// Test ls command logic directly with jsdom
import { JSDOM } from 'jsdom';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read Opal files
const opalJs = fs.readFileSync(path.join(__dirname, '../dist/chrome/lib/opal.js'), 'utf-8');
const opalParserJs = fs.readFileSync(path.join(__dirname, '../dist/chrome/lib/opal-parser.js'), 'utf-8');

// Create DOM environment
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
  runScripts: 'dangerously'
});

const { window } = dom;

// Execute Opal in the window context
const script = window.document.createElement('script');
script.textContent = opalJs + '\n' + opalParserJs;
window.document.body.appendChild(script);

console.log('Opal loaded:', typeof window.Opal !== 'undefined');
console.log('Opal.top:', typeof window.Opal.top);

// Capture base methods from Opal.Object.$$prototype (where def adds methods)
window.__opalReplBaseMethods__ = {};
if (window.Opal.Object && window.Opal.Object.$$prototype) {
  const keys = Object.getOwnPropertyNames(window.Opal.Object.$$prototype);
  for (const k of keys) {
    if (k.startsWith('$')) window.__opalReplBaseMethods__[k] = true;
  }
}
console.log('Base methods captured from Object.$$prototype:', Object.keys(window.__opalReplBaseMethods__).length);

// Capture base constants from Opal.Object.$$const
window.__opalReplBaseConstants__ = {};
if (window.Opal.Object && window.Opal.Object.$$const) {
  const keys = Object.keys(window.Opal.Object.$$const);
  for (const k of keys) {
    window.__opalReplBaseConstants__[k] = true;
  }
}
console.log('Base constants captured:', Object.keys(window.__opalReplBaseConstants__).length);

// Define a method using Opal IRB mode
console.log('\n--- Defining method b ---');
const compiled = window.Opal.compile('def b; 4; end', {irb: true});
console.log('Compiled code (first 200 chars):');
console.log(compiled.substring(0, 200));

// Execute in window context
const evalScript = window.document.createElement('script');
evalScript.textContent = compiled;
window.document.body.appendChild(evalScript);

// Check where the method ended up
console.log('\n--- Checking method location ---');
console.log('typeof Opal.top.$b:', typeof window.Opal.top.$b);
console.log('typeof Opal.Object.$$prototype.$b:', typeof window.Opal.Object.$$prototype.$b);
console.log('$b in __opalReplBaseMethods__:', !!window.__opalReplBaseMethods__['$b']);

// List new methods
console.log('\n--- Checking for new methods on Opal.top ---');
const baseMethods = window.__opalReplBaseMethods__;
const main = window.Opal.top;
const newMethods = [];

if (main) {
  const mainKeys = Object.getOwnPropertyNames(main);
  console.log('Total keys on Opal.top:', mainKeys.length);
  console.log('Keys starting with $:', mainKeys.filter(k => k.startsWith('$')).length);

  for (const key of mainKeys) {
    if (key.startsWith('$') && typeof main[key] === 'function' && !baseMethods[key]) {
      newMethods.push(key);
    }
  }
}

console.log('New methods found on Opal.top:', newMethods);

// Check Object.$$prototype
console.log('\n--- Checking Opal.Object.$$prototype ---');
const objProto = window.Opal.Object.$$prototype;
const protoNewMethods = [];
const protoKeys = Object.getOwnPropertyNames(objProto);
console.log('Total keys on Object.$$prototype:', protoKeys.length);

for (const key of protoKeys) {
  if (key.startsWith('$') && typeof objProto[key] === 'function' && !baseMethods[key]) {
    protoNewMethods.push(key);
  }
}
console.log('New methods on Object.$$prototype:', protoNewMethods);

// Test constants
console.log('\n--- Testing constants ---');
const constCompiled = window.Opal.compile('HOGE = "hoge"', {irb: true});
const constScript = window.document.createElement('script');
constScript.textContent = constCompiled;
window.document.body.appendChild(constScript);

// Check for new constants
const baseConstants = window.__opalReplBaseConstants__;
const newConstants = [];
if (window.Opal.Object && window.Opal.Object.$$const) {
  const constKeys = Object.keys(window.Opal.Object.$$const);
  for (const key of constKeys) {
    if (!baseConstants[key]) {
      newConstants.push(key);
    }
  }
}
console.log('New constants found:', newConstants);
console.log('HOGE in baseConstants:', !!baseConstants['HOGE']);
