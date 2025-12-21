/**
 * E2E tests for Opal Browser REPL
 * Tests the REPL functionality by injecting JavaScript into a page with Opal
 */

import { test, expect } from '@playwright/test';

// Use local dev server for testing
const PLAYGROUND_URL = 'http://localhost:3000/';

// Helper function that simulates what OpalRepl does
async function testLsLogic(page) {
  return await page.evaluate(() => {
    // Find a class to test with
    const testClassName = 'Greeter';
    const target = Opal.Object.$$const[testClassName];

    if (!target) {
      return { error: `Class ${testClassName} not found` };
    }

    const result = {
      className: target.$$name,
      isClass: target.$$is_class,
      isModule: target.$$is_module,
      methods: [],
      instanceMethods: [],
      constants: [],
      debug: {}
    };

    // Debug info
    result.debug.hasPrototype = !!target.$$prototype;
    result.debug.hasSMethods = !!target.$$smethods;
    result.debug.smethods = target.$$smethods;

    // Get class methods from the class object itself
    const ownKeys = Object.getOwnPropertyNames(target);
    result.debug.ownKeys = ownKeys.filter(k => k.startsWith('$'));

    for (const key of ownKeys) {
      if (key.startsWith('$') && typeof target[key] === 'function') {
        const methodName = key.substring(1);
        if (methodName.length > 0 &&
            !methodName.startsWith('_') &&
            !methodName.startsWith('$') &&
            methodName !== 'nesting' &&
            methodName !== 'new' &&
            methodName !== 'allocate') {
          result.methods.push(methodName);
        }
      }
    }

    // Get instance methods from prototype
    if (target.$$prototype) {
      const protoKeys = Object.getOwnPropertyNames(target.$$prototype);
      result.debug.protoKeys = protoKeys.filter(k => k.startsWith('$'));

      for (const key of protoKeys) {
        if (key.startsWith('$') && typeof target.$$prototype[key] === 'function') {
          const methodName = key.substring(1);
          if (methodName.length > 0 &&
              !methodName.startsWith('_') &&
              !methodName.startsWith('$') &&
              methodName !== 'initialize') {
            result.instanceMethods.push(methodName);
          }
        }
      }
    }

    // Get constants
    if (target.$$const) {
      result.constants = Object.keys(target.$$const);
    }

    // Try Opal's own method listing
    try {
      if (typeof target.$instance_methods === 'function') {
        const methods = target.$instance_methods(false);
        result.debug.opalInstanceMethods = methods.map ? methods.map(m => m.toString()) : String(methods);
      }
    } catch (e) {
      result.debug.opalInstanceMethodsError = e.message;
    }

    try {
      if (typeof target.$methods === 'function') {
        const methods = target.$methods(false);
        result.debug.opalMethods = methods.map ? methods.map(m => m.toString()) : String(methods);
      }
    } catch (e) {
      result.debug.opalMethodsError = e.message;
    }

    return result;
  });
}

test.describe('Opal REPL functionality', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to playground and wait for Opal to load
    await page.goto(PLAYGROUND_URL);

    // Wait for Opal to be available
    await page.waitForFunction(() => typeof Opal !== 'undefined', { timeout: 10000 });
  });

  test('Opal is loaded on playground page', async ({ page }) => {
    const hasOpal = await page.evaluate(() => typeof Opal !== 'undefined');
    expect(hasOpal).toBe(true);
  });

  test('Can evaluate simple Ruby code', async ({ page }) => {
    const result = await page.evaluate(() => {
      const compiled = Opal.compile('1 + 2');
      return eval(compiled);
    });
    expect(result).toBe(3);
  });

  test('Can access Greeter class', async ({ page }) => {
    const hasGreeter = await page.evaluate(() => {
      return typeof Opal.Object.$$const['Greeter'] !== 'undefined';
    });
    expect(hasGreeter).toBe(true);
  });

  test('Debug ls command logic', async ({ page }) => {
    const result = await testLsLogic(page);

    console.log('=== LS Debug Results ===');
    console.log('Class name:', result.className);
    console.log('Is class:', result.isClass);
    console.log('Class methods found:', result.methods);
    console.log('Instance methods found:', result.instanceMethods);
    console.log('Constants:', result.constants);
    console.log('Debug info:', JSON.stringify(result.debug, null, 2));

    // The test passes if we get any useful info
    expect(result.error).toBeUndefined();
  });

  test('Can create Greeter instance and call methods', async ({ page }) => {
    const result = await page.evaluate(() => {
      const code = `
        g = Greeter.new("Test")
        g.greet
      `;
      const compiled = Opal.compile(code, { irb: true });
      return eval(compiled);
    });

    expect(result).toContain('Hello, Test');
  });
});
