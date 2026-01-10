/**
 * Thumbnail Studio JavaScript
 * Handles thumbnail viewing, management, and regeneration
 * Note: Initial thumbnails are auto-generated with other content types
 */

class ThumbnailStudio {
    constructor() {
        this.videoId = null;
        this.videoTitle = null;
        this.options = null;
        this.referenceImages = [];
        this.selectedExpression = null;
        this.selectedCategory = null;
        this.selectedThumbnailId = null;
        this.selectedThumbnailData = null;
        this.jobId = null;
        this.pollInterval = null;
        this.initialized = false;
        this.thumbnailsData = [];
    }

    /**
     * Initialize the studio
     */
    async init() {
        if (this.initialized) return;

        this.createModalHTML();
        this.setupEventListeners();
        await this.loadOptions();
        await this.loadReferenceImages();
        this.initialized = true;
    }

    /**
     * Create the modal HTML and inject into page
     */
    createModalHTML() {
        const modalHTML = `
        <div id="thumbnail-studio-overlay" class="thumbnail-studio-overlay">
            <div class="thumbnail-studio-modal">
                <div class="thumbnail-studio-header">
                    <h2>Thumbnail Studio</h2>
                    <button id="thumbnail-studio-close-btn" class="thumbnail-studio-close">&times;</button>
                </div>
                <div class="thumbnail-studio-body">
                    <!-- Left Panel: Controls -->
                    <div class="studio-controls">
                        <!-- Reference Images -->
                        <div class="control-section">
                            <h3>Reference Images</h3>
                            <p class="helper-text">Upload 1-5 photos for character consistency (for regeneration)</p>
                            <div id="reference-images-grid" class="reference-grid"></div>
                            <input type="file" id="reference-image-input" accept="image/*" multiple style="display:none;">
                            <button id="upload-reference-btn" class="upload-reference-btn">
                                + Add Reference Photo
                            </button>
                        </div>

                        <!-- Topic -->
                        <div class="control-section">
                            <h3>Content</h3>
                            <div class="form-group">
                                <label for="thumbnail-topic">Main Topic *</label>
                                <input type="text" id="thumbnail-topic" class="form-input" placeholder="e.g., The Truth About AI">
                            </div>
                            <div class="form-group">
                                <label for="thumbnail-subtopic">Sub-Topic</label>
                                <input type="text" id="thumbnail-subtopic" class="form-input" placeholder="e.g., What They Don't Tell You">
                            </div>
                        </div>

                        <!-- Expression -->
                        <div class="control-section">
                            <h3>Expression</h3>
                            <div id="expression-selector" class="chip-selector"></div>
                        </div>

                        <!-- Category -->
                        <div class="control-section">
                            <h3>Content Category</h3>
                            <select id="thumbnail-category" class="form-select">
                                <option value="">Select category...</option>
                            </select>
                        </div>

                        <!-- Aspect Ratio -->
                        <div class="control-section">
                            <h3>Aspect Ratio</h3>
                            <div class="ratio-selector">
                                <label class="ratio-option selected" data-ratio="16:9">
                                    <input type="radio" name="aspect-ratio" value="16:9" checked>
                                    <div class="ratio-preview ratio-16-9"></div>
                                    <span>16:9 Standard</span>
                                </label>
                                <label class="ratio-option" data-ratio="9:16">
                                    <input type="radio" name="aspect-ratio" value="9:16">
                                    <div class="ratio-preview ratio-9-16"></div>
                                    <span>9:16 Shorts</span>
                                </label>
                            </div>
                        </div>

                        <!-- Regenerate Button -->
                        <div class="control-section">
                            <button id="generate-btn" class="generate-btn">
                                Generate Viral Thumbnails
                            </button>
                            <p class="helper-text">Creates 4 new style variations</p>
                        </div>
                    </div>

                    <!-- Right Panel: Results -->
                    <div class="studio-results">
                        <div class="results-header">
                            <h3>Generated Thumbnails</h3>
                            <span id="thumbnail-count" class="thumbnail-count-badge">0/4</span>
                        </div>

                        <!-- Progress -->
                        <div id="generation-progress" class="generation-progress">
                            <div class="progress-bar">
                                <div id="progress-fill" class="progress-fill"></div>
                            </div>
                            <p id="progress-text" class="progress-text">Generating...</p>
                        </div>

                        <!-- Thumbnail Grid -->
                        <div id="thumbnails-grid" class="thumbnails-grid">
                            <div class="thumbnail-slot placeholder" data-slot="1">
                                <span class="slot-label">Cinematic Drama</span>
                            </div>
                            <div class="thumbnail-slot placeholder" data-slot="2">
                                <span class="slot-label">Hyper-Vibrant Pop</span>
                            </div>
                            <div class="thumbnail-slot placeholder" data-slot="3">
                                <span class="slot-label">Clean & Studio</span>
                            </div>
                            <div class="thumbnail-slot placeholder" data-slot="4">
                                <span class="slot-label">Gritty & Mystery</span>
                            </div>
                        </div>

                        <!-- Actions Panel -->
                        <div id="thumbnail-actions-panel" class="thumbnail-actions-panel">
                            <div class="actions-header">
                                <div class="selected-preview">
                                    <img id="selected-preview-img" src="" alt="Selected thumbnail">
                                </div>
                                <div class="actions-info">
                                    <h4 id="selected-style-name">Selected Thumbnail</h4>
                                    <p id="selected-style-desc">Click a thumbnail to select it</p>
                                </div>
                            </div>
                            <div class="action-buttons">
                                <button id="use-thumbnail-btn" class="action-btn action-btn-primary">
                                    Use This Thumbnail
                                </button>
                                <button id="refine-toggle-btn" class="action-btn action-btn-outline">
                                    Refine with Feedback
                                </button>
                                <button id="download-thumbnail-btn" class="action-btn action-btn-outline">
                                    Download
                                </button>
                            </div>

                            <!-- Refine Panel -->
                            <div id="refine-panel" class="refine-panel">
                                <h4>Refine Thumbnail</h4>
                                <textarea id="refine-instruction" placeholder="Describe what to change... e.g., 'Make the background more dramatic' or 'Change expression to more surprised'"></textarea>
                                <div class="refine-actions">
                                    <button id="refine-cancel-btn" class="action-btn action-btn-outline">Cancel</button>
                                    <button id="refine-apply-btn" class="action-btn action-btn-primary">Apply Changes</button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHTML);
    }

    /**
     * Setup event listeners (no inline handlers - CSP compliant)
     */
    setupEventListeners() {
        // Close button
        document.getElementById('thumbnail-studio-close-btn').addEventListener('click', () => this.close());

        // Upload reference button
        document.getElementById('upload-reference-btn').addEventListener('click', () => {
            document.getElementById('reference-image-input').click();
        });

        // Reference image upload
        document.getElementById('reference-image-input').addEventListener('change', (e) => this.handleReferenceUpload(e));

        // Generate button
        document.getElementById('generate-btn').addEventListener('click', () => this.generate());

        // Action buttons
        document.getElementById('use-thumbnail-btn').addEventListener('click', () => this.setAsActive());
        document.getElementById('refine-toggle-btn').addEventListener('click', () => this.toggleRefinePanel());
        document.getElementById('download-thumbnail-btn').addEventListener('click', () => this.download());

        // Refine panel buttons
        document.getElementById('refine-cancel-btn').addEventListener('click', () => this.toggleRefinePanel());
        document.getElementById('refine-apply-btn').addEventListener('click', () => this.refine());

        // Aspect ratio selector
        document.querySelectorAll('.ratio-option').forEach(option => {
            option.addEventListener('click', () => {
                document.querySelectorAll('.ratio-option').forEach(o => o.classList.remove('selected'));
                option.classList.add('selected');
                option.querySelector('input').checked = true;

                // Update grid layout based on selected ratio
                const ratio = option.dataset.ratio;
                this.updateGridLayout(ratio);
            });
        });

        // Close on overlay click
        document.getElementById('thumbnail-studio-overlay').addEventListener('click', (e) => {
            if (e.target.id === 'thumbnail-studio-overlay') {
                this.close();
            }
        });

        // Close on Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && document.getElementById('thumbnail-studio-overlay').classList.contains('active')) {
                this.close();
            }
        });
    }

    /**
     * Load options from API
     */
    async loadOptions() {
        try {
            const response = await fetch('/api/thumbnails/options');
            const data = await response.json();

            if (data.success) {
                this.options = data.data;
                this.renderExpressionSelector();
                this.renderCategorySelector();
            }
        } catch (error) {
            console.error('Failed to load thumbnail options:', error);
        }
    }

    /**
     * Load user's reference images
     */
    async loadReferenceImages() {
        try {
            const response = await fetch('/api/thumbnails/reference-images');
            const data = await response.json();

            if (data.success) {
                this.referenceImages = data.data || [];
                this.renderReferenceImages();
            }
        } catch (error) {
            console.error('Failed to load reference images:', error);
        }
    }

    /**
     * Render expression selector chips
     */
    renderExpressionSelector() {
        const container = document.getElementById('expression-selector');
        if (!container || !this.options?.expressions) return;

        container.innerHTML = this.options.expressions.map(exp => `
            <button class="expression-chip ${this.selectedExpression === exp.key ? 'selected' : ''}"
                    data-key="${exp.key}"
                    title="${exp.primary_emotion}">
                ${exp.name}
            </button>
        `).join('');

        // Add click handlers
        container.querySelectorAll('.expression-chip').forEach(chip => {
            chip.addEventListener('click', () => {
                container.querySelectorAll('.expression-chip').forEach(c => c.classList.remove('selected'));
                chip.classList.add('selected');
                this.selectedExpression = chip.dataset.key;
            });
        });

        // Select first by default
        if (this.options.expressions.length > 0 && !this.selectedExpression) {
            this.selectedExpression = this.options.expressions[0].key;
            container.querySelector('.expression-chip')?.classList.add('selected');
        }
    }

    /**
     * Render category dropdown
     */
    renderCategorySelector() {
        const select = document.getElementById('thumbnail-category');
        if (!select || !this.options?.categories) return;

        select.innerHTML = '<option value="">Select category...</option>' +
            this.options.categories.map(cat => `
                <option value="${cat.key}">${cat.name}</option>
            `).join('');
    }

    /**
     * Render reference images grid
     */
    renderReferenceImages() {
        const container = document.getElementById('reference-images-grid');
        if (!container) return;

        if (this.referenceImages.length === 0) {
            container.innerHTML = '<p class="helper-text" style="grid-column: 1/-1; text-align: center;">No reference images yet</p>';
            return;
        }

        container.innerHTML = this.referenceImages.map(img => `
            <div class="reference-image-item" data-id="${img.id}">
                <img src="${img.cloudinary_secure_url}" alt="${img.display_name || 'Reference'}">
                <button class="remove-btn" onclick="event.stopPropagation(); thumbnailStudio.removeReferenceImage(${img.id})">&times;</button>
            </div>
        `).join('');
    }

    /**
     * Handle reference image upload
     */
    async handleReferenceUpload(event) {
        const files = event.target.files;
        if (!files.length) return;

        for (const file of files) {
            if (this.referenceImages.length >= 5) {
                this.showToast('Maximum 5 reference images allowed', 'warning');
                break;
            }

            const formData = new FormData();
            formData.append('image', file);
            formData.append('displayName', file.name);

            try {
                const response = await fetch('/api/thumbnails/reference-images', {
                    method: 'POST',
                    body: formData
                });

                const data = await response.json();
                if (data.success) {
                    this.referenceImages.push(data.data);
                    this.renderReferenceImages();
                    this.showToast('Reference image uploaded', 'success');
                } else {
                    this.showToast('Failed to upload image', 'error');
                }
            } catch (error) {
                console.error('Upload failed:', error);
                this.showToast('Upload failed', 'error');
            }
        }

        event.target.value = '';
    }

    /**
     * Remove a reference image
     */
    async removeReferenceImage(id) {
        try {
            const response = await fetch(`/api/thumbnails/reference-images/${id}`, {
                method: 'DELETE'
            });

            if (response.ok) {
                this.referenceImages = this.referenceImages.filter(img => img.id !== id);
                this.renderReferenceImages();
                this.showToast('Reference image removed', 'success');
            }
        } catch (error) {
            console.error('Failed to remove image:', error);
            this.showToast('Failed to remove image', 'error');
        }
    }

    /**
     * Open studio for a video
     */
    async open(videoId, videoTitle) {
        await this.init();

        this.videoId = videoId;
        this.videoTitle = videoTitle;
        this.selectedThumbnailId = null;
        this.selectedThumbnailData = null;

        // Pre-fill topic with video title
        const topicInput = document.getElementById('thumbnail-topic');
        if (topicInput && videoTitle) {
            topicInput.value = videoTitle;
        }

        // Reset UI
        this.resetResultsPanel();
        document.getElementById('thumbnail-actions-panel').classList.remove('active');
        document.getElementById('refine-panel').classList.remove('active');

        // Load existing thumbnails for this video
        await this.loadExistingThumbnails();

        // Show modal
        document.getElementById('thumbnail-studio-overlay').classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    /**
     * Close studio
     */
    close() {
        document.getElementById('thumbnail-studio-overlay').classList.remove('active');
        document.body.style.overflow = '';
        this.stopPolling();
    }

    /**
     * Reset results panel to placeholders
     */
    resetResultsPanel() {
        const grid = document.getElementById('thumbnails-grid');
        const styles = this.options?.styles || [
            { name: 'Cinematic Drama' },
            { name: 'Hyper-Vibrant Pop' },
            { name: 'Clean & Studio' },
            { name: 'Gritty & Mystery' }
        ];

        grid.innerHTML = styles.map((style, i) => `
            <div class="thumbnail-slot placeholder" data-slot="${i + 1}">
                <span class="slot-label">${style.name}</span>
            </div>
        `).join('');

        document.getElementById('thumbnail-count').textContent = '0/4';
    }

    /**
     * Load existing thumbnails for this video
     */
    async loadExistingThumbnails() {
        if (!this.videoId) return;

        try {
            const response = await fetch(`/api/thumbnails/videos/${this.videoId}`);
            const data = await response.json();

            if (data.success && data.data.length > 0) {
                this.renderThumbnails(data.data);
            }
        } catch (error) {
            console.error('Failed to load existing thumbnails:', error);
        }
    }

    /**
     * Generate thumbnails
     */
    async generate() {
        // Validate inputs
        const topic = document.getElementById('thumbnail-topic').value.trim();
        if (!topic) {
            this.showToast('Please enter a topic', 'error');
            return;
        }

        if (this.referenceImages.length === 0) {
            this.showToast('Please upload at least one reference image', 'error');
            return;
        }

        if (!this.selectedExpression) {
            this.showToast('Please select an expression', 'error');
            return;
        }

        const subTopic = document.getElementById('thumbnail-subtopic').value.trim();
        const categoryKey = document.getElementById('thumbnail-category').value;
        const aspectRatio = document.querySelector('input[name="aspect-ratio"]:checked').value;

        // Show progress
        this.showProgress(true);
        const generateBtn = document.getElementById('generate-btn');
        generateBtn.disabled = true;
        generateBtn.innerHTML = '<span class="spinner"></span> Generating...';

        try {
            const response = await fetch(`/api/thumbnails/videos/${this.videoId}/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    topic,
                    subTopic,
                    expressionKey: this.selectedExpression,
                    aspectRatio,
                    categoryKey,
                    referenceImageIds: this.referenceImages.map(img => img.id)
                })
            });

            const data = await response.json();

            if (data.success) {
                this.jobId = data.jobId;
                this.startPolling();
                this.showToast('Thumbnail generation started', 'info');
            } else {
                this.showToast(data.error || 'Generation failed', 'error');
                this.showProgress(false);
                generateBtn.disabled = false;
                generateBtn.innerHTML = 'Generate 4 Thumbnails';
            }
        } catch (error) {
            console.error('Generation request failed:', error);
            this.showToast('Failed to start generation', 'error');
            this.showProgress(false);
            generateBtn.disabled = false;
            generateBtn.innerHTML = 'Generate 4 Thumbnails';
        }
    }

    /**
     * Start polling for job status
     */
    startPolling() {
        this.pollInterval = setInterval(() => this.checkJobStatus(), 2000);
    }

    /**
     * Stop polling
     */
    stopPolling() {
        if (this.pollInterval) {
            clearInterval(this.pollInterval);
            this.pollInterval = null;
        }
    }

    /**
     * Check job status
     */
    async checkJobStatus() {
        if (!this.jobId) return;

        try {
            const response = await fetch(`/api/thumbnails/jobs/${this.jobId}`);
            const data = await response.json();

            if (data.success) {
                const job = data.data;

                // Update progress
                this.updateProgress(job.progress, job.current_style);

                if (job.status === 'completed') {
                    this.stopPolling();
                    this.showProgress(false);
                    this.resetGenerateButton();
                    this.renderThumbnails(job.thumbnails);
                    this.showToast('Thumbnails generated successfully!', 'success');
                } else if (job.status === 'failed') {
                    this.stopPolling();
                    this.showProgress(false);
                    this.resetGenerateButton();
                    this.showToast(job.error_message || 'Generation failed', 'error');
                }
            }
        } catch (error) {
            console.error('Status check failed:', error);
        }
    }

    /**
     * Reset generate button state
     */
    resetGenerateButton() {
        const generateBtn = document.getElementById('generate-btn');
        generateBtn.disabled = false;
        generateBtn.innerHTML = 'Generate 4 Thumbnails';
    }

    /**
     * Show/hide progress indicator
     */
    showProgress(show) {
        const progress = document.getElementById('generation-progress');
        if (show) {
            progress.classList.add('active');
        } else {
            progress.classList.remove('active');
        }
    }

    /**
     * Update progress bar
     */
    updateProgress(percent, currentStyle) {
        document.getElementById('progress-fill').style.width = `${percent}%`;

        const styleNames = {
            'cinematic_drama': 'Cinematic Drama',
            'hyper_vibrant': 'Hyper-Vibrant Pop',
            'clean_studio': 'Clean & Studio',
            'gritty_mystery': 'Gritty & Mystery'
        };

        const styleName = styleNames[currentStyle] || currentStyle;
        document.getElementById('progress-text').textContent =
            currentStyle ? `Generating ${styleName}... ${percent}%` : `${percent}%`;
    }

    /**
     * Render thumbnails in grid
     */
    renderThumbnails(thumbnails) {
        const grid = document.getElementById('thumbnails-grid');
        if (!grid) return;

        // Update count badge
        document.getElementById('thumbnail-count').textContent = `${thumbnails.length}/4`;

        // Get style display names
        const styleMap = {};
        if (this.options?.styles) {
            this.options.styles.forEach(s => styleMap[s.key] = s.name);
        }

        // Get current aspect ratio
        const selectedRatio = document.querySelector('input[name="aspect-ratio"]:checked')?.value || '16:9';
        this.updateGridLayout(selectedRatio);

        grid.innerHTML = thumbnails.map(thumb => `
            <div class="thumbnail-slot ${thumb.is_selected ? 'selected' : ''}"
                 data-id="${thumb.id}"
                 onclick="thumbnailStudio.selectThumbnail(${thumb.id}, this)">
                <img src="${thumb.cloudinary_secure_url}" alt="Thumbnail">
                ${thumb.is_selected ? '<span class="selected-badge">Active</span>' : ''}
                <button class="thumbnail-download-btn" onclick="event.stopPropagation(); thumbnailStudio.downloadSingleThumbnail('${thumb.cloudinary_secure_url}', '${thumb.style_name || 'thumbnail'}')" title="Download">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                        <polyline points="7 10 12 15 17 10"></polyline>
                        <line x1="12" y1="15" x2="12" y2="3"></line>
                    </svg>
                </button>
            </div>
        `).join('');

        // Add placeholders for remaining slots
        const remaining = 4 - thumbnails.length;
        const styles = this.options?.styles || [];
        for (let i = 0; i < remaining; i++) {
            const styleIndex = thumbnails.length + i;
            const styleName = styles[styleIndex]?.name || `Style ${styleIndex + 1}`;
            grid.innerHTML += `
                <div class="thumbnail-slot placeholder" data-slot="${styleIndex + 1}">
                    <span class="slot-label">${styleName}</span>
                </div>
            `;
        }

        // Store thumbnail data for later use
        this.thumbnailsData = thumbnails;
    }

    /**
     * Update grid layout based on aspect ratio
     */
    updateGridLayout(ratio) {
        const grid = document.getElementById('thumbnails-grid');
        if (!grid) return;

        if (ratio === '9:16') {
            grid.classList.add('portrait-mode');
            grid.classList.remove('landscape-mode');
        } else {
            grid.classList.add('landscape-mode');
            grid.classList.remove('portrait-mode');
        }

        // Also update thumbnail slots aspect ratio
        grid.querySelectorAll('.thumbnail-slot').forEach(slot => {
            if (ratio === '9:16') {
                slot.classList.add('portrait');
                slot.classList.remove('landscape');
            } else {
                slot.classList.add('landscape');
                slot.classList.remove('portrait');
            }
        });
    }

    /**
     * Download a single thumbnail
     */
    downloadSingleThumbnail(url, styleName) {
        const link = document.createElement('a');
        link.href = url;
        link.download = `thumbnail-${styleName}-${Date.now()}.png`;
        link.target = '_blank';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        this.showToast('Download started', 'success');
    }

    /**
     * Select a thumbnail
     */
    selectThumbnail(id, element) {
        this.selectedThumbnailId = id;
        this.selectedThumbnailData = this.thumbnailsData?.find(t => t.id === id);

        // Update UI selection
        document.querySelectorAll('.thumbnail-slot').forEach(slot => {
            slot.classList.remove('selected');
        });
        element.classList.add('selected');

        // Show actions panel
        const actionsPanel = document.getElementById('thumbnail-actions-panel');
        actionsPanel.classList.add('active');

        // Update preview
        if (this.selectedThumbnailData) {
            document.getElementById('selected-preview-img').src = this.selectedThumbnailData.cloudinary_secure_url;

            const styleMap = {};
            if (this.options?.styles) {
                this.options.styles.forEach(s => styleMap[s.key] = s.name);
            }

            document.getElementById('selected-style-name').textContent =
                styleMap[this.selectedThumbnailData.style_name] || this.selectedThumbnailData.style_name;
            document.getElementById('selected-style-desc').textContent =
                this.selectedThumbnailData.is_selected ? 'Currently active thumbnail' : 'Click "Use This Thumbnail" to set as active';
        }

        // Close refine panel if open
        document.getElementById('refine-panel').classList.remove('active');
    }

    /**
     * Toggle refine panel
     */
    toggleRefinePanel() {
        const panel = document.getElementById('refine-panel');
        panel.classList.toggle('active');

        if (panel.classList.contains('active')) {
            document.getElementById('refine-instruction').focus();
        }
    }

    /**
     * Refine selected thumbnail
     */
    async refine() {
        const instruction = document.getElementById('refine-instruction').value.trim();
        if (!instruction) {
            this.showToast('Please enter refinement instructions', 'error');
            return;
        }

        if (!this.selectedThumbnailId) {
            this.showToast('Please select a thumbnail first', 'error');
            return;
        }

        try {
            this.showToast('Refining thumbnail...', 'info');

            const response = await fetch(`/api/thumbnails/${this.selectedThumbnailId}/refine`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ instruction })
            });

            const data = await response.json();

            if (data.success) {
                this.showToast('Thumbnail refined successfully!', 'success');
                document.getElementById('refine-instruction').value = '';
                document.getElementById('refine-panel').classList.remove('active');
                await this.loadExistingThumbnails();
            } else {
                this.showToast(data.error || 'Refinement failed', 'error');
            }
        } catch (error) {
            console.error('Refine failed:', error);
            this.showToast('Refinement failed', 'error');
        }
    }

    /**
     * Set selected thumbnail as active
     */
    async setAsActive() {
        if (!this.selectedThumbnailId) return;

        try {
            const response = await fetch(`/api/thumbnails/${this.selectedThumbnailId}/select`, {
                method: 'POST'
            });

            const data = await response.json();

            if (data.success) {
                this.showToast('Thumbnail set as active!', 'success');
                await this.loadExistingThumbnails();
            } else {
                this.showToast(data.error || 'Failed to set thumbnail', 'error');
            }
        } catch (error) {
            console.error('Set active failed:', error);
            this.showToast('Failed to set thumbnail', 'error');
        }
    }

    /**
     * Download thumbnail
     */
    async download() {
        if (!this.selectedThumbnailId || !this.selectedThumbnailData) return;

        try {
            // Open the Cloudinary URL in a new tab for download
            window.open(this.selectedThumbnailData.cloudinary_secure_url, '_blank');
        } catch (error) {
            console.error('Download failed:', error);
            this.showToast('Download failed', 'error');
        }
    }

    /**
     * Show toast notification
     */
    showToast(message, type = 'info') {
        // Remove existing toast
        const existingToast = document.querySelector('.thumbnail-toast');
        if (existingToast) {
            existingToast.remove();
        }

        const toast = document.createElement('div');
        toast.className = `thumbnail-toast ${type}`;
        toast.textContent = message;
        document.body.appendChild(toast);

        // Trigger animation
        setTimeout(() => toast.classList.add('show'), 10);

        // Auto remove
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 4000);
    }
}

// Global instance
const thumbnailStudio = new ThumbnailStudio();

// Global function to open thumbnail studio from video cards
function openThumbnailStudio(videoId, videoTitle) {
    thumbnailStudio.open(videoId, videoTitle);
}
