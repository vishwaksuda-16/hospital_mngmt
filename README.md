# Hospital Management System (HMS)

A comprehensive web-based Hospital Management System built with Node.js and EJS templating to streamline healthcare operations.

## Overview

This Hospital Management System (HMS) is designed to digitize and efficiently manage hospital operations including patient records, appointments, billing, and administrative tasks. The system provides separate interfaces for patients, doctors, and administrative staff.

## Features

- **User Authentication**: Secure login and signup functionality with role-based access control
- **Dashboard**: Role-specific dashboards displaying relevant information
- **Patient Portal**: Access to medical records, appointment scheduling, and billing information
- **Doctor Management**: Profile management and patient appointment tracking
- **Administrative Tools**: User management and system configuration
- **Medical Records**: Electronic storage and retrieval of patient medical history
- **Appointment Scheduling**: Online booking and management of appointments
- **Billing and Payments**: Invoice generation and payment tracking
- **Document Management**: Upload and access of medical documents
- **Feedback System**: Collection and management of patient feedback

## Tech Stack

- **Backend**: Node.js, Express.js
- **Frontend**: EJS (Embedded JavaScript templates), CSS, JavaScript
- **Database**: MongoDB (Schema defined in models/user.js)
- **Environment Variables**: Configuration via mail.env

## Project Structure

```
HMS/
├── app.js                  # Main application entry point
├── mail.env                # Environment variables for email configuration
├── package.json            # Project dependencies
├── views/                  # EJS template files
│   ├── about.ejs           # About page
│   ├── admin-form.ejs      # Admin registration form
│   ├── Appointments.ejs    # Appointment management
│   ├── Billing.ejs         # Billing information
│   ├── Dashboard.ejs       # Main dashboard
│   ├── doctor-form.ejs     # Doctor registration form
│   ├── doctorinfo.ejs      # Doctor information
│   ├── Documents.ejs       # Document management
│   ├── feedback.ejs        # Feedback system
│   ├── home.ejs            # Homepage
│   ├── login.ejs           # Login page
│   ├── Medical_records.ejs # Patient medical records
│   ├── patient-form.ejs    # Patient registration form
│   ├── patient-portal.ejs  # Patient portal
│   ├── Profile.ejs         # User profile
│   ├── services.ejs        # Services information
│   └── signup.ejs          # Signup page
├── models/                 # Database models
│   └── user.js             # User model schema
└── public/                 # Static assets
    ├── styles/             # CSS files
    ├── script/             # JavaScript files
    └── images/             # Image resources
```

## Installation

1. Clone the repository
   ```
   git clone https://github.com/yourusername/hospital-management-system.git
   cd HMS
   ```

2. Install dependencies
   ```
   npm install
   ```

3. Configure environment variables
   - Rename `mail.env.example` to `mail.env` (if applicable)
   - Update the environment variables with your configuration

4. Start the application
   ```
   npm start
   ```

5. Access the application
   - Open your browser and navigate to `http://localhost:5085`

## Usage

1. **Login/Signup**: Create an account or login with existing credentials
2. **Navigation**: Use the dashboard to access different modules
3. **Patient Management**: Register patients and manage their records
4. **Appointment Scheduling**: Create, view, and manage appointments
5. **Billing**: Generate and track invoices
6. **Document Management**: Upload and access medical documents

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- [Node.js](https://nodejs.org/)
- [Express.js](https://expressjs.com/)
- [EJS](https://ejs.co/)
- [MongoDB](https://www.mongodb.com/)

## Contact

Your Name - Vishwak - 230701385@rajalakshmi.edu.in
Project Link: https://github.com/230701385/Software-Construction
