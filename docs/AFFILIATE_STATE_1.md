# Affiliate System State Analysis

**Date:** November 29, 2025
**Status:** Partially Implemented - Critical Gaps Identified

---

## Overview

This document analyzes the current state of the affiliate tracking system and its integration with Stripe for commission tracking on purchases.

---

## Database Schema

### Core Tables

**`affiliate_referrals`** (from `database/migrations/add-refgrow-affiliate-tracking.sql`)
| Column | Type | Description |
|--------|------|-------------|
| `referral_code` | VARCHAR(100) | The affiliate's unique code |
| `users_id` | FK | Reference to the referred user |
| `refgrow_affiliate_id` | VARCHAR | RefGrow's external affiliate ID |
| `commission_amount` | DECIMAL(10,2) | Commission earned in USD |
| `commission_status` | VARCHAR(50) | pending, approved, paid, failed, cancelled |
| `stripe_subscription_id` | VARCHAR | Link to Stripe subscription that generated commission |
| `converted_at` | TIMESTAMP | When user became paying customer |

**User Table Extensions:**
| Column | Type | Description |
|--------|------|-------------|
| `referred_by_code` | VARCHAR(100) | Code that referred this user during signup |
| `refgrow_affiliate_id` | VARCHAR(255) | If user is an affiliate |
| `affiliate_code` | VARCHAR(50) | User's own affiliate code (UNIQUE) |
| `is_affiliate` | BOOLEAN | Whether user is enrolled in affiliate program |
| `affiliate_status` | VARCHAR(50) | inactive, pending, active, suspended |

**`affiliate_clicks`** - Tracks referral link clicks
**`affiliate_payouts`** - Tracks commission payouts (minimum threshold: $50.00)

---

## Current Implementation

### What Works ✅

#### 1. Affiliate Signup Flow
- **Location:** `src/controllers/affiliate.controller.js`
- Users can join the affiliate program
- Affiliate code is generated and stored in `users.affiliate_code`
- RefGrow API integration for external tracking

#### 2. Referral Link Generation
- **Location:** `src/controllers/affiliate.controller.js:114`
- Format: `{baseUrl}/?ref={referralCode}`
- Example: `https://dev.amplifycontent.ai/?ref=aff_abc123`

#### 3. Click Tracking
- **Location:** `src/services/refgrow.service.js:139`
- Endpoint: `POST /affiliate/api/track-click`
- Captures: IP, user agent, referrer, landing page, UTM params, device info

#### 4. Stripe Webhook Conversion Tracking
- **Location:** `src/services/stripe.service.js:453-477`
- On `customer.subscription.created` webhook:
  ```javascript
  // Track affiliate conversion if user was referred
  const userRecord = await UserModel.findById(pgUserId);

  if (userRecord && userRecord.referred_by_code) {
    const subscriptionAmount = subscription.items.data[0].price.unit_amount / 100;

    await refgrowService.trackConversion(
      userRecord.referred_by_code,
      pgUserId,
      subscriptionAmount,
      subscription.id
    );
  }
  ```

#### 5. Commission Calculation & Recording
- **Location:** `src/services/refgrow.service.js:183-252`
- Function: `trackConversion(referralCode, userId, subscriptionAmount, stripeSubscriptionId)`
- Calculates: `(subscriptionAmount * commissionRate) / 100`
- Creates `affiliate_referrals` record with pending status
- Posts to RefGrow API for external tracking

#### 6. RefGrow Webhook Processing
- **Location:** `src/services/refgrow.service.js:392-424`
- Endpoint: `POST /affiliate/api/webhook`
- Events handled:
  - `commission.paid` → Updates status to 'paid', sets `paid_at`
  - `commission.approved` → Updates status to 'approved'

#### 7. Affiliate Dashboard
- **Location:** `src/controllers/affiliate.controller.js:286-329`
- Displays: clicks, conversions, conversion rate, pending/paid commissions

---

## Critical Gaps ❌

### Gap 1: Homepage Referral Code Capture

**Problem:** The `?ref=` query parameter is never captured when users land on the homepage.

**Location:** `src/views/index.hbs` and `public/js/main.js`

**Missing Implementation:**
```javascript
// Should be in main.js or index page
document.addEventListener('DOMContentLoaded', function() {
  const urlParams = new URLSearchParams(window.location.search);
  const refCode = urlParams.get('ref');
  if (refCode) {
    localStorage.setItem('referralCode', refCode);
  }
});
```

**Impact:** Affiliate codes are lost immediately when user lands on the site.

---

### Gap 2: Frontend Signup Form Integration

**Problem:** `public/js/auth.js` never sends `referralCode` to the backend during signup.

**Location:** `public/js/auth.js:233-301` (`handleSignupSubmit` function)

**Missing Implementation:**
```javascript
// In handleSignupSubmit
const referralCode = localStorage.getItem('referralCode');
const formData = {
  ...Object.fromEntries(new FormData(form)),
  referralCode: referralCode
};
```

**Impact:** Even if captured, referral code never reaches the server.

---

### Gap 3: Stripe Session Metadata

**Problem:** Stripe checkout session only includes `user_id`, not affiliate data.

**Location:** `src/services/stripe.service.js:37-44`

**Current Implementation:**
```javascript
metadata: {
  user_id: userId
}
```

**Should Be:**
```javascript
metadata: {
  user_id: userId,
  referred_by_code: userRecord.referred_by_code,
  is_referred: !!userRecord.referred_by_code
}
```

**Impact:** Cannot track affiliate at Stripe payment level, only post-webhook.

---

## Complete Flow Analysis

### Expected Flow (Not Working)
```
1. Affiliate shares: https://domain/?ref=aff_abc123
                              ↓
2. User lands on homepage    ← ?ref= param IGNORED (Gap 1)
                              ↓
3. User clicks "Sign Up"     ← referralCode NOT in localStorage
                              ↓
4. Signup form submitted     ← referralCode NOT sent (Gap 2)
                              ↓
5. User created              ← referred_by_code = NULL
                              ↓
6. User upgrades (Stripe)    ← No affiliate metadata (Gap 3)
                              ↓
7. Webhook fires             ← Checks referred_by_code → NULL
                              ↓
8. NO AFFILIATE CREDIT GIVEN ← BROKEN
```

### Actual Working Flow (If referred_by_code Was Set)
```
1. Stripe subscription created
                    ↓
2. Webhook: customer.subscription.created
                    ↓
3. handleSubscriptionCreated() in stripe.service.js
                    ↓
4. Look up user, check referred_by_code
                    ↓
5. If exists: refgrowService.trackConversion()
                    ↓
6. Calculate commission, create affiliate_referrals record
                    ↓
7. POST to RefGrow API
                    ↓
8. Affiliate credited ✅
```

---

## Implementation Status Summary

| Component | Status | Location | Notes |
|-----------|--------|----------|-------|
| Affiliate Signup | ✅ Complete | affiliate.controller.js | User can join program |
| Affiliate Code Generation | ✅ Complete | refgrow.service.js | Local + RefGrow codes |
| Referral Link Format | ✅ Complete | affiliate.controller.js:114 | Format: `/?ref={code}` |
| Homepage Capture | ✅ **FIXED** | main.js:5-23 | Captures ?ref= to localStorage |
| LocalStorage Persistence | ✅ **FIXED** | main.js:5-23 | 30-day expiry with auto-cleanup |
| Signup Form Integration | ✅ **FIXED** | auth.js:267-273 | Sends referralCode in signup |
| Referral Code Cleanup | ✅ **FIXED** | auth.js:287-289 | Clears after successful signup |
| Backend Referral Storage | ✅ Complete | auth.controller.js:379 | Stores if received |
| Stripe Session Metadata | ✅ **FIXED** | stripe.service.js:27-52 | Includes referred_by_code |
| Webhook Conversion Tracking | ✅ Complete | stripe.service.js:453-477 | Works if referred_by_code set |
| RefGrow API Integration | ✅ Complete | refgrow.service.js | POST /conversions |
| Commission Calculation | ✅ Complete | refgrow.service.js:197 | (amount * rate) / 100 |
| Webhook Processing | ✅ Complete | refgrow.service.js:392-424 | Handles paid/approved |
| Dashboard Stats | ✅ Complete | affiliate.controller.js:286-329 | Query and display |
| Payout Tracking | ✅ Complete | affiliate_payouts table | Schema in place |

---

## Fixes Applied (November 29, 2025)

### ✅ Fix 1: Capture Referral Code on Homepage
**File:** `public/js/main.js`
**Status:** IMPLEMENTED

Added IIFE at top of file to capture `?ref=` parameter:
```javascript
(function() {
  const urlParams = new URLSearchParams(window.location.search);
  const refCode = urlParams.get('ref');

  if (refCode) {
    localStorage.setItem('referralCode', refCode);
    localStorage.setItem('referralCodeExpiry', Date.now() + (30 * 24 * 60 * 60 * 1000));
  }

  // Clean up expired referral codes
  const expiry = localStorage.getItem('referralCodeExpiry');
  if (expiry && Date.now() > parseInt(expiry)) {
    localStorage.removeItem('referralCode');
    localStorage.removeItem('referralCodeExpiry');
  }
})();
```

### ✅ Fix 2: Pass Referral Code During Signup
**File:** `public/js/auth.js`
**Status:** IMPLEMENTED

Updated `handleSignupSubmit` function:
```javascript
const referralCode = localStorage.getItem('referralCode');
const signupData = Object.fromEntries(formData);

if (referralCode) {
  signupData.referralCode = referralCode;
}
```

### ✅ Fix 3: Clear Referral Code After Successful Signup
**File:** `public/js/auth.js`
**Status:** IMPLEMENTED

Added cleanup after successful signup:
```javascript
if (response.ok && result.success) {
  localStorage.removeItem('referralCode');
  localStorage.removeItem('referralCodeExpiry');
  // ...
}
```

### ✅ Fix 4: Add Affiliate Data to Stripe Metadata
**File:** `src/services/stripe.service.js`
**Status:** IMPLEMENTED

Updated `createCheckoutSession` to include affiliate data:
```javascript
const user = await UserModel.findById(userId);
const referredByCode = user?.referred_by_code || null;

const session = await stripe.checkout.sessions.create({
  // ...
  metadata: {
    user_id: userId,
    referred_by_code: referredByCode,
    is_referred: referredByCode ? 'true' : 'false'
  },
  subscription_data: {
    metadata: {
      user_id: userId,
      referred_by_code: referredByCode,
      is_referred: referredByCode ? 'true' : 'false'
    }
  }
});
```

---

## Testing Checklist

- [ ] Visit homepage with `?ref=TEST_CODE`
- [ ] Verify localStorage contains `referralCode`
- [ ] Complete signup flow
- [ ] Verify user record has `referred_by_code = TEST_CODE`
- [ ] Upgrade to paid subscription
- [ ] Verify `affiliate_referrals` record created
- [ ] Verify RefGrow API received conversion
- [ ] Check affiliate dashboard shows the referral

---

## Files to Modify

1. `public/js/main.js` - Add referral capture
2. `public/js/auth.js` - Pass referralCode in signup
3. `src/services/stripe.service.js` - Add affiliate metadata
4. `src/views/index.hbs` - Optional: Include capture script inline

---

## Related Documentation

- RefGrow API Documentation (external)
- Stripe Webhook Documentation (external)
- `database/migrations/add-refgrow-affiliate-tracking.sql` - Schema definition
