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
});

// Cancel button functionality
document.querySelectorAll('.btn-secondary').forEach(btn => {
    if (btn.textContent.trim() === 'Cancel') {
        btn.addEventListener('click', function () {
            console.log('Changes canceled! In a real application, this would reset the form.');
        });
    }
});

document.addEventListener('DOMContentLoaded', function () {
    // Get modal elements
    const modal = document.getElementById('rescheduleModal');
    const closeBtn = document.querySelector('.close');
    const closeBtnAction = document.getElementById('closeModal');

    // Get the reschedule form
    const rescheduleForm = document.getElementById('rescheduleForm');

    // Get all reschedule buttons
    const rescheduleButtons = document.querySelectorAll('.reschedule-btn');

    // Add click event to all reschedule buttons
    rescheduleButtons.forEach(button => {
        button.addEventListener('click', function () {
            // Get appointment data from data attributes
            const id = this.getAttribute('data-id');
            const doctor = this.getAttribute('data-doctor');
            const speciality = this.getAttribute('data-speciality');
            const date = new Date(this.getAttribute('data-date'));
            const time = this.getAttribute('data-time');

            // Format date for date input (YYYY-MM-DD)
            const formattedDate = date.toISOString().split('T')[0];

            // Set values in the modal form
            document.getElementById('appointmentId').value = id;
            document.getElementById('rescheduleDoctor').value = doctor;
            document.getElementById('rescheduleSpeciality').value = speciality;
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
    closeBtn.addEventListener('click', function () {
        modal.style.display = 'none';
    });

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
});

document.addEventListener('DOMContentLoaded', function () {
    console.log('Script loaded and DOM fully parsed');
    const deleteModal = document.getElementById('deleteModal');
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
});

