// Function to show toast notification
function showToast(message, type = 'success') {
    // Create toast container if it doesn't exist
    let toastContainer = document.querySelector('.toast-container');
    if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.className = 'toast-container';
        document.body.appendChild(toastContainer);
    }

    // Create toast element
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <div class="toast-content">
            <i class="fas ${type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle'}"></i>
            <div class="message">
                <span>${message}</span>
            </div>
        </div>
        <div class="progress"></div>
    `;

    toastContainer.appendChild(toast);

    // Auto remove toast after 5 seconds
    setTimeout(() => {
        toast.classList.add('hide');
        setTimeout(() => {
            toast.remove();
        }, 500);
    }, 5000);
}

// Function to add SMS notification to the UI after successful booking
function addSmsNotification(appointmentId, phone) {
    const appointmentRow = document.querySelector(`tr[data-id="${appointmentId}"]`);
    if (!appointmentRow) return;

    // Check if notification already exists
    if (appointmentRow.querySelector('.sms-notification')) return;

    // Create SMS notification element
    const notificationCell = document.createElement('div');
    notificationCell.className = 'sms-notification';
    notificationCell.innerHTML = `
        <div class="notification-badge">
            <i class="fas fa-sms"></i> SMS sent to ${maskPhoneNumber(phone)}
        </div>
        <div class="notification-info">
            <small>Reminder will be sent 1 hour before appointment</small>
        </div>
    `;

    // Add to the actions column
    const actionsCell = appointmentRow.querySelector('.action-buttons');
    if (actionsCell) {
        actionsCell.appendChild(notificationCell);
    }
}

// Function to mask phone number for privacy
function maskPhoneNumber(phone) {
    if (!phone) return '';
    return phone.replace(/(\d{3})(\d{3})(\d{4})/, '($1) ***-$3');
}

// Check for URL parameters after redirect
document.addEventListener('DOMContentLoaded', function () {
    const urlParams = new URLSearchParams(window.location.search);
    const smsStatus = urlParams.get('sms');
    const appointmentId = urlParams.get('appointmentId');

    if (smsStatus === 'sent') {
        showToast('Appointment confirmed! SMS notification sent.');
    } else if (smsStatus === 'failed') {
        showToast('Appointment confirmed, but SMS notification failed.', 'error');
    }

    // Clean up URL parameters
    if (smsStatus) {
        const newUrl = window.location.pathname;
        window.history.replaceState({}, document.title, newUrl);
    }
});

// Add event listener for appointment form submission
document.addEventListener('DOMContentLoaded', function () {
    const appointmentForm = document.querySelector('form[action="/appointments"]');
    if (appointmentForm) {
        appointmentForm.addEventListener('submit', function (e) {
            // You can add loading indicator or disable submit button here
            const submitBtn = this.querySelector('button[type="submit"]');
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';
            }
        });
    }
});