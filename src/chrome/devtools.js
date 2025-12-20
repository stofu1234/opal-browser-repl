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
            console.log('Opal REPL: Storage error, using defaults:', chrome.runtime.lastError);
            resolve({ ...DEFAULT_SETTINGS });
          } else {
            resolve({ ...DEFAULT_SETTINGS, ...result });
          }
        });
      } else {
        console.log('Opal REPL: Storage API not available, using defaults');
        resolve({ ...DEFAULT_SETTINGS });
      }
    } catch (e) {
      console.log('Opal REPL: Error loading settings, using defaults:', e);
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
      console.log('Opal REPL panel created');

      // Panel show/hide events
      panel.onShown.addListener((panelWindow) => {
        // Panel is now visible - focus input
        if (panelWindow.repl && panelWindow.repl.repl) {
          panelWindow.repl.repl.focus();
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
  console.log('Opal REPL: Initializing DevTools...');
  const settings = await loadSettings();
  console.log('Opal REPL: Settings loaded:', settings);

  if (settings.opalDetectionMode) {
    // Only create panel if Opal is detected
    console.log('Opal REPL: Detection mode enabled, checking for Opal...');
    const opalAvailable = await checkOpalAvailable();
    if (opalAvailable) {
      console.log('Opal REPL: Opal detected, creating panel');
      createPanel();
    } else {
      console.log('Opal REPL: Opal not detected on page, panel not created (detection mode enabled)');
    }
  } else {
    // Always create panel
    console.log('Opal REPL: Detection mode disabled, creating panel');
    createPanel();
  }
}

// Initialize
init();
