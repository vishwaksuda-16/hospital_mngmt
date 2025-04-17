const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const ObjectId = mongoose.Types.ObjectId;
const session = require('express-session');
const { User, Patient, Doctor, Admin, Appointment } = require('./models/user');

mongoose.connect('mongodb://localhost:27017/Hospital', {
    useNewUrlParser: true,
    useUnifiedTopology: true
});

const db = mongoose.connection;
db.on("error", console.error.bind(console, "connection error:"));
db.once("open", () => {
    console.log("Database connected");
});

const app = express();

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

app.get('/feedback', (req, res) => {
    res.render('feedback');
})

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
            address,
            medicalHistory,
            insuranceDetails: { provider, policyNumber }
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

        res.redirect('/dashboard');
    } catch (error) {
        console.log(error);
        res.status(400).send('Login Failed!!');
        res.redirect('/home');
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
        } else {
            // Create new appointment
            console.log('New appointment data:', req.body);
            const { doctor, speciality, date, time } = req.body;
            appointment = new Appointment({
                userID: userId,
                doctor,
                speciality,
                date,
                time
            });
            await appointment.save();
            console.log(`Created new appointment ${appointment._id}`);
        }
        res.redirect('/appointments');
    } catch (error) {
        console.error('Error processing appointment:', error);
        res.status(500).send('Failed to process appointment');
    }
});


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

        res.render('Appointments', {
            user: patient,
            appointments: appointments
        });
    } catch (err) {
        console.error('Error fetching appointments:', err);
        res.status(500).send('Internal Server Error');
    }
});


app.delete('/appointments/:id', async (req, res) => {
    try {
        const { id } = req.params;

        if (!ObjectId.isValid(id)) {
            return res.status(400).send('Invalid appointment ID');
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


app.listen(5085, () => {
    console.log('Serving on port 5085');
});