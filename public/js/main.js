// Main JavaScript for Our AI Legacy App

// Theme Management
class ThemeManager {
  constructor() {
    this.storageKey = 'theme-preference';
    this.themeAttribute = 'data-theme';
    this.init();
  }

  init() {
    // Get stored theme or default to light
    const savedTheme = localStorage.getItem(this.storageKey) || 'light';
    this.setTheme(savedTheme);
    
    // Set up theme selector
    this.setupThemeSelector();
    
    // Listen for system theme changes
    this.listenForSystemThemeChanges();
  }

  setTheme(theme) {
    document.documentElement.setAttribute(this.themeAttribute, theme);
    localStorage.setItem(this.storageKey, theme);
    
    // Update theme selector if it exists
    const themeSelector = document.getElementById('themeSelector');
    if (themeSelector) {
      themeSelector.value = theme;
    }
    
    // Only save to server if user appears to be logged in (has profile trigger)
    if (document.getElementById('profileTrigger')) {
      this.saveThemeToUserPreferences(theme);
    }
  }

  getTheme() {
    return document.documentElement.getAttribute(this.themeAttribute) || 'light';
  }

  setupThemeSelector() {
    const themeSelector = document.getElementById('themeSelector');
    if (!themeSelector) return;
    
    // Set initial value
    themeSelector.value = this.getTheme();
    
    // Add change listener
    themeSelector.addEventListener('change', (e) => {
      this.setTheme(e.target.value);
    });
  }

  listenForSystemThemeChanges() {
    if (window.matchMedia) {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      mediaQuery.addListener(() => {
        if (this.getTheme() === 'system') {
          // Force re-evaluation of system theme
          this.setTheme('system');
        }
      });
    }
  }

  async saveThemeToUserPreferences(theme) {
    try {
      const response = await fetch('/api/preferences/theme', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ themeMode: theme }),
      });

      if (!response.ok) {
        // Handle different error types appropriately
        if (response.status === 401) {
          // User not logged in - this is expected on public pages
          return;
        } else if (response.status === 503) {
          // Service unavailable (table not set up) - show user-friendly message
          // Theme preferences will be saved locally only
          return;
        } else {
          // Failed to save theme preference to server
        }
      }
    } catch (error) {
      // Silently handle network errors to prevent unhandled rejections
      // Theme preference save skipped
    }
  }
}

// Profile Dropdown Management
class ProfileDropdown {
  constructor() {
    this.trigger = document.getElementById('profileTrigger');
    this.menu = document.getElementById('profileMenu');
    this.chevron = this.trigger?.querySelector('.dropdown-chevron');
    this.navLinks = document.querySelector('.nav-links');
    
    if (this.trigger && this.menu) {
      this.init();
    }
  }

  init() {
    // Click handler for profile trigger
    this.trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggle();
    });

    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
      if (!this.menu.contains(e.target) && !this.trigger.contains(e.target)) {
        this.close();
      }
    });

    // ESC key handler
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen()) {
        this.close();
      }
    });

    // Handle menu item clicks
    this.menu.addEventListener('click', (e) => {
      const target = e.target.closest('.profile-menu-item');
      if (target) {
        // Close dropdown for all menu item clicks except theme selector
        if (!target.classList.contains('theme-selector')) {
          // Allow navigation links (Profile, Subscription) to work normally
          if (target.tagName === 'A') {
            this.close();
            // Don't prevent default - let the link navigate
            return;
          }
          // Only prevent default for non-link items (like logout button)
          e.preventDefault();
        }
      }
    });
  }

  toggle() {
    if (this.isOpen()) {
      this.close();
    } else {
      this.open();
    }
  }

  open() {
    this.menu.classList.add('active');
    if (this.chevron) {
      this.chevron.style.transform = 'rotate(180deg)';
    }
    
    // Expand mobile nav container if needed
    this.expandMobileNavForProfile();
  }

  close() {
    this.menu.classList.remove('active');
    if (this.chevron) {
      this.chevron.style.transform = 'rotate(0deg)';
    }
    
    // Collapse mobile nav container
    this.collapseMobileNavAfterProfile();
  }

  isOpen() {
    return this.menu.classList.contains('active');
  }

  expandMobileNavForProfile() {
    if (this.navLinks) {
      this.navLinks.classList.add('profile-expanded');
    }
  }

  collapseMobileNavAfterProfile() {
    if (this.navLinks) {
      this.navLinks.classList.remove('profile-expanded');
    }
  }
}

// Typing Effect Manager
class TypingEffect {
  constructor() {
    this.element = document.getElementById('typingText');
    this.texts = [
      'Funnel Scripts',
      'Social Media Posts',
      'Video Chapters',
      'Blogs',
      'Podcast Scripts',
      'Discussion Guides',
      'Quizzes',
      'Newsletters',
      'LinkedIn Articles'
      
    ];
    this.currentIndex = 0;
    this.isDeleting = false;
    this.charIndex = 0;
    this.typingSpeed = 100;
    this.deletingSpeed = 50;
    this.pauseDuration = 2000;

    if (this.element) {
      this.init();
    }
  }

  init() {
    // Start typing effect after a short delay
    setTimeout(() => {
      this.type();
    }, 1000);
  }

  type() {
    const currentText = this.texts[this.currentIndex];

    if (this.isDeleting) {
      // Deleting text
      this.charIndex--;
      this.element.textContent = currentText.substring(0, this.charIndex);

      if (this.charIndex === 0) {
        this.isDeleting = false;
        this.currentIndex = (this.currentIndex + 1) % this.texts.length;
        setTimeout(() => this.type(), 500);
        return;
      }

      setTimeout(() => this.type(), this.deletingSpeed);
    } else {
      // Typing text
      this.charIndex++;
      this.element.textContent = currentText.substring(0, this.charIndex);

      if (this.charIndex === currentText.length) {
        setTimeout(() => {
          this.isDeleting = true;
          this.type();
        }, this.pauseDuration);
        return;
      }

      setTimeout(() => this.type(), this.typingSpeed);
    }
  }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  // Initialize theme manager
  window.themeManager = new ThemeManager();

  // Initialize profile dropdown
  window.profileDropdown = new ProfileDropdown();

  // Initialize typing effect
  window.typingEffect = new TypingEffect();
});