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

  /**
   * Capture base methods and constants for ls command comparison
   * Should be called after all Opal modules are fully loaded
   */
  async captureBaseState() {
    const result = await this.evalFunction(`
      (function() {
        // Reset and recapture base state
        window.__opalReplBaseMethods__ = {};
        window.__opalReplBaseConstants__ = {};

        // Capture methods from Opal.Object.$$prototype
        if (Opal.Object && Opal.Object.$$prototype) {
          var keys = Object.getOwnPropertyNames(Opal.Object.$$prototype);
          for (var i = 0; i < keys.length; i++) {
            var k = keys[i];
            if (k.startsWith('$')) window.__opalReplBaseMethods__[k] = true;
          }
        }

        // Capture constants from Opal.Object.$$const
        if (Opal.Object && Opal.Object.$$const) {
          var keys = Object.keys(Opal.Object.$$const);
          for (var i = 0; i < keys.length; i++) {
            window.__opalReplBaseConstants__[keys[i]] = true;
          }
        }

      })()
    `);
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
    this.log('  ls       - List methods/variables/constants', 'info');
    this.log('  ls -m    - List methods only', 'info');
    this.log('  ls -v    - List variables only', 'info');
    this.log('  ls -c    - List constants only', 'info');
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

    // Build JavaScript code to get context information from Opal internals
    // This accesses IRB variables and singleton methods directly
    const lsCode = `
      (function() {
        var result = {
          context: 'main',
          methods: [],
          instance_variables: [],
          local_variables: [],
          constants: []
        };

        // Internal variables to filter out
        var internalVars = ['$ret_or_1', '$ret_or_2', '$ret_or_3', '__target__', '__ctx__',
                           '__methods__', '__ivars__', '__lvars__', '__consts__', 'target', 'result'];

        try {
          // Get local variables from IRB vars (Opal stores them globally in IRB mode)
          if (typeof Opal.irb_vars !== 'undefined') {
            result.local_variables = Object.keys(Opal.irb_vars).filter(function(v) {
              return internalVars.indexOf(v) === -1 && !v.startsWith('$ret_or_');
            }).sort();
          }

          // Use stored base methods (captured at REPL init from Opal.Object.$$prototype)
          var baseMethods = window.__opalReplBaseMethods__ || {};

          // Check methods on Opal.Object.$$prototype that weren't there at init
          // (top-level def adds methods to Object.$$prototype)
          if (Opal.Object && Opal.Object.$$prototype) {
            var protoKeys = Object.getOwnPropertyNames(Opal.Object.$$prototype);
            for (var i = 0; i < protoKeys.length; i++) {
              var key = protoKeys[i];
              if (key.startsWith('$') && typeof Opal.Object.$$prototype[key] === 'function' && !baseMethods[key]) {
                var methodName = key.substring(1);
                if (methodName.length > 0 && !methodName.startsWith('_') && result.methods.indexOf(methodName) === -1) {
                  result.methods.push(methodName);
                }
              }
            }
          }

          result.methods.sort();

          // Check constants on Opal.Object.$$const that weren't there at init
          var baseConstants = window.__opalReplBaseConstants__ || {};

          // Known stdlib/parser constants that are lazy-loaded (filter these out)
          var stdlibConstants = {
            'AST': true, 'Parser': true, 'Racc': true, 'ParseError': true,
            'Set': true, 'Pathname': true, 'File': true, 'Struct': true,
            'JSON': true, 'Date': true, 'Base64': true, 'PackUnpack': true,
            'StringScanner': true, 'Strscan': true, 'ERB': true,
            'OpenStruct': true, 'Delegator': true, 'SimpleDelegator': true,
            'PP': true, 'PrettyPrint': true, 'Observable': true,
            'Singleton': true, 'Forwardable': true, 'Logger': true,
            'URI': true, 'CGI': true, 'SecureRandom': true, 'Digest': true,
            'Native': true, 'Buffer': true, 'Console': true
          };

          if (Opal.Object && Opal.Object.$$const) {
            var constKeys = Object.keys(Opal.Object.$$const);
            for (var i = 0; i < constKeys.length; i++) {
              var key = constKeys[i];
              // Skip if it was in base, or if it's a known stdlib constant
              if (!baseConstants[key] && !stdlibConstants[key]) {
                result.constants.push(key);
              }
            }
          }
          result.constants.sort();

          // Get instance variables from main (Opal.top)
          var main = Opal.top;
          if (main) {
            for (var key in main) {
              if (main.hasOwnProperty(key) && key.startsWith('@') && !key.startsWith('@@')) {
                result.instance_variables.push(key);
              }
            }
            result.instance_variables.sort();
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

      if (showMethods && result.methods && result.methods.length > 0) {
        this.log('Methods:', 'info');
        this.log(`  ${result.methods.join(', ')}`, 'stdout');
      }

      if (showVars && result.instance_variables && result.instance_variables.length > 0) {
        this.log('Instance variables:', 'info');
        this.log(`  ${result.instance_variables.join(', ')}`, 'stdout');
      }

      if (showVars && result.local_variables && result.local_variables.length > 0) {
        this.log('Local variables:', 'info');
        this.log(`  ${result.local_variables.join(', ')}`, 'stdout');
      }

      if (showConstants && result.constants && result.constants.length > 0) {
        this.log('Constants:', 'info');
        this.log(`  ${result.constants.join(', ')}`, 'stdout');
      }

      const hasContent = (result.methods?.length > 0) ||
                        (result.instance_variables?.length > 0) ||
                        (result.local_variables?.length > 0) ||
                        (result.constants?.length > 0);

      if (!hasContent) {
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
