/**
 * Usage Charts JavaScript
 * Handles interactive charts and visualizations for subscription usage data
 */

(function() {
    'use strict';

    // Chart configuration and data
    let usageCharts = {};
    
    // Initialize charts when DOM is ready
    document.addEventListener('DOMContentLoaded', function() {
        initializeUsageCharts();
        loadUsageData();
        
        // Refresh charts every minute
        setInterval(refreshCharts, 60000);
    });

    /**
     * Initialize usage charts
     */
    function initializeUsageCharts() {
        // Find chart containers
        const chartContainers = document.querySelectorAll('[data-chart-type]');
        
        chartContainers.forEach(container => {
            const chartType = container.getAttribute('data-chart-type');
            const chartId = container.id || `chart-${Date.now()}`;
            
            container.id = chartId;
            
            switch(chartType) {
                case 'usage-overview':
                    createUsageOverviewChart(chartId);
                    break;
                case 'monthly-trends':
                    createMonthlyTrendsChart(chartId);
                    break;
                case 'feature-usage':
                    createFeatureUsageChart(chartId);
                    break;
                default:
                    console.warn('Unknown chart type:', chartType);
            }
        });
        
        // If no chart containers found, create default usage visualization
        if (chartContainers.length === 0) {
            createDefaultUsageVisualization();
        }
    }

    /**
     * Create usage overview chart
     */
    function createUsageOverviewChart(containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;
        
        // Create simple usage overview using CSS and HTML
        container.innerHTML = `
            <div class="usage-overview-chart">
                <div class="chart-header">
                    <h3>Usage Overview</h3>
                    <p>Current month usage across all features</p>
                </div>
                <div class="chart-content">
                    <div class="usage-metric" id="sermon-assists-metric">
                        <div class="metric-label">AI Sermon Assists</div>
                        <div class="metric-progress">
                            <div class="progress-bar" data-metric="sermonAssists">
                                <div class="progress-fill"></div>
                            </div>
                            <div class="progress-text">0 / 0</div>
                        </div>
                    </div>
                    <div class="usage-metric" id="content-generation-metric">
                        <div class="metric-label">Content Generation</div>
                        <div class="metric-progress">
                            <div class="progress-bar" data-metric="contentGeneration">
                                <div class="progress-fill"></div>
                            </div>
                            <div class="progress-text">0 / 0</div>
                        </div>
                    </div>
                    <div class="usage-metric" id="api-calls-metric">
                        <div class="metric-label">API Calls</div>
                        <div class="metric-progress">
                            <div class="progress-bar" data-metric="apiCalls">
                                <div class="progress-fill"></div>
                            </div>
                            <div class="progress-text">0 / 0</div>
                        </div>
                    </div>
                    <div class="usage-metric" id="storage-metric">
                        <div class="metric-label">Storage Used</div>
                        <div class="metric-progress">
                            <div class="progress-bar" data-metric="storage">
                                <div class="progress-fill"></div>
                            </div>
                            <div class="progress-text">0 MB / 0 MB</div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        usageCharts[containerId] = { type: 'usage-overview', container };
    }

    /**
     * Create monthly trends chart
     */
    function createMonthlyTrendsChart(containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;
        
        container.innerHTML = `
            <div class="monthly-trends-chart">
                <div class="chart-header">
                    <h3>Monthly Trends</h3>
                    <p>Usage patterns over the last 6 months</p>
                </div>
                <div class="chart-content">
                    <div class="trends-placeholder">
                        <div class="trend-bars">
                            ${Array.from({length: 6}, (_, i) => `
                                <div class="trend-bar" data-month="${i}">
                                    <div class="bar-fill" style="height: ${Math.random() * 80 + 20}%"></div>
                                    <div class="bar-label">Month ${i + 1}</div>
                                </div>
                            `).join('')}
                        </div>
                        <div class="trends-legend">
                            <div class="legend-item">
                                <div class="legend-color" style="background: #10b981;"></div>
                                <span>Usage</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        usageCharts[containerId] = { type: 'monthly-trends', container };
    }

    /**
     * Create feature usage chart
     */
    function createFeatureUsageChart(containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;
        
        container.innerHTML = `
            <div class="feature-usage-chart">
                <div class="chart-header">
                    <h3>Feature Usage</h3>
                    <p>Most used features this month</p>
                </div>
                <div class="chart-content">
                    <div class="feature-list">
                        <div class="feature-item" data-feature="sermon-assists">
                            <div class="feature-name">AI Sermon Assists</div>
                            <div class="feature-bar">
                                <div class="feature-fill" style="width: 0%"></div>
                            </div>
                            <div class="feature-count">0</div>
                        </div>
                        <div class="feature-item" data-feature="content-generation">
                            <div class="feature-name">Content Generation</div>
                            <div class="feature-bar">
                                <div class="feature-fill" style="width: 0%"></div>
                            </div>
                            <div class="feature-count">0</div>
                        </div>
                        <div class="feature-item" data-feature="transcriptions">
                            <div class="feature-name">Transcriptions</div>
                            <div class="feature-bar">
                                <div class="feature-fill" style="width: 0%"></div>
                            </div>
                            <div class="feature-count">0</div>
                        </div>
                        <div class="feature-item" data-feature="summaries">
                            <div class="feature-name">AI Summaries</div>
                            <div class="feature-bar">
                                <div class="feature-fill" style="width: 0%"></div>
                            </div>
                            <div class="feature-count">0</div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        usageCharts[containerId] = { type: 'feature-usage', container };
    }

    /**
     * Create default usage visualization for subscription page
     */
    function createDefaultUsageVisualization() {
        // Enhance existing usage bars with animations and interactions
        const usageItems = document.querySelectorAll('.usage-item');
        
        usageItems.forEach(item => {
            const usageBar = item.querySelector('.usage-bar');
            const usageFill = item.querySelector('.usage-fill');
            
            if (usageBar && usageFill) {
                // Add hover effects
                usageBar.addEventListener('mouseenter', function() {
                    this.style.transform = 'scale(1.02)';
                    this.style.transition = 'transform 0.2s ease';
                });
                
                usageBar.addEventListener('mouseleave', function() {
                    this.style.transform = 'scale(1)';
                });
                
                // Add click functionality to show details
                usageBar.addEventListener('click', function() {
                    showUsageDetails(item);
                });
                
                // Add accessibility
                usageBar.setAttribute('role', 'button');
                usageBar.setAttribute('tabindex', '0');
                usageBar.setAttribute('aria-label', 'Click for usage details');
                
                // Keyboard support
                usageBar.addEventListener('keydown', function(e) {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        showUsageDetails(item);
                    }
                });
            }
        });
    }

    /**
     * Load usage data from server
     */
    async function loadUsageData() {
        try {
            const response = await fetch('/api/subscription/usage-details');
            const data = await response.json();
            
            if (data.success) {
                updateChartsWithData(data.usage);
            } else {
                // Use mock data for demonstration
                updateChartsWithData(getMockUsageData());
            }
        } catch (error) {
            console.error('Failed to load usage data:', error);
            // Use mock data as fallback
            updateChartsWithData(getMockUsageData());
        }
    }

    /**
     * Update charts with usage data
     */
    function updateChartsWithData(usageData) {
        Object.keys(usageCharts).forEach(chartId => {
            const chart = usageCharts[chartId];
            
            switch(chart.type) {
                case 'usage-overview':
                    updateUsageOverviewChart(chartId, usageData);
                    break;
                case 'monthly-trends':
                    updateMonthlyTrendsChart(chartId, usageData);
                    break;
                case 'feature-usage':
                    updateFeatureUsageChart(chartId, usageData);
                    break;
            }
        });
        
        // Update default usage bars as well
        updateDefaultUsageBars(usageData);
    }

    /**
     * Update usage overview chart
     */
    function updateUsageOverviewChart(chartId, data) {
        const container = document.getElementById(chartId);
        if (!container || !data) return;
        
        const metrics = ['sermonAssists', 'contentGeneration', 'apiCalls', 'storage'];
        
        metrics.forEach(metric => {
            const progressBar = container.querySelector(`[data-metric="${metric}"]`);
            const progressFill = progressBar?.querySelector('.progress-fill');
            const progressText = progressBar?.parentElement.querySelector('.progress-text');
            
            if (progressFill && progressText && data[metric]) {
                const { used, limit } = data[metric];
                const percentage = Math.min((used / limit) * 100, 100);
                
                // Animate the fill
                setTimeout(() => {
                    progressFill.style.width = `${percentage}%`;
                    progressFill.style.background = getUsageColor(percentage);
                }, 100);
                
                // Update text
                const unit = metric === 'storage' ? ' MB' : '';
                progressText.textContent = `${used}${unit} / ${limit}${unit}`;
            }
        });
    }

    /**
     * Update monthly trends chart
     */
    function updateMonthlyTrendsChart(chartId, data) {
        const container = document.getElementById(chartId);
        if (!container || !data.monthlyTrends) return;
        
        const trendBars = container.querySelectorAll('.trend-bar');
        
        data.monthlyTrends.forEach((value, index) => {
            if (trendBars[index]) {
                const barFill = trendBars[index].querySelector('.bar-fill');
                const percentage = Math.min((value / 100) * 100, 100); // Normalize to 100
                
                setTimeout(() => {
                    barFill.style.height = `${percentage}%`;
                }, index * 100);
            }
        });
    }

    /**
     * Update feature usage chart
     */
    function updateFeatureUsageChart(chartId, data) {
        const container = document.getElementById(chartId);
        if (!container || !data.features) return;
        
        const features = ['sermon-assists', 'content-generation', 'transcriptions', 'summaries'];
        const maxUsage = Math.max(...Object.values(data.features));
        
        features.forEach(feature => {
            const featureItem = container.querySelector(`[data-feature="${feature}"]`);
            const featureFill = featureItem?.querySelector('.feature-fill');
            const featureCount = featureItem?.querySelector('.feature-count');
            
            if (featureFill && featureCount && data.features[feature] !== undefined) {
                const usage = data.features[feature];
                const percentage = maxUsage > 0 ? (usage / maxUsage) * 100 : 0;
                
                setTimeout(() => {
                    featureFill.style.width = `${percentage}%`;
                }, 200);
                
                featureCount.textContent = usage.toString();
            }
        });
    }

    /**
     * Update default usage bars on subscription page
     */
    function updateDefaultUsageBars(data) {
        const usageItems = document.querySelectorAll('.usage-item');
        
        usageItems.forEach(item => {
            const title = item.querySelector('h3')?.textContent;
            const usageFill = item.querySelector('.usage-fill');
            const usageText = item.querySelector('.usage-text');
            
            let usageInfo = null;
            
            switch(title) {
                case 'AI Sermon Assists':
                    usageInfo = data.sermonAssists;
                    break;
                case 'Content Generation':
                    usageInfo = data.contentGeneration;
                    break;
                case 'API Calls':
                    usageInfo = data.apiCalls;
                    break;
            }
            
            if (usageInfo && usageFill && usageText) {
                const percentage = Math.min((usageInfo.used / usageInfo.limit) * 100, 100);
                
                usageFill.style.width = `${percentage}%`;
                usageFill.style.background = getUsageColor(percentage);
                usageText.textContent = `${usageInfo.used} of ${usageInfo.limit} used`;
            }
        });
    }

    /**
     * Get usage color based on percentage
     */
    function getUsageColor(percentage) {
        if (percentage > 90) {
            return 'linear-gradient(90deg, #ef4444, #dc2626)'; // Red
        } else if (percentage > 75) {
            return 'linear-gradient(90deg, #f59e0b, #d97706)'; // Orange
        } else if (percentage > 50) {
            return 'linear-gradient(90deg, #eab308, #ca8a04)'; // Yellow
        } else {
            return 'linear-gradient(90deg, #10b981, #059669)'; // Green
        }
    }

    /**
     * Show usage details modal
     */
    function showUsageDetails(usageItem) {
        const title = usageItem.querySelector('h3').textContent;
        const usageText = usageItem.querySelector('.usage-text').textContent;
        
        // Create modal
        const modal = document.createElement('div');
        modal.className = 'usage-modal';
        modal.innerHTML = `
            <div class="usage-modal-content">
                <div class="usage-modal-header">
                    <h3>${title} Details</h3>
                    <button class="usage-modal-close">&times;</button>
                </div>
                <div class="usage-modal-body">
                    <p><strong>Current Usage:</strong> ${usageText}</p>
                    <p><strong>Billing Period:</strong> ${getCurrentBillingPeriod()}</p>
                    <p><strong>Reset Date:</strong> ${getNextResetDate()}</p>
                    <div class="usage-tips">
                        <h4>Usage Tips:</h4>
                        <ul>
                            ${getUsageTips(title)}
                        </ul>
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // Add close functionality
        const closeBtn = modal.querySelector('.usage-modal-close');
        closeBtn.addEventListener('click', () => modal.remove());
        
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });
        
        // Show modal
        setTimeout(() => modal.classList.add('show'), 10);
    }

    /**
     * Get mock usage data for demonstration
     */
    function getMockUsageData() {
        return {
            sermonAssists: { used: 3, limit: 5 },
            contentGeneration: { used: 12, limit: 30 },
            apiCalls: { used: 250, limit: 1000 },
            storage: { used: 45, limit: 100 },
            features: {
                'sermon-assists': 15,
                'content-generation': 32,
                'transcriptions': 8,
                'summaries': 24
            },
            monthlyTrends: [65, 78, 45, 89, 92, 67]
        };
    }

    /**
     * Get current billing period
     */
    function getCurrentBillingPeriod() {
        const now = new Date();
        const start = new Date(now.getFullYear(), now.getMonth(), 1);
        const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        
        return `${start.toLocaleDateString()} - ${end.toLocaleDateString()}`;
    }

    /**
     * Get next reset date
     */
    function getNextResetDate() {
        const now = new Date();
        const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
        
        return nextMonth.toLocaleDateString();
    }

    /**
     * Get usage tips based on feature
     */
    function getUsageTips(featureTitle) {
        const tips = {
            'AI Sermon Assists': [
                'Use specific keywords for better AI responses',
                'Break complex requests into smaller parts',
                'Review and edit AI-generated content before use'
            ],
            'Content Generation': [
                'Provide clear context for better results',
                'Combine multiple generations for comprehensive content',
                'Save frequently used prompts as templates'
            ],
            'API Calls': [
                'Cache responses when possible',
                'Use batch operations for efficiency',
                'Monitor usage to avoid limits'
            ]
        };
        
        const tipList = tips[featureTitle] || ['Monitor your usage regularly', 'Upgrade for higher limits'];
        return tipList.map(tip => `<li>${tip}</li>`).join('');
    }

    /**
     * Refresh all charts
     */
    function refreshCharts() {
        loadUsageData();
    }

    // Add chart styles
    const chartStyles = document.createElement('style');
    chartStyles.textContent = `
        /* Usage Chart Styles */
        .usage-overview-chart, .monthly-trends-chart, .feature-usage-chart {
            background: white;
            border-radius: 8px;
            padding: 20px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            margin-bottom: 20px;
        }

        .chart-header h3 {
            margin: 0 0 8px 0;
            font-size: 1.25rem;
            color: #1f2937;
        }

        .chart-header p {
            margin: 0 0 20px 0;
            color: #6b7280;
            font-size: 0.875rem;
        }

        .usage-metric {
            margin-bottom: 16px;
        }

        .metric-label {
            font-weight: 500;
            margin-bottom: 8px;
            color: #374151;
        }

        .metric-progress {
            display: flex;
            align-items: center;
            gap: 12px;
        }

        .progress-bar {
            flex: 1;
            height: 8px;
            background: #e5e7eb;
            border-radius: 4px;
            overflow: hidden;
        }

        .progress-fill {
            height: 100%;
            background: #10b981;
            border-radius: 4px;
            transition: width 0.5s ease;
            width: 0%;
        }

        .progress-text {
            font-size: 0.875rem;
            color: #6b7280;
            min-width: 80px;
        }

        .trends-placeholder {
            text-align: center;
        }

        .trend-bars {
            display: flex;
            align-items: end;
            justify-content: space-around;
            height: 200px;
            margin-bottom: 16px;
        }

        .trend-bar {
            width: 40px;
            height: 100%;
            display: flex;
            flex-direction: column;
            justify-content: end;
            align-items: center;
        }

        .bar-fill {
            width: 100%;
            background: #10b981;
            border-radius: 4px 4px 0 0;
            transition: height 0.5s ease;
        }

        .bar-label {
            margin-top: 8px;
            font-size: 0.75rem;
            color: #6b7280;
        }

        .trends-legend {
            display: flex;
            justify-content: center;
            gap: 16px;
        }

        .legend-item {
            display: flex;
            align-items: center;
            gap: 4px;
            font-size: 0.875rem;
        }

        .legend-color {
            width: 12px;
            height: 12px;
            border-radius: 2px;
        }

        .feature-list {
            display: flex;
            flex-direction: column;
            gap: 16px;
        }

        .feature-item {
            display: flex;
            align-items: center;
            gap: 16px;
        }

        .feature-name {
            min-width: 140px;
            font-weight: 500;
            color: #374151;
        }

        .feature-bar {
            flex: 1;
            height: 20px;
            background: #e5e7eb;
            border-radius: 10px;
            overflow: hidden;
        }

        .feature-fill {
            height: 100%;
            background: #10b981;
            border-radius: 10px;
            transition: width 0.5s ease;
            width: 0%;
        }

        .feature-count {
            min-width: 40px;
            text-align: center;
            font-weight: 600;
            color: #1f2937;
        }

        .usage-modal {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.5);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 1000;
            opacity: 0;
            transition: opacity 0.3s ease;
        }

        .usage-modal.show {
            opacity: 1;
        }

        .usage-modal-content {
            background: white;
            border-radius: 8px;
            max-width: 500px;
            width: 90%;
            max-height: 80vh;
            overflow-y: auto;
        }

        .usage-modal-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 20px;
            border-bottom: 1px solid #e5e7eb;
        }

        .usage-modal-header h3 {
            margin: 0;
            color: #1f2937;
        }

        .usage-modal-close {
            background: none;
            border: none;
            font-size: 24px;
            cursor: pointer;
            color: #6b7280;
        }

        .usage-modal-body {
            padding: 20px;
        }

        .usage-tips h4 {
            margin: 16px 0 8px 0;
            color: #1f2937;
        }

        .usage-tips ul {
            margin: 0;
            padding-left: 20px;
        }

        .usage-tips li {
            margin-bottom: 4px;
            color: #4b5563;
        }
    `;
    
    document.head.appendChild(chartStyles);

})();