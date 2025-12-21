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
    },
    'exit': {
      description: 'Return to previous context (alias for cd ..)',
      handler: () => this.cmdCd('..')
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

  async checkOpalAvailability(silent = false) {
    try {
      const result = await this.evalFunction('typeof Opal !== "undefined" && typeof Opal.eval === "function"');
      this.opalAvailable = result;

      if (!silent) {
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
      }

      this.onReady(this.opalAvailable);
      return result;
    } catch (error) {
      if (!silent) {
        const msg = error.message || '';
        // Check for special page errors (about:blank, chrome://, etc.)
        if (msg.includes('Operation failed') || msg.includes('Cannot access')) {
          this.log('This page does not support script execution.', 'error');
          this.log('Try opening a regular web page (http:// or https://).', 'info');
        // Check if this is a CSP error blocking eval
        } else if (msg.includes('CSP') || msg.includes('eval') ||
                   msg.includes('Content Security Policy') || msg.includes("'unsafe-eval'")) {
          this.log('This page blocks eval() via Content Security Policy.', 'error');
          this.log('Opal requires eval() to execute Ruby code.', 'error');
          this.log('Try using Opal REPL on a different page without strict CSP.', 'info');
        } else {
          this.log(`Error checking Opal: ${msg}`, 'error');
        }
      }
      return false;
    }
  }

  /**
   * Capture base methods and constants for ls command comparison
   * Should be called after all Opal modules are fully loaded
   */
  async captureBaseState() {
    if (!this.opalAvailable) return;

    try {
      await this.evalFunction(`
        (function() {
          if (typeof Opal === 'undefined') return;

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
    } catch (e) {
      // Ignore errors if Opal is not available
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
      const errorMsg = error.message || String(error);
      // Check for special page errors (about:blank, chrome://, etc.)
      if (errorMsg.includes('Operation failed') || errorMsg.includes('Cannot access')) {
        this.log('This page does not support script execution.', 'error');
        this.log('Try opening a regular web page (http:// or https://).', 'info');
      // Check if this is a CSP error blocking eval
      } else if (errorMsg.includes('CSP') || errorMsg.includes('eval') ||
          errorMsg.includes('Content Security Policy') || errorMsg.includes("'unsafe-eval'")) {
        this.log('This page blocks eval() via Content Security Policy.', 'error');
        this.log('Opal requires eval() to execute Ruby code.', 'error');
        this.log('Try using Opal REPL on a different page without strict CSP.', 'info');
      } else {
        this.log(errorMsg, 'error');
      }
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
          if (context) {
            // IRB mode uses Opal.top as 'self', so temporarily replace it
            var originalTop = Opal.top;
            try {
              Opal.top = context;
              result = eval(compiled);
            } finally {
              Opal.top = originalTop;
            }
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
            // Try to convert to a serializable format
            try {
              // Handle class/module objects
              if (result.$$is_class || result.$$is_module) {
                jsResult = {
                  __opal_class__: true,
                  name: result.$$name || 'Class',
                  type: result.$$is_module ? 'Module' : 'Class'
                };
              } else if (result && typeof result.$to_n === 'function') {
                jsResult = result.$to_n();
              } else if (result && result.$$class) {
                // Opal instance - create serializable representation
                jsResult = {
                  __opal_instance__: true,
                  class: result.$$class.$$name || 'Object',
                  id: result.$$id
                };
              } else {
                jsResult = result;
              }
            } catch(convErr) {
              // Conversion failed, return string representation
              try {
                jsResult = { __opal_string__: result.$inspect ? result.$inspect() : String(result) };
              } catch(e) {
                jsResult = { __opal_string__: '[Object]' };
              }
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
      // Handle our serialized Opal class/module
      if (value.__opal_class__) {
        return value.name;
      }

      // Handle our serialized Opal instance
      if (value.__opal_instance__) {
        const id = value.id ? value.id.toString(16) : '????';
        return `#<${value.class}:0x${id}>`;
      }

      // Handle string representation
      if (value.__opal_string__) {
        return value.__opal_string__;
      }

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
    this.log('  cd obj   - Enter object context', 'info');
    this.log('  cd ..    - Return to previous context', 'info');
    this.log('  cd /     - Return to top level', 'info');
    this.log('  exit     - Alias for cd ..', 'info');
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
   * ls - List methods and variables of current context or specified object
   */
  async cmdLs(args) {
    // Check if specific flags are used - if not, show everything
    const hasFlags = args && (args.includes('-m') || args.includes('-v') || args.includes('-c'));
    const showMethods = !hasFlags || args.includes('-m');
    const showVars = !hasFlags || args.includes('-v');
    const showConstants = !hasFlags || args.includes('-c');
    const targetArg = args.replace(/-[mvc]/g, '').trim();

    // Check if we're in a context or have a target argument
    const contextExpr = this.getContextExpression();
    const inContext = this.contextStack.length > 0;
    const hasTarget = targetArg.length > 0 || inContext;

    // If we have a target argument, compile it to get the target expression
    let targetExpr = null;
    if (targetArg) {
      targetExpr = `(function() {
        var compiled = Opal.compile(${JSON.stringify(targetArg)}, {irb: true});
        return eval(compiled);
      })()`;
    } else if (inContext) {
      targetExpr = contextExpr;
    }

    // Build JavaScript code to get context information from Opal internals
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
          ${hasTarget ? `
          // List methods/vars of the specified object or current context
          var target = ${targetExpr};
          if (!target) {
            result.error = 'Context object not found';
            return result;
          }

          // Get context name (check $$is_class first - classes also have $$class pointing to Class)
          if (target.$$is_class || target.$$is_module) {
            result.context = target.$$name || 'Class';
          } else if (target.$$class) {
            result.context = '#<' + (target.$$class.$$name || 'Object') + '>';
          } else {
            result.context = Object.prototype.toString.call(target).slice(8, -1);
          }

          // Get user-defined methods only (not inherited from Object/Kernel/etc)
          // For classes: get methods defined on the class itself
          // For instances: get methods from the object's class (not superclasses)

          if (target.$$is_class || target.$$is_module) {
            // It's a class or module - use Opal's native method listing

            // Get class/singleton methods using Opal's $methods
            if (typeof target.$methods === 'function') {
              try {
                var classMethods = target.$methods(false);
                if (classMethods && classMethods.length) {
                  for (var i = 0; i < classMethods.length; i++) {
                    var m = classMethods[i];
                    // Convert Opal Symbol/String to native JS string
                    var methodName;
                    if (typeof m === 'string') {
                      methodName = m;
                    } else if (typeof m.$to_s === 'function') {
                      var s = m.$to_s();
                      methodName = (typeof s === 'string') ? s : String(s);
                    } else {
                      methodName = String(m);
                    }
                    if (methodName && methodName.charAt(0) !== '_') {
                      result.methods.push('.' + methodName);  // Prefix with . for class method
                    }
                  }
                }
              } catch(e) {}
            }

            // Get instance methods using Opal's $instance_methods
            if (typeof target.$instance_methods === 'function') {
              try {
                var instanceMethods = target.$instance_methods(false);
                if (instanceMethods && instanceMethods.length) {
                  for (var i = 0; i < instanceMethods.length; i++) {
                    var m = instanceMethods[i];
                    // Convert Opal Symbol/String to native JS string
                    var methodName;
                    if (typeof m === 'string') {
                      methodName = m;
                    } else if (typeof m.$to_s === 'function') {
                      var s = m.$to_s();
                      methodName = (typeof s === 'string') ? s : String(s);
                    } else {
                      methodName = String(m);
                    }
                    // Filter out internal methods and initialize
                    if (methodName && methodName.charAt(0) !== '_' && methodName !== 'initialize') {
                      result.methods.push('#' + methodName);
                    }
                  }
                }
              } catch(e) {}
            }
          } else if (target.$$class) {
            // It's an instance - get methods defined on its class (not inherited)
            var klass = target.$$class;

            // Get own methods from the class prototype (not inherited)
            if (klass.$$prototype) {
              var protoKeys = Object.getOwnPropertyNames(klass.$$prototype);
              for (var i = 0; i < protoKeys.length; i++) {
                var key = protoKeys[i];
                if (key.startsWith('$') && typeof klass.$$prototype[key] === 'function') {
                  var methodName = key.substring(1);
                  // Skip internal/standard methods (including $class, $module, etc)
                  if (methodName.length > 0 &&
                      !methodName.startsWith('_') &&
                      !methodName.startsWith('$') &&
                      methodName !== 'initialize' &&
                      result.methods.indexOf(methodName) === -1) {
                    result.methods.push(methodName);
                  }
                }
              }
            }

            // Also check singleton methods on the instance
            if (target.$$smethods) {
              for (var i = 0; i < target.$$smethods.length; i++) {
                var m = target.$$smethods[i];
                if (typeof m === 'string' && !m.startsWith('_') && result.methods.indexOf(m) === -1) {
                  result.methods.push(m);
                }
              }
            }
          }

          // Get instance variables using Opal's method
          if (typeof target.$instance_variables === 'function') {
            var ivars = target.$instance_variables();
            for (var i = 0; i < ivars.length; i++) {
              var ivar = ivars[i];
              var ivarStr = (typeof ivar.$to_s === 'function') ? ivar.$to_s() : String(ivar);
              result.instance_variables.push(ivarStr);
            }
          }

          // Get constants if it's a class/module
          if (target.$$const) {
            result.constants = Object.keys(target.$$const).sort();
          }

          ` : `
          // Top level context (main)
          result.context = 'main';

          // Get local variables from IRB vars (Opal stores them globally in IRB mode)
          if (typeof Opal.irb_vars !== 'undefined') {
            result.local_variables = Object.keys(Opal.irb_vars).filter(function(v) {
              return internalVars.indexOf(v) === -1 && !v.startsWith('$ret_or_');
            }).sort();
          }

          // Use stored base methods (captured at REPL init from Opal.Object.$$prototype)
          var baseMethods = window.__opalReplBaseMethods__ || {};

          // Known stdlib methods that are lazy-loaded (filter these out)
          var stdlibMethods = {
            'to_json': true, 'as_json': true, 'to_n': true,
            'native_reader': true, 'native_writer': true, 'native_accessor': true
          };

          // Check methods on Opal.Object.$$prototype that weren't there at init
          // (top-level def adds methods to Object.$$prototype)
          if (Opal.Object && Opal.Object.$$prototype) {
            var protoKeys = Object.getOwnPropertyNames(Opal.Object.$$prototype);
            for (var i = 0; i < protoKeys.length; i++) {
              var key = protoKeys[i];
              if (key.startsWith('$') && typeof Opal.Object.$$prototype[key] === 'function' && !baseMethods[key]) {
                var methodName = key.substring(1);
                // Skip if it's a known stdlib method
                if (methodName.length > 0 && !methodName.startsWith('_') &&
                    !stdlibMethods[methodName] && result.methods.indexOf(methodName) === -1) {
                  result.methods.push(methodName);
                }
              }
            }
          }

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

          // Get instance variables from main (Opal.top)
          var main = Opal.top;
          if (main) {
            for (var key in main) {
              if (main.hasOwnProperty(key) && key.startsWith('@') && !key.startsWith('@@')) {
                result.instance_variables.push(key);
              }
            }
          }
          `}

          result.methods.sort();
          result.instance_variables.sort();
          result.constants.sort();

          // Convert to plain arrays for serialization
          result.methods = Array.prototype.slice.call(result.methods);
          result.instance_variables = Array.prototype.slice.call(result.instance_variables);
          result.local_variables = Array.prototype.slice.call(result.local_variables);
          result.constants = Array.prototype.slice.call(result.constants);

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
      this.contextStack.pop();
      // Pop from page context stack too
      // Use void to ensure undefined is returned (avoids serialization issues with Opal objects)
      await this.evalFunction('void window.__opalReplContextStack__.pop()');
      const newContext = this.contextStack.length > 0
        ? this.contextStack[this.contextStack.length - 1].name
        : 'main';
      this.log(`Returning to: ${newContext}`, 'info');
      return;
    }

    if (target === '/') {
      // Go back to top level
      this.contextStack = [];
      // Use void to ensure undefined is returned
      await this.evalFunction('void (window.__opalReplContextStack__ = [])');
      this.log('Returned to: main (top level)', 'info');
      return;
    }

    // Change to new context
    // Evaluate the target expression and store the actual object in the page
    const currentDepth = this.contextStack.length;
    const cdCode = `
      (function() {
        // Initialize context stack if needed
        if (!window.__opalReplContextStack__) {
          window.__opalReplContextStack__ = [];
        }

        try {
          // Get current context (top of stack or Opal.top)
          var currentContext = window.__opalReplContextStack__.length > 0
            ? window.__opalReplContextStack__[window.__opalReplContextStack__.length - 1]
            : Opal.top;

          var target = ${JSON.stringify(target)};
          var newContext;

          // Check if target is a simple constant name (starts with uppercase, no special chars)
          var isSimpleConstant = /^[A-Z][A-Za-z0-9_]*$/.test(target);

          if (isSimpleConstant && currentContext && currentContext.$$const && currentContext.$$const[target]) {
            // Direct constant access from current context
            newContext = currentContext.$$const[target];
          } else if (isSimpleConstant && Opal.Object.$$const && Opal.Object.$$const[target]) {
            // Try global constant
            newContext = Opal.Object.$$const[target];
          } else {
            // Compile and evaluate the expression
            var compiled = Opal.compile(target, {irb: true});

            if (currentContext && currentContext !== Opal.top &&
                (currentContext.$$is_class || currentContext.$$is_module)) {
              // For classes/modules, try to access as a constant first
              if (currentContext.$$const && currentContext.$$const[target]) {
                newContext = currentContext.$$const[target];
              } else {
                // Fall back to eval at top level
                newContext = eval(compiled);
              }
            } else if (currentContext && currentContext !== Opal.top &&
                       typeof currentContext.$instance_exec === 'function') {
              // For instances, use instance_exec with a simple function wrapper
              try {
                var fn = new Function('return ' + compiled);
                newContext = currentContext.$instance_exec(Opal.nil, fn);
              } catch(e2) {
                // Fall back to eval
                newContext = eval(compiled);
              }
            } else {
              // Top level - just eval directly
              newContext = eval(compiled);
            }
          }

          if (newContext === undefined || newContext === null || newContext === Opal.nil) {
            return { error: 'Target is nil or undefined' };
          }

          // Push to context stack
          window.__opalReplContextStack__.push(newContext);

          // Get display name
          var name = '';
          if (newContext.$$class) {
            name = '#<' + (newContext.$$class.$$name || 'Object') + '>';
          } else if (typeof newContext === 'function' && newContext.$$name) {
            name = newContext.$$name;
          } else if (newContext.$$is_class || newContext.$$is_module) {
            name = newContext.$$name || 'Class';
          } else {
            name = Object.prototype.toString.call(newContext).slice(8, -1);
          }

          return { success: true, name: name };
        } catch(e) {
          return { error: e.message };
        }
      })()
    `;

    try {
      const result = await this.evalFunction(cdCode);

      if (result.error) {
        this.log(`Cannot cd to '${target}': ${result.error}`, 'error');
        return;
      }

      // Store context info locally (the actual object is in page context)
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
   * Returns a JS expression that references the stored context object
   */
  getContextExpression() {
    if (this.contextStack.length === 0) {
      return null;
    }

    // Return reference to the top of the context stack stored in page
    return `window.__opalReplContextStack__[window.__opalReplContextStack__.length - 1]`;
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
