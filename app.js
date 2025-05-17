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

mongoose.connect('mongodb://localhost:27017/Hospital', {
    useNewUrlParser: true,
    useUnifiedTopology: true
});

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
    const userId = req.session.userId;

    if (!userId) {
        return res.redirect('/login');
    }

    try {
        let appointment;

        if (req.body.appointmentId) {
            // Update existing appointment
            const { appointmentId, date, time } = req.body;
            await Appointment.findByIdAndUpdate(appointmentId, { date, time });
            appointment = await Appointment.findById(appointmentId);
            console.log(`Updated appointment ${appointmentId}`);

            // Cancel any existing reminder job
            if (reminderJobs.has(appointmentId)) {
                reminderJobs.get(appointmentId).cancel();
                reminderJobs.delete(appointmentId);
            }
        } else {
            // Create new appointment
            console.log('New appointment data:', req.body);
            const { doctor, specialization, date, time } = req.body;
            appointment = new Appointment({
                userID: userId,
                doctor,
                specialization,
                date,
                time
            });
            await appointment.save();
            console.log(`Created new appointment ${appointment._id}`);
        }

        const patient = await Patient.findOne({ userID: userId });

        if (patient && patient.contactDetails && patient.contactDetails.phone) {
            // Send confirmation SMS
            try {
                await twilioUtils.sendAppointmentConfirmation(
                    patient.contactDetails.phone,
                    appointment.doctor,
                    appointment.specialization,
                    appointment.date,
                    appointment.time
                );
                console.log(`Confirmation SMS sent to ${patient.contactDetails.phone}`);
                console.log('appointment.date:', appointment.date);
                console.log('appointment.time:', appointment.time);

                // Schedule appointment reminder (1 hour before)
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
                    // Redirect with success parameters
                    return res.redirect('/appointments?sms=sent&reminder=scheduled');
                } else {
                    console.log('Could not schedule reminder job');
                    return res.redirect('/appointments?sms=sent&reminder=failed');
                }
            } catch (smsError) {
                console.error('Error sending SMS:', smsError);
                // Continue even if SMS fails, but redirect with error parameter
                return res.redirect('/appointments?sms_error=true');
            }
        } else {
            console.log('Patient phone not found, SMS not sent');
            // Redirect without SMS notification
            return res.redirect('/appointments?phone=missing');
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
        const appointments = await Appointment.find({ userID: userId });
        const doctors = await Doctor.find(); // Fetch all doctors

        // Extract unique specialities
        const specialities = [...new Set(doctors.map(doc => doc.specialization))];

        res.render('Appointments', {
            user: patient,
            doctors,
            specialities,
            appointments
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

    const appointments = await Appointment.find({ userID: userId });

    res.render('Dashboard', { user: patient, appointments: appointments });
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
app.get('/billing', async (req, res) => {
    const userId = req.session.userId;

    if (!userId) {
        return res.redirect('/login');
    }


    const patient = await Patient.findOne({ userID: userId }).populate('userID');

    if (!patient) {
        return res.send('Patient not found');
    }
    res.render('Billing', { user: patient });
});
app.get('/documents', async (req, res) => {
    const userId = req.session.userId;

    if (!userId) {
        return res.redirect('/login');
    }


    const patient = await Patient.findOne({ userID: userId }).populate('userID');

    if (!patient) {
        return res.send('Patient not found');
    }


    res.render('Documents', { user: patient });
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

        // Get today's date
        const today = new Date();
        const todayStr = today.toISOString().split('T')[0]; // YYYY-MM-DD format

        // Get all appointments for this doctor for today
        const todayAppointments = await Appointment.find({
            doctor: doctor.name,
            date: todayStr,
            status: { $in: ['Pending', 'Confirmed'] }
        }).populate({
            path: 'userID',
            model: 'User'
        });

        // Process appointments to include patient information
        const processedAppointments = [];
        for (const appointment of todayAppointments) {
            const patient = await Patient.findOne({ userID: appointment.userID });
            if (patient) {
                processedAppointments.push({
                    id: appointment._id,
                    time: appointment.time,
                    patientName: patient.name,
                    patientId: patient._id,
                    patientAge: calculateAge(patient.dob),
                    purpose: appointment.specialization
                });
            }
        }

        // Count pending reports
        const pendingReports = await Prescription.countDocuments({
            doctorId: doctor._id,
            status: 'Active'
        });

        // Count upcoming consultations for the week
        const nextWeek = new Date();
        nextWeek.setDate(today.getDate() + 7);
        const nextWeekStr = nextWeek.toISOString().split('T')[0];

        const upcomingConsultations = await Appointment.countDocuments({
            doctor: doctor.name,
            date: { $gte: todayStr, $lte: nextWeekStr },
            status: { $in: ['Pending', 'Confirmed'] }
        });

        // Get appointment dates for the calendar
        const currentMonth = today.getMonth();
        const currentYear = today.getFullYear();
        const startDate = new Date(currentYear, currentMonth, 1);
        const endDate = new Date(currentYear, currentMonth + 1, 0);

        const monthAppointments = await Appointment.find({
            doctor: doctor.name,
            date: {
                $gte: startDate.toISOString().split('T')[0],
                $lte: endDate.toISOString().split('T')[0]
            }
        });

        // Extract day of month from appointment dates
        const appointmentDates = monthAppointments.map(app => {
            const dateParts = app.date.split('-');
            return parseInt(dateParts[2], 10); // Extract day from YYYY-MM-DD
        });

        // Find the URL for the background image
        const backgroundImageUrl = '/images/hospital-bg.jpg'; // Update with your actual image path

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

// Helper function to calculate age
function calculateAge(dob) {
    const birthDate = new Date(dob);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
        age--;
    }
    return age;
}

// Route for doctor appointments page
app.get('/doctor/appointments', async (req, res) => {
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

        // Process appointments to include patient information
        const processedAppointments = [];
        for (const appointment of appointments) {
            const patient = await Patient.findOne({ userID: appointment.userID });
            if (patient) {
                processedAppointments.push({
                    id: appointment._id,
                    date: appointment.date,
                    time: appointment.time,
                    patientName: patient.name,
                    patientId: patient._id,
                    patientAge: calculateAge(patient.dob),
                    purpose: appointment.specialization,
                    status: appointment.status
                });
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

        res.render('doctorAppointments', {
            doctor,
            appointmentsByDate
        });
    } catch (error) {
        console.error('Error loading doctor appointments:', error);
        res.status(500).send('Internal Server Error');
    }
});

// Add prescription route
app.post('/doctor/prescriptions/add', async (req, res) => {
    const userId = req.session.userId;

    if (!userId) {
        return res.status(401).json({ error: 'Not authenticated' });
    }

    try {
        const doctor = await Doctor.findOne({ userID: userId });

        if (!doctor) {
            return res.status(403).json({ error: 'Not authorized' });
        }

        const { appointmentId, patientId, diagnosis, prescription, notes, followUp } = req.body;

        // Create new prescription
        const newPrescription = new Prescription({
            appointmentId,
            patientId,
            doctorId: doctor._id,
            diagnosis,
            prescription,
            notes,
            followUp: followUp || null
        });

        await newPrescription.save();

        // Update appointment status to completed
        await Appointment.findByIdAndUpdate(appointmentId, { status: 'Completed' });

        return res.status(200).json({
            success: true,
            message: 'Prescription added successfully',
            prescriptionId: newPrescription._id
        });
    } catch (error) {
        console.error('Error adding prescription:', error);
        return res.status(500).json({ error: 'Server error' });
    }
});

// Add billing route
app.post('/doctor/billing/add', async (req, res) => {
    const userId = req.session.userId;

    if (!userId) {
        return res.status(401).json({ error: 'Not authenticated' });
    }

    try {
        const doctor = await Doctor.findOne({ userID: userId });

        if (!doctor) {
            return res.status(403).json({ error: 'Not authorized' });
        }

        const { prescriptionId, consultationFee, medicationFee, otherCharges, billNotes } = req.body;

        // Get the prescription to find the patient
        const prescription = await Prescription.findById(prescriptionId);

        if (!prescription) {
            return res.status(404).json({ error: 'Prescription not found' });
        }

        // Calculate total amount
        const totalAmount = Number(consultationFee) + Number(medicationFee) + Number(otherCharges);

        // Create new billing
        const newBilling = new Billing({
            prescriptionId,
            patientId: prescription.patientId,
            doctorId: doctor._id,
            consultationFee,
            medicationFee: medicationFee || 0,
            otherCharges: otherCharges || 0,
            totalAmount,
            notes: billNotes
        });

        await newBilling.save();

        return res.status(200).json({
            success: true,
            message: 'Billing added successfully'
        });
    } catch (error) {
        console.error('Error adding billing:', error);
        return res.status(500).json({ error: 'Server error' });
    }
});

// Route for complete appointment process
app.post('/doctor/appointments/complete', async (req, res) => {
    const userId = req.session.userId;

    if (!userId) {
        return res.status(401).json({ error: 'Not authenticated' });
    }

    try {
        const { appointmentId, diagnosis, prescription, notes, followUp, consultationFee, medicationFee, otherCharges, billNotes } = req.body;

        const doctor = await Doctor.findOne({ userID: userId });

        if (!doctor) {
            return res.status(403).json({ error: 'Not authorized' });
        }

        // Get the appointment
        const appointment = await Appointment.findById(appointmentId);

        if (!appointment) {
            return res.status(404).json({ error: 'Appointment not found' });
        }

        // Get the patient
        const patient = await Patient.findOne({ userID: appointment.userID });

        if (!patient) {
            return res.status(404).json({ error: 'Patient not found' });
        }

        // Create prescription
        const newPrescription = new Prescription({
            appointmentId,
            patientId: patient._id,
            doctorId: doctor._id,
            diagnosis,
            prescription,
            notes,
            followUp: followUp || null
        });

        await newPrescription.save();

        // Calculate total amount
        const totalAmount = Number(consultationFee) + Number(medicationFee || 0) + Number(otherCharges || 0);

        // Create billing
        const newBilling = new Billing({
            prescriptionId: newPrescription._id,
            patientId: patient._id,
            doctorId: doctor._id,
            consultationFee,
            medicationFee: medicationFee || 0,
            otherCharges: otherCharges || 0,
            totalAmount,
            notes: billNotes
        });

        await newBilling.save();

        // Update appointment status
        appointment.status = 'Completed';
        await appointment.save();

        return res.status(200).json({
            success: true,
            message: 'Appointment completed successfully'
        });
    } catch (error) {
        console.error('Error completing appointment:', error);
        return res.status(500).json({ error: 'Server error' });
    }
});

// Route for doctor's patients
app.get('/doctor/patients', async (req, res) => {
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

        // Find all appointments for this doctor
        const appointments = await Appointment.find({ doctor: doctor.name });

        // Get unique patient IDs
        const patientUserIds = [...new Set(appointments.map(app => app.userID.toString()))];

        // Find patient details
        const patients = await Patient.find({
            userID: { $in: patientUserIds }
        }).populate('userID');

        // For each patient, get their last appointment
        const patientData = [];
        for (const patient of patients) {
            const lastAppointment = await Appointment.findOne({
                userID: patient.userID,
                doctor: doctor.name
            }).sort({ date: -1, time: -1 });

            // Count total appointments
            const appointmentCount = await Appointment.countDocuments({
                userID: patient.userID,
                doctor: doctor.name
            });

            patientData.push({
                id: patient._id,
                name: patient.name,
                age: calculateAge(patient.dob),
                gender: patient.gender,
                phone: patient.contactDetails.phone,
                email: patient.contactDetails.email,
                lastVisit: lastAppointment ? lastAppointment.date : 'N/A',
                visitCount: appointmentCount
            });
        }

        res.render('doctorPatients', {
            doctor,
            patients: patientData
        });
    } catch (error) {
        console.error('Error loading doctor patients:', error);
        res.status(500).send('Internal Server Error');
    }
});

// Route for doctor's schedule
app.get('/doctor/schedule', async (req, res) => {
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

        // Get current week's appointments
        const today = new Date();
        const startOfWeek = new Date(today);
        startOfWeek.setDate(today.getDate() - today.getDay()); // Start from Sunday

        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(startOfWeek.getDate() + 6); // End on Saturday

        const startDateStr = startOfWeek.toISOString().split('T')[0];
        const endDateStr = endOfWeek.toISOString().split('T')[0];

        const weekAppointments = await Appointment.find({
            doctor: doctor.name,
            date: { $gte: startDateStr, $lte: endDateStr }
        }).sort({ date: 1, time: 1 });

        // Group appointments by date
        const appointmentsByDate = {};
        for (const appointment of weekAppointments) {
            if (!appointmentsByDate[appointment.date]) {
                appointmentsByDate[appointment.date] = [];
            }

            // Get patient info
            const patient = await Patient.findOne({ userID: appointment.userID });

            appointmentsByDate[appointment.date].push({
                id: appointment._id,
                time: appointment.time,
                patientName: patient ? patient.name : 'Unknown',
                purpose: appointment.specialization,
                status: appointment.status
            });
        }

        res.render('doctorSchedule', {
            doctor,
            startDate: startOfWeek,
            endDate: endOfWeek,
            appointmentsByDate
        });
    } catch (error) {
        console.error('Error loading doctor schedule:', error);
        res.status(500).send('Internal Server Error');
    }
});

// Route for doctor's prescriptions
app.get('/doctor/prescriptions', async (req, res) => {
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

        // Get all prescriptions by this doctor
        const prescriptions = await Prescription.find({
            doctorId: doctor._id
        }).sort({ createdAt: -1 });

        // Process prescriptions to include patient information
        const prescriptionData = [];
        for (const prescription of prescriptions) {
            const patient = await Patient.findById(prescription.patientId);
            const appointment = await Appointment.findById(prescription.appointmentId);

            if (patient && appointment) {
                prescriptionData.push({
                    id: prescription._id,
                    patientName: patient.name,
                    diagnosis: prescription.diagnosis,
                    prescription: prescription.prescription,
                    date: appointment.date,
                    status: prescription.status
                });
            }
        }

        res.render('doctorPrescriptions', {
            doctor,
            prescriptions: prescriptionData
        });
    } catch (error) {
        console.error('Error loading doctor prescriptions:', error);
        res.status(500).send('Internal Server Error');
    }
});

// Route for doctor's billing
app.get('/doctor/billing', async (req, res) => {
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

        // Get all billings by this doctor
        const billings = await Billing.find({
            doctorId: doctor._id
        }).sort({ createdAt: -1 });

        // Process billings to include patient information
        const billingData = [];
        for (const billing of billings) {
            const patient = await Patient.findById(billing.patientId);
            const prescription = await Prescription.findById(billing.prescriptionId);

            if (patient && prescription) {
                billingData.push({
                    id: billing._id,
                    patientName: patient.name,
                    diagnosis: prescription.diagnosis,
                    date: billing.createdAt,
                    totalAmount: billing.totalAmount,
                    paymentStatus: billing.paymentStatus
                });
            }
        }

        res.render('doctorBilling', {
            doctor,
            billings: billingData
        });
    } catch (error) {
        console.error('Error loading doctor billing:', error);
        res.status(500).send('Internal Server Error');
    }
});

// Route for doctor's profile
app.get('/doctor/profile', async (req, res) => {
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

        res.render('doctorProfile', {
            doctor
        });
    } catch (error) {
        console.error('Error loading doctor profile:', error);
        res.status(500).send('Internal Server Error');
    }
});

// Update doctor's profile
app.post('/doctor/profile/update', async (req, res) => {
    const userId = req.session.userId;

    if (!userId) {
        return res.status(401).json({ error: 'Not authenticated' });
    }

    try {
        const doctor = await Doctor.findOne({ userID: userId });

        if (!doctor) {
            return res.status(403).json({ error: 'Not authorized' });
        }

        const { name, specialization, experience, phone, email } = req.body;

        // Update doctor information
        doctor.name = name;
        doctor.specialization = specialization;
        doctor.experience = experience;
        doctor.contactDetails.phone = phone;
        doctor.contactDetails.email = email;

        await doctor.save();

        return res.status(200).json({
            success: true,
            message: 'Profile updated successfully'
        });
    } catch (error) {
        console.error('Error updating doctor profile:', error);
        return res.status(500).json({ error: 'Server error' });
    }
});

app.listen(5085, () => {
    console.log('Serving on port 5085');
});