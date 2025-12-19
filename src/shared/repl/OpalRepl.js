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
    // Context stack for cd command (stores JS expressions to reach each context)
    this.contextStack = [];
  }

  /**
   * REPL Commands (Pry-like)
   */
  replCommands = {
    'help': {
      description: 'Show available commands',
      handler: () => this.cmdHelp()
    },
    'history': {
      description: 'Show command history',
      handler: () => this.cmdHistory()
    },
    'ls': {
      description: 'List methods and variables of current context',
      handler: (args) => this.cmdLs(args)
    },
    'cd': {
      description: 'Change context (cd object / cd ..)',
      handler: (args) => this.cmdCd(args)
    }
  };

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
    prompt.textContent = this.getPromptPrefix();

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

    // Check for REPL commands
    const commandResult = await this.tryReplCommand(inputCode);
    if (commandResult.handled) {
      this.createPrompt();
      return;
    }

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
   * Try to execute input as a REPL command
   */
  async tryReplCommand(input) {
    const parts = input.split(/\s+/);
    const cmd = parts[0].toLowerCase();
    const args = parts.slice(1).join(' ');

    if (this.replCommands[cmd]) {
      await this.replCommands[cmd].handler(args);
      return { handled: true };
    }

    return { handled: false };
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
    prompt.textContent = this.getPromptPrefix();

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
    const contextExpr = this.getContextExpression();

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

          // Execute in context if we're inside a cd
          var result;
          ${contextExpr ? `
          var context = ${contextExpr};
          if (context && context.$instance_eval) {
            result = context.$instance_eval(compiled);
          } else {
            result = eval(compiled);
          }
          ` : `
          result = eval(compiled);
          `}

          // Store result as $_ (last result) for next evaluation
          if (typeof Opal.gvars !== 'undefined') {
            Opal.gvars['_'] = result;
          }

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

  // ==================== REPL Commands ====================

  /**
   * help - Show available commands
   */
  cmdHelp() {
    this.log('Available commands:', 'info');
    this.log('  help     - Show this help message', 'info');
    this.log('  history  - Show command history', 'info');
    this.log('  ls       - List methods/variables (ls, ls -m, ls -v, ls -c)', 'info');
    this.log('  cd <obj> - Change context to object', 'info');
    this.log('  cd ..    - Return to previous context', 'info');
    this.log('', 'info');
    this.log('Special variables:', 'info');
    this.log('  $_       - Last evaluation result', 'info');
    this.log('', 'info');
    this.log('Tips:', 'info');
    this.log('  Shift+Enter  - Multi-line input', 'info');
    this.log('  Ctrl+L       - Clear console', 'info');
    this.log('  Up/Down      - Navigate history', 'info');
  }

  /**
   * history - Show command history
   */
  cmdHistory() {
    if (this.history.length === 0) {
      this.log('No history yet.', 'info');
      return;
    }

    this.log('Command history:', 'info');
    this.history.forEach((cmd, i) => {
      const num = String(i + 1).padStart(3, ' ');
      this.log(`${num}: ${cmd}`, 'stdout');
    });
  }

  /**
   * ls - List methods and variables of current context
   */
  async cmdLs(args) {
    const showMethods = !args || args.includes('-m') || args === '';
    const showVars = !args || args.includes('-v') || args === '';
    const showConstants = !args || args.includes('-c') || args === '';
    const targetArg = args.replace(/-[mvc]/g, '').trim();

    const contextExpr = this.getContextExpression();
    const lsCode = `
      (function() {
        var target = ${contextExpr || 'self'};
        ${targetArg ? `target = ${targetArg};` : ''}

        var result = { methods: [], instance_variables: [], constants: [], context: '' };

        try {
          // Get context description
          if (target.$$class) {
            result.context = target.$$class.$$name || 'Object';
          } else if (typeof target === 'function' && target.$$name) {
            result.context = target.$$name + ' (Class)';
          } else {
            result.context = typeof target;
          }

          // Get methods (own methods minus Object methods)
          if (typeof target.$methods === 'function') {
            var methods = target.$methods();
            if (methods && methods.$$is_array) {
              result.methods = methods.map(function(m) { return m.toString(); });
            }
          }

          // Get instance variables
          if (typeof target.$instance_variables === 'function') {
            var ivars = target.$instance_variables();
            if (ivars && ivars.$$is_array) {
              result.instance_variables = ivars.map(function(v) { return v.toString(); });
            }
          }

          // Get constants (if class/module)
          if (target.$$is_class || target.$$is_module) {
            var consts = target.$constants ? target.$constants() : [];
            if (consts && consts.$$is_array) {
              result.constants = consts.map(function(c) { return c.toString(); });
            }
          }
        } catch(e) {
          result.error = e.message;
        }

        return result;
      })()
    `;

    try {
      const result = await this.evalFunction(lsCode);

      if (result.error) {
        this.log(`Error: ${result.error}`, 'error');
        return;
      }

      this.log(`Context: ${result.context}`, 'info');

      if (showMethods && result.methods.length > 0) {
        this.log('Methods:', 'info');
        const methodList = result.methods.sort().join(', ');
        this.log(`  ${methodList}`, 'stdout');
      }

      if (showVars && result.instance_variables.length > 0) {
        this.log('Instance variables:', 'info');
        const varList = result.instance_variables.sort().join(', ');
        this.log(`  ${varList}`, 'stdout');
      }

      if (showConstants && result.constants.length > 0) {
        this.log('Constants:', 'info');
        const constList = result.constants.sort().join(', ');
        this.log(`  ${constList}`, 'stdout');
      }

      if (result.methods.length === 0 && result.instance_variables.length === 0 && result.constants.length === 0) {
        this.log('(no methods, variables, or constants found)', 'info');
      }
    } catch (error) {
      this.log(`Error: ${error.message}`, 'error');
    }
  }

  /**
   * cd - Change context
   */
  async cmdCd(args) {
    if (!args || args.trim() === '') {
      // Show current context
      if (this.contextStack.length === 0) {
        this.log('Context: main (top level)', 'info');
      } else {
        this.log(`Context: ${this.contextStack[this.contextStack.length - 1].name}`, 'info');
        this.log(`Depth: ${this.contextStack.length}`, 'info');
      }
      return;
    }

    const target = args.trim();

    if (target === '..') {
      // Go back to previous context
      if (this.contextStack.length === 0) {
        this.log('Already at top level', 'warning');
        return;
      }
      const popped = this.contextStack.pop();
      const newContext = this.contextStack.length > 0
        ? this.contextStack[this.contextStack.length - 1].name
        : 'main';
      this.log(`Returning to: ${newContext}`, 'info');
      return;
    }

    if (target === '/') {
      // Go back to top level
      this.contextStack = [];
      this.log('Returned to: main (top level)', 'info');
      return;
    }

    // Change to new context
    // First verify the target exists and get its description
    const currentContext = this.getContextExpression();
    const checkCode = `
      (function() {
        var context = ${currentContext || 'self'};
        try {
          var target = context.$instance_eval ?
            context.$instance_eval(Opal.compile(${JSON.stringify(target)}, {irb: true})) :
            eval(Opal.compile(${JSON.stringify(target)}, {irb: true}));

          if (target === undefined || target === null) {
            return { error: 'Target is nil or undefined' };
          }

          var name = '';
          if (target.$$class) {
            name = '#<' + (target.$$class.$$name || 'Object') + '>';
          } else if (typeof target === 'function' && target.$$name) {
            name = target.$$name;
          } else {
            name = typeof target;
          }

          return { success: true, name: name, expr: ${JSON.stringify(target)} };
        } catch(e) {
          return { error: e.message };
        }
      })()
    `;

    try {
      const result = await this.evalFunction(checkCode);

      if (result.error) {
        this.log(`Cannot cd to '${target}': ${result.error}`, 'error');
        return;
      }

      // Store context with both the Ruby expression and a name for display
      this.contextStack.push({
        expr: target,
        name: result.name
      });

      this.log(`Entered: ${result.name}`, 'info');
    } catch (error) {
      this.log(`Error: ${error.message}`, 'error');
    }
  }

  /**
   * Get the current context expression for eval
   */
  getContextExpression() {
    if (this.contextStack.length === 0) {
      return null;
    }

    // Build nested instance_eval expression
    let expr = 'self';
    for (const ctx of this.contextStack) {
      expr = `(${expr}).$instance_eval(Opal.compile(${JSON.stringify(ctx.expr)}, {irb: true}))`;
    }
    return expr;
  }

  /**
   * Get the prompt prefix showing context depth
   */
  getPromptPrefix() {
    if (this.contextStack.length === 0) {
      return '>>';
    }
    const depth = this.contextStack.length;
    const lastName = this.contextStack[this.contextStack.length - 1].name;
    return `${lastName}:${depth}>>`;
  }
}

export default OpalRepl;
