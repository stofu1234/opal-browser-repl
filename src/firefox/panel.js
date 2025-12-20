/**
 * Firefox-specific panel implementation
 * Uses browser.devtools.inspectedWindow.eval for code execution
 */

import { OpalRepl } from '../shared/repl/OpalRepl.js';

const DEFAULT_SETTINGS = {
  opalDetectionMode: false,
  autoInjectOpal: true
};

class FirefoxOpalPanel {
  constructor() {
    this.consoleElement = document.getElementById('console');
    this.statusElement = document.getElementById('status');
    this.clearButton = document.getElementById('btn-clear');
    this.settings = { ...DEFAULT_SETTINGS };

    this.repl = new OpalRepl({
      consoleElement: this.consoleElement,
      evalFunction: this.evalInPage.bind(this),
      onReady: this.onReplReady.bind(this)
    });

    this.setupEventListeners();
    this.init();
  }

  /**
   * Load settings from storage
   */
  async loadSettings() {
    try {
      if (browser.storage && browser.storage.sync) {
        const result = await browser.storage.sync.get(DEFAULT_SETTINGS);
        this.settings = { ...DEFAULT_SETTINGS, ...result };
        return this.settings;
      }
    } catch (e) {
      console.log('Opal REPL: Error loading settings:', e);
    }
    this.settings = { ...DEFAULT_SETTINGS };
    return this.settings;
  }

  setupEventListeners() {
    // Clear button
    this.clearButton.addEventListener('click', () => {
      this.repl.clear();
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      // Ctrl+L to clear
      if (e.ctrlKey && e.key === 'l') {
        e.preventDefault();
        this.repl.clear();
      }
    });

    // Click on console to focus input
    this.consoleElement.addEventListener('click', (e) => {
      // Only focus if clicking on empty area (not on text)
      if (e.target === this.consoleElement) {
        this.repl.focus();
      }
    });

    // Save history on unload
    window.addEventListener('beforeunload', () => {
      this.saveHistory();
    });
  }

  async init() {
    // Load settings
    await this.loadSettings();

    // Load saved history
    this.loadHistory();

    // Display welcome message
    this.repl.log('Opal REPL - Ruby in the browser', 'info');
    this.repl.log('Tip: Use backticks for inline JavaScript: `console.log("hello")`', 'info');
    this.repl.log('', 'info');

    // Check Opal availability
    const available = await this.repl.checkOpalAvailability();

    if (!available) {
      if (this.settings.autoInjectOpal) {
        // Try to inject Opal
        await this.injectOpal();
      } else {
        this.setStatus('Opal not found', 'error');
        this.repl.log('Opal not detected on page. Auto-injection is disabled in settings.', 'warning');
        this.repl.log('Enable "Auto-inject Opal" in extension settings or add Opal to your page.', 'info');
      }
    } else {
      // Opal exists, but check if native module is available
      await this.ensureNativeModule();
    }

    // Capture base state for ls command (after all modules are loaded)
    await this.repl.captureBaseState();

    // Create first prompt
    this.repl.createPrompt();
  }

  async ensureNativeModule() {
    try {
      const hasNative = await this.evalInPage('typeof Opal.Native !== "undefined"');
      if (!hasNative) {
        this.repl.log('Loading native module...', 'info');
        const nativeUrl = browser.runtime.getURL('lib/native.js');
        await this.evalInPage(`
          (function() {
            return new Promise((resolve, reject) => {
              var script = document.createElement('script');
              script.src = '${nativeUrl}';
              script.onload = function() { resolve('loaded'); };
              script.onerror = function() { reject(new Error('Failed to load native')); };
              document.head.appendChild(script);
            });
          })()
        `);
        this.repl.log('Native module loaded. You can now use Native() wrapper.', 'info');
      }
    } catch (error) {
      this.repl.log(`Note: Could not load native module: ${error.message}`, 'warning');
    }
  }

  async injectOpal() {
    this.setStatus('Injecting Opal...', 'checking');

    try {
      // Get the extension URL for lib files
      const opalUrl = browser.runtime.getURL('lib/opal.js');
      const parserUrl = browser.runtime.getURL('lib/opal-parser.js');
      const nativeUrl = browser.runtime.getURL('lib/native.js');

      // Inject Opal runtime via script tag
      const injectScript = `
        (function() {
          return new Promise((resolve, reject) => {
            if (typeof Opal !== 'undefined') {
              resolve('already loaded');
              return;
            }

            function loadScript(url) {
              return new Promise((res, rej) => {
                var s = document.createElement('script');
                s.src = url;
                s.onload = function() { res(); };
                s.onerror = function(e) {
                  console.error('[Opal REPL] Failed to load: ' + url, e);
                  rej(new Error('Failed to load ' + url));
                };
                document.head.appendChild(s);
              });
            }

            loadScript('${opalUrl}')
              .then(function() { return loadScript('${parserUrl}'); })
              .then(function() { return loadScript('${nativeUrl}'); })
              .then(function() { resolve('loaded'); })
              .catch(reject);
          });
        })()
      `;

      await this.evalInPage(injectScript);

      // Small delay to ensure scripts are fully initialized
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify injection (silent mode to avoid duplicate messages)
      const available = await this.repl.checkOpalAvailability(true);
      if (available) {
        this.repl.log('Opal injected successfully. REPL ready.', 'info');
        this.setStatus('Ready', 'ready');
      } else {
        this.setStatus('Injection failed', 'error');
        this.repl.log('Failed to inject Opal. Try refreshing the page.', 'error');
        this.repl.log('Check browser console for details.', 'info');
      }
    } catch (error) {
      this.setStatus('Error', 'error');
      this.repl.log(`Error injecting Opal: ${error.message}`, 'error');
    }
  }

  onReplReady(opalAvailable) {
    if (opalAvailable) {
      this.setStatus('Ready', 'ready');
    }
  }

  setStatus(text, state) {
    this.statusElement.textContent = text;
    this.statusElement.className = `status-${state}`;
  }

  /**
   * Evaluate JavaScript code in the inspected page context
   * Firefox's browser.devtools.inspectedWindow.eval returns a Promise
   */
  evalInPage(code) {
    return browser.devtools.inspectedWindow.eval(code).then((response) => {
      // Firefox returns [result, exceptionInfo] as an array
      let result, exceptionInfo;
      if (Array.isArray(response)) {
        [result, exceptionInfo] = response;
      } else {
        result = response;
      }

      if (exceptionInfo) {
        if (exceptionInfo.isException) {
          throw new Error(exceptionInfo.value || 'Evaluation error');
        } else if (exceptionInfo.isError) {
          throw new Error(exceptionInfo.description || 'Unknown error');
        } else {
          throw new Error('Evaluation failed');
        }
      }
      return result;
    }).catch((error) => {
      // Handle protocol errors gracefully
      if (error.message && error.message.includes('protocol error')) {
        throw new Error('Page not ready. Please refresh the page.');
      }
      throw error;
    });
  }

  saveHistory() {
    try {
      const history = this.repl.getHistory();
      localStorage.setItem('opal-repl-history', JSON.stringify(history.slice(-100)));
    } catch (e) {
      // Ignore storage errors
    }
  }

  loadHistory() {
    try {
      const stored = localStorage.getItem('opal-repl-history');
      if (stored) {
        const history = JSON.parse(stored);
        this.repl.setHistory(history);
      }
    } catch (e) {
      // Ignore storage errors
    }
  }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  window.repl = new FirefoxOpalPanel();
});
