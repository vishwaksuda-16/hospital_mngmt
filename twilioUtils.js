require('dotenv').config();

console.log("DEBUG ENV:");
console.log("TWILIO_ACCOUNT_SID:", process.env.TWILIO_ACCOUNT_SID);
console.log("TWILIO_AUTH_TOKEN:", process.env.TWILIO_AUTH_TOKEN);
console.log("TWILIO_PHONE_NUMBER:", process.env.TWILIO_PHONE_NUMBER);

const twilio = require('twilio');
const schedule = require('node-schedule');

// Initialize Twilio client
const client = twilio(
    process.env.TWILIO_ACCOUNT_SID,
    process.env.TWILIO_AUTH_TOKEN
);

/**
 * Formats a date and time for display in messages
 * @param {Date} date - The appointment date
 * @param {String} time - The appointment time string
 * @returns {String} - Formatted date and time string
 */
const formatAppointmentDateTime = (date, time) => {
    // Format date as "Monday, January 1, 2025"
    const dateOptions = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    const formattedDate = new Date(date).toLocaleDateString('en-US', dateOptions);

    // Return combined date and time
    return `${formattedDate} at ${time}`;
};

/**
 * Sends an SMS message using Twilio
 * @param {string} to - The recipient's phone number
 * @param {string} body - The message content
 * @returns {Promise} - A promise that resolves with the message details
 */
const sendSMS = async (to, body) => {
    try {
        if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
            throw new Error('Twilio credentials are not configured');
        }

        if (!process.env.TWILIO_PHONE_NUMBER) {
            throw new Error('Twilio phone number is not configured');
        }

        // Format phone number (ensure it has country code)
        const formattedNumber = formatPhoneNumber(to);

        const message = await client.messages.create({
            body: body,
            to: formattedNumber,
            from: process.env.TWILIO_PHONE_NUMBER,
        });

        console.log(`SMS sent successfully! Message SID: ${message.sid}`);
        return message;
    } catch (error) {
        console.error(`Error sending SMS to ${to}: ${error}`);
        throw error;
    }
};

/**
 * Formats phone number to ensure it has country code
 * @param {string} phoneNumber - The phone number to format
 * @returns {string} - Formatted phone number
 */
const formatPhoneNumber = (phoneNumber) => {
    // Strip any non-numeric characters
    const numbersOnly = phoneNumber.replace(/\D/g, '');

    // If number doesn't start with +, add US country code (+1)
    if (!phoneNumber.startsWith('+')) {
        // For US numbers
        if (numbersOnly.length === 10) {
            return `+1${numbersOnly}`;
        }
        // For numbers that already have country code without +
        else if (numbersOnly.length > 10) {
            return `+${numbersOnly}`;
        }
    }

    // Return original if it already has + or other cases
    return phoneNumber;
};

/**
 * Sends appointment confirmation SMS to patient
 * @param {string} phoneNumber - Patient's phone number
 * @param {string} doctor - Doctor's name
 * @param {string} specialization - Doctor's specialization
 * @param {Date} date - Appointment date
 * @param {string} time - Appointment time
 * @returns {Promise} - Result of sendSMS operation
 */
const sendAppointmentConfirmation = async (phoneNumber, doctor, specialization, date, time) => {
    const formattedDateTime = formatAppointmentDateTime(date, time);

    const message = `Your appointment with ${doctor} (${specialization}) has been confirmed for ${formattedDateTime}. Thank you for choosing our hospital.`;

    return await sendSMS(phoneNumber, message);
};

/**
 * Schedules an SMS reminder for an upcoming appointment
 * @param {string} phoneNumber - Patient's phone number
 * @param {string} doctor - Doctor's name
 * @param {string} specialization - Doctor's specialization
 * @param {Date} date - Appointment date
 * @param {string} time - Appointment time
 * @returns {Object} - The scheduled job object
 */
const scheduleAppointmentReminder = (phoneNumber, doctor, specialization, date, time) => {
    try {
        // Convert 12-hour time with am/pm to 24-hour format
        const time24 = convertTo24Hour(time);

        // Parse appointment date and time
        const appointmentDate = new Date(date);
        if (isNaN(appointmentDate)) {
            throw new Error(`Invalid appointment date: ${date}`);
        }

        const timeParts = time24.split(':').map(Number);
        if (timeParts.length !== 2 || timeParts.some(isNaN)) {
            throw new Error(`Invalid time format after conversion: ${time24}`);
        }
        const [hours, minutes] = timeParts;

        appointmentDate.setHours(hours, minutes);

        // Set reminder time (1 hour before appointment)
        const reminderTime = new Date(appointmentDate);
        reminderTime.setHours(reminderTime.getHours() - 1);

        if (isNaN(reminderTime)) {
            throw new Error('Computed reminder time is invalid');
        }

        // Don't schedule if reminder time is in the past
        if (reminderTime <= new Date()) {
            console.log('Reminder time is in the past, not scheduling');
            return null;
        }

        console.log(`Scheduling reminder for ${phoneNumber} at ${reminderTime.toISOString()}`);

        // Schedule the job
        const job = schedule.scheduleJob(reminderTime, async function () {
            try {
                const formattedDateTime = formatAppointmentDateTime(date, time);
                const message = `Reminder: You have an appointment with Dr. ${doctor} (${specialization}) tomorrow at ${formattedDateTime}. Please arrive 15 minutes early.`;

                await sendSMS(phoneNumber, message);
                console.log(`Reminder sent to ${phoneNumber} for appointment on ${formattedDateTime}`);
            } catch (error) {
                console.error('Failed to send reminder SMS:', error);
            }
        });

        return job;
    } catch (error) {
        console.error('Error scheduling reminder:', error);
        return null;
    }
};

// Add the helper function somewhere accessible:
function convertTo24Hour(time12h) {
    const [time, modifier] = time12h.toLowerCase().split(' ');

    let [hours, minutes] = time.split(':').map(Number);

    if (modifier === 'pm' && hours !== 12) {
        hours += 12;
    }
    if (modifier === 'am' && hours === 12) {
        hours = 0;
    }

    const hoursStr = hours.toString().padStart(2, '0');
    const minutesStr = minutes.toString().padStart(2, '0');

    return `${hoursStr}:${minutesStr}`;
}


/**
 * Sends a test SMS to verify Twilio integration works
 * @param {string} phoneNumber - The phone number to test with
 * @returns {Promise} Result of sendSMS operation
 */
const sendTestSMS = async (phoneNumber) => {
    return await sendSMS(
        phoneNumber,
        'This is a test message from your Hospital Management System. If you received this, Twilio is configured correctly!'
    );
};

module.exports = {
    sendSMS,
    sendAppointmentConfirmation,
    scheduleAppointmentReminder,
    sendTestSMS,
    formatPhoneNumber
};