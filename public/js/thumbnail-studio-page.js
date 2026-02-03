/**
 * Thumbnail Studio Page JavaScript
 * Standalone page version (non-modal) of the thumbnail studio
 */

class ThumbnailStudioPage {
    constructor() {
        this.videoId = window.thumbnailStudioConfig?.videoId || null;
        this.videoTitle = window.thumbnailStudioConfig?.videoTitle || '';
        this.thumbnailTopic = window.thumbnailStudioConfig?.thumbnailTopic || '';
        this.thumbnailSubtopic = window.thumbnailStudioConfig?.thumbnailSubtopic || '';
        this.options = null;
        this.referenceImages = [];
        this.selectedExpression = null;
        this.selectedCategory = null;
        this.selectedThumbnailId = null;
        this.selectedThumbnailData = null;
        this.jobId = null;
        this.pollInterval = null;
        this.thumbnailsData = [];
        this.canUploadToYouTube = false;
        this.videoType = 'video'; // 'video', 'short', or 'live'
    }

    /**
     * Initialize the studio
     */
    async init() {
        this.setupEventListeners();
        await this.loadOptions();
        await this.loadReferenceImages();

        // Load videos for selector if no video specified
        if (!this.videoId) {
            await this.loadVideoSelector();
        } else {
            await this.loadExistingThumbnails();
        }
    }

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        // Upload reference button
        const uploadBtn = document.getElementById('upload-reference-btn');
        if (uploadBtn) {
            uploadBtn.addEventListener('click', () => {
                document.getElementById('reference-image-input').click();
            });
        }

        // Reference image upload
        const imageInput = document.getElementById('reference-image-input');
        if (imageInput) {
            imageInput.addEventListener('change', (e) => this.handleReferenceUpload(e));
        }

        // Generate button
        const generateBtn = document.getElementById('generate-btn');
        if (generateBtn) {
            generateBtn.addEventListener('click', () => this.generate());
        }

        // Action buttons
        const useBtn = document.getElementById('use-thumbnail-btn');
        if (useBtn) {
            useBtn.addEventListener('click', () => this.setAsActive());
        }

        const refineToggleBtn = document.getElementById('refine-toggle-btn');
        if (refineToggleBtn) {
            refineToggleBtn.addEventListener('click', (e) => this.toggleRefinePanel(e));
        }

        const downloadBtn = document.getElementById('download-thumbnail-btn');
        if (downloadBtn) {
            downloadBtn.addEventListener('click', () => this.download());
        }

        // Refine panel buttons
        const refineCancelBtn = document.getElementById('refine-cancel-btn');
        if (refineCancelBtn) {
            refineCancelBtn.addEventListener('click', (e) => this.toggleRefinePanel(e));
        }

        const refineApplyBtn = document.getElementById('refine-apply-btn');
        if (refineApplyBtn) {
            refineApplyBtn.addEventListener('click', () => this.refine());
        }

        // Aspect ratio selector
        document.querySelectorAll('.ratio-option').forEach(option => {
            option.addEventListener('click', () => {
                document.querySelectorAll('.ratio-option').forEach(o => o.classList.remove('selected'));
                option.classList.add('selected');
                option.querySelector('input').checked = true;

                const ratio = option.dataset.ratio;
                this.updateGridLayout(ratio);

                // Clear selection since the selected thumbnail may be from a different ratio
                this.selectedThumbnailId = null;
                this.selectedThumbnailData = null;
                document.getElementById('thumbnail-actions-panel').classList.remove('active');

                // Re-render thumbnails for the newly selected aspect ratio
                this.renderThumbnailsForRatio(ratio);
            });
        });

        // Video selector change
        const videoSelector = document.getElementById('video-selector');
        if (videoSelector) {
            videoSelector.addEventListener('change', (e) => this.onVideoSelect(e.target.value));
        }
    }

    /**
     * Load videos for selector
     */
    async loadVideoSelector() {
        try {
            const response = await fetch('/api/videos?status=completed');
            const data = await response.json();

            const selector = document.getElementById('video-selector');
            if (!selector) return;

            // API returns { success, data: { videos: [], pagination: {} } }
            const videos = data.data?.videos || [];

            if (data.success && videos.length > 0) {
                selector.innerHTML = '<option value="">Select a video...</option>' +
                    videos.map(video => `
                        <option value="${video.id}">${video.video_title || 'Untitled'}</option>
                    `).join('');
            } else {
                selector.innerHTML = '<option value="">No videos found</option>';
            }
        } catch (error) {
            console.error('Failed to load videos:', error);
        }
    }

    /**
     * Handle video selection
     */
    async onVideoSelect(videoId) {
        if (!videoId) return;

        this.videoId = videoId;
        this.canUploadToYouTube = false; // Reset until we check
        this.videoType = 'video'; // Reset until we check
        this.thumbnailTopic = ''; // Reset until loaded
        this.thumbnailSubtopic = ''; // Reset until loaded
        const selector = document.getElementById('video-selector');
        const selectedOption = selector.options[selector.selectedIndex];
        this.videoTitle = selectedOption.text;

        // Load existing thumbnails for this video (also loads saved topic/subtopic)
        await this.loadExistingThumbnails();

        // Populate topic input with saved topic or fall back to video title
        const topicInput = document.getElementById('thumbnail-topic');
        if (topicInput) {
            topicInput.value = this.thumbnailTopic || this.videoTitle;
        }

        // Populate subtopic input with saved subtopic
        const subtopicInput = document.getElementById('thumbnail-subtopic');
        if (subtopicInput) {
            subtopicInput.value = this.thumbnailSubtopic || '';
        }
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
     * Render category selector as pills
     */
    renderCategorySelector() {
        const container = document.getElementById('category-selector');
        if (!container || !this.options?.categories) return;

        // Default to 'entertainment' (Entertainment/Reaction)
        const defaultCategory = 'entertainment';
        this.selectedCategory = defaultCategory;

        container.innerHTML = this.options.categories.map(cat => `
            <div class="category-chip ${cat.key === defaultCategory ? 'selected' : ''}" data-key="${cat.key}">
                ${cat.name}
            </div>
        `).join('');

        // Add click handlers
        container.querySelectorAll('.category-chip').forEach(chip => {
            chip.addEventListener('click', () => {
                container.querySelectorAll('.category-chip').forEach(c => c.classList.remove('selected'));
                chip.classList.add('selected');
                this.selectedCategory = chip.dataset.key;
            });
        });
    }

    /**
     * Render reference images grid
     */
    renderReferenceImages() {
        const container = document.getElementById('reference-images-grid');
        if (!container) return;

        if (this.referenceImages.length === 0) {
            container.innerHTML = '<p class="section-helper" style="grid-column: 1/-1; text-align: center; margin: 0;">No reference images yet</p>';
            return;
        }

        container.innerHTML = this.referenceImages.map(img => `
            <div class="reference-image-item" data-id="${img.id}">
                <img src="${img.cloudinary_secure_url}" alt="${img.display_name || 'Reference'}">
                <button class="remove-btn" data-id="${img.id}">&times;</button>
            </div>
        `).join('');

        // Add remove button handlers
        container.querySelectorAll('.remove-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.removeReferenceImage(parseInt(btn.dataset.id));
            });
        });
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
     * Load existing thumbnails for this video
     */
    async loadExistingThumbnails() {
        if (!this.videoId) return;

        try {
            const response = await fetch(`/api/thumbnails/videos/${this.videoId}`);
            const data = await response.json();

            // Store whether user can upload to YouTube for this video
            this.canUploadToYouTube = data.canUploadToYouTube || false;
            this.videoType = data.videoType || 'video';

            // Store saved topic/subtopic from API
            this.thumbnailTopic = data.thumbnailTopic || '';
            this.thumbnailSubtopic = data.thumbnailSubtopic || '';

            if (data.success && data.data.length > 0) {
                // Store ALL thumbnails (up to 8: 4 for 16:9 + 4 for 9:16)
                this.thumbnailsData = data.data;

                // Get current UI selection
                const currentRatio = this.getSelectedAspectRatio();

                // Check what's available
                const has16x9 = data.data.some(t => t.aspect_ratio === '16:9');
                const has9x16 = data.data.some(t => t.aspect_ratio === '9:16');
                const hasCurrentRatio = data.data.some(t => t.aspect_ratio === currentRatio);

                // Determine which ratio to display:
                // 1. Keep current selection if thumbnails exist for it
                // 2. Otherwise, show whichever ratio has thumbnails (prefer 16:9)
                let displayRatio = currentRatio;
                if (!hasCurrentRatio) {
                    if (has16x9) {
                        displayRatio = '16:9';
                    } else if (has9x16) {
                        displayRatio = '9:16';
                    }
                    // Update UI to match
                    this.setAspectRatio(displayRatio);
                }

                // Render thumbnails for the display ratio
                this.renderThumbnailsForRatio(displayRatio);
            } else {
                // No thumbnails, just reset and show placeholders for current ratio
                this.thumbnailsData = [];
                this.renderThumbnailsForRatio(this.getSelectedAspectRatio());
            }
        } catch (error) {
            console.error('Failed to load existing thumbnails:', error);
        }
    }

    /**
     * Get currently selected aspect ratio from UI
     */
    getSelectedAspectRatio() {
        return document.querySelector('input[name="aspect-ratio"]:checked')?.value || '16:9';
    }

    /**
     * Check if YouTube upload button should be shown for current view
     * Only shows when:
     * - canUploadToYouTube is true (video is from connected channel)
     * - Current aspect ratio matches video type (9:16 for shorts, 16:9 for videos/lives)
     */
    shouldShowYouTubeUpload() {
        if (!this.canUploadToYouTube) return false;

        const currentRatio = this.getSelectedAspectRatio();
        const expectedRatio = this.videoType === 'short' ? '9:16' : '16:9';

        return currentRatio === expectedRatio;
    }

    /**
     * Render thumbnails filtered by aspect ratio
     */
    renderThumbnailsForRatio(ratio) {
        const filtered = this.thumbnailsData?.filter(t => t.aspect_ratio === ratio) || [];
        this.renderThumbnails(filtered, ratio);

        // Update aspect ratio badges to show count for each ratio
        this.updateAspectRatioBadges();
    }

    /**
     * Update aspect ratio button badges with thumbnail counts
     */
    updateAspectRatioBadges() {
        const count16x9 = this.thumbnailsData?.filter(t => t.aspect_ratio === '16:9').length || 0;
        const count9x16 = this.thumbnailsData?.filter(t => t.aspect_ratio === '9:16').length || 0;

        // Update or create badges on ratio options
        document.querySelectorAll('.ratio-option').forEach(option => {
            const ratio = option.dataset.ratio;
            const count = ratio === '16:9' ? count16x9 : count9x16;

            // Remove existing badge
            const existingBadge = option.querySelector('.ratio-count-badge');
            if (existingBadge) existingBadge.remove();

            // Add badge if there are thumbnails
            if (count > 0) {
                const badge = document.createElement('span');
                badge.className = 'ratio-count-badge';
                badge.textContent = count;
                option.appendChild(badge);
            }
        });
    }

    /**
     * Set aspect ratio and update UI
     */
    setAspectRatio(ratio) {
        // Update radio button selection
        const radioInput = document.querySelector(`input[name="aspect-ratio"][value="${ratio}"]`);
        if (radioInput) {
            radioInput.checked = true;

            // Update visual selection on ratio options
            document.querySelectorAll('.ratio-option').forEach(opt => {
                opt.classList.remove('selected');
                if (opt.dataset.ratio === ratio) {
                    opt.classList.add('selected');
                }
            });
        }

        // Update grid layout
        this.updateGridLayout(ratio);
    }

    /**
     * Generate thumbnails
     */
    async generate() {
        // Validate video selected
        if (!this.videoId) {
            this.showToast('Please select a video', 'error');
            return;
        }

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
        const categoryKey = this.selectedCategory || 'entertainment';
        const aspectRatio = document.querySelector('input[name="aspect-ratio"]:checked').value;
        const creativeTitles = document.getElementById('creative-titles')?.checked || false;

        // Show progress
        this.showProgress(true);
        const generateBtn = document.getElementById('generate-btn');
        generateBtn.disabled = true;
        generateBtn.innerHTML = '<span class="spinner"></span> Generating...';

        try {
            // Use regenerate endpoint if there are existing thumbnails of the same aspect ratio
            const existingForRatio = this.thumbnailsData?.filter(t => t.aspect_ratio === aspectRatio) || [];
            const endpoint = existingForRatio.length > 0 ? 'regenerate' : 'generate';
            const response = await fetch(`/api/thumbnails/videos/${this.videoId}/${endpoint}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    topic,
                    subTopic,
                    expressionKey: this.selectedExpression,
                    aspectRatio,
                    categoryKey,
                    referenceImageIds: this.referenceImages.map(img => img.id),
                    creativeTitles
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
                generateBtn.innerHTML = 'Generate Viral Thumbnails';
            }
        } catch (error) {
            console.error('Generation request failed:', error);
            this.showToast('Failed to start generation', 'error');
            this.showProgress(false);
            generateBtn.disabled = false;
            generateBtn.innerHTML = 'Generate Viral Thumbnails';
        }
    }

    /**
     * Start polling for job status
     */
    startPolling() {
        // First poll immediately
        this.checkJobStatus();
        // Then poll every 1 second for faster incremental updates
        this.pollInterval = setInterval(() => this.checkJobStatus(), 1000);
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

                // Debug logging
                console.log('Job status:', job.status, 'Progress:', job.progress, 'Thumbnails:', job.thumbnails?.length || 0);

                // Update progress
                this.updateProgress(job.progress, job.current_style);

                // Render thumbnails incrementally as they complete
                if (job.thumbnails && job.thumbnails.length > 0) {
                    console.log('Rendering incremental thumbnails:', job.thumbnails.length);
                    this.renderThumbnailsIncremental(job.thumbnails);
                }

                if (job.status === 'completed') {
                    this.stopPolling();
                    this.showProgress(false);
                    this.resetGenerateButton();
                    // Reload all thumbnails to get updated data for both aspect ratios
                    await this.loadExistingThumbnails();
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
     * Render thumbnails incrementally (for live updates during generation)
     */
    renderThumbnailsIncremental(thumbnails) {
        const grid = document.getElementById('thumbnails-grid');
        if (!grid) return;

        // Get style display names
        const styleMap = {};
        if (this.options?.styles) {
            this.options.styles.forEach(s => styleMap[s.key] = s.name);
        }

        // Get currently selected aspect ratio
        const selectedRatio = this.getSelectedAspectRatio();

        // Filter to only show thumbnails matching current aspect ratio
        const filteredThumbnails = thumbnails.filter(t => t.aspect_ratio === selectedRatio);

        // Update count badge
        document.getElementById('thumbnail-count').textContent = `${filteredThumbnails.length}/4`;

        // Check which thumbnails are already rendered
        const existingIds = new Set(
            Array.from(grid.querySelectorAll('.thumbnail-slot[data-id]'))
                .map(el => parseInt(el.dataset.id))
        );

        // Add new thumbnails
        for (const thumb of filteredThumbnails) {
            if (existingIds.has(thumb.id)) continue; // Already rendered

            // Find placeholder slot to replace
            const placeholderSlot = grid.querySelector(`.thumbnail-slot.placeholder[data-slot="${thumb.generation_order}"]`);

            const thumbHtml = `
                <div class="thumbnail-slot" data-id="${thumb.id}">
                    <img src="${thumb.cloudinary_secure_url}" alt="Thumbnail">
                    <div class="thumbnail-actions-btns">
                        <button class="thumbnail-view-btn" data-url="${thumb.cloudinary_secure_url}" title="View Full Size">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                                <circle cx="12" cy="12" r="3"></circle>
                            </svg>
                        </button>
                        <button class="thumbnail-download-btn" data-url="${thumb.cloudinary_secure_url}" data-style="${thumb.style_name || 'thumbnail'}" title="Download">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                                <polyline points="7 10 12 15 17 10"></polyline>
                                <line x1="12" y1="15" x2="12" y2="3"></line>
                            </svg>
                        </button>
                        ${this.shouldShowYouTubeUpload() ? `
                        <button class="thumbnail-youtube-btn ${thumb.is_uploaded_to_youtube ? 'uploaded' : ''}" data-id="${thumb.id}" title="${thumb.is_uploaded_to_youtube ? 'Already uploaded to YouTube' : 'Upload to YouTube'}">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M22.54 6.42a2.78 2.78 0 0 0-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 0 0-1.94 2A29 29 0 0 0 1 11.75a29 29 0 0 0 .46 5.33A2.78 2.78 0 0 0 3.4 19c1.72.46 8.6.46 8.6.46s6.88 0 8.6-.46a2.78 2.78 0 0 0 1.94-2 29 29 0 0 0 .46-5.25 29 29 0 0 0-.46-5.33z"></path>
                                <polygon points="9.75 15.02 15.5 11.75 9.75 8.48 9.75 15.02"></polygon>
                            </svg>
                            ${thumb.is_uploaded_to_youtube ? '<span class="uploaded-check">✓</span>' : ''}
                        </button>
                        ` : ''}
                    </div>
                </div>
            `;

            if (placeholderSlot) {
                // Replace placeholder with actual thumbnail
                placeholderSlot.outerHTML = thumbHtml;
            } else {
                // Append if no placeholder found
                grid.insertAdjacentHTML('beforeend', thumbHtml);
            }

            // Add event listeners to the new element
            const newSlot = grid.querySelector(`.thumbnail-slot[data-id="${thumb.id}"]`);
            if (newSlot) {
                newSlot.addEventListener('click', (e) => {
                    if (!e.target.closest('.thumbnail-actions-btns')) {
                        this.selectThumbnail(thumb.id, newSlot);
                    }
                });

                const viewBtn = newSlot.querySelector('.thumbnail-view-btn');
                if (viewBtn) {
                    viewBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        window.open(viewBtn.dataset.url, '_blank');
                    });
                }

                const downloadBtn = newSlot.querySelector('.thumbnail-download-btn');
                if (downloadBtn) {
                    downloadBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        this.downloadSingleThumbnail(downloadBtn.dataset.url, downloadBtn.dataset.style);
                    });
                }

                const youtubeBtn = newSlot.querySelector('.thumbnail-youtube-btn');
                if (youtubeBtn) {
                    youtubeBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        this.handleYouTubeUploadClick(parseInt(youtubeBtn.dataset.id));
                    });
                }
            }

            // Store in thumbnailsData for selection
            if (!this.thumbnailsData.find(t => t.id === thumb.id)) {
                this.thumbnailsData.push(thumb);
            }
        }
    }

    /**
     * Reset generate button state
     */
    resetGenerateButton() {
        const generateBtn = document.getElementById('generate-btn');
        generateBtn.disabled = false;
        generateBtn.innerHTML = 'Generate Viral Thumbnails';
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
     * @param {Array} thumbnails - Thumbnails to render (already filtered by ratio)
     * @param {string} ratio - Optional aspect ratio (if not provided, uses first thumbnail's ratio or UI selection)
     */
    renderThumbnails(thumbnails, ratio = null) {
        const grid = document.getElementById('thumbnails-grid');
        if (!grid) return;

        // Update count badge - shows count for current ratio
        document.getElementById('thumbnail-count').textContent = `${thumbnails.length}/4`;

        // Get style display names
        const styleMap = {};
        if (this.options?.styles) {
            this.options.styles.forEach(s => styleMap[s.key] = s.name);
        }

        // Determine aspect ratio to use for grid layout
        let selectedRatio = ratio || this.getSelectedAspectRatio();
        if (!ratio && thumbnails.length > 0 && thumbnails[0].aspect_ratio) {
            selectedRatio = thumbnails[0].aspect_ratio;
        }
        this.updateGridLayout(selectedRatio);

        // Build all HTML first (thumbnails + placeholders)
        let gridHTML = thumbnails.map(thumb => `
            <div class="thumbnail-slot ${thumb.is_selected ? 'selected' : ''}"
                 data-id="${thumb.id}">
                <img src="${thumb.cloudinary_secure_url}" alt="Thumbnail">
                ${thumb.is_selected ? '<span class="selected-badge">Active</span>' : ''}
                <div class="thumbnail-actions-btns">
                    <button class="thumbnail-view-btn" data-url="${thumb.cloudinary_secure_url}" title="View Full Size">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                            <circle cx="12" cy="12" r="3"></circle>
                        </svg>
                    </button>
                    <button class="thumbnail-download-btn" data-url="${thumb.cloudinary_secure_url}" data-style="${thumb.style_name || 'thumbnail'}" title="Download">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                            <polyline points="7 10 12 15 17 10"></polyline>
                            <line x1="12" y1="15" x2="12" y2="3"></line>
                        </svg>
                    </button>
                    ${this.shouldShowYouTubeUpload() ? `
                    <button class="thumbnail-youtube-btn ${thumb.is_uploaded_to_youtube ? 'uploaded' : ''}" data-id="${thumb.id}" title="${thumb.is_uploaded_to_youtube ? 'Already uploaded to YouTube' : 'Upload to YouTube'}">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M22.54 6.42a2.78 2.78 0 0 0-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 0 0-1.94 2A29 29 0 0 0 1 11.75a29 29 0 0 0 .46 5.33A2.78 2.78 0 0 0 3.4 19c1.72.46 8.6.46 8.6.46s6.88 0 8.6-.46a2.78 2.78 0 0 0 1.94-2 29 29 0 0 0 .46-5.25 29 29 0 0 0-.46-5.33z"></path>
                            <polygon points="9.75 15.02 15.5 11.75 9.75 8.48 9.75 15.02"></polygon>
                        </svg>
                        ${thumb.is_uploaded_to_youtube ? '<span class="uploaded-check">✓</span>' : ''}
                    </button>
                    ` : ''}
                </div>
            </div>
        `).join('');

        // Add placeholders for remaining slots
        const remaining = 4 - thumbnails.length;
        const styles = this.options?.styles || [];
        for (let i = 0; i < remaining; i++) {
            const styleIndex = thumbnails.length + i;
            const styleName = styles[styleIndex]?.name || `Style ${styleIndex + 1}`;
            gridHTML += `
                <div class="thumbnail-slot placeholder" data-slot="${styleIndex + 1}">
                    <span class="slot-label">${styleName}</span>
                </div>
            `;
        }

        // Set all HTML at once
        grid.innerHTML = gridHTML;

        // Now add click handlers (after all DOM elements exist)
        grid.querySelectorAll('.thumbnail-slot:not(.placeholder)').forEach(slot => {
            slot.addEventListener('click', (e) => {
                // Don't select if clicking on action buttons
                if (!e.target.closest('.thumbnail-actions-btns')) {
                    this.selectThumbnail(parseInt(slot.dataset.id), slot);
                }
            });
        });

        // Add click handlers for view buttons
        grid.querySelectorAll('.thumbnail-view-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                window.open(btn.dataset.url, '_blank');
            });
        });

        // Add click handlers for download buttons
        grid.querySelectorAll('.thumbnail-download-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.downloadSingleThumbnail(btn.dataset.url, btn.dataset.style);
            });
        });

        // Add click handlers for YouTube upload buttons
        grid.querySelectorAll('.thumbnail-youtube-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.handleYouTubeUploadClick(parseInt(btn.dataset.id));
            });
        });

        // Note: thumbnailsData is now managed by loadExistingThumbnails() to keep ALL thumbnails
        // This method only renders the filtered subset for display
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
    async downloadSingleThumbnail(url, styleName) {
        try {
            this.showToast('Preparing download...', 'info');

            // Fetch the image and create a blob URL for proper download
            const response = await fetch(url);
            const blob = await response.blob();
            const blobUrl = URL.createObjectURL(blob);

            const link = document.createElement('a');
            link.href = blobUrl;
            link.download = `thumbnail-${styleName}-${Date.now()}.png`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            // Clean up blob URL
            URL.revokeObjectURL(blobUrl);

            this.showToast('Download started', 'success');
        } catch (error) {
            console.error('Download failed:', error);
            // Fallback: open in new tab
            window.open(url, '_blank');
            this.showToast('Opening image in new tab', 'info');
        }
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
            const previewContainer = document.getElementById('selected-preview-img').parentElement;
            document.getElementById('selected-preview-img').src = this.selectedThumbnailData.cloudinary_secure_url;

            // Update preview aspect ratio based on thumbnail
            const isPortrait = this.selectedThumbnailData.aspect_ratio === '9:16';
            previewContainer.classList.toggle('portrait', isPortrait);

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
     * Toggle refine panel (with protection against rapid clicks on touch devices)
     */
    toggleRefinePanel(e) {
        // Prevent event propagation issues on touch devices
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }

        // Prevent rapid multiple toggles (touch device issue)
        if (this._isTogglingRefine) return;
        this._isTogglingRefine = true;

        const panel = document.getElementById('refine-panel');
        panel.classList.toggle('active');

        if (panel.classList.contains('active')) {
            document.getElementById('refine-instruction').focus();
        }

        // Reset flag after a short delay
        setTimeout(() => {
            this._isTogglingRefine = false;
        }, 300);
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
        const container = document.getElementById('toast-container');
        if (!container) return;

        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        container.appendChild(toast);

        // Trigger animation
        setTimeout(() => toast.classList.add('show'), 10);

        // Auto remove
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 4000);
    }

    /**
     * Handle YouTube upload button click
     */
    handleYouTubeUploadClick(thumbnailId) {
        const thumbnail = this.thumbnailsData?.find(t => t.id === thumbnailId);
        if (!thumbnail) {
            this.showToast('Thumbnail not found', 'error');
            return;
        }

        // Check if already uploaded
        if (thumbnail.is_uploaded_to_youtube) {
            this.showToast('This thumbnail has already been uploaded to YouTube', 'info');
            return;
        }

        // Show confirmation modal
        this.showYouTubeUploadModal(thumbnailId);
    }

    /**
     * Show YouTube upload confirmation modal
     */
    showYouTubeUploadModal(thumbnailId) {
        // Remove existing modal if any
        this.hideYouTubeUploadModal();

        const modal = document.createElement('div');
        modal.id = 'youtube-upload-modal';
        modal.className = 'youtube-upload-modal';
        modal.innerHTML = `
            <div class="youtube-upload-modal-overlay"></div>
            <div class="youtube-upload-modal-content">
                <div class="youtube-upload-modal-header">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="#FF0000" stroke="none">
                        <path d="M22.54 6.42a2.78 2.78 0 0 0-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 0 0-1.94 2A29 29 0 0 0 1 11.75a29 29 0 0 0 .46 5.33A2.78 2.78 0 0 0 3.4 19c1.72.46 8.6.46 8.6.46s6.88 0 8.6-.46a2.78 2.78 0 0 0 1.94-2 29 29 0 0 0 .46-5.25 29 29 0 0 0-.46-5.33z"></path>
                        <polygon points="9.75 15.02 15.5 11.75 9.75 8.48 9.75 15.02" fill="#FFFFFF"></polygon>
                    </svg>
                    <h3>Upload to YouTube</h3>
                </div>
                <p class="youtube-upload-modal-message">
                    This will replace any existing custom thumbnail on your YouTube video.
                </p>
                <div class="youtube-upload-modal-actions">
                    <button class="btn btn-secondary" id="youtube-upload-cancel">Cancel</button>
                    <button class="btn btn-youtube" id="youtube-upload-confirm" data-id="${thumbnailId}">
                        Upload to YouTube
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Add event listeners
        modal.querySelector('#youtube-upload-cancel').addEventListener('click', () => this.hideYouTubeUploadModal());
        modal.querySelector('.youtube-upload-modal-overlay').addEventListener('click', () => this.hideYouTubeUploadModal());
        modal.querySelector('#youtube-upload-confirm').addEventListener('click', () => {
            this.uploadToYouTube(thumbnailId);
        });

        // Trigger animation
        setTimeout(() => modal.classList.add('active'), 10);
    }

    /**
     * Hide YouTube upload modal
     */
    hideYouTubeUploadModal() {
        const modal = document.getElementById('youtube-upload-modal');
        if (modal) {
            modal.classList.remove('active');
            setTimeout(() => modal.remove(), 200);
        }
    }

    /**
     * Upload thumbnail to YouTube
     */
    async uploadToYouTube(thumbnailId) {
        this.hideYouTubeUploadModal();
        this.showToast('Uploading to YouTube...', 'info');

        try {
            const response = await fetch(`/api/thumbnails/${thumbnailId}/upload-youtube`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });

            const data = await response.json();

            if (data.success) {
                this.showToast('Thumbnail uploaded to YouTube successfully!', 'success');

                // Update local data
                const thumbnail = this.thumbnailsData?.find(t => t.id === thumbnailId);
                if (thumbnail) {
                    thumbnail.is_uploaded_to_youtube = true;
                }

                // Update the button state in the DOM
                const btn = document.querySelector(`.thumbnail-youtube-btn[data-id="${thumbnailId}"]`);
                if (btn) {
                    btn.classList.add('uploaded');
                    btn.title = 'Already uploaded to YouTube';
                    if (!btn.querySelector('.uploaded-check')) {
                        btn.insertAdjacentHTML('beforeend', '<span class="uploaded-check">✓</span>');
                    }
                }
            } else {
                // Handle specific error cases
                if (data.requiresYouTubeConnection) {
                    this.showToast('Please connect your YouTube account first', 'error');
                } else if (data.alreadyUploaded) {
                    this.showToast('This thumbnail has already been uploaded to YouTube', 'info');
                } else {
                    this.showToast(data.error || 'Failed to upload to YouTube', 'error');
                }
            }
        } catch (error) {
            console.error('YouTube upload failed:', error);
            this.showToast('Failed to upload to YouTube', 'error');
        }
    }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    const studio = new ThumbnailStudioPage();
    studio.init();
});
