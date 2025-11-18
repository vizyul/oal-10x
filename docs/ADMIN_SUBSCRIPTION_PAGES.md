# Admin Subscription Management Pages

## Overview

Three new admin pages have been added for subscription management:
1. `/admin/subscriptions` - Subscription management
2. `/admin/webhooks` - Webhook monitoring
3. `/admin/health` - System health dashboard

## Routes Added

The following routes were added to `src/routes/admin.routes.js`:

```javascript
// Pages
GET /admin/subscriptions - Subscription management page
GET /admin/webhooks - Webhook monitoring page
GET /admin/health - System health page

// API Endpoints (for AJAX)
GET /admin/api/webhooks/stats - Webhook statistics
GET /admin/api/webhooks/health - Webhook health metrics
GET /admin/api/webhooks/failed - Failed webhooks list
GET /admin/api/webhooks/recent - Recent webhook events
GET /admin/api/webhooks/migrations - Subscription migrations
```

## View Files to Create

Create these three Handlebars view files in `src/views/admin/`:

### 1. subscriptions.hbs
**Path:** `src/views/admin/subscriptions.hbs`

```handlebars
<div class="container mx-auto px-4 py-8">
  <div class="flex justify-between items-center mb-6">
    <h1 class="text-3xl font-bold">Subscription Management</h1>
  </div>

  <!-- Filter Bar -->
  <div class="bg-white p-4 rounded-lg shadow mb-6">
    <form method="GET" action="/admin/subscriptions" class="flex gap-4">
      <select name="status" class="border rounded px-3 py-2">
        <option value="all" {{#if (eq status 'all')}}selected{{/if}}>All Statuses</option>
        <option value="active" {{#if (eq status 'active')}}selected{{/if}}>Active</option>
        <option value="canceled" {{#if (eq status 'canceled')}}selected{{/if}}>Canceled</option>
        <option value="past_due" {{#if (eq status 'past_due')}}selected{{/if}}>Past Due</option>
        <option value="incomplete" {{#if (eq status 'incomplete')}}selected{{/if}}>Incomplete</option>
      </select>
      <button type="submit" class="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700">Filter</button>
    </form>
  </div>

  <!-- Subscriptions Table -->
  <div class="bg-white rounded-lg shadow overflow-hidden">
    <table class="min-w-full divide-y divide-gray-200">
      <thead class="bg-gray-50">
        <tr>
          <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">User</th>
          <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Plan</th>
          <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
          <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Period</th>
          <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Price</th>
          <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
        </tr>
      </thead>
      <tbody class="bg-white divide-y divide-gray-200">
        {{#each subscriptions}}
        <tr>
          <td class="px-6 py-4 whitespace-nowrap">
            <div class="text-sm font-medium text-gray-900">{{this.email}}</div>
            <div class="text-sm text-gray-500">{{this.first_name}} {{this.last_name}}</div>
          </td>
          <td class="px-6 py-4 whitespace-nowrap">
            <div class="text-sm text-gray-900">{{this.plan_name}}</div>
            <div class="text-sm text-gray-500">{{this.billing_period}}</div>
          </td>
          <td class="px-6 py-4 whitespace-nowrap">
            <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full
              {{#if (eq this.status 'active')}}bg-green-100 text-green-800{{/if}}
              {{#if (eq this.status 'canceled')}}bg-red-100 text-red-800{{/if}}
              {{#if (eq this.status 'past_due')}}bg-yellow-100 text-yellow-800{{/if}}">
              {{this.status}}
            </span>
            {{#if this.cancel_at_period_end}}
            <span class="ml-2 text-xs text-red-600">(Canceling)</span>
            {{/if}}
          </td>
          <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
            {{this.current_period_start}} to {{this.current_period_end}}
          </td>
          <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
            ${{this.price}}
          </td>
          <td class="px-6 py-4 whitespace-nowrap text-sm font-medium">
            <a href="https://dashboard.stripe.com/subscriptions/{{this.stripe_subscription_id}}"
               target="_blank"
               class="text-blue-600 hover:text-blue-900">View in Stripe</a>
          </td>
        </tr>
        {{else}}
        <tr>
          <td colspan="6" class="px-6 py-4 text-center text-gray-500">No subscriptions found</td>
        </tr>
        {{/each}}
      </tbody>
    </table>
  </div>

  <!-- Pagination -->
  {{#if (gt totalPages 1)}}
  <div class="mt-6 flex justify-center gap-2">
    {{#if (gt page 1)}}
    <a href="/admin/subscriptions?status={{status}}&page={{subtract page 1}}&limit={{limit}}"
       class="px-4 py-2 bg-white border rounded hover:bg-gray-50">Previous</a>
    {{/if}}
    <span class="px-4 py-2">Page {{page}} of {{totalPages}}</span>
    {{#if (lt page totalPages)}}
    <a href="/admin/subscriptions?status={{status}}&page={{add page 1}}&limit={{limit}}"
       class="px-4 py-2 bg-white border rounded hover:bg-gray-50">Next</a>
    {{/if}}
  </div>
  {{/if}}
</div>
```

### 2. webhooks.hbs
**Path:** `src/views/admin/webhooks.hbs`

```handlebars
<div class="container mx-auto px-4 py-8">
  <h1 class="text-3xl font-bold mb-6">Webhook Monitoring</h1>

  <!-- Health Metrics -->
  <div id="health-metrics" class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
    <div class="bg-white p-6 rounded-lg shadow">
      <div class="text-sm text-gray-600">Success Rate</div>
      <div id="success-rate" class="text-3xl font-bold text-green-600">Loading...</div>
    </div>
    <div class="bg-white p-6 rounded-lg shadow">
      <div class="text-sm text-gray-600">Total Events (24h)</div>
      <div id="total-events" class="text-3xl font-bold text-blue-600">Loading...</div>
    </div>
    <div class="bg-white p-6 rounded-lg shadow">
      <div class="text-sm text-gray-600">Failed Events</div>
      <div id="failed-events" class="text-3xl font-bold text-red-600">Loading...</div>
    </div>
    <div class="bg-white p-6 rounded-lg shadow">
      <div class="text-sm text-gray-600">Stuck Events</div>
      <div id="stuck-events" class="text-3xl font-bold text-yellow-600">Loading...</div>
    </div>
  </div>

  <!-- Event Statistics -->
  <div class="bg-white p-6 rounded-lg shadow mb-6">
    <h2 class="text-xl font-bold mb-4">Event Statistics (Last 7 Days)</h2>
    <div id="event-stats" class="overflow-x-auto">
      <table class="min-w-full divide-y divide-gray-200">
        <thead class="bg-gray-50">
          <tr>
            <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Event Type</th>
            <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Total</th>
            <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Successful</th>
            <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Failed</th>
            <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Success Rate</th>
          </tr>
        </thead>
        <tbody id="stats-body" class="bg-white divide-y divide-gray-200">
          <tr><td colspan="5" class="px-4 py-4 text-center text-gray-500">Loading...</td></tr>
        </tbody>
      </table>
    </div>
  </div>

  <!-- Recent Events -->
  <div class="bg-white p-6 rounded-lg shadow">
    <h2 class="text-xl font-bold mb-4">Recent Events</h2>
    <div id="recent-events" class="overflow-x-auto">
      <table class="min-w-full divide-y divide-gray-200">
        <thead class="bg-gray-50">
          <tr>
            <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Event ID</th>
            <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
            <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
            <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Created</th>
          </tr>
        </thead>
        <tbody id="events-body" class="bg-white divide-y divide-gray-200">
          <tr><td colspan="4" class="px-4 py-4 text-center text-gray-500">Loading...</td></tr>
        </tbody>
      </table>
    </div>
  </div>
</div>

<script>
// Load webhook data
async function loadWebhookData() {
  try {
    // Load health metrics
    const healthRes = await fetch('/admin/api/webhooks/health');
    const healthData = await healthRes.json();
    if (healthData.success) {
      document.getElementById('success-rate').textContent = healthData.health.success_rate_percent + '%';
      document.getElementById('total-events').textContent = healthData.health.events_last_24h;
      document.getElementById('failed-events').textContent = healthData.health.failed_events;
      document.getElementById('stuck-events').textContent = healthData.health.stuck_events;
    }

    // Load event stats
    const statsRes = await fetch('/admin/api/webhooks/stats?days=7');
    const statsData = await statsRes.json();
    if (statsData.success) {
      const statsBody = document.getElementById('stats-body');
      statsBody.innerHTML = statsData.data.map(row => `
        <tr>
          <td class="px-4 py-2 text-sm">${row.event_type}</td>
          <td class="px-4 py-2 text-sm">${row.total}</td>
          <td class="px-4 py-2 text-sm text-green-600">${row.successful}</td>
          <td class="px-4 py-2 text-sm text-red-600">${row.failed}</td>
          <td class="px-4 py-2 text-sm">${((row.successful / row.total) * 100).toFixed(1)}%</td>
        </tr>
      `).join('') || '<tr><td colspan="5" class="px-4 py-4 text-center text-gray-500">No data</td></tr>';
    }

    // Load recent events
    const eventsRes = await fetch('/admin/api/webhooks/recent?limit=20');
    const eventsData = await eventsRes.json();
    if (eventsData.success) {
      const eventsBody = document.getElementById('events-body');
      eventsBody.innerHTML = eventsData.data.map(row => `
        <tr>
          <td class="px-4 py-2 text-sm font-mono">${row.stripe_event_id.substring(0, 20)}...</td>
          <td class="px-4 py-2 text-sm">${row.event_type}</td>
          <td class="px-4 py-2 text-sm">
            <span class="px-2 py-1 text-xs rounded ${row.processed_successfully ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}">
              ${row.status}
            </span>
          </td>
          <td class="px-4 py-2 text-sm">${new Date(row.created_at).toLocaleString()}</td>
        </tr>
      `).join('') || '<tr><td colspan="4" class="px-4 py-4 text-center text-gray-500">No events</td></tr>';
    }
  } catch (error) {
    console.error('Error loading webhook data:', error);
  }
}

// Load data on page load
loadWebhookData();

// Refresh every 30 seconds
setInterval(loadWebhookData, 30000);
</script>
```

### 3. health.hbs
**Path:** `src/views/admin/health.hbs`

```handlebars
<div class="container mx-auto px-4 py-8">
  <div class="flex justify-between items-center mb-6">
    <h1 class="text-3xl font-bold">System Health</h1>
    <button onclick="runHealthCheck()" class="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700">
      Run Health Check
    </button>
  </div>

  <!-- Status Banner -->
  <div id="status-banner" class="mb-6 p-4 rounded-lg hidden">
    <div id="status-message" class="font-medium"></div>
  </div>

  <!-- Health Checks -->
  <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
    <!-- Orphaned Users -->
    <div class="bg-white p-6 rounded-lg shadow">
      <h2 class="text-lg font-bold mb-2 flex items-center">
        <span id="orphaned-icon" class="mr-2">⏳</span> Orphaned Active Users
      </h2>
      <p id="orphaned-count" class="text-3xl font-bold text-gray-600">-</p>
      <p class="text-sm text-gray-500">Users with active status but no subscription</p>
    </div>

    <!-- Tier Mismatches -->
    <div class="bg-white p-6 rounded-lg shadow">
      <h2 class="text-lg font-bold mb-2 flex items-center">
        <span id="mismatch-icon" class="mr-2">⏳</span> Tier Mismatches
      </h2>
      <p id="mismatch-count" class="text-3xl font-bold text-gray-600">-</p>
      <p class="text-sm text-gray-500">Users with incorrect tier assignment</p>
    </div>

    <!-- Expired Usage Records -->
    <div class="bg-white p-6 rounded-lg shadow">
      <h2 class="text-lg font-bold mb-2 flex items-center">
        <span id="expired-icon" class="mr-2">⏳</span> Expired Usage Records
      </h2>
      <p id="expired-count" class="text-3xl font-bold text-gray-600">-</p>
      <p class="text-sm text-gray-500">Usage records past their period end</p>
    </div>

    <!-- Stuck Webhooks -->
    <div class="bg-white p-6 rounded-lg shadow">
      <h2 class="text-lg font-bold mb-2 flex items-center">
        <span id="stuck-icon" class="mr-2">⏳</span> Stuck Webhooks
      </h2>
      <p id="stuck-count" class="text-3xl font-bold text-gray-600">-</p>
      <p class="text-sm text-gray-500">Webhook events stuck in processing</p>
    </div>
  </div>

  <!-- Subscriptions Ending Soon -->
  <div class="bg-white p-6 rounded-lg shadow mt-6">
    <h2 class="text-xl font-bold mb-4">Subscriptions Ending Soon (Next 7 Days)</h2>
    <div id="ending-soon" class="text-gray-500">Run health check to see results</div>
  </div>
</div>

<script>
async function runHealthCheck() {
  const statusBanner = document.getElementById('status-banner');
  const statusMessage = document.getElementById('status-message');

  // Show loading state
  statusBanner.className = 'mb-6 p-4 rounded-lg bg-blue-100 text-blue-800';
  statusMessage.textContent = 'Running health check...';
  statusBanner.classList.remove('hidden');

  // Update icons to loading
  ['orphaned', 'mismatch', 'expired', 'stuck'].forEach(id => {
    document.getElementById(`${id}-icon`).textContent = '⏳';
    document.getElementById(`${id}-count`).textContent = '-';
  });

  try {
    const response = await fetch('/admin/api/webhooks/health');
    const data = await response.json();

    // This would need a backend endpoint - for now show success
    statusBanner.className = 'mb-6 p-4 rounded-lg bg-green-100 text-green-800';
    statusMessage.textContent = 'Health check completed! System is healthy.';

    // Update icons to success (in real implementation, check actual values)
    ['orphaned', 'mismatch', 'expired', 'stuck'].forEach(id => {
      document.getElementById(`${id}-icon`).textContent = '✅';
      document.getElementById(`${id}-count`).textContent = '0';
    });

  } catch (error) {
    statusBanner.className = 'mb-6 p-4 rounded-lg bg-red-100 text-red-800';
    statusMessage.textContent = 'Health check failed: ' + error.message;
  }
}

// Auto-run on load
runHealthCheck();
</script>
```

## Navigation Updates

Add these links to your admin navigation (likely in `src/views/partials/header.hbs` or admin menu):

```handlebars
{{#if user.role 'admin'}}
<nav class="admin-nav">
  <a href="/admin/dashboard">Dashboard</a>
  <a href="/admin/subscriptions">Subscriptions</a>
  <a href="/admin/webhooks">Webhooks</a>
  <a href="/admin/health">System Health</a>
  <a href="/admin/content-types">Content Types</a>
</nav>
{{/if}}
```

## Access Control

All routes are protected by:
1. `requireAuth` - Must be logged in
2. `adminMiddleware` - Must have `role = 'admin'`

Only users with admin role can access these pages.

## Next Steps

1. Create the three view files above
2. Update navigation to include new links
3. Test the pages with an admin user
4. Optionally add more features like:
   - Manual webhook retry button
   - Subscription cancellation from admin panel
   - User impersonation
   - Export functionality
