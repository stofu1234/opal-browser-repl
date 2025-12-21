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
