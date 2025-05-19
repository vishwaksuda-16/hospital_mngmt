const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const UserSchema = new Schema({
    UserName: { type: String, required: true },
    Password: { type: String, required: true },
    Role: { type: String, required: true },
    resetToken: { type: String },
    resetTokenExpiry: { type: Date }
});

const User = mongoose.model('User', UserSchema);

const PatientSchema = new Schema({
    userID: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true },
    dob: { type: Date, required: true },
    gender: { type: String, required: true },
    contactDetails: {
        phone: { type: String, required: true },
        email: { type: String, required: true }
    },
    address: { type: String, required: true }
}, { timestamps: true });

const Patient = mongoose.model('Patient', PatientSchema);

const DocSchema = new Schema({
    userID: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true },
    dob: { type: Date, required: true },
    gender: { type: String, required: true },
    contactDetails: {
        phone: { type: String, required: true },
        email: { type: String, required: true }
    },
    licenseNumber: { type: String, required: true },
    specialization: { type: String, required: true },
    experience: { type: Number, required: true },
})

const Doctor = mongoose.model('Doctor', DocSchema);


const AppointmentSchema = new Schema({
    userID: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    doctor: { type: String, required: true },
    specialization: { type: String, required: true },
    date: { type: String, required: true },
    time: { type: String, required: true },
    status: { type: String, enum: ['Pending', 'Confirmed', 'Completed', 'Cancelled'], default: 'Pending' }
}, { timestamps: true });

const Appointment = mongoose.model('Appointment', AppointmentSchema);

const FeedbackSchema = new Schema({
    userID: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    feedback: { type: String, required: true },
    rating: { type: Number, required: true }
});

const Feedback = mongoose.model('Feedback', FeedbackSchema);


const BillingSchema = new mongoose.Schema({
    doctorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor' },
    patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient' },
    appointmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Appointment' },
    amount: Number,
    notes: String,
    status: { type: String, enum: ['Pending', 'Paid'], default: 'Pending' },
    createdAt: { type: Date, default: Date.now },
    paymentMethod: String
});


const Billing = mongoose.model('Billing', BillingSchema);



module.exports = { User, Patient, Doctor, Appointment, Feedback, Billing };