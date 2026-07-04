const mongoose = require('mongoose');
const Donor = require('../models/Donor');
const BloodBank = require('../models/BloodBank');
const fs = require('fs');
const path = require('path');

if (fs.existsSync(path.join(__dirname, '../.env'))) {
    const envConfig = fs.readFileSync(path.join(__dirname, '../.env'), 'utf8');
    envConfig.split('\n').forEach(line => {
        const parts = line.split('=');
        if (parts.length > 1) {
            const key = parts[0].trim();
            const val = parts.slice(1).join('=').trim().replace(/(^['"]|['"]$)/g, '');
            process.env[key] = val;
        }
    });
}

async function list() {
    const MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/stranger_to_friends";
    try {
        await mongoose.connect(MONGODB_URI);
        const donors = await Donor.find({});
        console.log(`=== REGISTERED DONORS IN DATABASE (${donors.length}) ===`);
        donors.forEach((d, idx) => {
            try {
                const dec = d.decryptFields();
                console.log(`${idx + 1}. Name: ${dec.fullName}, Phone: ${dec.phone}, Group: ${dec.bloodGroup}, Location: ${dec.city}, ${dec.state}`);
            } catch (e) {
                console.log(`${idx + 1}. (Decryption failed) Group: ${d.bloodGroup}`);
            }
        });

        const banks = await BloodBank.find({});
        console.log(`\n=== REGISTERED BLOOD BANKS IN DATABASE (${banks.length}) ===`);
        banks.forEach((b, idx) => {
            console.log(`${idx + 1}. Bank Name: ${b.bankName}, Phone: ${b.phone}, Location: ${b.district}, ${b.state}`);
        });

        process.exit(0);
    } catch (err) {
        console.error("Error:", err.message);
        process.exit(1);
    }
}

list();
