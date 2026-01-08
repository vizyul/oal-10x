/**
 * Sidebar JavaScript
 * Handles sidebar collapse/expand, state persistence, and mobile behavior
 */

document.addEventListener('DOMContentLoaded', function() {
    const sidebar = document.getElementById('app-sidebar');
    const toggle = document.getElementById('sidebar-toggle');
    const overlay = document.getElementById('sidebar-overlay');
    const body = document.body;

    if (!sidebar) return; // No sidebar (not authenticated)

    // Storage key for state persistence
    const STORAGE_KEY = 'sidebar-collapsed';

    /**
     * Initialize sidebar state from localStorage
     */
    function initSidebarState() {
        const isCollapsed = localStorage.getItem(STORAGE_KEY) === 'true';
        if (isCollapsed && window.innerWidth > 768) {
            sidebar.classList.add('collapsed');
            body.classList.add('sidebar-collapsed');
        }
    }

    /**
     * Toggle sidebar collapsed state
     */
    function toggleSidebar() {
        sidebar.classList.toggle('collapsed');
        body.classList.toggle('sidebar-collapsed');

        // Persist state
        const isCollapsed = sidebar.classList.contains('collapsed');
        localStorage.setItem(STORAGE_KEY, isCollapsed);
    }

    /**
     * Open sidebar (mobile)
     */
    function openSidebar() {
        sidebar.classList.add('open');
        overlay.classList.add('active');
        body.style.overflow = 'hidden';
    }

    /**
     * Close sidebar (mobile)
     */
    function closeSidebar() {
        sidebar.classList.remove('open');
        overlay.classList.remove('active');
        body.style.overflow = '';
    }

    /**
     * Highlight active link based on current URL
     */
    function highlightActiveLink() {
        const currentPath = window.location.pathname;
        const links = sidebar.querySelectorAll('.sidebar-link');

        links.forEach(link => {
            link.classList.remove('active');
            const href = link.getAttribute('href');

            // Check for exact match or if current path starts with href
            if (href === currentPath ||
                (href !== '/' && currentPath.startsWith(href))) {
                link.classList.add('active');
            }

            // Special case for /videos (content page)
            if (href === '/videos' && currentPath === '/videos') {
                link.classList.add('active');
            }
        });
    }

    /**
     * Handle window resize
     */
    function handleResize() {
        if (window.innerWidth > 768) {
            // Desktop/Tablet: close mobile overlay
            closeSidebar();
        }
    }

    // Initialize
    initSidebarState();
    highlightActiveLink();

    // Event Listeners

    // Toggle button click
    if (toggle) {
        toggle.addEventListener('click', toggleSidebar);
    }

    // Overlay click (mobile)
    if (overlay) {
        overlay.addEventListener('click', closeSidebar);
    }

    // Close sidebar on Escape key
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && sidebar.classList.contains('open')) {
            closeSidebar();
        }
    });

    // Handle window resize
    window.addEventListener('resize', handleResize);

    // Expose functions globally for mobile menu toggle in header
    window.sidebarFunctions = {
        open: openSidebar,
        close: closeSidebar,
        toggle: function() {
            if (window.innerWidth <= 768) {
                if (sidebar.classList.contains('open')) {
                    closeSidebar();
                } else {
                    openSidebar();
                }
            } else {
                toggleSidebar();
            }
        }
    };

    // ==========================================
    // Profile Dropdown Functionality
    // ==========================================

    const profileTrigger = document.getElementById('sidebar-profile-trigger');
    const profileDropdown = document.getElementById('sidebar-profile-dropdown');

    if (profileTrigger && profileDropdown) {
        /**
         * Toggle profile dropdown visibility
         */
        function toggleProfileDropdown(e) {
            e.stopPropagation();
            profileDropdown.classList.toggle('active');
        }

        /**
         * Close profile dropdown
         */
        function closeProfileDropdown() {
            profileDropdown.classList.remove('active');
        }

        // Click on profile circle toggles dropdown
        profileTrigger.addEventListener('click', toggleProfileDropdown);

        // Close dropdown when clicking outside
        document.addEventListener('click', function(e) {
            if (!profileDropdown.contains(e.target) && !profileTrigger.contains(e.target)) {
                closeProfileDropdown();
            }
        });

        // Close dropdown on Escape key
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape') {
                closeProfileDropdown();
            }
        });
    }

    // ==========================================
    // Theme Toggle Functionality
    // ==========================================

    const THEME_STORAGE_KEY = 'theme';
    const themeButtons = document.querySelectorAll('.sidebar-profile-dropdown .theme-btn');

    /**
     * Get system preferred theme
     */
    function getSystemTheme() {
        return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }

    /**
     * Apply theme to document
     */
    function applyTheme(theme) {
        const effectiveTheme = theme === 'system' ? getSystemTheme() : theme;
        document.documentElement.setAttribute('data-theme', effectiveTheme);
    }

    /**
     * Update active button state
     */
    function updateThemeButtons(theme) {
        themeButtons.forEach(btn => {
            btn.classList.remove('active');
            if (btn.dataset.theme === theme) {
                btn.classList.add('active');
            }
        });
    }

    /**
     * Initialize theme from localStorage or default to system
     */
    function initTheme() {
        const savedTheme = localStorage.getItem(THEME_STORAGE_KEY) || 'system';
        applyTheme(savedTheme);
        updateThemeButtons(savedTheme);
    }

    /**
     * Handle theme button click
     */
    function handleThemeChange(e) {
        e.stopPropagation();
        const btn = e.currentTarget;
        const theme = btn.dataset.theme;

        localStorage.setItem(THEME_STORAGE_KEY, theme);
        applyTheme(theme);
        updateThemeButtons(theme);
    }

    // Initialize theme
    initTheme();

    // Add click listeners to theme buttons
    themeButtons.forEach(btn => {
        btn.addEventListener('click', handleThemeChange);
    });

    // Listen for system theme changes
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function() {
        const savedTheme = localStorage.getItem(THEME_STORAGE_KEY) || 'system';
        if (savedTheme === 'system') {
            applyTheme('system');
        }
    });
});
