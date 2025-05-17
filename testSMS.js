const twilioUtils = require('./twilioUtils');
require('dotenv').config();

async function testTwilioIntegration() {
    try {
        // Get phone number from command line argument
        const phoneNumber = process.argv[2];

        if (!phoneNumber) {
            console.error('Please provide a phone number as an argument');
            console.error('Usage: node testTwilio.js your_phone_number');
            process.exit(1);
        }

        console.log(`Testing Twilio integration with phone number: ${phoneNumber}`);

        // Format the phone number
        const formattedNumber = twilioUtils.formatPhoneNumber(phoneNumber);
        console.log(`Formatted phone number: ${formattedNumber}`);

        // Test sending a message
        console.log('Sending test SMS...');
        const message = await twilioUtils.sendSMS(
            phoneNumber,
            'This is a test message from your Hospital Management System. If you received this, your Twilio integration is working!'
        );

        console.log('Test SMS sent successfully!');
        console.log('Message SID:', message.sid);
        console.log('Status:', message.status);

        // Test scheduling a reminder for 1 minute from now
        const now = new Date();
        const reminderTime = new Date(now.getTime() + 60000); // 1 minute from now

        console.log(`Scheduling test reminder for ${reminderTime.toLocaleTimeString()}...`);

        const job = twilioUtils.scheduleAppointmentReminder(
            phoneNumber,
            'Test Doctor',
            'Test Specialization',
            reminderTime,
            reminderTime.toLocaleTimeString()
        );

        if (job) {
            console.log('Reminder scheduled successfully!');
            console.log('Reminder will be sent in approximately 1 minute');

            // Keep the script running until after the reminder should be sent
            setTimeout(() => {
                console.log('Test complete. Exiting...');
                process.exit(0);
            }, 70000); // Wait 70 seconds
        } else {
            console.error('Failed to schedule reminder');
            process.exit(1);
        }
    } catch (error) {
        console.error('Error during Twilio test:', error);
        process.exit(1);
    }
}

testTwilioIntegration();