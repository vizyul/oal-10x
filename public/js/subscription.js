/**
 * Subscription Management JavaScript
 * Handles subscription plan interactions, billing, and usage tracking
 */

(function() {
    'use strict';

    // Initialize subscription page functionality
    document.addEventListener('DOMContentLoaded', function() {
        initializePlanButtons();
        initializeBillingButtons();
        initializeUsageTracking();
        loadSubscriptionData();
    });

    /**
     * Initialize plan selection buttons
     */
    function initializePlanButtons() {
        const planButtons = document.querySelectorAll('.plan-btn');
        
        planButtons.forEach(button => {
            button.addEventListener('click', function() {
                const planCard = this.closest('.plan-card');
                const planName = planCard.querySelector('h3').textContent;
                const price = planCard.querySelector('.price').textContent;
                
                handlePlanSelection(planName, price, this);
            });
        });
    }

    /**
     * Initialize billing management buttons
     */
    function initializeBillingButtons() {
        const billingButtons = document.querySelectorAll('.billing-card .btn');
        
        billingButtons.forEach(button => {
            button.addEventListener('click', function() {
                const billingItem = this.closest('.billing-item');
                const actionType = billingItem.querySelector('h3').textContent;
                
                handleBillingAction(actionType, this);
            });
        });
    }

    /**
     * Initialize usage tracking display
     */
    function initializeUsageTracking() {
        updateUsageBars();
        
        // Refresh usage data every 30 seconds
        setInterval(updateUsageData, 30000);
    }

    /**
     * Handle plan selection
     */
    function handlePlanSelection(planName, price, buttonElement) {
        const originalText = buttonElement.textContent;
        buttonElement.textContent = 'Processing...';
        buttonElement.disabled = true;

        // Handle different plan types
        switch(planName) {
            case 'Starter':
                initiateSubscription('starter', buttonElement, originalText);
                break;
            case 'Professional':
                initiateSubscription('professional', buttonElement, originalText);
                break;
            case 'Enterprise':
                handleEnterpriseContact(buttonElement, originalText);
                break;
            default:
                console.error('Unknown plan:', planName);
                resetButton(buttonElement, originalText);
        }
    }

    /**
     * Initiate subscription process
     */
    async function initiateSubscription(planType, buttonElement, originalText) {
        try {
            const response = await fetch('/api/subscription/create-checkout-session', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ planType })
            });

            const data = await response.json();

            if (data.success && data.checkoutUrl) {
                // Redirect to Stripe Checkout
                window.location.href = data.checkoutUrl;
            } else {
                throw new Error(data.message || 'Failed to create checkout session');
            }
        } catch (error) {
            console.error('Subscription error:', error);
            showNotification('Failed to start subscription process. Please try again.', 'error');
            resetButton(buttonElement, originalText);
        }
    }

    /**
     * Handle enterprise contact
     */
    function handleEnterpriseContact(buttonElement, originalText) {
        // For now, show a contact message
        showNotification('Enterprise plans require a consultation. Our sales team will contact you within 24 hours.', 'info');
        
        // Optionally redirect to contact form or email
        setTimeout(() => {
            window.location.href = '/contact?plan=enterprise';
        }, 2000);
        
        resetButton(buttonElement, originalText);
    }

    /**
     * Handle billing actions
     */
    function handleBillingAction(actionType, buttonElement) {
        const originalText = buttonElement.textContent;
        
        switch(actionType) {
            case 'Payment Method':
                handlePaymentMethod(buttonElement, originalText);
                break;
            case 'Billing Address':
                handleBillingAddress(buttonElement, originalText);
                break;
            case 'Billing History':
                handleBillingHistory(buttonElement, originalText);
                break;
            default:
                console.log('Billing action:', actionType);
        }
    }

    /**
     * Handle payment method management
     */
    async function handlePaymentMethod(buttonElement, originalText) {
        try {
            buttonElement.textContent = 'Loading...';
            buttonElement.disabled = true;

            // Create or get customer portal session
            const response = await fetch('/api/subscription/customer-portal', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                }
            });

            const data = await response.json();

            if (data.success && data.portalUrl) {
                window.open(data.portalUrl, '_blank');
            } else {
                throw new Error(data.message || 'Failed to access customer portal');
            }
        } catch (error) {
            console.error('Payment method error:', error);
            showNotification('Failed to access payment methods. Please try again.', 'error');
        } finally {
            resetButton(buttonElement, originalText);
        }
    }

    /**
     * Handle billing address update
     */
    function handleBillingAddress(buttonElement, originalText) {
        // For now, redirect to customer portal
        handlePaymentMethod(buttonElement, originalText);
    }

    /**
     * Handle billing history access
     */
    function handleBillingHistory(buttonElement, originalText) {
        // For now, redirect to customer portal
        handlePaymentMethod(buttonElement, originalText);
    }

    /**
     * Load and update subscription data
     */
    async function loadSubscriptionData() {
        try {
            const response = await fetch('/api/subscription/status');
            const data = await response.json();

            if (data.success) {
                updateSubscriptionDisplay(data.subscription);
                updateUsageDisplay(data.usage);
            }
        } catch (error) {
            console.error('Failed to load subscription data:', error);
        }
    }

    /**
     * Update subscription display
     */
    function updateSubscriptionDisplay(subscription) {
        if (!subscription) return;

        // Update current plan display
        const currentPlan = document.querySelector('.current-plan');
        if (currentPlan && subscription.plan) {
            const planName = currentPlan.querySelector('h3');
            const planPrice = currentPlan.querySelector('.price');
            
            if (planName) planName.textContent = subscription.plan.name;
            if (planPrice) planPrice.textContent = `$${subscription.plan.price}`;
        }

        // Update status information
        const statusValue = document.querySelector('.status-value.active');
        if (statusValue && subscription.status) {
            statusValue.textContent = subscription.status;
        }
    }

    /**
     * Update usage display
     */
    function updateUsageDisplay(usage) {
        if (!usage) return;

        // Update usage bars and text
        const usageItems = document.querySelectorAll('.usage-item');
        
        usageItems.forEach(item => {
            const title = item.querySelector('h3').textContent;
            const usageBar = item.querySelector('.usage-fill');
            const usageText = item.querySelector('.usage-text');
            
            let usageData = null;
            
            switch(title) {
                case 'AI Sermon Assists':
                    usageData = usage.sermonAssists;
                    break;
                case 'Content Generation':
                    usageData = usage.contentGeneration;
                    break;
                case 'API Calls':
                    usageData = usage.apiCalls;
                    break;
            }
            
            if (usageData && usageBar && usageText) {
                const percentage = (usageData.used / usageData.limit) * 100;
                usageBar.style.width = `${Math.min(percentage, 100)}%`;
                usageText.textContent = `${usageData.used} of ${usageData.limit} used`;
                
                // Update color based on usage
                if (percentage > 90) {
                    usageBar.style.background = 'linear-gradient(90deg, #ef4444, #dc2626)';
                } else if (percentage > 75) {
                    usageBar.style.background = 'linear-gradient(90deg, #f59e0b, #d97706)';
                } else {
                    usageBar.style.background = 'linear-gradient(90deg, #10b981, #059669)';
                }
            }
        });
    }

    /**
     * Update usage bars animation
     */
    function updateUsageBars() {
        const usageBars = document.querySelectorAll('.usage-fill');
        
        usageBars.forEach(bar => {
            const width = bar.style.width || '0%';
            bar.style.width = '0%';
            
            setTimeout(() => {
                bar.style.width = width;
            }, 100);
        });
    }

    /**
     * Update usage data from server
     */
    async function updateUsageData() {
        try {
            const response = await fetch('/api/subscription/usage');
            const data = await response.json();

            if (data.success) {
                updateUsageDisplay(data.usage);
            }
        } catch (error) {
            console.error('Failed to update usage data:', error);
        }
    }

    /**
     * Reset button state
     */
    function resetButton(buttonElement, originalText) {
        buttonElement.textContent = originalText;
        buttonElement.disabled = false;
    }

    /**
     * Show notification message
     */
    function showNotification(message, type = 'info') {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `subscription-notification subscription-notification-${type}`;
        notification.innerHTML = `
            <div class="subscription-notification-content">
                <span class="subscription-notification-message">${message}</span>
                <button class="subscription-notification-close">&times;</button>
            </div>
        `;
        
        // Add to page
        document.body.appendChild(notification);
        
        // Add close functionality
        const closeBtn = notification.querySelector('.subscription-notification-close');
        closeBtn.addEventListener('click', () => {
            notification.remove();
        });
        
        // Auto-remove after 5 seconds
        setTimeout(() => {
            if (notification.parentNode) {
                notification.remove();
            }
        }, 5000);
        
        // Animate in
        setTimeout(() => {
            notification.classList.add('show');
        }, 100);
    }

    // Add notification styles to head
    const style = document.createElement('style');
    style.textContent = `
        .subscription-notification {
            position: fixed;
            top: 20px;
            right: 20px;
            max-width: 400px;
            padding: 15px;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            z-index: 1000;
            opacity: 0;
            transform: translateX(100%);
            transition: all 0.3s ease;
        }

        .subscription-notification.show {
            opacity: 1;
            transform: translateX(0);
        }

        .subscription-notification-success {
            background-color: #d4edda;
            border: 1px solid #c3e6cb;
            color: #155724;
        }

        .subscription-notification-error {
            background-color: #f8d7da;
            border: 1px solid #f5c6cb;
            color: #721c24;
        }

        .subscription-notification-info {
            background-color: #d1ecf1;
            border: 1px solid #bee5eb;
            color: #0c5460;
        }

        .subscription-notification-content {
            display: flex;
            align-items: center;
            justify-content: space-between;
        }

        .subscription-notification-message {
            flex: 1;
            font-weight: 500;
        }

        .subscription-notification-close {
            background: none;
            border: none;
            font-size: 18px;
            cursor: pointer;
            margin-left: 10px;
            color: inherit;
            opacity: 0.7;
        }

        .subscription-notification-close:hover {
            opacity: 1;
        }
    `;
    document.head.appendChild(style);

})();