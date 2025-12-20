/**
 * Popup settings page for Opal REPL extension
 */

const DEFAULT_SETTINGS = {
  opalDetectionMode: false,
  autoInjectOpal: true
};

/**
 * Get the storage API (works for both Chrome and Firefox)
 */
function getStorageApi() {
  if (typeof chrome !== 'undefined' && chrome.storage) {
    return chrome.storage.sync;
  }
  if (typeof browser !== 'undefined' && browser.storage) {
    return browser.storage.sync;
  }
  return null;
}

/**
 * Load settings from storage
 */
async function loadSettings() {
  const storage = getStorageApi();

  if (storage) {
    return new Promise((resolve) => {
      storage.get(DEFAULT_SETTINGS, (result) => {
        resolve({ ...DEFAULT_SETTINGS, ...result });
      });
    });
  }

  // Fallback to localStorage
  try {
    const stored = localStorage.getItem('opal-repl-settings');
    if (stored) {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
    }
  } catch (e) {
    // Ignore
  }

  return { ...DEFAULT_SETTINGS };
}

/**
 * Save settings to storage
 */
async function saveSettings(settings) {
  const storage = getStorageApi();

  if (storage) {
    return new Promise((resolve) => {
      storage.set(settings, () => {
        resolve(settings);
      });
    });
  }

  // Fallback to localStorage
  try {
    localStorage.setItem('opal-repl-settings', JSON.stringify(settings));
  } catch (e) {
    // Ignore
  }

  return settings;
}

/**
 * Initialize the popup
 */
async function init() {
  const settings = await loadSettings();

  // Set initial checkbox states
  document.getElementById('opalDetectionMode').checked = settings.opalDetectionMode;
  document.getElementById('autoInjectOpal').checked = settings.autoInjectOpal;

  // Add event listeners
  document.getElementById('opalDetectionMode').addEventListener('change', async (e) => {
    const newSettings = await loadSettings();
    newSettings.opalDetectionMode = e.target.checked;
    await saveSettings(newSettings);
  });

  document.getElementById('autoInjectOpal').addEventListener('change', async (e) => {
    const newSettings = await loadSettings();
    newSettings.autoInjectOpal = e.target.checked;
    await saveSettings(newSettings);
  });
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', init);
