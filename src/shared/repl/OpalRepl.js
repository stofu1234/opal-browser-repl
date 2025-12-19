/**
 * OpalRepl - Core REPL functionality for Opal Ruby
 * IRB/Pry style inline input interface
 */
export class OpalRepl {
  constructor(options = {}) {
    this.history = [];
    this.historyIndex = -1;
    this.consoleElement = options.consoleElement;
    this.evalFunction = options.evalFunction;
    this.onReady = options.onReady || (() => {});
    this.opalAvailable = false;
    this.currentInputLine = null;
    this.currentInputField = null;
  }

  /**
   * Create a new input prompt line
   */
  createPrompt() {
    // Create input line container
    const inputLine = document.createElement('div');
    inputLine.className = 'repl-input-line';

    // Create prompt
    const prompt = document.createElement('span');
    prompt.className = 'repl-prompt';
    prompt.textContent = '>>';

    // Create input field (textarea for multi-line support)
    const inputField = document.createElement('textarea');
    inputField.className = 'repl-input-field';
    inputField.rows = 1;
    inputField.spellcheck = false;
    inputField.placeholder = 'Enter Ruby code...';

    inputLine.appendChild(prompt);
    inputLine.appendChild(inputField);
    this.consoleElement.appendChild(inputLine);

    // Store references
    this.currentInputLine = inputLine;
    this.currentInputField = inputField;

    // Setup event listeners
    this.setupInputListeners(inputField);

    // Focus and scroll
    inputField.focus();
    this.scrollToBottom();

    return inputField;
  }

  setupInputListeners(inputField) {
    // Auto-resize textarea
    const autoResize = () => {
      inputField.style.height = 'auto';
      inputField.style.height = inputField.scrollHeight + 'px';
    };

    inputField.addEventListener('input', autoResize);

    inputField.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.execute();
      } else if (e.key === 'ArrowUp' && inputField.selectionStart === 0) {
        e.preventDefault();
        this.navigateHistory(-1);
      } else if (e.key === 'ArrowDown') {
        const atEnd = inputField.selectionStart === inputField.value.length;
        if (atEnd || !inputField.value.includes('\n')) {
          e.preventDefault();
          this.navigateHistory(1);
        }
      } else if (e.key === 'Tab') {
        e.preventDefault();
        this.insertTab();
      }
    });
  }

  insertTab() {
    if (!this.currentInputField) return;
    const input = this.currentInputField;
    const start = input.selectionStart;
    const end = input.selectionEnd;
    const value = input.value;
    input.value = value.substring(0, start) + '  ' + value.substring(end);
    input.selectionStart = input.selectionEnd = start + 2;
  }

  async checkOpalAvailability() {
    try {
      const result = await this.evalFunction('typeof Opal !== "undefined" && typeof Opal.eval === "function"');
      this.opalAvailable = result;

      if (result) {
        this.log('Opal detected on page. REPL ready.', 'info');
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

  async execute() {
    if (!this.currentInputField) return;

    const inputCode = this.currentInputField.value.trim();
    if (!inputCode) return;

    // Add to history
    if (this.history[this.history.length - 1] !== inputCode) {
      this.history.push(inputCode);
    }
    this.historyIndex = this.history.length;

    // Convert input line to executed (read-only) format
    this.freezeCurrentInput(inputCode);

    try {
      const evalResult = await this.evalRuby(inputCode);

      // Display captured stdout output
      if (evalResult.output) {
        const outputText = evalResult.output.replace(/\n$/, '');
        if (outputText) {
          this.log(outputText, 'stdout');
        }
      }

      // Handle error
      if (evalResult.error) {
        this.log(evalResult.error, 'error');
      } else {
        // Display result
        this.log(`=> ${this.inspect(evalResult.result)}`, 'output');
      }
    } catch (error) {
      this.log(error.message || String(error), 'error');
    }

    // Create new prompt
    this.createPrompt();
  }

  /**
   * Convert current input line to read-only executed format
   */
  freezeCurrentInput(code) {
    if (!this.currentInputLine) return;

    // Create executed line element
    const executedLine = document.createElement('div');
    executedLine.className = 'repl-executed';

    const prompt = document.createElement('span');
    prompt.className = 'repl-prompt';
    prompt.textContent = '>>';

    const codeSpan = document.createElement('span');
    codeSpan.className = 'repl-code';
    codeSpan.textContent = code;

    executedLine.appendChild(prompt);
    executedLine.appendChild(codeSpan);

    // Replace input line with executed line
    this.currentInputLine.replaceWith(executedLine);
    this.currentInputLine = null;
    this.currentInputField = null;
  }

  async evalRuby(code) {
    const escapedCode = JSON.stringify(code);

    const evalExpr = `
      (function() {
        var output = [];
        var originalStdout = null;
        var originalStderr = null;

        try {
          if (typeof Opal.gvars !== 'undefined') {
            originalStdout = Opal.gvars.stdout;
            originalStderr = Opal.gvars.stderr;

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

          var jsResult = null;
          if (result !== Opal.nil) {
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
      if (value.$$class) {
        const className = value.$$class.$$name || 'Object';
        const id = value.$$id ? value.$$id.toString(16) : '????';
        return `#<${className}:0x${id}>`;
      }

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
    if (!this.consoleElement) {
      console.log(`[${type}] ${message}`);
      return;
    }

    const line = document.createElement('div');
    line.className = `repl-line repl-${type}`;

    if (message.includes('\n')) {
      line.innerHTML = message.split('\n').map(l => this.escapeHtml(l)).join('<br>');
    } else {
      line.textContent = message;
    }

    // Insert before current input line if exists, otherwise append
    if (this.currentInputLine) {
      this.consoleElement.insertBefore(line, this.currentInputLine);
    } else {
      this.consoleElement.appendChild(line);
    }

    this.scrollToBottom();
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  scrollToBottom() {
    this.consoleElement.scrollTop = this.consoleElement.scrollHeight;
  }

  navigateHistory(direction) {
    if (this.history.length === 0 || !this.currentInputField) return;

    const newIndex = this.historyIndex + direction;

    if (newIndex >= 0 && newIndex < this.history.length) {
      this.historyIndex = newIndex;
      this.currentInputField.value = this.history[newIndex];
      // Trigger resize
      this.currentInputField.dispatchEvent(new Event('input'));
    } else if (newIndex >= this.history.length) {
      this.historyIndex = this.history.length;
      this.currentInputField.value = '';
      this.currentInputField.dispatchEvent(new Event('input'));
    }
  }

  clear() {
    if (this.consoleElement) {
      this.consoleElement.innerHTML = '';
    }
    this.currentInputLine = null;
    this.currentInputField = null;
    this.log('Console cleared', 'info');
    this.createPrompt();
  }

  focus() {
    if (this.currentInputField) {
      this.currentInputField.focus();
    }
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
