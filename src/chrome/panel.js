/**
 * Chrome-specific panel implementation
 * Uses chrome.devtools.inspectedWindow.eval for code execution
 */

import { OpalRepl } from '../shared/repl/OpalRepl.js';

class ChromeOpalPanel {
  constructor() {
    this.consoleElement = document.getElementById('console');
    this.statusElement = document.getElementById('status');
    this.clearButton = document.getElementById('btn-clear');

    this.repl = new OpalRepl({
      consoleElement: this.consoleElement,
      evalFunction: this.evalInPage.bind(this),
      onReady: this.onReplReady.bind(this)
    });

    this.setupEventListeners();
    this.init();
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
    // Load saved history
    this.loadHistory();

    // Display welcome message
    this.repl.log('Opal REPL - Ruby in the browser', 'info');
    this.repl.log('Tip: Use backticks for inline JavaScript: `console.log("hello")`', 'info');
    this.repl.log('', 'info');

    // Check Opal availability
    const available = await this.repl.checkOpalAvailability();

    if (!available) {
      // Try to inject Opal
      await this.injectOpal();
    } else {
      // Opal exists, but check if native module is available
      await this.ensureNativeModule();
    }

    // Create first prompt
    this.repl.createPrompt();
  }

  async ensureNativeModule() {
    try {
      const hasNative = await this.evalInPage('typeof Opal.Native !== "undefined"');
      if (!hasNative) {
        this.repl.log('Loading native module...', 'info');
        const nativeUrl = chrome.runtime.getURL('lib/native.js');
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
      const opalUrl = chrome.runtime.getURL('lib/opal.js');
      const parserUrl = chrome.runtime.getURL('lib/opal-parser.js');
      const nativeUrl = chrome.runtime.getURL('lib/native.js');

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
                s.onerror = function() { rej(new Error('Failed to load ' + url)); };
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

      // Verify injection
      const available = await this.repl.checkOpalAvailability();
      if (available) {
        this.setStatus('Ready', 'ready');
      } else {
        this.setStatus('Injection failed', 'error');
        this.repl.log('Failed to inject Opal. Try refreshing the page.', 'error');
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
   */
  evalInPage(code) {
    return new Promise((resolve, reject) => {
      chrome.devtools.inspectedWindow.eval(
        code,
        { useContentScriptContext: false },
        (result, exceptionInfo) => {
          if (exceptionInfo) {
            if (exceptionInfo.isException) {
              reject(new Error(exceptionInfo.value || 'Evaluation error'));
            } else if (exceptionInfo.isError) {
              reject(new Error(exceptionInfo.description || 'Unknown error'));
            } else {
              reject(new Error('Evaluation failed'));
            }
          } else {
            resolve(result);
          }
        }
      );
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
  window.repl = new ChromeOpalPanel();
});
