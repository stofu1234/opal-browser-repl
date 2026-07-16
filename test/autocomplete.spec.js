/**
 * E2E / unit tests for Opal Browser REPL autocomplete (Phase 1.1)
 *
 * - Parsing tests run the real OpalRepl logic directly in Node (no DOM needed).
 * - Candidate tests drive the real eval code against Opal on the playground page.
 */

import { test, expect } from '@playwright/test';
import { OpalRepl } from '../src/shared/repl/OpalRepl.js';

const PLAYGROUND_URL = 'http://localhost:4000/';

test.describe('Autocomplete - completion context parsing', () => {
  const repl = new OpalRepl({});

  test('detects method completion after a dot', () => {
    const ctx = repl.computeCompletionContext('"foo".up', 8);
    expect(ctx).not.toBeNull();
    expect(ctx.type).toBe('method');
    expect(ctx.receiverExpr).toBe('"foo"');
    expect(ctx.fragment).toBe('up');
    expect(ctx.fragStart).toBe(6);
  });

  test('detects method completion with empty fragment right after dot', () => {
    const ctx = repl.computeCompletionContext('arr.', 4);
    expect(ctx.type).toBe('method');
    expect(ctx.receiverExpr).toBe('arr');
    expect(ctx.fragment).toBe('');
  });

  test('detects constant completion for uppercase token', () => {
    const ctx = repl.computeCompletionContext('Gree', 4);
    expect(ctx.type).toBe('constant');
    expect(ctx.fragment).toBe('Gree');
    expect(ctx.receiverExpr).toBeNull();
  });

  test('detects identifier completion for lowercase token', () => {
    const ctx = repl.computeCompletionContext('myva', 4);
    expect(ctx.type).toBe('identifier');
    expect(ctx.fragment).toBe('myva');
  });

  test('identifier completion with empty fragment (for indentation fallback)', () => {
    const ctx = repl.computeCompletionContext('  ', 2);
    expect(ctx.type).toBe('identifier');
    expect(ctx.fragment).toBe('');
  });

  test('extracts chained receiver expression', () => {
    const ctx = repl.computeCompletionContext('Foo.bar.ba', 10);
    expect(ctx.type).toBe('method');
    expect(ctx.receiverExpr).toBe('Foo.bar');
    expect(ctx.fragment).toBe('ba');
  });

  test('extracts bracketed receiver expression', () => {
    const ctx = repl.computeCompletionContext('arr[0].up', 9);
    expect(ctx.type).toBe('method');
    expect(ctx.receiverExpr).toBe('arr[0]');
    expect(ctx.fragment).toBe('up');
  });

  test('returns null when a dot has no receiver', () => {
    const ctx = repl.computeCompletionContext('.foo', 4);
    expect(ctx).toBeNull();
  });
});

test.describe('Autocomplete - helpers', () => {
  const repl = new OpalRepl({});

  test('commonPrefix finds the longest shared prefix', () => {
    expect(repl.commonPrefix(['map', 'map!', 'max'])).toBe('ma');
    expect(repl.commonPrefix(['upcase'])).toBe('upcase');
    expect(repl.commonPrefix(['a', 'b'])).toBe('');
    expect(repl.commonPrefix([])).toBe('');
  });

  test('receiverLooksSafe rejects method calls', () => {
    expect(repl.receiverLooksSafe('arr')).toBe(true);
    expect(repl.receiverLooksSafe('"str"')).toBe(true);
    expect(repl.receiverLooksSafe('delete_all()')).toBe(false);
    expect(repl.receiverLooksSafe('')).toBe(false);
  });
});

test.describe('Autocomplete - candidate generation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(PLAYGROUND_URL);
    await page.waitForFunction(() => typeof Opal !== 'undefined', { timeout: 10000 });
  });

  function makeRepl(page) {
    return new OpalRepl({ evalFunction: (code) => page.evaluate(code) });
  }

  test('method completion lists instance methods of a string', async ({ page }) => {
    const repl = makeRepl(page);
    const result = await repl.fetchMethodCompletions('"hello"', 'up');
    expect(result.candidates).toContain('upcase');
    // every candidate respects the prefix filter
    expect(result.candidates.every((c) => c.indexOf('up') === 0)).toBe(true);
  });

  test('method completion lists class methods of a constant', async ({ page }) => {
    const repl = makeRepl(page);
    const result = await repl.fetchMethodCompletions('Greeter', 'ne');
    expect(result.candidates).toContain('new');
  });

  test('method completion on a user instance includes its methods', async ({ page }) => {
    await page.evaluate(() => eval(Opal.compile('g = Greeter.new("Test")', { irb: true })));
    const repl = makeRepl(page);
    const result = await repl.fetchMethodCompletions('g', 'gr');
    expect(result.candidates).toContain('greet');
  });

  test('identifier completion includes local variables', async ({ page }) => {
    await page.evaluate(() => eval(Opal.compile('myvar = 42', { irb: true })));
    const repl = makeRepl(page);
    const result = await repl.fetchIdentifierCompletions('my', false);
    expect(result.candidates).toContain('myvar');
  });

  test('identifier completion includes top-level methods', async ({ page }) => {
    const repl = makeRepl(page);
    const result = await repl.fetchIdentifierCompletions('put', false);
    expect(result.candidates).toContain('puts');
  });

  test('constant completion includes class and module names', async ({ page }) => {
    const repl = makeRepl(page);
    const greeter = await repl.fetchIdentifierCompletions('Gre', true);
    expect(greeter.candidates).toContain('Greeter');

    const math = await repl.fetchIdentifierCompletions('Math', true);
    expect(math.candidates).toContain('MathUtils');
  });

  test('completion returns empty list for an unknown prefix', async ({ page }) => {
    const repl = makeRepl(page);
    const result = await repl.fetchIdentifierCompletions('zzz_no_such_thing', false);
    expect(result.candidates).toEqual([]);
  });

  test('method completion excludes Opal method-missing stubs (opal-parser noise)', async ({ page }) => {
    const repl = makeRepl(page);
    // `compile_body` etc. are opal-parser internals present only as stubs on the
    // shared prototype; real objects must not offer them for completion.
    const result = await repl.fetchMethodCompletions('"hello"', 'com');
    expect(result.candidates).not.toContain('compile_body');
    expect(result.candidates).not.toContain('compile');
    // A real String method with the same prefix is still offered
    // (only present in newer cores; assert the stub-free property instead)
    expect(result.candidates.every((c) => c.indexOf('compile_') !== 0)).toBe(true);
  });

  test('identifier completion excludes Opal method-missing stubs', async ({ page }) => {
    const repl = makeRepl(page);
    const result = await repl.fetchIdentifierCompletions('compile_', false);
    // Every candidate would be an opal-parser stub; none should survive
    expect(result.candidates).toEqual([]);
  });
});
