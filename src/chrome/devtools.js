/**
 * DevTools initialization script for Chrome
 * Creates the Opal REPL panel in Chrome DevTools
 */

const DEFAULT_SETTINGS = {
  opalDetectionMode: false,
  autoInjectOpal: true
};

/**
 * Load settings from storage
 */
function loadSettings() {
  return new Promise((resolve) => {
    try {
      if (chrome.storage && chrome.storage.sync) {
        chrome.storage.sync.get(DEFAULT_SETTINGS, (result) => {
          if (chrome.runtime.lastError) {
            resolve({ ...DEFAULT_SETTINGS });
          } else {
            resolve({ ...DEFAULT_SETTINGS, ...result });
          }
        });
      } else {
        resolve({ ...DEFAULT_SETTINGS });
      }
    } catch (e) {
      resolve({ ...DEFAULT_SETTINGS });
    }
  });
}

/**
 * Check if Opal is available on the inspected page
 */
function checkOpalAvailable() {
  return new Promise((resolve) => {
    chrome.devtools.inspectedWindow.eval(
      'typeof Opal !== "undefined"',
      (result, exceptionInfo) => {
        if (exceptionInfo) {
          resolve(false);
        } else {
          resolve(result === true);
        }
      }
    );
  });
}

/**
 * Create the Opal REPL panel
 */
function createPanel() {
  chrome.devtools.panels.create(
    'Opal REPL',
    'icons/opal-48.png',
    'panel/panel.html',
    (panel) => {
      // Panel show/hide events
      panel.onShown.addListener((panelWindow) => {
        // Panel is now visible - focus input
        // Wrapped in try-catch for Edge cross-origin security
        try {
          if (panelWindow.repl && panelWindow.repl.repl) {
            panelWindow.repl.repl.focus();
          }
        } catch (e) {
          // Ignore cross-origin access errors in Edge
        }
      });

      panel.onHidden.addListener(() => {
        // Panel is now hidden
      });
    }
  );
}

/**
 * Initialize DevTools
 */
async function init() {
  const settings = await loadSettings();

  if (settings.opalDetectionMode) {
    // Only create panel if Opal is detected
    const opalAvailable = await checkOpalAvailable();
    if (opalAvailable) {
      createPanel();
    }
    // If Opal not detected, panel not created (detection mode enabled)
  } else {
    // Always create panel
    createPanel();
  }
}

// Initialize
init();
