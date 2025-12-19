/**
 * OpalRepl - Core REPL functionality for Opal Ruby
 * This is the shared core that works across different browsers
 */
export class OpalRepl {
  constructor(options = {}) {
    this.history = [];
    this.historyIndex = -1;
    this.outputElement = options.outputElement;
    this.inputElement = options.inputElement;
    this.evalFunction = options.evalFunction;
    this.onReady = options.onReady || (() => {});
    this.opalAvailable = false;

    if (this.inputElement) {
      this.setupEventListeners();
    }
  }

  setupEventListeners() {
    this.inputElement.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.execute();
      } else if (e.key === 'ArrowUp' && this.inputElement.selectionStart === 0) {
        e.preventDefault();
        this.navigateHistory(-1);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        this.navigateHistory(1);
      } else if (e.key === 'Tab') {
        e.preventDefault();
        this.insertTab();
      }
    });
  }

  insertTab() {
    const start = this.inputElement.selectionStart;
    const end = this.inputElement.selectionEnd;
    const value = this.inputElement.value;
    this.inputElement.value = value.substring(0, start) + '  ' + value.substring(end);
    this.inputElement.selectionStart = this.inputElement.selectionEnd = start + 2;
  }

  async checkOpalAvailability() {
    try {
      const result = await this.evalFunction('typeof Opal !== "undefined" && typeof Opal.eval === "function"');
      this.opalAvailable = result;

      if (result) {
        this.log('Opal detected on page. REPL ready.', 'info');
        // Check if opal-parser is available
        const hasParser = await this.evalFunction('typeof Opal.compile === "function"');
        if (hasParser) {
          this.log('opal-parser available. Full Ruby support enabled.', 'info');
        } else {
          this.log('Note: opal-parser not loaded. Some features may be limited.', 'warning');
        }
      } else {
        this.log('Opal not found on page. Injecting Opal runtime...', 'info');
      }

      this.onReady(this.opalAvailable);
      return result;
    } catch (error) {
      this.log(`Error checking Opal: ${error.message}`, 'error');
      return false;
    }
  }

  async execute(code = null) {
    const inputCode = code || this.inputElement?.value?.trim();
    if (!inputCode) return;

    // Add to history
    if (this.history[this.history.length - 1] !== inputCode) {
      this.history.push(inputCode);
    }
    this.historyIndex = this.history.length;

    // Display input
    this.log(`>> ${inputCode}`, 'input');

    // Clear input
    if (this.inputElement) {
      this.inputElement.value = '';
    }

    try {
      const evalResult = await this.evalRuby(inputCode);

      // Display captured stdout output
      if (evalResult.output) {
        // Remove trailing newline for cleaner display
        const outputText = evalResult.output.replace(/\n$/, '');
        if (outputText) {
          this.log(outputText, 'stdout');
        }
      }

      // Handle error
      if (evalResult.error) {
        this.log(evalResult.error, 'error');
        return { success: false, error: evalResult.error };
      }

      // Display result
      this.log(`=> ${this.inspect(evalResult.result)}`, 'output');
      return { success: true, result: evalResult.result };
    } catch (error) {
      this.log(error.message || String(error), 'error');
      return { success: false, error };
    }
  }

  async evalRuby(code) {
    // Escape the code for safe evaluation
    const escapedCode = JSON.stringify(code);

    // Build the eval expression with stdout capture
    const evalExpr = `
      (function() {
        var output = [];
        var originalStdout = null;
        var originalStderr = null;

        try {
          // Setup stdout/stderr capture
          if (typeof Opal.gvars !== 'undefined') {
            originalStdout = Opal.gvars.stdout;
            originalStderr = Opal.gvars.stderr;

            // Create a custom IO-like object to capture output
            var captureIO = {
              write: function(str) {
                if (str && str !== Opal.nil) {
                  var text = (typeof str.$to_s === 'function') ? str.$to_s() : String(str);
                  if (text !== Opal.nil) {
                    output.push(text);
                  }
                }
                return str;
              },
              puts: function() {
                for (var i = 0; i < arguments.length; i++) {
                  var arg = arguments[i];
                  var text = (arg === Opal.nil) ? '' :
                             (typeof arg.$to_s === 'function') ? arg.$to_s() : String(arg);
                  output.push(text + "\\n");
                }
                return Opal.nil;
              },
              print: function() {
                for (var i = 0; i < arguments.length; i++) {
                  var arg = arguments[i];
                  var text = (arg === Opal.nil) ? 'nil' :
                             (typeof arg.$to_s === 'function') ? arg.$to_s() : String(arg);
                  output.push(text);
                }
                return Opal.nil;
              },
              flush: function() { return this; }
            };

            // Also add Opal method aliases
            captureIO.$write = captureIO.write;
            captureIO.$puts = captureIO.puts;
            captureIO.$print = captureIO.print;
            captureIO.$flush = captureIO.flush;

            Opal.gvars.stdout = captureIO;
            Opal.gvars.stderr = captureIO;
          }

          // Compile with IRB mode to preserve local variables
          var compiled = Opal.compile(${escapedCode}, {irb: true});
          var result = eval(compiled);

          // Handle Opal nil
          var jsResult = null;
          if (result !== Opal.nil) {
            // Convert Opal objects to JS where possible
            if (result && typeof result.$to_n === 'function') {
              jsResult = result.$to_n();
            } else {
              jsResult = result;
            }
          }

          return {
            output: output.join(''),
            result: jsResult
          };
        } catch(e) {
          return {
            output: output.join(''),
            error: e.message || e.toString()
          };
        } finally {
          // Restore original stdout/stderr
          if (originalStdout !== null) {
            Opal.gvars.stdout = originalStdout;
          }
          if (originalStderr !== null) {
            Opal.gvars.stderr = originalStderr;
          }
        }
      })()
    `;

    return await this.evalFunction(evalExpr);
  }

  /**
   * Inspect a value and return a Ruby-like string representation
   */
  inspect(value) {
    if (value === null || value === undefined) {
      return 'nil';
    }

    if (typeof value === 'string') {
      return `"${value}"`;
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }

    if (Array.isArray(value)) {
      const items = value.map(v => this.inspect(v)).join(', ');
      return `[${items}]`;
    }

    if (typeof value === 'object') {
      // Check if it's an Opal object
      if (value.$$class) {
        const className = value.$$class.$$name || 'Object';
        const id = value.$$id ? value.$$id.toString(16) : '????';
        return `#<${className}:0x${id}>`;
      }

      // Check for Hash-like objects
      if (value.constructor && value.constructor.name === 'Object') {
        try {
          const pairs = Object.entries(value).map(([k, v]) => `${k}: ${this.inspect(v)}`);
          return `{${pairs.join(', ')}}`;
        } catch {
          return '[Object]';
        }
      }

      return String(value);
    }

    if (typeof value === 'function') {
      return '#<Proc>';
    }

    return String(value);
  }

  log(message, type = 'output') {
    if (!this.outputElement) {
      console.log(`[${type}] ${message}`);
      return;
    }

    const line = document.createElement('div');
    line.className = `repl-line repl-${type}`;

    // Handle multi-line messages
    if (message.includes('\n')) {
      line.innerHTML = message.split('\n').map(l => this.escapeHtml(l)).join('<br>');
    } else {
      line.textContent = message;
    }

    this.outputElement.appendChild(line);
    this.outputElement.scrollTop = this.outputElement.scrollHeight;
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  navigateHistory(direction) {
    if (this.history.length === 0) return;

    const newIndex = this.historyIndex + direction;

    if (newIndex >= 0 && newIndex < this.history.length) {
      this.historyIndex = newIndex;
      this.inputElement.value = this.history[newIndex];
    } else if (newIndex >= this.history.length) {
      this.historyIndex = this.history.length;
      this.inputElement.value = '';
    }
  }

  clear() {
    if (this.outputElement) {
      this.outputElement.innerHTML = '';
    }
    this.log('Console cleared', 'info');
  }

  getHistory() {
    return [...this.history];
  }

  setHistory(history) {
    this.history = Array.isArray(history) ? history : [];
    this.historyIndex = this.history.length;
  }
}

export default OpalRepl;
