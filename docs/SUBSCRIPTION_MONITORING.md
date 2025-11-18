# Subscription System Monitoring Guide

This guide provides SQL queries and scripts for monitoring the health and performance of the subscription system.

## Quick Start

### Health Check
Run the subscription health check script:
```bash
node scripts/subscription-health-check.js
```

### Retry Failed Webhooks
Automatically retry failed webhook events:
```bash
node scripts/retry-failed-webhooks.js --max-retries=5 --limit=50
```

### Schedule as Cron Jobs
Add to your cron configuration:
```cron
# Retry failed webhooks every 15 minutes
*/15 * * * * cd /path/to/app && node scripts/retry-failed-webhooks.js >> /var/log/webhook-retry.log 2>&1

# Run health check daily at 6 AM
0 6 * * * cd /path/to/app && node scripts/subscription-health-check.js >> /var/log/subscription-health.log 2>&1
```

---

## Monitoring Dashboard Queries

### 1. Webhook Processing Statistics (Last 7 Days)

```sql
SELECT
  event_type,
  COUNT(*) as total,
  COUNT(*) FILTER (WHERE processed_successfully = true) as successful,
  COUNT(*) FILTER (WHERE processed_successfully = false) as failed,
  ROUND(
    (COUNT(*) FILTER (WHERE processed_successfully = true)::numeric /
     NULLIF(COUNT(*), 0) * 100),
    2
  ) as success_rate_percent,
  AVG(EXTRACT(EPOCH FROM (processed_at - created_at))) as avg_processing_time_seconds
FROM subscription_events
WHERE created_at >= NOW() - INTERVAL '7 days'
GROUP BY event_type
ORDER BY total DESC;
```

### 2. Overall System Health

```sql
SELECT
  COUNT(*) as total_events,
  COUNT(*) FILTER (WHERE processed_successfully = true) as successful_events,
  COUNT(*) FILTER (WHERE processed_successfully = false) as failed_events,
  COUNT(*) FILTER (WHERE status = 'processing') as stuck_events,
  COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '1 hour') as events_last_hour,
  COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours') as events_last_24h,
  ROUND(
    (COUNT(*) FILTER (WHERE processed_successfully = true)::numeric /
     NULLIF(COUNT(*), 0) * 100),
    2
  ) as success_rate_percent
FROM subscription_events
WHERE created_at >= NOW() - INTERVAL '7 days';
```

### 3. Failed Webhooks Requiring Attention

```sql
SELECT
  id,
  stripe_event_id,
  event_type,
  status,
  retry_count,
  error_message,
  created_at,
  updated_at
FROM subscription_events
WHERE processed_successfully = false
AND retry_count < 5
ORDER BY created_at DESC
LIMIT 50;
```

### 4. Subscription Plan Migration Analytics (Last 30 Days)

```sql
SELECT
  migration_type,
  COUNT(*) as count,
  AVG(proration_amount) as avg_proration,
  fp.plan_name as from_plan,
  tp.plan_name as to_plan
FROM subscription_plan_migrations spm
LEFT JOIN subscription_plans fp ON spm.from_plan_id = fp.id
LEFT JOIN subscription_plans tp ON spm.to_plan_id = tp.id
WHERE spm.created_at >= NOW() - INTERVAL '30 days'
GROUP BY migration_type, fp.plan_name, tp.plan_name
ORDER BY count DESC;
```

### 5. Active Subscriptions by Plan

```sql
SELECT
  sp.plan_name,
  spp.billing_period,
  COUNT(*) as active_subscriptions,
  SUM(spp.amount) / 100.0 as monthly_revenue
FROM user_subscriptions us
JOIN subscription_plan_prices spp ON us.stripe_price_id = spp.stripe_price_id
JOIN subscription_plans sp ON spp.subscription_plan_id = sp.id
WHERE us.status = 'active'
GROUP BY sp.plan_name, spp.billing_period, sp.sort_order
ORDER BY sp.sort_order, spp.billing_period;
```

### 6. Subscriptions Expiring Soon (Next 7 Days)

```sql
SELECT
  us.id,
  u.email,
  sp.plan_name,
  spp.billing_period,
  us.current_period_end,
  us.cancel_at_period_end,
  DATE_PART('day', us.current_period_end::timestamp - CURRENT_TIMESTAMP) as days_remaining
FROM user_subscriptions us
JOIN users u ON us.users_id = u.id
JOIN subscription_plan_prices spp ON us.stripe_price_id = spp.stripe_price_id
JOIN subscription_plans sp ON spp.subscription_plan_id = sp.id
WHERE us.cancel_at_period_end = true
AND us.current_period_end <= CURRENT_DATE + INTERVAL '7 days'
AND us.status = 'active'
ORDER BY us.current_period_end ASC;
```

### 7. Usage Tracking - Users Near Limits

```sql
SELECT
  u.email,
  sp.plan_name,
  su.videos_processed,
  su.usage_limit,
  ROUND((su.videos_processed::numeric / NULLIF(su.usage_limit, 0) * 100), 1) as usage_percent,
  su.period_end
FROM subscription_usage su
JOIN user_subscriptions us ON su.user_subscriptions_id = us.id
JOIN users u ON su.user_id = u.id
JOIN subscription_plan_prices spp ON us.stripe_price_id = spp.stripe_price_id
JOIN subscription_plans sp ON spp.subscription_plan_id = sp.id
WHERE us.status = 'active'
AND su.videos_processed >= (su.usage_limit * 0.8)
ORDER BY usage_percent DESC
LIMIT 50;
```

### 8. Revenue Metrics (Last 30 Days)

```sql
SELECT
  DATE(spm.created_at) as date,
  COUNT(*) as migrations,
  COUNT(*) FILTER (WHERE migration_type = 'upgrade') as upgrades,
  COUNT(*) FILTER (WHERE migration_type = 'downgrade') as downgrades,
  SUM(proration_amount) / 100.0 as total_prorations
FROM subscription_plan_migrations spm
WHERE spm.created_at >= NOW() - INTERVAL '30 days'
GROUP BY DATE(spm.created_at)
ORDER BY date DESC;
```

### 9. Webhook Event Trends (Hourly, Last 24 Hours)

```sql
SELECT
  DATE_TRUNC('hour', created_at) as hour,
  event_type,
  COUNT(*) as count,
  COUNT(*) FILTER (WHERE processed_successfully = true) as successful,
  COUNT(*) FILTER (WHERE processed_successfully = false) as failed
FROM subscription_events
WHERE created_at >= NOW() - INTERVAL '24 hours'
GROUP BY DATE_TRUNC('hour', created_at), event_type
ORDER BY hour DESC, count DESC;
```

### 10. Stuck or Long-Running Webhooks

```sql
SELECT
  id,
  stripe_event_id,
  event_type,
  status,
  created_at,
  updated_at,
  EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - updated_at)) / 60 as minutes_stuck
FROM subscription_events
WHERE status = 'processing'
AND updated_at < NOW() - INTERVAL '5 minutes'
ORDER BY created_at ASC;
```

---

## API Endpoints

### Webhook Statistics
```
GET /api/admin/webhooks/stats?days=7
```

### Webhook Health
```
GET /api/admin/webhooks/health
```

### Failed Webhooks
```
GET /api/admin/webhooks/failed?limit=50&maxRetries=3
```

### Recent Events
```
GET /api/admin/webhooks/recent?limit=100&eventType=customer.subscription.created
```

### Subscription Migrations
```
GET /api/admin/webhooks/migrations?days=30
```

---

## Alert Thresholds

Recommended alert thresholds for monitoring:

| Metric | Warning | Critical |
|--------|---------|----------|
| Webhook success rate | <95% | <90% |
| Failed events (1 hour) | >10 | >50 |
| Stuck webhooks | >5 | >20 |
| Processing time (avg) | >10s | >30s |
| Users with tier mismatch | >0 | >10 |

---

## Troubleshooting

### Webhook Not Processing
1. Check webhook event log: `SELECT * FROM subscription_events WHERE stripe_event_id = '<event_id>'`
2. Verify webhook signature in Stripe dashboard
3. Check application logs for errors
4. Retry manually: `node scripts/retry-failed-webhooks.js`

### Tier Mismatch Issues
1. Run health check: `node scripts/subscription-health-check.js`
2. Manually sync from Stripe dashboard
3. Trigger subscription updated webhook

### Usage Limit Not Updating
1. Check subscription_usage table for user
2. Verify user_subscriptions record exists
3. Check for errors in handleTierChangeUsage logs

---

## Performance Optimization

### Index Recommendations

```sql
-- Speed up webhook queries
CREATE INDEX IF NOT EXISTS idx_subscription_events_created_at
ON subscription_events(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_subscription_events_status_processed
ON subscription_events(status, processed_successfully);

-- Speed up migration queries
CREATE INDEX IF NOT EXISTS idx_subscription_plan_migrations_created_at
ON subscription_plan_migrations(created_at DESC);

-- Speed up subscription lookups
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_status
ON user_subscriptions(status) WHERE status = 'active';
```

### Archive Old Events

```sql
-- Archive events older than 90 days (keep failed events)
DELETE FROM subscription_events
WHERE processed_successfully = true
AND status = 'processed'
AND created_at < NOW() - INTERVAL '90 days';
```

---

## Maintenance Schedule

| Task | Frequency | Command |
|------|-----------|---------|
| Retry failed webhooks | Every 15 minutes | `node scripts/retry-failed-webhooks.js` |
| Health check | Daily | `node scripts/subscription-health-check.js` |
| Archive old events | Weekly | See "Archive Old Events" query above |
| Review migrations | Weekly | See "Subscription Plan Migration Analytics" query |
| Capacity planning | Monthly | Review "Active Subscriptions by Plan" |

---

## Success Metrics

Track these metrics to ensure system health:

- **Webhook Success Rate**: Target >99.5%
- **Average Processing Time**: Target <5 seconds
- **Failed Event Recovery**: Target >90% recovered within 1 hour
- **Subscription State Consistency**: Target 100% (no mismatches)
- **Upgrade/Downgrade Accuracy**: Target 100% correctly tracked

---

## Support

For issues or questions:
1. Check application logs: `logs/app.log`
2. Review webhook events: Query `subscription_events` table
3. Run health check for diagnostics
4. Contact system administrator with health check results
