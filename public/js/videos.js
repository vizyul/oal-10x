// Videos JavaScript functionality
document.addEventListener('DOMContentLoaded', function() {
  // Initialize video-related functionality
  initializeVideoActions();
  initializeFiltering();
  initializePagination();
});

/**
 * Initialize video action buttons (delete, process, etc.)
 */
function initializeVideoActions() {
  // Delete video buttons
  document.querySelectorAll('.delete-video-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      
      const videoId = btn.dataset.videoId;
      const videoTitle = btn.dataset.videoTitle || 'this video';
      
      if (confirm(`Are you sure you want to delete "${videoTitle}"? This action cannot be undone.`)) {
        try {
          const response = await fetch(`/api/videos/${videoId}`, {
            method: 'DELETE',
            headers: {
              'Content-Type': 'application/json',
            }
          });
          
          const result = await response.json();
          
          if (result.success) {
            // Remove the video element from the page
            const videoElement = btn.closest('.video-card');
            if (videoElement) {
              videoElement.remove();
            }
            
            showNotification('Video deleted successfully', 'success');
          } else {
            throw new Error(result.message || 'Failed to delete video');
          }
        } catch (error) {
          showNotification(error.message || 'Failed to delete video', 'error');
        }
      }
    });
  });

  // Process video buttons
  document.querySelectorAll('.process-video-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      
      const videoId = btn.dataset.videoId;
      
      try {
        btn.disabled = true;
        btn.textContent = 'Processing...';
        
        const response = await fetch(`/api/videos/${videoId}/process`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          }
        });
        
        const result = await response.json();
        
        if (result.success) {
          showNotification('Video processing started', 'success');
          // Refresh the page to show updated status
          setTimeout(() => {
            window.location.reload();
          }, 2000);
        } else {
          throw new Error(result.message || 'Failed to start processing');
        }
      } catch (error) {
        showNotification(error.message || 'Failed to start processing', 'error');
        btn.disabled = false;
        btn.textContent = 'Process';
      }
    });
  });

  // Retry processing buttons
  document.querySelectorAll('.retry-video-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      
      const videoId = btn.dataset.videoId;
      
      try {
        btn.disabled = true;
        btn.textContent = 'Retrying...';
        
        const response = await fetch(`/api/videos/${videoId}/retry`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          }
        });
        
        const result = await response.json();
        
        if (result.success) {
          showNotification('Retry started', 'success');
          // Refresh the page to show updated status
          setTimeout(() => {
            window.location.reload();
          }, 2000);
        } else {
          throw new Error(result.message || 'Failed to retry processing');
        }
      } catch (error) {
        showNotification(error.message || 'Failed to retry processing', 'error');
        btn.disabled = false;
        btn.textContent = 'Retry';
      }
    });
  });
}

/**
 * Initialize filtering functionality
 */
function initializeFiltering() {
  const statusFilter = document.getElementById('status-filter');
  const categoryFilter = document.getElementById('category-filter');
  const searchInput = document.getElementById('search-input');
  
  // Apply filters when changed
  [statusFilter, categoryFilter].forEach(filter => {
    if (filter) {
      filter.addEventListener('change', applyFilters);
    }
  });
  
  // Search with debounce
  if (searchInput) {
    let searchTimeout;
    searchInput.addEventListener('input', () => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(applyFilters, 500);
    });
  }
}

/**
 * Apply current filter settings
 */
function applyFilters() {
  const statusFilter = document.getElementById('status-filter');
  const categoryFilter = document.getElementById('category-filter');
  const searchInput = document.getElementById('search-input');
  
  const params = new URLSearchParams(window.location.search);
  
  // Update parameters
  if (statusFilter && statusFilter.value) {
    params.set('status', statusFilter.value);
  } else {
    params.delete('status');
  }
  
  if (categoryFilter && categoryFilter.value) {
    params.set('category', categoryFilter.value);
  } else {
    params.delete('category');
  }
  
  if (searchInput && searchInput.value.trim()) {
    params.set('search', searchInput.value.trim());
  } else {
    params.delete('search');
  }
  
  // Reset to first page when filtering
  params.set('page', '1');
  
  // Reload with new parameters
  window.location.search = params.toString();
}

/**
 * Initialize pagination
 */
function initializePagination() {
  document.querySelectorAll('.pagination-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      
      const page = btn.dataset.page;
      if (page) {
        const params = new URLSearchParams(window.location.search);
        params.set('page', page);
        window.location.search = params.toString();
      }
    });
  });
}

/**
 * Show notification to user
 */
function showNotification(message, type = 'info') {
  // Create notification element
  const notification = document.createElement('div');
  notification.className = `notification notification-${type}`;
  notification.innerHTML = `
    <div class="notification-content">
      <span class="notification-message">${message}</span>
      <button class="notification-close">&times;</button>
    </div>
  `;
  
  // Add to page
  document.body.appendChild(notification);
  
  // Add close functionality
  const closeBtn = notification.querySelector('.notification-close');
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

/**
 * Format duration from seconds to readable format
 */
function formatDuration(seconds) {
  if (!seconds) return '0:00';
  
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Format file size to readable format
 */
function formatFileSize(bytes) {
  if (!bytes) return '0 B';
  
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
}

/**
 * Copy text to clipboard
 */
async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    showNotification('Copied to clipboard', 'success');
  } catch (error) {
    showNotification('Failed to copy to clipboard', 'error');
  }
}