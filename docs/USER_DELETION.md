# User Deletion Scripts

This folder contains scripts for safely removing users and all their associated data from the development database.

## ⚠️ Warning

These scripts are intended for **DEVELOPMENT USE ONLY**. They permanently delete user data and cannot be undone.

## Available Scripts

### 1. Full Deletion Script (`delete-user.js`)

Comprehensive script with detailed output, dry-run mode, and safety checks.

```bash
# Show help
node scripts/delete-user.js --help

# Dry run (shows what would be deleted, but doesn't delete)
node scripts/delete-user.js 123
node scripts/delete-user.js user@example.com

# Actually delete (requires --confirm flag)
node scripts/delete-user.js 123 --confirm
node scripts/delete-user.js user@example.com --confirm
```

**Features:**
- Finds users by ID or email
- Shows detailed user information
- Counts all related records before deletion
- Dry-run mode by default (requires `--confirm` to actually delete)
- Comprehensive error handling
- Transaction-based deletion for data integrity

### 2. Quick Deletion Script (`quick-delete-user.js`)

Simple script for quick deletion without verbose output.

```bash
# Delete user immediately (no confirmation needed)
node scripts/quick-delete-user.js 123
node scripts/quick-delete-user.js test@example.com
```

**Features:**
- Immediate deletion (no dry-run mode)
- Minimal output
- Good for cleaning up test data quickly

## What Gets Deleted

Both scripts delete the user and **ALL** associated data across these tables:

1. **subscription_usage** - Usage tracking records
2. **subscription_events** - Subscription event history  
3. **user_subscriptions** - Subscription records
4. **user_preferences** - User preference settings
5. **sessions** - Login session data
6. **users** - The user record itself

## Database Safety

- All deletions use database transactions
- Foreign key constraints are respected (child records deleted before parent)
- Automatic rollback on errors
- No orphaned data is left behind

## Common Use Cases

### Remove Test Users
```bash
# Remove multiple test users quickly
node scripts/quick-delete-user.js test1@example.com
node scripts/quick-delete-user.js test2@example.com
node scripts/quick-delete-user.js test3@example.com
```

### Remove User with Detailed Info
```bash
# See what would be deleted first
node scripts/delete-user.js user@example.com

# Then actually delete
node scripts/delete-user.js user@example.com --confirm
```

### Clean Up By User ID
```bash
# When you know the user ID
node scripts/quick-delete-user.js 456
```

## Error Handling

Both scripts include comprehensive error handling:
- Database connection errors
- User not found errors
- Transaction rollback on failures
- Clear error messages

## Examples

```bash
# Example 1: Dry run shows user info without deleting
$ node scripts/delete-user.js dwight@vizyul.com
🔍 User Deletion Script - Development Database
═══════════════════════════════════════════════════
🔎 Searching for user: dwight@vizyul.com
📋 User found:
   ID: 4
   Name: Dwight Taylor
   Email: dwight@vizyul.com
   Registration: email

📊 Counting related records...
📈 Records to be deleted:
   Users: 1
   user_preferences: 1
   sessions: 3
   Total: 5 records

🛡️  DRY RUN MODE - No data will be deleted
🛡️  To actually delete the user, add --confirm flag:
   node scripts/delete-user.js dwight@vizyul.com --confirm

# Example 2: Quick deletion with minimal output
$ node scripts/quick-delete-user.js test@example.com
✅ Deleted user test@example.com (ID: 123) and 4 total records
```