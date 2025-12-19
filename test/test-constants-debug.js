// Debug constants capture timing
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

console.log('=== Step 1: Load opal.js only ===');
const opalScript = window.document.createElement('script');
opalScript.textContent = opalJs;
window.document.body.appendChild(opalScript);

console.log('Opal loaded:', typeof window.Opal !== 'undefined');
const constCountAfterOpal = Object.keys(window.Opal.Object.$$const || {}).length;
console.log('Constants after opal.js:', constCountAfterOpal);
console.log('Sample constants:', Object.keys(window.Opal.Object.$$const || {}).slice(0, 10));

console.log('\n=== Step 2: Load opal-parser.js ===');
const parserScript = window.document.createElement('script');
parserScript.textContent = opalParserJs;
window.document.body.appendChild(parserScript);

const constCountAfterParser = Object.keys(window.Opal.Object.$$const || {}).length;
console.log('Constants after opal-parser.js:', constCountAfterParser);
console.log('New constants added by parser:', constCountAfterParser - constCountAfterOpal);

// Check which constants were added by parser
const parserAddedConstants = [];
const allConstants = Object.keys(window.Opal.Object.$$const || {});
console.log('\nConstants that might be from parser:');
const parserRelated = ['AST', 'Parser', 'Racc', 'ParseError', 'Set', 'Pathname', 'File', 'Struct', 'JSON', 'Date', 'Base64', 'PackUnpack'];
for (const c of parserRelated) {
  if (window.Opal.Object.$$const[c]) {
    console.log(`  ${c}: present`);
  }
}

console.log('\n=== Step 3: Capture base state NOW ===');
window.__opalReplBaseConstants__ = {};
const keys = Object.keys(window.Opal.Object.$$const);
for (const k of keys) {
  window.__opalReplBaseConstants__[k] = true;
}
console.log('Base constants captured:', Object.keys(window.__opalReplBaseConstants__).length);

console.log('\n=== Step 4: Define HOGE constant ===');
const hogeCompiled = window.Opal.compile('HOGE = "hoge"', {irb: true});
const hogeScript = window.document.createElement('script');
hogeScript.textContent = hogeCompiled;
window.document.body.appendChild(hogeScript);

console.log('\n=== Step 5: Check new constants ===');
const newConstants = [];
const currentConstants = Object.keys(window.Opal.Object.$$const);
for (const k of currentConstants) {
  if (!window.__opalReplBaseConstants__[k]) {
    newConstants.push(k);
  }
}
console.log('New constants found:', newConstants);
console.log('Total constants now:', currentConstants.length);

// Check if HOGE is in base
console.log('HOGE in base constants:', !!window.__opalReplBaseConstants__['HOGE']);
console.log('HOGE exists now:', !!window.Opal.Object.$$const['HOGE']);
