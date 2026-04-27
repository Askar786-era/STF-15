const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const http = require('http');
const Donor = require('./models/Donor');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" }
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '')));

// Serve the main page at the root URL
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'STF.html'));
});

// Connect to MongoDB
const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URL || 'mongodb://localhost:27017/stranger_to_friends';
mongoose.connect(MONGODB_URI)
    .then(() => console.log("Connected to MongoDB successfully!"))
    .catch(err => {
        console.error("MongoDB connection error:", err.message);
        console.log("\nTIP: Make sure MongoDB is running on your local machine.");
        console.log("To start MongoDB on Windows, open Command Prompt as Administrator and run: net start MongoDB\n");
    });

// Socket logic
io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // Initial count
    Donor.countDocuments().then(count => {
        socket.emit('donorCountUpdate', count);
    });

    socket.on('donorOnline', async (donorPhone) => {
        try {
            await Donor.findOneAndUpdate({ phone: donorPhone }, { isOnline: true, socketId: socket.id });
            console.log(`Donor ${donorPhone} is online`);
        } catch (err) {
            console.error(err);
        }
    });

    socket.on('donorOffline', async (donorPhone) => {
        try {
            await Donor.findOneAndUpdate({ phone: donorPhone }, { isOnline: false, socketId: null });
            console.log(`Donor ${donorPhone} went offline manually`);
        } catch (err) {
            console.error(err);
        }
    });

    socket.on('callUser', async ({ donorPhone, signalData, callerName }) => {
        const cleanPhone = String(donorPhone).trim();
        console.log(`[CALL] Attempting to call: ${cleanPhone} from ${callerName}`);
        
        const donor = await Donor.findOne({ phone: cleanPhone, isOnline: true });
        
        if (donor && donor.socketId) {
            console.log(`[CALL] Donor found! Relaying to socket: ${donor.socketId}`);
            io.to(donor.socketId).emit('incomingCall', { 
                signal: signalData, 
                from: callerName, 
                callerSocket: socket.id 
            });
        } else {
            console.log(`[CALL] Failed: Donor ${cleanPhone} is ${donor ? 'OFFLINE' : 'NOT FOUND'}`);
            socket.emit('callError', { message: 'Donor is currently offline or busy.' });
        }
    });

    socket.on('answerCall', (data) => {
        console.log(`Call answered. Relaying to caller: ${data.to}`);
        io.to(data.to).emit('callAccepted', { 
            signal: data.signal, 
            donorSocket: socket.id 
        });
    });

    socket.on('iceCandidate', (data) => {
        io.to(data.to).emit('iceCandidate', data.candidate);
    });

    socket.on('disconnect', async () => {
        await Donor.findOneAndUpdate({ socketId: socket.id }, { isOnline: false, socketId: null });
        console.log('User disconnected:', socket.id);
    });
});

// Registration Route
app.post('/api/donors', async (req, res) => {
    try {
        const newDonor = new Donor(req.body);
        await newDonor.save();
        const count = await Donor.countDocuments();
        io.emit('donorCountUpdate', count); // Real-time update
        res.status(201).json({ message: 'Donor registered successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Error registering donor' });
    }
});

// Login Route
app.post('/api/login', async (req, res) => {
    try {
        const { phone, password } = req.body;
        const donor = await Donor.findOne({ phone, password });
        if (donor) {
            res.json({ success: true, donor });
        } else {
            res.status(401).json({ success: false, message: 'Invalid credentials' });
        }
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

// Search Route
app.get('/api/donors/search', async (req, res) => {
    try {
        const { bloodGroup, city, state } = req.query;
        let query = {};
        if (bloodGroup && bloodGroup !== 'Select Blood Group') query.bloodGroup = bloodGroup;
        if (city) query.city = { $regex: new RegExp(city, "i") };
        if (state) query.state = { $regex: new RegExp(state, "i") };

        const donors = await Donor.find(query).select('-password').lean(); 
        res.set('Cache-Control', 'public, max-age=60'); // Cache search results for 60 seconds
        res.json(donors);
    } catch (error) {
        res.status(500).json({ message: 'Error searching donors' });
    }
});

// Use a dynamic port or 3000
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
