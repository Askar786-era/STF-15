const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const receiverSchema = new mongoose.Schema({
    fullName: { type: String, required: true },
    phone: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    city: { type: String, required: true, index: true },
    state: { type: String, required: true, index: true },
    zipCode: { type: String, required: true, index: true },
    isOnline: { type: Boolean, default: false },
    socketId: { type: String, default: null },
    firebaseUid: { type: String, default: null },
    pushToken: { type: String, default: null },
    createdAt: { type: Date, default: Date.now }
});

receiverSchema.index({ city: 1, state: 1, zipCode: 1 });

// Hash password before saving
receiverSchema.pre('save', async function() {
    if (!this.isModified('password')) return;
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
});

module.exports = mongoose.model('Receiver', receiverSchema);
