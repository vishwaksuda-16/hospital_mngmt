// Toggle sidebar on mobile
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    sidebar.classList.toggle('expanded');
}

// Switch between tabs
function switchTab(tabId, btnElement) {
    // Hide all tab contents in the same container
    const tabContainer = btnElement.closest('.card');
    const tabs = tabContainer.querySelectorAll('.tab-content');
    tabs.forEach(tab => {
        tab.classList.remove('active');
    });

    // Show selected tab
    const selectedTab = document.getElementById(tabId);
    if (selectedTab) {
        selectedTab.classList.add('active');
    }

    // Update active tab button
    const tabButtons = tabContainer.querySelectorAll('.tab-btn');
    tabButtons.forEach(btn => {
        btn.classList.remove('active');
    });
    btnElement.classList.add('active');
}

// Logout function
function logout() {
    // In a real application, this would handle logout logic
    alert('Logging out...');
    // Redirect to login page
    // window.location.href = 'login.html';
}

// Initialize responsive behavior
document.addEventListener('DOMContentLoaded', function () {
    // Set sidebar state based on screen size
    if (window.innerWidth <= 992) {
        const sidebar = document.getElementById('sidebar');
        sidebar.classList.remove('expanded');
    }

    // Add any other initialization code here

    // PROFILE PAGE FUNCTIONALITY
    // =========================

    // Check if we're on the profile page
    if (document.getElementById('profile-page')) {
        initializeProfileForms();
    }

    // Check if we're on the appointments page
    if (document.getElementById('rescheduleModal') ||
        document.getElementById('deleteModal') ||
        document.getElementById('doctor-data')) {
        initializeAppointmentFunctions();
    }
});

// Profile Page Functions
function initializeProfileForms() {
    // Personal Information Form
    const personalInfoForm = document.getElementById('personal-info-form');
    const personalInfoStatus = document.getElementById('personal-info-status');
    const personalInfoCancel = document.getElementById('personal-info-cancel');

    // Original values to revert to on cancel
    let originalPersonalInfo = {};

    // Store original values when page loads
    document.querySelectorAll('#personal-info-form input, #personal-info-form select').forEach(field => {
        originalPersonalInfo[field.id] = field.value;
    });

    personalInfoCancel.addEventListener('click', function () {
        // Revert to original values
        for (const [id, value] of Object.entries(originalPersonalInfo)) {
            document.getElementById(id).value = value;
        }
        personalInfoStatus.textContent = '';
        personalInfoStatus.className = 'status-message';
    });

    personalInfoForm.addEventListener('submit', function (e) {
        e.preventDefault();

        // Collect form data
        const formData = new FormData(personalInfoForm);
        const firstName = formData.get('first-name');
        const lastName = formData.get('last-name');

        const userData = {
            name: `${firstName} ${lastName}`,
            dob: formData.get('dob'),
            gender: formData.get('gender'),
            contactDetails: {
                email: formData.get('email'),
                phone: formData.get('phone')
            },
            address: formData.get('address')
        };

        // Send data to server
        fetch('/api/user/profile', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(userData)
        })
            .then(response => {
                if (!response.ok) {
                    throw new Error('Failed to update personal information');
                }
                return response.json();
            })
            .then(data => {
                // Update original values
                document.querySelectorAll('#personal-info-form input, #personal-info-form select').forEach(field => {
                    originalPersonalInfo[field.id] = field.value;
                });

                // Show success message
                personalInfoStatus.textContent = 'Personal information updated successfully!';
                personalInfoStatus.className = 'status-message success';

                // Update user name in the sidebar and topbar
                document.querySelector('.user-name').textContent = userData.name;
                document.querySelector('.topbar-right span').textContent = `Welcome, ${firstName}`;
                document.querySelector('.user-avatar').textContent = firstName[0];
            })
            .catch(error => {
                console.error('Error:', error);
                personalInfoStatus.textContent = error.message;
                personalInfoStatus.className = 'status-message error';
            });
    });

    // Password Form
    const passwordForm = document.getElementById('password-form');
    const passwordStatus = document.getElementById('password-status');
    const passwordCancel = document.getElementById('password-cancel');

    passwordCancel.addEventListener('click', function () {
        // Clear password fields
        document.getElementById('current-password').value = '';
        document.getElementById('new-password').value = '';
        document.getElementById('confirm-password').value = '';
        passwordStatus.textContent = '';
        passwordStatus.className = 'status-message';
    });

    passwordForm.addEventListener('submit', function (e) {
        e.preventDefault();

        // Collect form data
        const formData = new FormData(passwordForm);
        const currentPassword = formData.get('current-password');
        const newPassword = formData.get('new-password');
        const confirmPassword = formData.get('confirm-password');

        // Validate passwords
        if (newPassword !== confirmPassword) {
            passwordStatus.textContent = 'New password and confirmation do not match';
            passwordStatus.className = 'status-message error';
            return;
        }

        // Send data to server
        fetch('/api/user/password', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                currentPassword,
                newPassword
            })
        })
            .then(response => {
                if (!response.ok) {
                    throw new Error('Failed to update password');
                }
                return response.json();
            })
            .then(data => {
                // Clear password fields
                document.getElementById('current-password').value = '';
                document.getElementById('new-password').value = '';
                document.getElementById('confirm-password').value = '';

                // Show success message
                passwordStatus.textContent = 'Password updated successfully!';
                passwordStatus.className = 'status-message success';
            })
            .catch(error => {
                console.error('Error:', error);
                passwordStatus.textContent = error.message;
                passwordStatus.className = 'status-message error';
            });
    });
}

// Appointments Page Functions
function initializeAppointmentFunctions() {
    // Modal elements
    const modal = document.getElementById('rescheduleModal');
    const deleteModal = document.getElementById('deleteModal');

    // Handle reschedule modal if present
    if (modal) {
        const closeBtn = document.querySelector('.close');
        const closeBtnAction = document.getElementById('closeModal');
        const rescheduleButtons = document.querySelectorAll('.reschedule-btn');

        // Add click event to all reschedule buttons
        rescheduleButtons.forEach(button => {
            button.addEventListener('click', function () {
                // Get appointment data from data attributes
                const id = this.getAttribute('data-id');
                const doctor = this.getAttribute('data-doctor');
                const specialization = this.getAttribute('data-specialization');
                const date = new Date(this.getAttribute('data-date'));
                const time = this.getAttribute('data-time');

                // Format date for date input (YYYY-MM-DD)
                const formattedDate = date.toISOString().split('T')[0];

                // Set values in the modal form
                document.getElementById('appointmentId').value = id;
                document.getElementById('rescheduleDoctor').value = doctor;
                document.getElementById('reschedulespecialization').value = specialization;
                document.getElementById('rescheduleDate').value = formattedDate;

                // Set the time if it matches one of the options
                const timeSelect = document.getElementById('rescheduleTime');
                for (let i = 0; i < timeSelect.options.length; i++) {
                    if (timeSelect.options[i].value === time) {
                        timeSelect.selectedIndex = i;
                        break;
                    }
                }

                // Set minimum date to today
                const today = new Date().toISOString().split('T')[0];
                document.getElementById('rescheduleDate').min = today;

                // Show the modal
                modal.style.display = 'block';
            });
        });

        // Close modal when clicking the X
        if (closeBtn) {
            closeBtn.addEventListener('click', function () {
                modal.style.display = 'none';
            });
        }

        // Close modal when clicking the Cancel button
        if (closeBtnAction) {
            closeBtnAction.addEventListener('click', function () {
                modal.style.display = 'none';
            });
        }

        // Close modal when clicking outside of it
        window.addEventListener('click', function (event) {
            if (event.target === modal) {
                modal.style.display = 'none';
            }
        });
    }

    // Handle delete appointment modal if present
    if (deleteModal) {
        const confirmDeleteBtn = document.getElementById('confirmDeleteBtn');
        const cancelDeleteBtn = document.getElementById('cancelDeleteBtn');
        let currentAppointmentId = null;

        document.querySelectorAll('.btn-danger').forEach(button => {
            button.addEventListener('click', function () {
                currentAppointmentId = this.getAttribute('data-id');
                deleteModal.style.display = 'flex';
            });
        });

        cancelDeleteBtn.addEventListener('click', function () {
            deleteModal.style.display = 'none';
            currentAppointmentId = null;
        });

        confirmDeleteBtn.addEventListener('click', async function () {
            if (currentAppointmentId) {
                try {
                    const response = await fetch(`/appointments/${currentAppointmentId}`, {
                        method: 'DELETE'
                    });

                    if (response.ok) {
                        console.log('Appointment deleted successfully');
                        window.location.reload();
                    } else {
                        const data = await response.text();
                        console.log(`Failed to delete appointment: ${data}`);
                    }
                } catch (error) {
                    console.error('Error deleting appointment:', error);
                    alert('Error occurred while deleting appointment');
                } finally {
                    deleteModal.style.display = 'none';
                    currentAppointmentId = null;
                }
            }
        });
    }

    // Handle doctor/specialization functionality if present
    const doctorDataElement = document.getElementById('doctor-data');
    const specializationSelect = document.getElementById('specialization');
    const doctorSelect = document.getElementById('doctor');

    if (doctorDataElement && specializationSelect && doctorSelect) {
        try {
            const doctorData = JSON.parse(doctorDataElement.textContent);
            const dateField = document.getElementById('date');

            // Set min date for appointment date field
            if (dateField) {
                const today = new Date().toISOString().split('T')[0];
                dateField.min = today;
            }

            // Keep track of whether we're currently updating from another dropdown
            // to prevent infinite loops
            let isUpdatingFromOtherDropdown = false;

            // Function to populate all doctors
            function populateAllDoctors() {
                doctorSelect.innerHTML = '<option value="">Select Doctor</option>';

                doctorData.forEach(doc => {
                    const option = document.createElement('option');
                    option.value = doc.name;
                    option.textContent = doc.name;
                    doctorSelect.appendChild(option);
                });
            }

            // Function to filter doctors by specialization
            function filterDoctorsBySpecialization(specialization) {
                if (isUpdatingFromOtherDropdown) return;

                isUpdatingFromOtherDropdown = true;

                // If no specialization is selected, show all doctors
                if (!specialization) {
                    populateAllDoctors();
                    isUpdatingFromOtherDropdown = false;
                    return;
                }

                // Clear current options
                doctorSelect.innerHTML = '<option value="">Select Doctor</option>';

                const matchingDoctors = doctorData.filter(doc => doc.specialization === specialization);

                matchingDoctors.forEach(doc => {
                    const option = document.createElement('option');
                    option.value = doc.name;
                    option.textContent = doc.name;
                    doctorSelect.appendChild(option);
                });

                isUpdatingFromOtherDropdown = false;
            }

            // Function to set specialization based on selected doctor
            function setSpecializationFromDoctor(doctorName) {
                if (isUpdatingFromOtherDropdown) return;

                isUpdatingFromOtherDropdown = true;

                if (!doctorName) {
                    // If no doctor is selected, don't change specialization
                    isUpdatingFromOtherDropdown = false;
                    return;
                }

                const doctor = doctorData.find(doc => doc.name === doctorName);
                if (doctor) {
                    specializationSelect.value = doctor.specialization;
                }

                isUpdatingFromOtherDropdown = false;
            }

            // Initialize doctor dropdown with all doctors
            populateAllDoctors();

            // Add event listener for specialization change
            specializationSelect.addEventListener('change', function () {
                const selectedSpecialization = this.value;
                filterDoctorsBySpecialization(selectedSpecialization);
            });

            // Add event listener for doctor change
            doctorSelect.addEventListener('change', function () {
                const selectedDoctor = this.value;
                setSpecializationFromDoctor(selectedDoctor);
            });

        } catch (error) {
            console.error('Error initializing doctor selection:', error);
        }
    }
}