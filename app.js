const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const ObjectId = mongoose.Types.ObjectId;
const session = require('express-session');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
require('dotenv').config();
const { User, Patient, Doctor, Admin, Appointment, Feedback, Prescription, Billing } = require('./models/user');
// Import the Twilio utilities
const twilioUtils = require('./twilioUtils');

// Map to store scheduled reminder jobs by appointment ID
const reminderJobs = new Map();

mongoose.connect('mongodb://localhost:27017/Hospital');

const db = mongoose.connection;
db.on("error", console.error.bind(console, "connection error:"));
db.once("open", () => {
    console.log("Database connected");
    // Load existing appointments and schedule reminders for them
    scheduleExistingAppointmentReminders();
});

// Function to schedule reminders for all existing appointments
async function scheduleExistingAppointmentReminders() {
    try {
        const futureAppointments = await Appointment.find({
            date: { $gte: new Date() }
        }).populate({
            path: 'userID',
            model: 'User'
        });

        console.log(`Found ${futureAppointments.length} future appointments to schedule reminders for.`);

        for (const appointment of futureAppointments) {
            try {
                // Get patient details for phone number
                const patient = await Patient.findOne({ userID: appointment.userID });

                if (patient && patient.contactDetails && patient.contactDetails.phone) {
                    const job = twilioUtils.scheduleAppointmentReminder(
                        patient.contactDetails.phone,
                        appointment.doctor,
                        appointment.specialization,
                        appointment.date,
                        appointment.time
                    );

                    if (job) {
                        reminderJobs.set(appointment._id.toString(), job);
                        console.log(`Scheduled reminder for appointment ${appointment._id}`);
                    }
                }
            } catch (err) {
                console.error(`Error scheduling reminder for appointment ${appointment._id}:`, err);
            }
        }
    } catch (error) {
        console.error('Error loading appointments for reminders:', error);
    }
}

const app = express();
app.use(express.json());

app.use(session({
    secret: 'hospital-management-secret',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false }
}));

app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Existing routes...
// [Keep all your existing routes]

// Update the appointments POST route to include SMS notifications
app.post('/appointments', async (req, res) => {
    req.session.cancelledAppointmentId = null;
    const userId = req.session.userId;

    if (!userId) {
        return res.redirect('/login');
    }

    try {
        let appointment;

        if (req.body.appointmentId) {
            const { appointmentId, date, time } = req.body;
            const formattedDate = new Date(date).toISOString().split('T')[0];
            await Appointment.findByIdAndUpdate(appointmentId, { date: formattedDate, time });
            appointment = await Appointment.findById(appointmentId);

            if (reminderJobs.has(appointmentId)) {
                reminderJobs.get(appointmentId).cancel();
                reminderJobs.delete(appointmentId);
            }
        } else {
            const { doctor, specialization, date, time, status } = req.body;
            const formattedDate = new Date(date).toISOString().split('T')[0];

            appointment = new Appointment({
                userID: userId,
                doctor,
                specialization,
                date: formattedDate,
                time,
                status: status || 'Pending'
            });

            await appointment.save();
        }

        const patient = await Patient.findOne({ userID: userId });

        if (patient && patient.contactDetails && patient.contactDetails.phone) {
            try {
                await twilioUtils.sendAppointmentConfirmation(
                    patient.contactDetails.phone,
                    appointment.doctor,
                    appointment.specialization,
                    appointment.date,
                    appointment.time
                );

                const job = twilioUtils.scheduleAppointmentReminder(
                    patient.contactDetails.phone,
                    appointment.doctor,
                    appointment.specialization,
                    appointment.date,
                    appointment.time
                );

                if (job) {
                    reminderJobs.set(appointment._id.toString(), job);

                    req.session.cancelledAppointmentId = null; // ✅ Clear it here
                    return res.redirect('/appointments?sms=sent&reminder=scheduled');
                } else {
                    req.session.cancelledAppointmentId = null;
                    return res.redirect('/appointments?sms=sent&reminder=failed');
                }
            } catch (smsError) {
                console.error('Error sending SMS:', smsError);
                req.session.cancelledAppointmentId = null;
                return res.redirect('/appointments');
            }
        } else {
            req.session.cancelledAppointmentId = null;
            return res.redirect('/appointments');
        }

    } catch (error) {
        console.error('Error processing appointment:', error);
        res.status(500).send('Failed to process appointment');
    }
});


// Update the delete appointment route to cancel scheduled reminders
app.delete('/appointments/:id', async (req, res) => {
    try {
        const { id } = req.params;

        if (!ObjectId.isValid(id)) {
            return res.status(400).send('Invalid appointment ID');
        }

        // Cancel any scheduled reminder
        if (reminderJobs.has(id)) {
            reminderJobs.get(id).cancel();
            reminderJobs.delete(id);
            console.log(`Cancelled reminder for appointment ${id}`);
        }

        const deletedAppointment = await Appointment.findByIdAndDelete(id);

        if (!deletedAppointment) {
            return res.status(404).send('Appointment not found');
        }

        res.status(200).send({ message: 'Appointment deleted' });
    } catch (error) {
        console.error('Error deleting appointment:', error);
        res.status(500).send('Server error');
    }
});
app.get('/home', (req, res) => {
    res.render('home');
});

app.get('/about', (req, res) => {
    res.render('about');
})

app.get('/services', (req, res) => {
    res.render('services');
})

app.get('/doctorinfo', (req, res) => {
    res.render('doctorinfo');
})
app.get('/appointments', async (req, res) => {
    const userId = req.session.userId;

    if (!userId) {
        return res.redirect('/login');
    }

    try {
        // First find the patient data
        const patient = await Patient.findOne({ userID: userId }).populate('userID');

        if (!patient) {
            return res.send('Patient not found');
        }

        // Then find appointments using userID (not patient or user)
        const appointments = await Appointment.find({ userID: userId, status: { $nin: ['Cancelled', 'Completed'] } });
        const doctors = await Doctor.find(); // Fetch all doctors

        // Extract unique specialities
        const specialities = [...new Set(doctors.map(doc => doc.specialization))];

        const cancelledAppointmentId = req.session.cancelledAppointmentId || null;
        req.session.cancelledAppointmentId = null;

        res.render('Appointments', {
            user: patient,
            doctors,
            specialities,
            appointments,
            cancelledAppointmentId
        });

    } catch (err) {
        console.error('Error fetching appointments:', err);
        res.status(500).send('Internal Server Error');
    }
});

app.get('/feedback', async (req, res) => {
    try {
        // Fetch recent feedbacks to display (limit to 10)
        const recentFeedbacks = await Feedback.find()
            .populate({
                path: 'userID',
                select: 'UserName' // Get username only
            })
            .sort({ createdAt: -1 }) // Most recent first
            .limit(10);

        res.render('feedback', { feedbacks: recentFeedbacks });
    } catch (error) {
        console.error('Error fetching feedbacks:', error);
        res.render('feedback', { feedbacks: [] });
    }
});

app.get('/signup', (req, res) => {
    res.render('signup');
});

app.post('/signup', async (req, res) => {
    try {
        console.log(req.body);
        const UserName = req.body.userName;
        const Password = req.body.password;
        const Role = req.body.role;

        const newUser = new User({ UserName, Password, Role });
        await newUser.save();
        req.session.userID = newUser._id;
        req.session.userRole = Role;

        if (Role === 'Patient') {
            res.redirect('/patient-form');
        } else if (Role === 'Doctor') {
            res.redirect('/doctor-form');
        } else if (Role === 'Admin') {
            res.redirect('/admin-form');
        } else {
            res.redirect('/home');
        }
    } catch (error) {
        console.log(error);
        res.status(400).send('Signup failed. Please check your inputs.');
    }
});

app.get('/patient-form', (req, res) => {
    if (!req.session.userID) {
        return res.redirect('/signup');
    }
    res.render('patient-form');
});


app.post('/patient-form', async (req, res) => {
    try {
        if (!req.session.userID) {
            return res.redirect('/signup');
        }
        const { name, dob, gender, phone, email, address, medicalHistory, provider, policyNumber } = req.body;
        const newPatient = new Patient({
            userID: req.session.userID,
            name,
            dob,
            gender,
            contactDetails: { phone, email },
            address
        });
        await newPatient.save();
        res.redirect('/home');
    } catch (error) {
        console.log(error);
        res.status(400).send('Patient registration failed.');
    }
});

app.get('/doctor-form', (req, res) => {
    if (!req.session.userID) {
        return res.redirect('/signup');
    }
    res.render('doctor-form');
});

app.post('/doctor-form', async (req, res) => {
    try {
        if (!req.session.userID) {
            return res.redirect('/signup');
        }
        const { name, dob, gender, phone, email, licenseNumber, specialization, experience } = req.body;
        const newDoc = new Doctor({
            userID: req.session.userID,
            name,
            dob,
            gender,
            contactDetails: { phone, email },
            licenseNumber,
            specialization,
            experience
        });
        console.log(req.body);
        await newDoc.save();
        res.redirect('/home');
    } catch (error) {
        console.log(error);
        res.status(400).send('Doctor registration failed.');
    }
});

app.get('/admin-form', (req, res) => {
    if (!req.session.userID) {
        return res.redirect('/signup');
    }
    res.render('admin-form');
});

app.post('/admin-form', async (req, res) => {
    try {
        if (!req.session.userID) {
            return res.redirect('/signup');
        }
        const { name, phone, email, designation, joinDate } = req.body;
        const newDoc = new Admin({
            userID: req.session.userID,
            name,
            contactDetails: { phone, email },
            designation,
            joinDate
        });
        console.log(req.body);
        await newDoc.save();
        res.redirect('/home');
    } catch (error) {
        console.log(error);
        res.status(400).send('Admin registration failed.');
    }
});

app.get('/login', (req, res) => {
    res.render('login');
});

app.get('/dashboard', async (req, res) => {
    const userId = req.session.userId;

    if (!userId) {
        return res.redirect('/login');
    }

    const patient = await Patient.findOne({ userID: userId }).populate('userID');

    if (!patient) {
        return res.send('Patient not found');
    }

    const appointments = await Appointment.find({ userID: userId, status: { $nin: ['Cancelled', 'Completed'] } });

    res.render('Dashboard', {
        user: patient,
        appointments,
        cancelledAppointmentId: req.session.cancelledAppointmentId || null
    });
    req.session.cancelledAppointmentId = null;
});

app.post('/dashboard', async (req, res) => {
    const userId = req.session.userId;

    if (!userId) {
        return res.redirect('/login');
    }

    try {
        if (req.body.appointmentId) {
            // Update existing appointment
            const { appointmentId, date, time } = req.body;
            await Appointment.findByIdAndUpdate(appointmentId, { date, time });
            console.log(`Updated appointment ${appointmentId} from dashboard`);
        }
        // Redirect back to dashboard
        res.redirect('/dashboard');
    } catch (error) {
        console.log(error);
        res.status(500).send('Failed to update appointment');
    }
});

app.post('/login', async (req, res) => {
    try {
        const { userName, password } = req.body;

        // Find the user in the User database
        const user = await User.findOne({ UserName: userName, Password: password });

        if (!user) {
            return res.status(401).render('login', { error: 'Invalid username or password' });
        }

        // Set session data
        req.session.userId = user._id;
        req.session.userRole = user.Role;

        // Redirect based on role
        if (user.Role.toLowerCase() === 'patient') {
            res.redirect('/dashboard');
        } else if (user.Role.toLowerCase() === 'doctor') {
            res.redirect('/doctor/dashboard');
        } else {
            res.status(403).send('Unauthorized role');
        }

    } catch (error) {
        console.log(error);
        res.status(400).send('Login Failed!!');
    }
});


app.get('/medical_records', async (req, res) => {
    const userId = req.session.userId;

    if (!userId) {
        return res.redirect('/login');
    }


    const patient = await Patient.findOne({ userID: userId }).populate('userID');

    if (!patient) {
        return res.send('Patient not found');
    }


    res.render('Medical_records', { user: patient });
});

app.get('/profile', async (req, res) => {
    const userId = req.session.userId;

    if (!userId) {
        return res.redirect('/login');
    }


    const patient = await Patient.findOne({ userID: userId }).populate('userID');

    if (!patient) {
        return res.send('Patient not found');
    }


    res.render('Profile', { user: patient });
});

app.get('/patient-feedback', async (req, res) => {
    const userId = req.session.userId;

    if (!userId) {
        return res.redirect('/login');
    }

    // Find the patient information
    const patient = await Patient.findOne({ userID: userId }).populate('userID');

    if (!patient) {
        return res.send('Patient not found');
    }

    res.render('patient-feedback', { user: patient });
});

// Add this route to handle feedback form submission from patient portal
app.post('/submit-patient-feedback', async (req, res) => {
    try {
        const userId = req.session.userId;

        if (!userId) {
            return res.redirect('/login');
        }

        // Get form data
        const { rating, feedback } = req.body;

        // Create new feedback
        const newFeedback = new Feedback({
            userID: userId,
            feedback: feedback,
            rating: parseInt(rating)
        });

        // Save feedback to database
        await newFeedback.save();

        // Redirect with success message
        res.redirect('/patient-feedback?success=true');
    } catch (error) {
        console.error('Error submitting feedback:', error);
        res.redirect('/patient-feedback?error=true');
    }
});

app.post('/api/user/profile', async (req, res) => {
    try {
        console.log(req.body);
        const userId = req.session.userId;


        if (!userId) {
            return res.status(401).json({ error: 'Not authenticated' });
        }

        const patient = await Patient.findOne({ userID: userId });

        if (!patient) {
            return res.status(404).json({ error: 'Patient not found' });
        }

        // Update patient information
        patient.name = req.body.name;
        patient.dob = req.body.dob;
        patient.gender = req.body.gender;
        patient.contactDetails.email = req.body.contactDetails.email;
        patient.contactDetails.phone = req.body.contactDetails.phone;
        patient.address = req.body.address;

        await patient.save();

        res.status(200).json({ success: true, message: 'Profile updated successfully' });
    } catch (error) {
        console.error('Error updating profile:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// API endpoint to change password
app.post('/api/user/password', async (req, res) => {
    try {
        console.log(req.body);
        const userId = req.session.userId;

        if (!userId) {
            return res.status(401).json({ error: 'Not authenticated' });
        }

        const { currentPassword, newPassword } = req.body;

        // Find the user
        const user = await User.findById(userId);

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Verify current password
        if (user.Password !== currentPassword) {
            return res.status(400).json({ error: 'Current password is incorrect' });
        }

        // Update password
        user.Password = newPassword;
        await user.save();

        res.status(200).json({ success: true, message: 'Password updated successfully' });
    } catch (error) {
        console.error('Error updating password:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Set up Nodemailer transporter
const transporter = nodemailer.createTransport({
    service: 'gmail', // You can use other services like SendGrid, Mailgun, etc.
    auth: {
        user: 'vishwaksuda@gmail.com', // Replace with your email
        pass: 'uhoc pinh rayy qduw' // Replace with your password or app password
    }
});

// Handle forgot password form submission
app.post('/forgot-password', async (req, res) => {
    try {
        const { email } = req.body;
        let user = null;
        let userModel = null;

        // First, try to find a patient with this email
        const patient = await Patient.findOne({ 'contactDetails.email': email }).populate('userID');
        if (patient && patient.userID) {
            user = patient.userID;
            userModel = 'Patient';
        }

        // If not found, try to find a doctor with this email
        if (!user) {
            const doctor = await Doctor.findOne({ 'contactDetails.email': email }).populate('userID');
            if (doctor && doctor.userID) {
                user = doctor.userID;
                userModel = 'Doctor';
            }
        }

        // If still not found, try to find an admin with this email
        if (!user) {
            const admin = await Admin.findOne({ 'contactDetails.email': email }).populate('userID');
            if (admin && admin.userID) {
                user = admin.userID;
                userModel = 'Admin';
            }
        }

        // If user not found in any collection, return generic response
        if (!user) {
            console.log(`Password reset requested for non-existent email: ${email}`);
            return res.send({
                success: true,
                message: "If your email exists in our system, you will receive password reset instructions."
            });
        }

        // Generate random token and expiry
        const resetToken = crypto.randomBytes(32).toString('hex');
        const resetTokenExpiry = new Date(Date.now() + 3600000); // 1 hour

        // Update user with reset token
        user.resetToken = resetToken;
        user.resetTokenExpiry = resetTokenExpiry;
        await user.save();

        // Create reset URL
        const resetUrl = `http://${req.headers.host}/reset-password/${resetToken}`;

        // Send email
        const mailOptions = {
            from: 'your-email@gmail.com',
            to: email,
            subject: 'Password Reset - Hospital Management System',
            html: `
                <p>You requested a password reset for the Hospital Management System.</p>
                <p>Please click the link below to reset your password:</p>
                <a href="${resetUrl}">Reset My Password</a>
                <p>This link is valid for 1 hour.</p>
                <p>If you didn't request this, please ignore this email.</p>
            `
        };

        await transporter.sendMail(mailOptions);

        res.send({
            success: true,
            message: "If your email exists in our system, you will receive password reset instructions."
        });

    } catch (error) {
        console.error('Error in forgot password:', error);
        res.status(500).send('An error occurred. Please try again later.');
    }
});

// Route to serve the reset password form
app.get('/reset-password/:token', async (req, res) => {
    try {
        const { token } = req.params;

        // Find user with this token and check if token is still valid
        const user = await User.findOne({
            resetToken: token,
            resetTokenExpiry: { $gt: Date.now() } // Token should not be expired
        });

        if (!user) {
            return res.render('error', { message: 'Password reset token is invalid or has expired.' });
        }

        // Render the password reset form
        res.render('reset-password', { token });

    } catch (error) {
        console.error('Error in reset password page:', error);
        res.status(500).send('An error occurred. Please try again later.');
    }
});

// Handle password reset form submission
app.post('/reset-password/:token', async (req, res) => {
    try {
        const { token } = req.params;
        const { password, confirmPassword } = req.body;

        // Validate password
        if (password !== confirmPassword) {
            return res.render('reset-password', {
                token,
                error: 'Passwords do not match'
            });
        }

        // Find user with valid token
        const user = await User.findOne({
            resetToken: token,
            resetTokenExpiry: { $gt: Date.now() }
        });

        if (!user) {
            return res.render('error', { message: 'Password reset token is invalid or has expired.' });
        }

        // Update password and clear reset token
        user.Password = password;
        user.resetToken = undefined;
        user.resetTokenExpiry = undefined;
        await user.save();

        // Redirect to login with success message
        res.redirect('/login?passwordReset=true');

    } catch (error) {
        console.error('Error in reset password submission:', error);
        res.status(500).send('An error occurred. Please try again later.');
    }
});

// Doctor dashboard routes - Add these to your app.js file

// Route for doctor dashboard
app.get('/doctor/dashboard', async (req, res) => {
    const userId = req.session.userId;

    if (!userId) {
        return res.redirect('/login');
    }

    try {
        // Get the doctor information
        const doctor = await Doctor.findOne({ userID: userId }).populate('userID');

        if (!doctor) {
            return res.redirect('/login');
        }

        // Get today's date in YYYY-MM-DD format
        const today = new Date();
        const todayStr = today.toISOString().split('T')[0]; // YYYY-MM-DD format

        console.log('Doctor Name:', doctor.name);
        console.log('Looking for appointments on date:', todayStr);

        // Get all appointments for this doctor for today
        const todayAppointments = await Appointment.find({
            doctor: doctor.name, // This needs to match exactly how it's stored
            date: todayStr
        });

        console.log('Found appointments:', todayAppointments.length);

        // Process appointments to include patient information
        const processedAppointments = [];
        for (const appointment of todayAppointments) {
            try {
                const patient = await Patient.findOne({ userID: appointment.userID });
                if (patient) {
                    processedAppointments.push({
                        id: appointment._id,
                        time: appointment.time,
                        patientName: patient.name,
                        patientId: patient._id,
                        purpose: appointment.specialization,
                        status: appointment.status
                    });
                } else {
                    console.log(`No patient found for userID: ${appointment.userID}`);
                }
            } catch (err) {
                console.error(`Error processing appointment ${appointment._id}:`, err);
            }
        }

        // Count pending reports
        const pendingReports = await Prescription.countDocuments({
            doctorId: doctor._id,
            status: 'Active'
        });

        // Count upcoming consultations for the week - using string comparison since date is stored as string
        const nextWeek = new Date();
        nextWeek.setDate(today.getDate() + 7);
        const nextWeekStr = nextWeek.toISOString().split('T')[0];

        const upcomingConsultations = await Appointment.countDocuments({
            doctor: doctor.name,
            date: { $gte: todayStr, $lte: nextWeekStr }
        });

        // Get appointment dates for the calendar - modified to work with string dates
        const currentMonth = today.getMonth() + 1; // JavaScript months are 0-based
        const currentYear = today.getFullYear();

        // Create date range strings for the current month
        const startDateStr = `${currentYear}-${currentMonth.toString().padStart(2, '0')}-01`;
        const lastDay = new Date(currentYear, currentMonth, 0).getDate();
        const endDateStr = `${currentYear}-${currentMonth.toString().padStart(2, '0')}-${lastDay}`;

        console.log(`Looking for month appointments between ${startDateStr} and ${endDateStr}`);

        const monthAppointments = await Appointment.find({
            doctor: doctor.name,
            date: { $gte: startDateStr, $lte: endDateStr }
        });

        console.log(`Found ${monthAppointments.length} appointments for this month`);

        // Extract day of month from appointment dates
        const appointmentDates = monthAppointments.map(app => {
            // Parse the date string (assuming YYYY-MM-DD format)
            const dateParts = app.date.split('-');
            return parseInt(dateParts[2], 10); // Extract day from YYYY-MM-DD
        });

        // Find the URL for the background image
        const backgroundImageUrl = '/images/hospital-bg.jpg';

        res.render('doctorDashboard', {
            doctor,
            todayAppointments: processedAppointments,
            pendingReports,
            upcomingConsultations,
            appointmentDates,
            backgroundImageUrl
        });
    } catch (error) {
        console.error('Error loading doctor dashboard:', error);
        res.status(500).send('Internal Server Error');
    }
});



// Route for doctor appointments page
app.get('/doctor/calendar', async (req, res) => {
    const userId = req.session.userId;

    if (!userId) {
        return res.redirect('/login');
    }

    try {
        // Get the doctor information
        const doctor = await Doctor.findOne({ userID: userId }).populate('userID');

        if (!doctor) {
            return res.redirect('/login');
        }

        // Get all appointments for this doctor
        const appointments = await Appointment.find({
            doctor: doctor.name
        }).sort({ date: 1, time: 1 });

        console.log(`Found ${appointments.length} total appointments for doctor calendar`);

        // Process appointments to include patient information
        const processedAppointments = [];
        for (const appointment of appointments) {
            try {
                const patient = await Patient.findOne({ userID: appointment.userID });
                if (patient) {
                    // Format the date correctly: Convert from "YYYY-MM-DD" to YYYY-MM-DD
                    // (strip any potential quotes from the date string)
                    const formattedDate = appointment.date.replace(/"/g, '');

                    // Format the time correctly: Ensure it's in HH:MM:SS format
                    let formattedTime = appointment.time;
                    if (!formattedTime.includes(':')) {
                        // Add seconds if missing
                        formattedTime = formattedTime + ":00";
                    }
                    // Ensure we have the right format HH:MM:SS
                    if (formattedTime.split(':').length === 2) {
                        formattedTime = formattedTime + ":00";
                    }

                    // Calculate patient age
                    const age = calculateAge(patient.dob);

                    processedAppointments.push({
                        id: appointment._id,
                        date: formattedDate,
                        time: formattedTime,
                        patientName: patient.name,
                        patientId: patient._id,
                        patientAge: age,
                        purpose: appointment.specialization,
                        status: appointment.status.toLowerCase(), // Normalize status to lowercase
                        notes: appointment.notes || ""
                    });
                }
            } catch (err) {
                console.error(`Error processing appointment ${appointment._id} for calendar:`, err);
            }
        }

        // Group appointments by date
        const appointmentsByDate = {};
        processedAppointments.forEach(appointment => {
            if (!appointmentsByDate[appointment.date]) {
                appointmentsByDate[appointment.date] = [];
            }
            appointmentsByDate[appointment.date].push(appointment);
        });

        res.render('doctorCalendar', {
            doctor,
            appointmentsByDate
        });
    } catch (error) {
        console.error('Error loading doctor appointments:', error);
        res.status(500).send('Internal Server Error');
    }
});

// Helper function to calculate age from DOB
function calculateAge(dob) {
    const birthDate = new Date(dob);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();

    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
        age--;
    }

    return age;
}
app.post('/doctor/appointments/cancel', async (req, res) => {
    try {
        const { appointmentId } = req.body;

        if (!appointmentId) {
            return res.status(400).json({ success: false, message: 'Appointment ID is required' });
        }

        const appointment = await Appointment.findById(appointmentId);

        if (!appointment) {
            return res.status(404).json({ success: false, message: 'Appointment not found' });
        }

        // Update the appointment status to cancelled
        appointment.status = 'Cancelled';
        await appointment.save();
        // Set session flag for patient
        req.session.cancelledAppointmentId = appointment._id;


        return res.json({ success: true, message: 'Appointment cancelled successfully' });
    } catch (error) {
        console.error('Error cancelling appointment:', error);
        return res.status(500).json({ success: false, message: 'Server error' });
    }
});

app.post('/doctor/appointments/save-notes', async (req, res) => {
    try {
        const { appointmentId, notes } = req.body;

        if (!appointmentId) {
            return res.status(400).json({ success: false, message: 'Appointment ID is required' });
        }

        const appointment = await Appointment.findById(appointmentId);

        if (!appointment) {
            return res.status(404).json({ success: false, message: 'Appointment not found' });
        }

        // Update the appointment notes
        appointment.notes = notes;
        await appointment.save();

        return res.json({ success: true, message: 'Notes saved successfully' });
    } catch (error) {
        console.error('Error saving appointment notes:', error);
        return res.status(500).json({ success: false, message: 'Server error' });
    }
});

app.post('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            console.error('Logout error:', err);
            return res.status(500).send('Logout failed');
        }
        res.redirect('/login'); // or /home or any landing page
    });
});
app.post('/doctor/appointments/complete', async (req, res) => {
    try {
        const { appointmentId } = req.body;

        if (!appointmentId) {
            return res.status(400).json({ success: false, message: 'Appointment ID is required' });
        }

        const result = await Appointment.findByIdAndUpdate(
            appointmentId,
            { status: 'Completed' },
            { new: true }
        );

        if (!result) {
            return res.status(404).json({ success: false, message: 'Appointment not found' });
        }

        return res.json({
            success: true,
            message: 'Appointment marked as completed successfully',
            appointment: result
        });

    } catch (error) {
        console.error('Error completing appointment:', error);
        return res.status(500).json({ success: false, message: 'Server error' });
    }
});



app.listen(5085, () => {
    console.log('Serving on port 5085');
});