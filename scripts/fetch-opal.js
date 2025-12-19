#!/usr/bin/env node

/**
 * Script to fetch Opal runtime and parser from CDN
 */

import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');

const OPAL_VERSION = '1.8.2';
const CDN_BASE = `https://cdn.opalrb.com/opal/${OPAL_VERSION}`;

const FILES = [
  { name: 'opal.min.js', url: `${CDN_BASE}/opal.min.js` },
  { name: 'opal-parser.min.js', url: `${CDN_BASE}/opal-parser.min.js` }
];

const LIB_DIR = join(projectRoot, 'src', 'shared', 'lib');

async function fetchFile(url) {
  console.log(`Fetching: ${url}`);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  return response.text();
}

async function main() {
  // Ensure lib directory exists
  if (!existsSync(LIB_DIR)) {
    mkdirSync(LIB_DIR, { recursive: true });
  }

  console.log(`Fetching Opal ${OPAL_VERSION} from CDN...`);
  console.log('');

  for (const file of FILES) {
    try {
      const content = await fetchFile(file.url);
      const filePath = join(LIB_DIR, file.name);
      writeFileSync(filePath, content);
      console.log(`  Saved: ${file.name} (${(content.length / 1024).toFixed(1)} KB)`);
    } catch (error) {
      console.error(`  Error fetching ${file.name}: ${error.message}`);
      process.exit(1);
    }
  }

  console.log('');
  console.log('Done! Opal libraries saved to src/shared/lib/');
}

main().catch(console.error);
