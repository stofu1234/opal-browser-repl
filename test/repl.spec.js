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
