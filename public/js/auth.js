// Authentication JavaScript functionality

// Global variables
let isSubmitting = false;

// Initialize signup form
function initSignupForm() {
    const form = document.getElementById('signupForm');
    const passwordField = document.getElementById('password');
    const passwordToggle = document.getElementById('passwordToggle');
    const submitBtn = document.getElementById('submitBtn');
    
    if (!form) return;
    
    // Password requirements validation
    setupPasswordValidation(passwordField);
    
    // Password toggle functionality
    setupPasswordToggle(passwordField, passwordToggle);
    
    // Form submission
    form.addEventListener('submit', handleSignupSubmit);
    
    // Real-time validation
    setupRealTimeValidation(form);
}

// Initialize signin form
function initSigninForm() {
    const form = document.getElementById('signinForm');
    const passwordField = document.getElementById('password');
    const passwordToggle = document.getElementById('passwordToggle');
    
    if (!form) return;
    
    // Password toggle functionality
    setupPasswordToggle(passwordField, passwordToggle);
    
    // Form submission
    form.addEventListener('submit', handleSigninSubmit);
    
    // Real-time validation
    setupRealTimeValidation(form);
}

// Password validation setup
function setupPasswordValidation(passwordField) {
    if (!passwordField) return;
    
    const requirementsList = document.querySelectorAll('.requirement');
    const strengthIndicator = document.getElementById('passwordStrength');
    
    passwordField.addEventListener('input', function() {
        const password = this.value;
        
        // Check requirements
        const requirements = {
            length: password.length >= 8,
            uppercase: /[A-Z]/.test(password),
            lowercase: /[a-z]/.test(password),
            number: /\d/.test(password),
            special: /[@$!%*?&]/.test(password)
        };
        
        // Update requirement indicators
        requirementsList.forEach(req => {
            const type = req.getAttribute('data-requirement');
            if (requirements[type]) {
                req.classList.add('valid');
            } else {
                req.classList.remove('valid');
            }
        });
        
        // Update strength indicator
        if (strengthIndicator) {
            const score = Object.values(requirements).filter(Boolean).length;
            strengthIndicator.className = 'password-strength';
            
            if (score >= 5) {
                strengthIndicator.classList.add('strong');
            } else if (score >= 4) {
                strengthIndicator.classList.add('good');
            } else if (score >= 3) {
                strengthIndicator.classList.add('fair');
            } else if (score >= 1) {
                strengthIndicator.classList.add('weak');
            }
        }
    });
}

// Password toggle setup
function setupPasswordToggle(passwordField, toggleBtn) {
    if (!passwordField || !toggleBtn) return;
    
    toggleBtn.addEventListener('click', function() {
        const type = passwordField.getAttribute('type') === 'password' ? 'text' : 'password';
        passwordField.setAttribute('type', type);
        
        const icon = toggleBtn.querySelector('.eye-icon');
        if (type === 'text') {
            icon.innerHTML = '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line>';
        } else {
            icon.innerHTML = '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle>';
        }
    });
}

// Real-time validation setup
function setupRealTimeValidation(form) {
    const inputs = form.querySelectorAll('input[required]');
    
    inputs.forEach(input => {
        let hasInteracted = false;
        
        // Mark as interacted when user starts typing
        input.addEventListener('input', function() {
            hasInteracted = true;
            if (this.classList.contains('error')) {
                validateField(this);
            }
        });
        
        // Only validate on blur if user has interacted with this specific field
        input.addEventListener('blur', function() {
            if (hasInteracted) {
                validateField(this);
            }
        });
        
        // Also mark as interacted if they focused and typed
        input.addEventListener('keydown', function() {
            hasInteracted = true;
        });
    });
}

// Field validation
function validateField(field) {
    const fieldName = field.name;
    const value = field.value.trim();
    const errorElement = document.getElementById(`${fieldName}-error`);
    
    let isValid = true;
    let errorMessage = '';
    
    // Required field check
    if (field.hasAttribute('required') && !value) {
        isValid = false;
        errorMessage = `${getFieldLabel(fieldName)} is required`;
    }
    
    // Email validation
    if (fieldName === 'email' && value) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(value)) {
            isValid = false;
            errorMessage = 'Please enter a valid email address';
        }
    }
    
    // Password validation
    if (fieldName === 'password' && value) {
        if (value.length < 8) {
            isValid = false;
            errorMessage = 'Password must be at least 8 characters long';
        } else if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/.test(value)) {
            isValid = false;
            errorMessage = 'Password must meet all requirements';
        }
    }
    
    // Name validation
    if ((fieldName === 'firstName' || fieldName === 'lastName') && value) {
        if (value.length < 2) {
            isValid = false;
            errorMessage = `${getFieldLabel(fieldName)} must be at least 2 characters`;
        } else if (!/^[A-Za-z\s'-]+$/.test(value)) {
            isValid = false;
            errorMessage = `${getFieldLabel(fieldName)} can only contain letters, spaces, hyphens, and apostrophes`;
        }
    }
    
    // Checkbox validation
    if (field.type === 'checkbox' && field.hasAttribute('required') && !field.checked) {
        isValid = false;
        if (fieldName === 'terms') {
            errorMessage = 'You must agree to the Terms & Conditions';
        } else if (fieldName === 'privacy') {
            errorMessage = 'You must agree to the Privacy Policy';
        } else {
            errorMessage = `${getFieldLabel(fieldName)} is required`;
        }
    }
    
    // Update UI
    updateFieldValidation(field, errorElement, isValid, errorMessage);
    
    return isValid;
}

// Update field validation UI
function updateFieldValidation(field, errorElement, isValid, errorMessage) {
    if (isValid) {
        field.classList.remove('error');
        if (errorElement) {
            errorElement.classList.remove('show');
            errorElement.textContent = '';
        }
    } else {
        field.classList.add('error');
        if (errorElement) {
            errorElement.classList.add('show');
            errorElement.textContent = errorMessage;
        }
    }
}

// Get field label
function getFieldLabel(fieldName) {
    const labels = {
        email: 'Email address',
        password: 'Password',
        firstName: 'First name',
        lastName: 'Last name',
        terms: 'Terms & Conditions',
        privacy: 'Privacy Policy'
    };
    return labels[fieldName] || fieldName;
}

// Handle signup form submission
async function handleSignupSubmit(e) {
    e.preventDefault();
    
    if (isSubmitting) return;
    
    const form = e.target;
    const formData = new FormData(form);
    const submitBtn = document.getElementById('submitBtn');
    const loadingOverlay = document.getElementById('loadingOverlay');
    
    // Validate all fields
    const inputs = form.querySelectorAll('input[required]');
    let isFormValid = true;
    
    inputs.forEach(input => {
        if (!validateField(input)) {
            isFormValid = false;
        }
    });
    
    if (!isFormValid) {
        showAlert('Please fix the errors below', 'error');
        return;
    }
    
    // Start loading state
    isSubmitting = true;
    submitBtn.classList.add('loading');
    submitBtn.disabled = true;
    loadingOverlay.classList.add('show');
    
    try {
        const response = await fetch('/auth/sign-up', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Requested-With': 'XMLHttpRequest'
            },
            body: JSON.stringify(Object.fromEntries(formData))
        });
        
        const result = await response.json();
        
        if (response.ok && result.success) {
            // Show success modal
            showSuccessModal(result.message, formData.get('email'));
        } else {
            // Show error
            showAlert(result.message || 'An error occurred. Please try again.', 'error');
            
            // Handle field-specific errors
            if (result.field && result.error) {
                const field = document.getElementById(result.field);
                const errorElement = document.getElementById(`${result.field}-error`);
                updateFieldValidation(field, errorElement, false, result.message);
            }
        }
    } catch (error) {
        // Signup error handled by user notification
        showAlert('Network error. Please check your connection and try again.', 'error');
    } finally {
        // End loading state
        isSubmitting = false;
        submitBtn.classList.remove('loading');
        submitBtn.disabled = false;
        loadingOverlay.classList.remove('show');
    }
}

// Handle signin form submission
async function handleSigninSubmit(e) {
    e.preventDefault();
    
    if (isSubmitting) return;
    
    const form = e.target;
    const formData = new FormData(form);
    const submitBtn = document.getElementById('submitBtn');
    const loadingOverlay = document.getElementById('loadingOverlay');
    
    // Validate all fields when form is submitted
    const inputs = form.querySelectorAll('input[required]');
    let isFormValid = true;
    
    inputs.forEach(input => {
        if (!validateField(input)) {
            isFormValid = false;
        }
    });
    
    if (!isFormValid) {
        showAlert('Please fix the errors below', 'error');
        return;
    }
    
    // Start loading state
    isSubmitting = true;
    submitBtn.classList.add('loading');
    submitBtn.disabled = true;
    loadingOverlay.classList.add('show');
    
    try {
        const response = await fetch('/auth/sign-in', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Requested-With': 'XMLHttpRequest'
            },
            body: JSON.stringify(Object.fromEntries(formData))
        });
        
        const result = await response.json();
        
        if (response.ok && result.success) {
            // Show success message briefly then redirect
            showAlert('Sign in successful! Redirecting...', 'success');
            
            setTimeout(() => {
                window.location.href = result.data.redirectTo || '/dashboard';
            }, 1500);
        } else {
            // Show error
            showAlert(result.message || 'Invalid credentials. Please try again.', 'error');
        }
    } catch (error) {
        // Signin error handled by user notification
        showAlert('Network error. Please check your connection and try again.', 'error');
    } finally {
        // End loading state
        isSubmitting = false;
        submitBtn.classList.remove('loading');
        submitBtn.disabled = false;
        loadingOverlay.classList.remove('show');
    }
}

// Show success modal
function showSuccessModal(message, email) {
    const modal = document.getElementById('successModal');
    if (!modal) return;
    
    // Update modal content if needed
    const messageElement = modal.querySelector('.modal-message');
    if (messageElement && message) {
        messageElement.textContent = message;
    }
    
    // Show modal
    modal.classList.add('show');
    
    // Handle resend email button
    const resendBtn = document.getElementById('resendEmail');
    if (resendBtn) {
        resendBtn.addEventListener('click', async function() {
            try {
                const response = await fetch('/auth/resend-verification', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Requested-With': 'XMLHttpRequest'
                    },
                    body: JSON.stringify({ email: email })
                });
                
                const result = await response.json();
                
                if (response.ok && result.success) {
                    showAlert('Verification email sent!', 'success');
                } else {
                    showAlert(result.message || 'Failed to resend email', 'error');
                }
            } catch (error) {
                // Resend email error handled by user notification
                showAlert('Failed to resend email. Please try again.', 'error');
            }
        });
    }
    
    // Close modal when clicking outside
    modal.addEventListener('click', function(e) {
        if (e.target === modal) {
            modal.classList.remove('show');
        }
    });
}

// Show alert message
function showAlert(message, type = 'info') {
    // Remove existing alerts
    const existingAlerts = document.querySelectorAll('.alert.dynamic');
    existingAlerts.forEach(alert => alert.remove());
    
    // Create new alert
    const alert = document.createElement('div');
    alert.className = `alert alert-${type} dynamic`;
    alert.innerHTML = `
        <span class="alert-message">${message}</span>
        <button type="button" class="alert-close" onclick="this.parentElement.remove()">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
        </button>
    `;
    
    // Insert at top of form
    const form = document.querySelector('.auth-form');
    if (form) {
        form.insertBefore(alert, form.firstChild);
    }
    
    // Auto-remove success messages after 5 seconds
    if (type === 'success') {
        setTimeout(() => {
            if (alert.parentNode) {
                alert.remove();
            }
        }, 5000);
    }
    
    // Scroll to alert if needed
    alert.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// Handle social login buttons
function initSocialLogin() {
    const socialButtons = document.querySelectorAll('.social-btn');
    
    socialButtons.forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.preventDefault();
            
            // Extract provider from the href attribute
            const href = this.getAttribute('href');
            let provider = null;
            
            if (href && href.includes('/auth/')) {
                const match = href.match(/\/auth\/(\w+)/);
                if (match) {
                    provider = match[1];
                }
            }
            
            if (provider) {
                handleSocialLogin(provider);
            }
        });
    });
}

// Handle social login
async function handleSocialLogin(provider) {
    try {
        // Redirect to OAuth provider
        window.location.href = `/auth/${provider}`;
    } catch (error) {
        // Social login error handled by user notification
        showAlert(`Failed to sign in with ${provider}. Please try again.`, 'error');
    }
}

// Utility functions
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

function throttle(func, limit) {
    let lastFunc;
    let lastRan;
    return function() {
        const context = this;
        const args = arguments;
        if (!lastRan) {
            func.apply(context, args);
            lastRan = Date.now();
        } else {
            clearTimeout(lastFunc);
            lastFunc = setTimeout(function() {
                if ((Date.now() - lastRan) >= limit) {
                    func.apply(context, args);
                    lastRan = Date.now();
                }
            }, limit - (Date.now() - lastRan));
        }
    };
}

// Add CSS for dynamic alerts
const alertStyles = `
.alert.dynamic {
    animation: slideIn 0.3s ease-out;
    position: relative;
    margin-bottom: 16px;
}

.alert-close {
    position: absolute;
    right: 12px;
    top: 50%;
    transform: translateY(-50%);
    background: none;
    border: none;
    color: currentColor;
    cursor: pointer;
    opacity: 0.7;
    padding: 4px;
    border-radius: 4px;
    transition: opacity 0.2s ease;
}

.alert-close:hover {
    opacity: 1;
}

@keyframes slideIn {
    from {
        opacity: 0;
        transform: translateY(-10px);
    }
    to {
        opacity: 1;
        transform: translateY(0);
    }
}

@keyframes slideOut {
    from {
        opacity: 1;
        transform: translateY(0);
    }
    to {
        opacity: 0;
        transform: translateY(-10px);
    }
}
`;

// Inject styles
const styleSheet = document.createElement('style');
styleSheet.textContent = alertStyles;
document.head.appendChild(styleSheet);

// Initialize everything when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    // Initialize social login
    initSocialLogin();
    
    // Add smooth scrolling for anchor links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function(e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                target.scrollIntoView({ behavior: 'smooth' });
            }
        });
    });
    
    // Add focus management for accessibility
    const inputs = document.querySelectorAll('input, button, textarea, select');
    inputs.forEach(input => {
        input.addEventListener('focus', function() {
            this.classList.add('focused');
        });
        
        input.addEventListener('blur', function() {
            this.classList.remove('focused');
        });
    });
    
    // Handle escape key to close modals
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            const modals = document.querySelectorAll('.modal-overlay.show');
            modals.forEach(modal => {
                modal.classList.remove('show');
            });
        }
    });
    
    // Note: Loading states are handled by individual form handlers
});

// Export functions for global access
window.initSignupForm = initSignupForm;
window.initSigninForm = initSigninForm;
window.showAlert = showAlert;
window.showSuccessModal = showSuccessModal;