/**
 * DevTools initialization script for Firefox
 * Creates the Opal REPL panel in Firefox DevTools
 */

const DEFAULT_SETTINGS = {
  opalDetectionMode: false,
  autoInjectOpal: true
};

/**
 * Load settings from storage
 */
async function loadSettings() {
  try {
    if (browser.storage && browser.storage.sync) {
      const result = await browser.storage.sync.get(DEFAULT_SETTINGS);
      return { ...DEFAULT_SETTINGS, ...result };
    }
  } catch (e) {
    console.log('Opal REPL: Storage error, using defaults:', e);
  }
  return { ...DEFAULT_SETTINGS };
}

/**
 * Check if Opal is available on the inspected page
 */
async function checkOpalAvailable() {
  try {
    const result = await browser.devtools.inspectedWindow.eval(
      'typeof Opal !== "undefined"'
    );
    // Firefox returns [result, exceptionInfo] or just result depending on version
    if (Array.isArray(result)) {
      return result[0] === true;
    }
    return result === true;
  } catch (e) {
    console.log('Opal REPL: Error checking Opal:', e);
    return false;
  }
}

/**
 * Create the Opal REPL panel
 */
function createPanel() {
  browser.devtools.panels.create(
    'Opal REPL',
    'icons/opal-48.png',
    'panel/panel.html'
  ).then((panel) => {
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
  });
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
    } else {
      console.log('Opal REPL: Opal not detected on page, panel not created (detection mode enabled)');
    }
  } else {
    // Always create panel
    createPanel();
  }
}

// Initialize
init();
