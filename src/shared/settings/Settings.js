/**
 * Settings management for Opal REPL extension
 * Uses chrome.storage.sync for cross-device synchronization
 */

const DEFAULT_SETTINGS = {
  // Only show Opal tab when Opal is detected on the page
  opalDetectionMode: false,
  // Automatically inject Opal if not found on the page
  autoInjectOpal: true
};

class Settings {
  constructor() {
    this.cache = null;
    this.listeners = [];
  }

  /**
   * Get the storage API (works for both Chrome and Firefox)
   */
  getStorageApi() {
    if (typeof chrome !== 'undefined' && chrome.storage) {
      return chrome.storage.sync;
    }
    if (typeof browser !== 'undefined' && browser.storage) {
      return browser.storage.sync;
    }
    // Fallback to localStorage for development
    return null;
  }

  /**
   * Load settings from storage
   */
  async load() {
    const storage = this.getStorageApi();

    if (storage) {
      return new Promise((resolve) => {
        storage.get(DEFAULT_SETTINGS, (result) => {
          this.cache = { ...DEFAULT_SETTINGS, ...result };
          resolve(this.cache);
        });
      });
    }

    // Fallback to localStorage
    try {
      const stored = localStorage.getItem('opal-repl-settings');
      if (stored) {
        this.cache = { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
      } else {
        this.cache = { ...DEFAULT_SETTINGS };
      }
    } catch (e) {
      this.cache = { ...DEFAULT_SETTINGS };
    }

    return this.cache;
  }

  /**
   * Save settings to storage
   */
  async save(settings) {
    const newSettings = { ...this.cache, ...settings };
    const storage = this.getStorageApi();

    if (storage) {
      return new Promise((resolve) => {
        storage.set(newSettings, () => {
          this.cache = newSettings;
          this.notifyListeners();
          resolve(newSettings);
        });
      });
    }

    // Fallback to localStorage
    try {
      localStorage.setItem('opal-repl-settings', JSON.stringify(newSettings));
      this.cache = newSettings;
      this.notifyListeners();
    } catch (e) {
      // Ignore storage errors
    }

    return newSettings;
  }

  /**
   * Get a specific setting value
   */
  async get(key) {
    if (!this.cache) {
      await this.load();
    }
    return this.cache[key];
  }

  /**
   * Get all settings
   */
  async getAll() {
    if (!this.cache) {
      await this.load();
    }
    return { ...this.cache };
  }

  /**
   * Set a specific setting value
   */
  async set(key, value) {
    if (!this.cache) {
      await this.load();
    }
    return this.save({ [key]: value });
  }

  /**
   * Reset settings to defaults
   */
  async reset() {
    return this.save(DEFAULT_SETTINGS);
  }

  /**
   * Add a listener for settings changes
   */
  addListener(callback) {
    this.listeners.push(callback);
  }

  /**
   * Remove a listener
   */
  removeListener(callback) {
    this.listeners = this.listeners.filter(l => l !== callback);
  }

  /**
   * Notify all listeners of settings changes
   */
  notifyListeners() {
    for (const listener of this.listeners) {
      listener(this.cache);
    }
  }
}

// Export singleton instance
export const settings = new Settings();
export { DEFAULT_SETTINGS };
