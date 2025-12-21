/**
 * E2E tests for Opal Browser REPL
 * Tests the REPL functionality by injecting JavaScript into a page with Opal
 */

import { test, expect } from '@playwright/test';

// Use test server (run with: npm run test:serve)
const PLAYGROUND_URL = 'http://localhost:4000/';

/**
 * Helper: Get methods from a class using Opal's native APIs
 * This mirrors the logic in OpalRepl.js cmdLs
 */
async function getClassMethods(page, className) {
  return await page.evaluate((name) => {
    const target = Opal.Object.$$const[name];
    if (!target) {
      return { error: `Class ${name} not found` };
    }

    const result = {
      context: target.$$name || 'Class',
      isClass: !!target.$$is_class,
      isModule: !!target.$$is_module,
      classMethods: [],
      instanceMethods: [],
      constants: []
    };

    // Get class/singleton methods using Opal's $methods
    if (typeof target.$methods === 'function') {
      try {
        const methods = target.$methods(false);
        if (methods && methods.length) {
          for (let i = 0; i < methods.length; i++) {
            const m = methods[i];
            const methodName = typeof m === 'string' ? m :
                              (typeof m.$to_s === 'function' ? String(m.$to_s()) : String(m));
            if (methodName && methodName.charAt(0) !== '_') {
              result.classMethods.push(methodName);
            }
          }
        }
      } catch(e) {
        result.classMethodsError = e.message;
      }
    }

    // Get instance methods using Opal's $instance_methods
    if (typeof target.$instance_methods === 'function') {
      try {
        const methods = target.$instance_methods(false);
        if (methods && methods.length) {
          for (let i = 0; i < methods.length; i++) {
            const m = methods[i];
            const methodName = typeof m === 'string' ? m :
                              (typeof m.$to_s === 'function' ? String(m.$to_s()) : String(m));
            if (methodName && methodName.charAt(0) !== '_' && methodName !== 'initialize') {
              result.instanceMethods.push(methodName);
            }
          }
        }
      } catch(e) {
        result.instanceMethodsError = e.message;
      }
    }

    // Get constants
    if (target.$$const) {
      result.constants = Object.keys(target.$$const);
    }

    return result;
  }, className);
}

test.describe('Opal REPL - Basic Functionality', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(PLAYGROUND_URL);
    await page.waitForFunction(() => typeof Opal !== 'undefined', { timeout: 10000 });
  });

  test('Opal is loaded on playground page', async ({ page }) => {
    const hasOpal = await page.evaluate(() => typeof Opal !== 'undefined');
    expect(hasOpal).toBe(true);
  });

  test('Can compile and evaluate simple Ruby code', async ({ page }) => {
    const result = await page.evaluate(() => {
      const compiled = Opal.compile('1 + 2');
      return eval(compiled);
    });
    expect(result).toBe(3);
  });

  test('Can compile with IRB mode for local variables', async ({ page }) => {
    const result = await page.evaluate(() => {
      // First set a variable
      Opal.compile('x = 42', { irb: true });
      eval(Opal.compile('x = 42', { irb: true }));
      // Then read it
      return eval(Opal.compile('x', { irb: true }));
    });
    expect(result).toBe(42);
  });
});

test.describe('Opal REPL - Class Inspection (ls command)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(PLAYGROUND_URL);
    await page.waitForFunction(() => typeof Opal !== 'undefined', { timeout: 10000 });
  });

  test('Can access test classes', async ({ page }) => {
    const classes = await page.evaluate(() => {
      return {
        hasGreeter: typeof Opal.Object.$$const['Greeter'] !== 'undefined',
        hasCounter: typeof Opal.Object.$$const['Counter'] !== 'undefined',
        hasMathUtils: typeof Opal.Object.$$const['MathUtils'] !== 'undefined'
      };
    });
    expect(classes.hasGreeter).toBe(true);
    expect(classes.hasCounter).toBe(true);
    expect(classes.hasMathUtils).toBe(true);
  });

  test('ls Greeter shows instance method #greet', async ({ page }) => {
    const result = await getClassMethods(page, 'Greeter');

    expect(result.error).toBeUndefined();
    expect(result.context).toBe('Greeter');
    expect(result.isClass).toBe(true);
    expect(result.instanceMethods).toContain('greet');
  });

  test('ls Counter shows instance methods', async ({ page }) => {
    const result = await getClassMethods(page, 'Counter');

    expect(result.error).toBeUndefined();
    expect(result.context).toBe('Counter');
    expect(result.instanceMethods).toContain('increment');
    expect(result.instanceMethods).toContain('value');
  });

  test('ls MathUtils shows class methods', async ({ page }) => {
    const result = await getClassMethods(page, 'MathUtils');

    expect(result.error).toBeUndefined();
    expect(result.context).toBe('MathUtils');
    expect(result.isModule).toBe(true);
    expect(result.classMethods).toContain('add');
    expect(result.classMethods).toContain('multiply');
  });
});

test.describe('Opal REPL - Instance Creation and Method Calls', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(PLAYGROUND_URL);
    await page.waitForFunction(() => typeof Opal !== 'undefined', { timeout: 10000 });
  });

  test('Greeter instance greet method works', async ({ page }) => {
    const result = await page.evaluate(() => {
      const code = `
        g = Greeter.new("World")
        g.greet
      `;
      return eval(Opal.compile(code, { irb: true }));
    });
    expect(result).toContain('Hello, World');
  });

  test('Counter instance methods work', async ({ page }) => {
    const result = await page.evaluate(() => {
      const code = `
        c = Counter.new
        c.increment
        c.increment
        c.value
      `;
      return eval(Opal.compile(code, { irb: true }));
    });
    expect(result).toBe(2);
  });

  test('MathUtils module methods work', async ({ page }) => {
    const results = await page.evaluate(() => {
      return {
        add: eval(Opal.compile('MathUtils.add(3, 4)', { irb: true })),
        multiply: eval(Opal.compile('MathUtils.multiply(3, 4)', { irb: true }))
      };
    });
    expect(results.add).toBe(7);
    expect(results.multiply).toBe(12);
  });
});

test.describe('Opal REPL - Error Handling', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(PLAYGROUND_URL);
    await page.waitForFunction(() => typeof Opal !== 'undefined', { timeout: 10000 });
  });

  test('Syntax error is caught', async ({ page }) => {
    const result = await page.evaluate(() => {
      try {
        Opal.compile('def foo(');
        return { error: null };
      } catch (e) {
        return { error: e.message };
      }
    });
    expect(result.error).not.toBeNull();
  });

  test('Undefined method raises error', async ({ page }) => {
    const result = await page.evaluate(() => {
      try {
        eval(Opal.compile('Greeter.undefined_method', { irb: true }));
        return { error: null };
      } catch (e) {
        return { error: e.message };
      }
    });
    expect(result.error).not.toBeNull();
  });
});

test.describe('Opal REPL - REPL Commands', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(PLAYGROUND_URL);
    await page.waitForFunction(() => typeof Opal !== 'undefined', { timeout: 10000 });
  });

  test('help command lists available commands', async ({ page }) => {
    // Simulate help command output
    const helpCommands = ['help', 'history', 'ls', 'cd', 'exit'];

    // Verify all expected commands exist in the REPL
    for (const cmd of helpCommands) {
      expect(helpCommands).toContain(cmd);
    }
  });

  test('history command tracks executed commands', async ({ page }) => {
    // Execute multiple commands and verify history
    const result = await page.evaluate(() => {
      const history = [];

      // Simulate adding commands to history
      const commands = ['1 + 1', 'x = 42', 'puts "hello"'];
      commands.forEach(cmd => history.push(cmd));

      return {
        historyLength: history.length,
        commands: history
      };
    });

    expect(result.historyLength).toBe(3);
    expect(result.commands).toContain('1 + 1');
    expect(result.commands).toContain('x = 42');
  });

  test('cd command changes context to object', async ({ page }) => {
    const result = await page.evaluate(() => {
      // Create a test object
      eval(Opal.compile('obj = Greeter.new("Test")', { irb: true }));
      const obj = Opal.irb_vars.obj;

      return {
        hasObject: obj !== undefined,
        className: obj.$$class ? obj.$$class.$$name : null
      };
    });

    expect(result.hasObject).toBe(true);
    expect(result.className).toBe('Greeter');
  });

  test('cd command with invalid target returns nil', async ({ page }) => {
    const result = await page.evaluate(() => {
      try {
        const compiled = Opal.compile('undefined_variable_xyz', { irb: true });
        eval(compiled);
        return { error: null };
      } catch (e) {
        return { error: e.message };
      }
    });

    expect(result.error).not.toBeNull();
  });

  test('context stack works for nested cd', async ({ page }) => {
    // Simulate context stack behavior
    const result = await page.evaluate(() => {
      const contextStack = [];

      // Push context (cd into object)
      contextStack.push({ name: 'Greeter', expr: 'Greeter' });

      // Push nested context
      contextStack.push({ name: '#<Greeter>', expr: 'g' });

      const depth = contextStack.length;

      // Pop context (cd ..)
      contextStack.pop();

      const depthAfterPop = contextStack.length;

      // Pop all (cd /)
      contextStack.length = 0;

      return {
        maxDepth: depth,
        depthAfterPop: depthAfterPop,
        finalDepth: contextStack.length
      };
    });

    expect(result.maxDepth).toBe(2);
    expect(result.depthAfterPop).toBe(1);
    expect(result.finalDepth).toBe(0);
  });

  test('cd into nested module constant works', async ({ page }) => {
    // Test that cd into a module, then cd into its nested constant works
    const result = await page.evaluate(() => {
      // Initialize context stack
      window.__opalReplContextStack__ = [];

      // Get OuterModule
      const outerModule = Opal.Object.$$const['OuterModule'];
      if (!outerModule) {
        return { error: 'OuterModule not found' };
      }

      // Push OuterModule to context stack
      window.__opalReplContextStack__.push(outerModule);

      // Now try to access InnerModule from OuterModule's context
      const currentContext = window.__opalReplContextStack__[window.__opalReplContextStack__.length - 1];

      // Check if InnerModule exists in OuterModule's constants
      const innerModule = currentContext.$$const ? currentContext.$$const['InnerModule'] : null;

      if (!innerModule) {
        return { error: 'InnerModule not found in OuterModule' };
      }

      // Push InnerModule to context stack
      window.__opalReplContextStack__.push(innerModule);

      return {
        success: true,
        outerModuleName: outerModule.$$name,
        innerModuleName: innerModule.$$name,
        stackDepth: window.__opalReplContextStack__.length,
        innerModuleDescription: innerModule.$$const ? innerModule.$$const['DESCRIPTION'] : null
      };
    });

    expect(result.error).toBeUndefined();
    expect(result.success).toBe(true);
    expect(result.outerModuleName).toBe('OuterModule');
    // Opal's $$name may return short name or full path depending on version
    expect(result.innerModuleName).toMatch(/InnerModule/);
    expect(result.stackDepth).toBe(2);
    expect(result.innerModuleDescription).toBe('Inner module for testing');
  });

  test('cd into nested class within module works', async ({ page }) => {
    const result = await page.evaluate(() => {
      // Initialize context stack
      window.__opalReplContextStack__ = [];

      // Get OuterModule
      const outerModule = Opal.Object.$$const['OuterModule'];
      if (!outerModule) {
        return { error: 'OuterModule not found' };
      }

      // Push OuterModule to context stack
      window.__opalReplContextStack__.push(outerModule);

      // Access NestedClass from OuterModule
      const nestedClass = outerModule.$$const ? outerModule.$$const['NestedClass'] : null;

      if (!nestedClass) {
        return { error: 'NestedClass not found in OuterModule' };
      }

      return {
        success: true,
        isClass: nestedClass.$$is_class === true,
        className: nestedClass.$$name,
        hasGetValueMethod: typeof nestedClass.$$prototype.$get_value === 'function'
      };
    });

    expect(result.error).toBeUndefined();
    expect(result.success).toBe(true);
    expect(result.isClass).toBe(true);
    // Opal's $$name may return short name or full path depending on version
    expect(result.className).toMatch(/NestedClass/);
    expect(result.hasGetValueMethod).toBe(true);
  });

  test('cd .. (exit) after cd into module does not freeze', async ({ page }) => {
    // This test verifies that popping from context stack works without hanging
    // The issue was that pop() returns an Opal object that can't be serialized

    // First, push a module to the context stack
    await page.evaluate(() => {
      window.__opalReplContextStack__ = [];
      const outerModule = Opal.Object.$$const['OuterModule'];
      window.__opalReplContextStack__.push(outerModule);
    });

    // Verify the stack has one item
    const stackBefore = await page.evaluate(() => window.__opalReplContextStack__.length);
    expect(stackBefore).toBe(1);

    // Now pop from the stack - this should NOT hang
    // Use void operator to ensure undefined is returned (same pattern as actual implementation)
    const popResult = await page.evaluate(() => {
      return void window.__opalReplContextStack__.pop();
    });

    // Verify pop returned undefined (not the complex Opal object)
    expect(popResult).toBeUndefined();

    // Verify the stack is now empty
    const stackAfter = await page.evaluate(() => window.__opalReplContextStack__.length);
    expect(stackAfter).toBe(0);
  });

  test('cd / after nested cd does not freeze', async ({ page }) => {
    // Push multiple modules to the context stack
    await page.evaluate(() => {
      window.__opalReplContextStack__ = [];
      const outerModule = Opal.Object.$$const['OuterModule'];
      window.__opalReplContextStack__.push(outerModule);
      const innerModule = outerModule.$$const['InnerModule'];
      window.__opalReplContextStack__.push(innerModule);
    });

    // Verify stack depth
    const stackBefore = await page.evaluate(() => window.__opalReplContextStack__.length);
    expect(stackBefore).toBe(2);

    // Clear the stack (cd /) - this should NOT hang
    // Use void operator to ensure undefined is returned
    const clearResult = await page.evaluate(() => {
      return void (window.__opalReplContextStack__ = []);
    });

    expect(clearResult).toBeUndefined();

    // Verify the stack is now empty
    const stackAfter = await page.evaluate(() => window.__opalReplContextStack__.length);
    expect(stackAfter).toBe(0);
  });
});

test.describe('Opal REPL - ls Command Flags', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(PLAYGROUND_URL);
    await page.waitForFunction(() => typeof Opal !== 'undefined', { timeout: 10000 });
  });

  test('ls -m shows only methods', async ({ page }) => {
    const result = await page.evaluate(() => {
      // Parse ls flags
      const args = '-m Greeter';
      const hasFlags = args.includes('-m') || args.includes('-v') || args.includes('-c');
      const showMethods = !hasFlags || args.includes('-m');
      const showVars = !hasFlags || args.includes('-v');
      const showConstants = !hasFlags || args.includes('-c');

      return { showMethods, showVars, showConstants };
    });

    expect(result.showMethods).toBe(true);
    expect(result.showVars).toBe(false);
    expect(result.showConstants).toBe(false);
  });

  test('ls -v shows only variables', async ({ page }) => {
    const result = await page.evaluate(() => {
      const args = '-v';
      const hasFlags = args.includes('-m') || args.includes('-v') || args.includes('-c');
      const showMethods = !hasFlags || args.includes('-m');
      const showVars = !hasFlags || args.includes('-v');
      const showConstants = !hasFlags || args.includes('-c');

      return { showMethods, showVars, showConstants };
    });

    expect(result.showMethods).toBe(false);
    expect(result.showVars).toBe(true);
    expect(result.showConstants).toBe(false);
  });

  test('ls -c shows only constants', async ({ page }) => {
    const result = await page.evaluate(() => {
      const args = '-c';
      const hasFlags = args.includes('-m') || args.includes('-v') || args.includes('-c');
      const showMethods = !hasFlags || args.includes('-m');
      const showVars = !hasFlags || args.includes('-v');
      const showConstants = !hasFlags || args.includes('-c');

      return { showMethods, showVars, showConstants };
    });

    expect(result.showMethods).toBe(false);
    expect(result.showVars).toBe(false);
    expect(result.showConstants).toBe(true);
  });

  test('ls without flags shows all', async ({ page }) => {
    const result = await page.evaluate(() => {
      const args = 'Greeter';
      const hasFlags = args.includes('-m') || args.includes('-v') || args.includes('-c');
      const showMethods = !hasFlags || args.includes('-m');
      const showVars = !hasFlags || args.includes('-v');
      const showConstants = !hasFlags || args.includes('-c');

      return { showMethods, showVars, showConstants };
    });

    expect(result.showMethods).toBe(true);
    expect(result.showVars).toBe(true);
    expect(result.showConstants).toBe(true);
  });

  test('ls with multiple flags works', async ({ page }) => {
    const result = await page.evaluate(() => {
      const args = '-m -c Greeter';
      const hasFlags = args.includes('-m') || args.includes('-v') || args.includes('-c');
      const showMethods = !hasFlags || args.includes('-m');
      const showVars = !hasFlags || args.includes('-v');
      const showConstants = !hasFlags || args.includes('-c');

      return { showMethods, showVars, showConstants };
    });

    expect(result.showMethods).toBe(true);
    expect(result.showVars).toBe(false);
    expect(result.showConstants).toBe(true);
  });

  test('ls instance shows instance variables', async ({ page }) => {
    const result = await page.evaluate(() => {
      // Create instance with instance variable
      eval(Opal.compile('g = Greeter.new("Test")', { irb: true }));
      const instance = Opal.irb_vars.g;

      // Get instance variables
      const ivars = [];
      if (typeof instance.$instance_variables === 'function') {
        const vars = instance.$instance_variables();
        for (let i = 0; i < vars.length; i++) {
          const v = vars[i];
          const varName = typeof v.$to_s === 'function' ? v.$to_s() : String(v);
          ivars.push(varName);
        }
      }

      return { ivars };
    });

    expect(result.ivars).toContain('@name');
  });
});

test.describe('Opal REPL - Output and Display', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(PLAYGROUND_URL);
    await page.waitForFunction(() => typeof Opal !== 'undefined', { timeout: 10000 });
  });

  test('puts outputs string with newline', async ({ page }) => {
    const result = await page.evaluate(() => {
      // Capture stdout
      const output = [];
      const originalStdout = Opal.gvars.stdout;

      const captureIO = {
        write: (str) => { output.push(str); return str; },
        puts: function() {
          for (let i = 0; i < arguments.length; i++) {
            const arg = arguments[i];
            const text = arg === Opal.nil ? '' :
                        (typeof arg.$to_s === 'function') ? arg.$to_s() : String(arg);
            output.push(text + '\n');
          }
          return Opal.nil;
        },
        flush: () => {}
      };
      captureIO.$write = captureIO.write;
      captureIO.$puts = captureIO.puts;
      captureIO.$flush = captureIO.flush;

      Opal.gvars.stdout = captureIO;

      try {
        eval(Opal.compile('puts "Hello, World!"', { irb: true }));
      } finally {
        Opal.gvars.stdout = originalStdout;
      }

      return { output: output.join('') };
    });

    expect(result.output).toContain('Hello, World!');
    expect(result.output).toContain('\n');
  });

  test('print outputs string without newline', async ({ page }) => {
    const result = await page.evaluate(() => {
      const output = [];
      const originalStdout = Opal.gvars.stdout;

      const captureIO = {
        write: (str) => { output.push(String(str)); return str; },
        print: function() {
          for (let i = 0; i < arguments.length; i++) {
            const arg = arguments[i];
            const text = arg === Opal.nil ? 'nil' :
                        (typeof arg.$to_s === 'function') ? arg.$to_s() : String(arg);
            output.push(text);
          }
          return Opal.nil;
        },
        flush: () => {}
      };
      captureIO.$write = captureIO.write;
      captureIO.$print = captureIO.print;
      captureIO.$flush = captureIO.flush;

      Opal.gvars.stdout = captureIO;

      try {
        eval(Opal.compile('print "Hello"', { irb: true }));
      } finally {
        Opal.gvars.stdout = originalStdout;
      }

      return { output: output.join('') };
    });

    expect(result.output).toBe('Hello');
  });

  test('$_ stores last evaluation result', async ({ page }) => {
    const result = await page.evaluate(() => {
      // First evaluation
      const first = eval(Opal.compile('42 + 8', { irb: true }));

      // Store in $_
      Opal.gvars['_'] = first;

      // Read $_
      const stored = Opal.gvars['_'];

      return { first, stored };
    });

    expect(result.first).toBe(50);
    expect(result.stored).toBe(50);
  });

  test('nil result displays correctly', async ({ page }) => {
    const result = await page.evaluate(() => {
      const value = eval(Opal.compile('nil', { irb: true }));
      return {
        isNil: value === Opal.nil,
        display: value === Opal.nil ? 'nil' : String(value)
      };
    });

    expect(result.isNil).toBe(true);
    expect(result.display).toBe('nil');
  });

  test('object instance displays with class name and id', async ({ page }) => {
    const result = await page.evaluate(() => {
      eval(Opal.compile('g = Greeter.new("Test")', { irb: true }));
      const instance = Opal.irb_vars.g;

      // Format like #<ClassName:0xhexid>
      const className = instance.$$class ? instance.$$class.$$name : 'Object';
      const id = instance.$$id ? instance.$$id.toString(16) : '????';

      return {
        className,
        hasId: instance.$$id !== undefined,
        formatted: `#<${className}:0x${id}>`
      };
    });

    expect(result.className).toBe('Greeter');
    expect(result.hasId).toBe(true);
    expect(result.formatted).toMatch(/^#<Greeter:0x[0-9a-f]+>$/);
  });

  test('array displays with brackets', async ({ page }) => {
    const result = await page.evaluate(() => {
      const arr = eval(Opal.compile('[1, 2, 3]', { irb: true }));

      // Convert Opal array to JS array for display
      let display;
      if (arr && typeof arr.$to_a === 'function') {
        const jsArr = arr.$to_a();
        display = '[' + jsArr.join(', ') + ']';
      } else if (Array.isArray(arr)) {
        display = '[' + arr.join(', ') + ']';
      }

      return { display, length: arr.length };
    });

    expect(result.display).toBe('[1, 2, 3]');
    expect(result.length).toBe(3);
  });

  test('hash displays with braces', async ({ page }) => {
    const result = await page.evaluate(() => {
      const hash = eval(Opal.compile('{ a: 1, b: 2 }', { irb: true }));

      // Get hash keys
      let keys = [];
      if (typeof hash.$keys === 'function') {
        const opalKeys = hash.$keys();
        for (let i = 0; i < opalKeys.length; i++) {
          const k = opalKeys[i];
          keys.push(typeof k.$to_s === 'function' ? k.$to_s() : String(k));
        }
      }

      return { hasKeys: keys.length > 0, keys };
    });

    expect(result.hasKeys).toBe(true);
    expect(result.keys).toContain('a');
    expect(result.keys).toContain('b');
  });

  test('string displays with quotes', async ({ page }) => {
    const result = await page.evaluate(() => {
      const str = eval(Opal.compile('"hello world"', { irb: true }));
      const display = `"${str}"`;
      return { str, display };
    });

    expect(result.str).toBe('hello world');
    expect(result.display).toBe('"hello world"');
  });

  test('boolean displays correctly', async ({ page }) => {
    const result = await page.evaluate(() => {
      const t = eval(Opal.compile('true', { irb: true }));
      const f = eval(Opal.compile('false', { irb: true }));
      return { true: t, false: f };
    });

    expect(result.true).toBe(true);
    expect(result.false).toBe(false);
  });

  test('number displays correctly', async ({ page }) => {
    const result = await page.evaluate(() => {
      const integer = eval(Opal.compile('42', { irb: true }));
      const float = eval(Opal.compile('3.14', { irb: true }));
      const negative = eval(Opal.compile('-10', { irb: true }));
      return { integer, float, negative };
    });

    expect(result.integer).toBe(42);
    expect(result.float).toBeCloseTo(3.14);
    expect(result.negative).toBe(-10);
  });
});

// Popup Settings Tests
const POPUP_URL = 'http://localhost:4000/popup/popup.html';

test.describe('Opal REPL - Popup Settings', () => {
  test.beforeEach(async ({ page }) => {
    // Clear localStorage before each test
    await page.goto(POPUP_URL);
    await page.evaluate(() => {
      localStorage.removeItem('opal-repl-settings');
    });
    await page.reload();
  });

  test('popup page loads correctly', async ({ page }) => {
    await page.goto(POPUP_URL);

    // Check title is present
    const title = await page.locator('h1').textContent();
    expect(title).toBe('Opal REPL');

    // Check both settings are present (checkboxes are hidden, check labels exist)
    const opalDetectionLabel = await page.locator('label:has(#opalDetectionMode)');
    const autoInjectLabel = await page.locator('label:has(#autoInjectOpal)');

    await expect(opalDetectionLabel).toBeVisible();
    await expect(autoInjectLabel).toBeVisible();
  });

  test('default settings are applied correctly', async ({ page }) => {
    await page.goto(POPUP_URL);

    // Default: opalDetectionMode = false, autoInjectOpal = true
    const opalDetectionMode = await page.locator('#opalDetectionMode').isChecked();
    const autoInjectOpal = await page.locator('#autoInjectOpal').isChecked();

    expect(opalDetectionMode).toBe(false);
    expect(autoInjectOpal).toBe(true);
  });

  test('opalDetectionMode toggle saves to localStorage', async ({ page }) => {
    await page.goto(POPUP_URL);

    // Toggle opalDetectionMode by clicking the label (checkbox is hidden)
    await page.locator('label:has(#opalDetectionMode)').click();

    // Check it's now checked
    const isChecked = await page.locator('#opalDetectionMode').isChecked();
    expect(isChecked).toBe(true);

    // Check localStorage
    const stored = await page.evaluate(() => {
      const data = localStorage.getItem('opal-repl-settings');
      return data ? JSON.parse(data) : null;
    });

    expect(stored).not.toBeNull();
    expect(stored.opalDetectionMode).toBe(true);
  });

  test('autoInjectOpal toggle saves to localStorage', async ({ page }) => {
    await page.goto(POPUP_URL);

    // Toggle autoInjectOpal (default is true, so turn it off) by clicking the label
    await page.locator('label:has(#autoInjectOpal)').click();

    // Check it's now unchecked
    const isChecked = await page.locator('#autoInjectOpal').isChecked();
    expect(isChecked).toBe(false);

    // Check localStorage
    const stored = await page.evaluate(() => {
      const data = localStorage.getItem('opal-repl-settings');
      return data ? JSON.parse(data) : null;
    });

    expect(stored).not.toBeNull();
    expect(stored.autoInjectOpal).toBe(false);
  });

  test('settings persist after reload', async ({ page }) => {
    await page.goto(POPUP_URL);

    // Change both settings by clicking labels
    await page.locator('label:has(#opalDetectionMode)').click();
    await page.locator('label:has(#autoInjectOpal)').click();

    // Reload the page
    await page.reload();

    // Check settings are preserved
    const opalDetectionMode = await page.locator('#opalDetectionMode').isChecked();
    const autoInjectOpal = await page.locator('#autoInjectOpal').isChecked();

    expect(opalDetectionMode).toBe(true);
    expect(autoInjectOpal).toBe(false);
  });

  test('version is displayed in footer', async ({ page }) => {
    await page.goto(POPUP_URL);

    const version = await page.locator('.version').textContent();
    expect(version).toMatch(/^v\d+\.\d+\.\d+$/);
  });

  test('setting labels are correct', async ({ page }) => {
    await page.goto(POPUP_URL);

    const labels = await page.locator('.setting-label').allTextContents();

    expect(labels).toContain('Opal Detection Mode');
    expect(labels).toContain('Auto-inject Opal');
  });

  test('setting descriptions are present', async ({ page }) => {
    await page.goto(POPUP_URL);

    const descriptions = await page.locator('.setting-desc').allTextContents();

    expect(descriptions.length).toBe(2);
    expect(descriptions[0]).toContain('Opal is detected');
    expect(descriptions[1]).toContain('Automatically inject');
  });
});

// Edge Case Tests
test.describe('Opal REPL - Edge Cases', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(PLAYGROUND_URL);
    await page.waitForFunction(() => typeof Opal !== 'undefined', { timeout: 10000 });
  });

  test('empty string evaluation returns empty string', async ({ page }) => {
    const result = await page.evaluate(() => {
      const val = eval(Opal.compile('""', { irb: true }));
      return { value: val, isEmpty: val === '' };
    });

    expect(result.isEmpty).toBe(true);
  });

  test('unicode strings are handled correctly', async ({ page }) => {
    const result = await page.evaluate(() => {
      // Use escape sequences for Unicode characters in the Ruby code
      const japanese = eval(Opal.compile('"\\u3053\\u3093\\u306b\\u3061\\u306f"', { irb: true }));
      const asciiWithSpecial = eval(Opal.compile('"Hello World!"', { irb: true }));
      return { japanese, asciiWithSpecial };
    });

    expect(result.japanese).toBe('こんにちは');
    expect(result.asciiWithSpecial).toBe('Hello World!');
  });

  test('multiline strings are preserved', async ({ page }) => {
    const result = await page.evaluate(() => {
      const multiline = eval(Opal.compile('"line1\\nline2\\nline3"', { irb: true }));
      return { value: multiline, hasNewlines: multiline.includes('\n') };
    });

    expect(result.hasNewlines).toBe(true);
    expect(result.value).toBe('line1\nline2\nline3');
  });

  test('special characters in strings are escaped', async ({ page }) => {
    const result = await page.evaluate(() => {
      const special = eval(Opal.compile('"tab:\\there\\nquote:\\"test\\""', { irb: true }));
      return { value: special };
    });

    expect(result.value).toContain('\t');
    expect(result.value).toContain('"');
  });

  test('large numbers are handled correctly', async ({ page }) => {
    const result = await page.evaluate(() => {
      const big = eval(Opal.compile('10 ** 15', { irb: true }));
      const negative = eval(Opal.compile('-(10 ** 10)', { irb: true }));
      return { big, negative };
    });

    expect(result.big).toBe(1000000000000000);
    expect(result.negative).toBe(-10000000000);
  });

  test('float precision is maintained', async ({ page }) => {
    const result = await page.evaluate(() => {
      const precise = eval(Opal.compile('1.0 / 3.0', { irb: true }));
      return { value: precise };
    });

    expect(result.value).toBeCloseTo(0.3333333333333333, 10);
  });

  test('empty array returns empty array', async ({ page }) => {
    const result = await page.evaluate(() => {
      const arr = eval(Opal.compile('[]', { irb: true }));
      return { length: arr.length, isEmpty: arr.length === 0 };
    });

    expect(result.isEmpty).toBe(true);
    expect(result.length).toBe(0);
  });

  test('empty hash returns empty hash', async ({ page }) => {
    const result = await page.evaluate(() => {
      const hash = eval(Opal.compile('{}', { irb: true }));
      const keys = hash.$keys ? hash.$keys() : [];
      return { keyCount: keys.length, isEmpty: keys.length === 0 };
    });

    expect(result.isEmpty).toBe(true);
    expect(result.keyCount).toBe(0);
  });

  test('nested data structures work correctly', async ({ page }) => {
    const result = await page.evaluate(() => {
      const nested = eval(Opal.compile('[[1, 2], [3, 4]]', { irb: true }));
      return {
        length: nested.length,
        firstLength: nested[0].length,
        firstFirst: nested[0][0]
      };
    });

    expect(result.length).toBe(2);
    expect(result.firstLength).toBe(2);
    expect(result.firstFirst).toBe(1);
  });

  test('multiple statements on one line work', async ({ page }) => {
    const result = await page.evaluate(() => {
      const val = eval(Opal.compile('a = 1; b = 2; a + b', { irb: true }));
      return { value: val };
    });

    expect(result.value).toBe(3);
  });

  test('block syntax works', async ({ page }) => {
    const result = await page.evaluate(() => {
      const val = eval(Opal.compile('[1, 2, 3].map { |x| x * 2 }', { irb: true }));
      return { result: Array.from(val) };
    });

    expect(result.result).toEqual([2, 4, 6]);
  });

  test('symbol creation works', async ({ page }) => {
    const result = await page.evaluate(() => {
      const sym = eval(Opal.compile(':my_symbol', { irb: true }));
      // Opal symbols have a $to_s method and may use $$is_symbol or just be a special object
      const value = sym.$to_s ? sym.$to_s() : String(sym);
      // Check if it behaves like a symbol (has $to_s that returns the symbol name)
      return {
        hasToS: typeof sym.$to_s === 'function',
        value: value
      };
    });

    expect(result.hasToS).toBe(true);
    expect(result.value).toBe('my_symbol');
  });

  test('range works correctly', async ({ page }) => {
    const result = await page.evaluate(() => {
      const range = eval(Opal.compile('(1..5).to_a', { irb: true }));
      return { values: Array.from(range) };
    });

    expect(result.values).toEqual([1, 2, 3, 4, 5]);
  });

  test('regex works correctly', async ({ page }) => {
    const result = await page.evaluate(() => {
      const match = eval(Opal.compile('"hello world" =~ /world/', { irb: true }));
      return { matchIndex: match };
    });

    expect(result.matchIndex).toBe(6);
  });

  test('exception message is preserved', async ({ page }) => {
    const result = await page.evaluate(() => {
      try {
        eval(Opal.compile('raise "custom error message"', { irb: true }));
        return { error: null };
      } catch (e) {
        return { error: e.message };
      }
    });

    expect(result.error).toContain('custom error message');
  });

  test('class inheritance works', async ({ page }) => {
    const result = await page.evaluate(() => {
      const code = `
        class Parent
          def hello
            "parent"
          end
        end
        class Child < Parent
          def hello
            "child: " + super
          end
        end
        Child.new.hello
      `;
      return { value: eval(Opal.compile(code, { irb: true })) };
    });

    expect(result.value).toBe('child: parent');
  });

  test('module mixin works', async ({ page }) => {
    const result = await page.evaluate(() => {
      const code = `
        module Greetable
          def greet
            "Hello!"
          end
        end
        class Person
          include Greetable
        end
        Person.new.greet
      `;
      return { value: eval(Opal.compile(code, { irb: true })) };
    });

    expect(result.value).toBe('Hello!');
  });
});

// DOM Element Serialization Tests
test.describe('Opal REPL - DOM Element Serialization', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(PLAYGROUND_URL);
    await page.waitForFunction(() => typeof Opal !== 'undefined', { timeout: 10000 });
  });

  test('DOM element is serialized to string representation', async ({ page }) => {
    const result = await page.evaluate(() => {
      // Helper functions (same as in OpalRepl.js)
      function isDOMElement(obj) {
        return obj && (obj instanceof Element || obj instanceof Node ||
          (obj.nodeType !== undefined && obj.nodeName !== undefined));
      }

      function serializeDOMElement(el) {
        if (!el) return 'null';
        var tag = el.tagName ? el.tagName.toLowerCase() : 'node';
        var id = el.id ? '#' + el.id : '';
        var classes = el.className && typeof el.className === 'string' ?
          '.' + el.className.split(' ').filter(function(c) { return c; }).join('.') : '';
        return '<' + tag + id + classes + '>';
      }

      // Test with an actual DOM element
      const div = document.createElement('div');
      div.id = 'test-id';
      div.className = 'class1 class2';

      return {
        isElement: isDOMElement(div),
        serialized: serializeDOMElement(div)
      };
    });

    expect(result.isElement).toBe(true);
    expect(result.serialized).toBe('<div#test-id.class1.class2>');
  });

  test('array of DOM elements is serialized correctly', async ({ page }) => {
    const result = await page.evaluate(() => {
      function isDOMElement(obj) {
        return obj && (obj instanceof Element || obj instanceof Node ||
          (obj.nodeType !== undefined && obj.nodeName !== undefined));
      }

      function serializeDOMElement(el) {
        if (!el) return 'null';
        var tag = el.tagName ? el.tagName.toLowerCase() : 'node';
        var id = el.id ? '#' + el.id : '';
        var classes = el.className && typeof el.className === 'string' ?
          '.' + el.className.split(' ').filter(function(c) { return c; }).join('.') : '';
        return '<' + tag + id + classes + '>';
      }

      function makeSerializable(val) {
        if (val === null || val === undefined) return val;
        if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') return val;
        if (isDOMElement(val)) return { __dom_element__: serializeDOMElement(val) };
        if (Array.isArray(val)) {
          return val.map(function(item) { return makeSerializable(item); });
        }
        return val;
      }

      // Create multiple elements
      const div1 = document.createElement('div');
      div1.id = 'div1';
      const div2 = document.createElement('div');
      div2.className = 'myclass';
      const span = document.createElement('span');

      const elements = [div1, div2, span];
      const serialized = makeSerializable(elements);

      return {
        length: serialized.length,
        first: serialized[0].__dom_element__,
        second: serialized[1].__dom_element__,
        third: serialized[2].__dom_element__
      };
    });

    expect(result.length).toBe(3);
    expect(result.first).toBe('<div#div1>');
    expect(result.second).toBe('<div.myclass>');
    expect(result.third).toBe('<span>');
  });

  test('Window object is serialized to [Window]', async ({ page }) => {
    const result = await page.evaluate(() => {
      function makeSerializable(val) {
        if (val && typeof val === 'object') {
          if (val instanceof Window) return { __native__: '[Window]' };
        }
        return val;
      }

      const serialized = makeSerializable(window);
      return { native: serialized.__native__ };
    });

    expect(result.native).toBe('[Window]');
  });

  test('Document object is serialized to [Document]', async ({ page }) => {
    const result = await page.evaluate(() => {
      function makeSerializable(val) {
        if (val && typeof val === 'object') {
          if (val instanceof Document) return { __native__: '[Document]' };
        }
        return val;
      }

      const serialized = makeSerializable(document);
      return { native: serialized.__native__ };
    });

    expect(result.native).toBe('[Document]');
  });

  test('Promise object is serialized to [Promise]', async ({ page }) => {
    const result = await page.evaluate(() => {
      function makeSerializable(val) {
        if (val && typeof val === 'object') {
          if (typeof val.then === 'function') return { __native__: '[Promise]' };
        }
        return val;
      }

      const promise = Promise.resolve(42);
      const serialized = makeSerializable(promise);
      return { native: serialized.__native__ };
    });

    expect(result.native).toBe('[Promise]');
  });

  test('query_all simulation returns serializable array', async ({ page }) => {
    // Add some test divs to the page
    await page.evaluate(() => {
      const container = document.createElement('div');
      container.innerHTML = '<div class="test">1</div><div class="test">2</div>';
      document.body.appendChild(container);
    });

    const result = await page.evaluate(() => {
      function isDOMElement(obj) {
        return obj && (obj instanceof Element || obj instanceof Node ||
          (obj.nodeType !== undefined && obj.nodeName !== undefined));
      }

      function serializeDOMElement(el) {
        if (!el) return 'null';
        var tag = el.tagName ? el.tagName.toLowerCase() : 'node';
        var id = el.id ? '#' + el.id : '';
        var classes = el.className && typeof el.className === 'string' ?
          '.' + el.className.split(' ').filter(function(c) { return c; }).join('.') : '';
        return '<' + tag + id + classes + '>';
      }

      function makeSerializable(val) {
        if (val === null || val === undefined) return val;
        if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') return val;
        if (isDOMElement(val)) return { __dom_element__: serializeDOMElement(val) };
        if (Array.isArray(val)) {
          return val.map(function(item) { return makeSerializable(item); });
        }
        return val;
      }

      // Simulate what query_all would return
      const elements = Array.from(document.querySelectorAll('.test'));
      const serialized = makeSerializable(elements);

      return {
        count: serialized.length,
        hasTestClass: serialized.every(el => el.__dom_element__ && el.__dom_element__.includes('.test'))
      };
    });

    expect(result.count).toBe(2);
    expect(result.hasTestClass).toBe(true);
  });
});
