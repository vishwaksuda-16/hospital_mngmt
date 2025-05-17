const mongoose = require('mongoose');
const { Patient } = require('./models/user');
require('dotenv').config();

// Connect to database
mongoose.connect('mongodb://localhost:27017/Hospital', {
    useNewUrlParser: true,
    useUnifiedTopology: true
});

const db = mongoose.connection;
db.on("error", console.error.bind(console, "connection error:"));
db.once("open", async () => {
    console.log("Database connected");
    await migratePhoneNumbers();
    mongoose.connection.close();
});

/**
 * Format phone number to E.164 standard
 * @param {string} phoneNumber - The raw phone number from database
 * @returns {string} - E.164 formatted phone number
 */
function formatPhoneNumber(phoneNumber) {
    if (!phoneNumber) return null;

    // Remove any non-digit characters
    const digitsOnly = phoneNumber.replace(/\D/g, '');

    // Already has country code with '+'
    if (phoneNumber.startsWith('+')) {
        return phoneNumber;
    }

    // Already has country code without '+'
    if (digitsOnly.startsWith('91') && digitsOnly.length > 10) {
        return '+' + digitsOnly;
    }

    // Add country code for India
    if (digitsOnly.length === 10) {
        return '+91' + digitsOnly;
    } else {
        console.warn(`Warning: Phone number ${phoneNumber} seems invalid for an Indian mobile number`);
        return '+91' + digitsOnly;
    }
}

async function migratePhoneNumbers() {
    try {
        console.log('Starting phone number migration...');

        // Get all patients with phone numbers
        const patients = await Patient.find({
            'contactDetails.phone': { $exists: true, $ne: null }
        });

        console.log(`Found ${patients.length} patients with phone numbers`);

        let updated = 0;

        // Update each patient's phone number
        for (const patient of patients) {
            const oldPhone = patient.contactDetails.phone;
            const newPhone = formatPhoneNumber(oldPhone);

            // Skip if no change needed
            if (oldPhone === newPhone) {
                continue;
            }

            // Update phone number
            patient.contactDetails.phone = newPhone;
            await patient.save();

            updated++;
            console.log(`Updated ${oldPhone} to ${newPhone}`);
        }

        console.log(`Migration complete. Updated ${updated} phone numbers.`);
    } catch (error) {
        console.error('Error during migration:', error);
    }
}

// Uncomment this line to run migration
migratePhoneNumbers();