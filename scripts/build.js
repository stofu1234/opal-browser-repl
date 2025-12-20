#!/usr/bin/env node

/**
 * Build script for Opal Browser REPL extension
 * Assembles browser-specific distributions from shared and browser-specific code
 */

import { copyFileSync, mkdirSync, existsSync, readdirSync, statSync, readFileSync, writeFileSync, rmSync } from 'fs';
import { dirname, join, basename } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');
const srcDir = join(projectRoot, 'src');
const distDir = join(projectRoot, 'dist');

// Parse command line arguments
const args = process.argv.slice(2);
const targetArg = args.find(a => a.startsWith('--target='));
const target = targetArg ? targetArg.split('=')[1] : 'all';
const watchMode = args.includes('--watch');

/**
 * Recursively copy directory
 */
function copyDir(src, dest) {
  if (!existsSync(src)) return;

  mkdirSync(dest, { recursive: true });

  for (const entry of readdirSync(src)) {
    const srcPath = join(src, entry);
    const destPath = join(dest, entry);

    if (statSync(srcPath).isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      copyFileSync(srcPath, destPath);
    }
  }
}

/**
 * Copy file if it exists
 */
function copyIfExists(src, dest) {
  if (existsSync(src)) {
    mkdirSync(dirname(dest), { recursive: true });
    copyFileSync(src, dest);
    return true;
  }
  return false;
}

/**
 * Process panel.js to bundle with shared modules
 * For simplicity, we inline the imports
 */
function bundlePanelJs(browserDir, outputDir) {
  const panelJsPath = join(browserDir, 'panel.js');
  if (!existsSync(panelJsPath)) return;

  let panelJs = readFileSync(panelJsPath, 'utf-8');

  // Read the shared OpalRepl module
  const replModulePath = join(srcDir, 'shared', 'repl', 'OpalRepl.js');
  if (existsSync(replModulePath)) {
    let replModule = readFileSync(replModulePath, 'utf-8');

    // Remove export statements from the module
    replModule = replModule.replace(/^export\s+default\s+\w+;\s*$/gm, ''); // Remove "export default X;"
    replModule = replModule.replace(/^export\s+(class|const|function)/gm, '$1'); // export class -> class
    replModule = replModule.replace(/^export\s+\{[^}]*\};?\s*$/gm, ''); // Remove "export { ... };"

    // Remove import statement from panel.js and prepend the module
    panelJs = panelJs.replace(/^import\s+\{[^}]*\}\s+from\s+['"][^'"]*['"];?\s*$/gm, '');

    // Combine
    const bundled = `// Bundled Opal REPL\n\n${replModule}\n\n${panelJs}`;

    const outputPath = join(outputDir, 'panel', 'panel.js');
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, bundled);
    console.log(`  Bundled: panel/panel.js`);
  }
}

/**
 * Build for Chrome
 */
function buildChrome() {
  console.log('Building Chrome extension...');
  const chromeDistDir = join(distDir, 'chrome');

  // Clean
  if (existsSync(chromeDistDir)) {
    rmSync(chromeDistDir, { recursive: true });
  }
  mkdirSync(chromeDistDir, { recursive: true });

  const chromeSrcDir = join(srcDir, 'chrome');
  const sharedDir = join(srcDir, 'shared');

  // Copy manifest.json
  copyIfExists(join(chromeSrcDir, 'manifest.json'), join(chromeDistDir, 'manifest.json'));
  console.log('  Copied: manifest.json');

  // Copy devtools files
  copyIfExists(join(chromeSrcDir, 'devtools.html'), join(chromeDistDir, 'devtools.html'));
  copyIfExists(join(chromeSrcDir, 'devtools.js'), join(chromeDistDir, 'devtools.js'));
  console.log('  Copied: devtools.html, devtools.js');

  // Copy panel UI files
  const panelDir = join(chromeDistDir, 'panel');
  mkdirSync(panelDir, { recursive: true });
  copyIfExists(join(sharedDir, 'ui', 'panel.html'), join(panelDir, 'panel.html'));
  copyIfExists(join(sharedDir, 'ui', 'panel.css'), join(panelDir, 'panel.css'));
  console.log('  Copied: panel/panel.html, panel/panel.css');

  // Bundle panel.js with shared modules
  bundlePanelJs(chromeSrcDir, chromeDistDir);

  // Copy popup UI files
  const popupDir = join(chromeDistDir, 'popup');
  mkdirSync(popupDir, { recursive: true });
  copyIfExists(join(sharedDir, 'ui', 'popup.html'), join(popupDir, 'popup.html'));
  copyIfExists(join(sharedDir, 'ui', 'popup.css'), join(popupDir, 'popup.css'));
  copyIfExists(join(sharedDir, 'ui', 'popup.js'), join(popupDir, 'popup.js'));
  console.log('  Copied: popup/popup.html, popup.css, popup.js');

  // Copy Opal libraries
  const libSrcDir = join(sharedDir, 'lib');
  const libDestDir = join(chromeDistDir, 'lib');
  if (existsSync(libSrcDir)) {
    copyDir(libSrcDir, libDestDir);
    console.log('  Copied: lib/opal.js, lib/opal-parser.js, lib/native.js');
  } else {
    console.log('  Warning: lib/ not found. Run "npm run build-opal" first.');
  }

  // Copy icons
  const iconsSrcDir = join(projectRoot, 'icons');
  const iconsDestDir = join(chromeDistDir, 'icons');
  if (existsSync(iconsSrcDir)) {
    copyDir(iconsSrcDir, iconsDestDir);
    console.log('  Copied: icons/');
  }

  console.log(`  Output: dist/chrome/`);
  console.log('');
}

/**
 * Build for Edge (Chromium-based, same as Chrome with different manifest)
 */
function buildEdge() {
  console.log('Building Edge extension...');
  const edgeDistDir = join(distDir, 'edge');

  // Clean
  if (existsSync(edgeDistDir)) {
    rmSync(edgeDistDir, { recursive: true });
  }
  mkdirSync(edgeDistDir, { recursive: true });

  const edgeSrcDir = join(srcDir, 'edge');
  const chromeSrcDir = join(srcDir, 'chrome');
  const sharedDir = join(srcDir, 'shared');

  // Copy Edge-specific manifest.json
  copyIfExists(join(edgeSrcDir, 'manifest.json'), join(edgeDistDir, 'manifest.json'));
  console.log('  Copied: manifest.json');

  // Copy devtools files (same as Chrome)
  copyIfExists(join(chromeSrcDir, 'devtools.html'), join(edgeDistDir, 'devtools.html'));
  copyIfExists(join(chromeSrcDir, 'devtools.js'), join(edgeDistDir, 'devtools.js'));
  console.log('  Copied: devtools.html, devtools.js');

  // Copy panel UI files
  const panelDir = join(edgeDistDir, 'panel');
  mkdirSync(panelDir, { recursive: true });
  copyIfExists(join(sharedDir, 'ui', 'panel.html'), join(panelDir, 'panel.html'));
  copyIfExists(join(sharedDir, 'ui', 'panel.css'), join(panelDir, 'panel.css'));
  console.log('  Copied: panel/panel.html, panel/panel.css');

  // Bundle panel.js with shared modules (reuse Chrome's panel.js)
  bundlePanelJs(chromeSrcDir, edgeDistDir);

  // Copy popup UI files
  const popupDir = join(edgeDistDir, 'popup');
  mkdirSync(popupDir, { recursive: true });
  copyIfExists(join(sharedDir, 'ui', 'popup.html'), join(popupDir, 'popup.html'));
  copyIfExists(join(sharedDir, 'ui', 'popup.css'), join(popupDir, 'popup.css'));
  copyIfExists(join(sharedDir, 'ui', 'popup.js'), join(popupDir, 'popup.js'));
  console.log('  Copied: popup/popup.html, popup.css, popup.js');

  // Copy Opal libraries
  const libSrcDir = join(sharedDir, 'lib');
  const libDestDir = join(edgeDistDir, 'lib');
  if (existsSync(libSrcDir)) {
    copyDir(libSrcDir, libDestDir);
    console.log('  Copied: lib/opal.js, lib/opal-parser.js, lib/native.js');
  } else {
    console.log('  Warning: lib/ not found. Run "npm run build-opal" first.');
  }

  // Copy icons
  const iconsSrcDir = join(projectRoot, 'icons');
  const iconsDestDir = join(edgeDistDir, 'icons');
  if (existsSync(iconsSrcDir)) {
    copyDir(iconsSrcDir, iconsDestDir);
    console.log('  Copied: icons/');
  }

  console.log(`  Output: dist/edge/`);
  console.log('');
}

/**
 * Build for Firefox (Manifest V2)
 */
function buildFirefox() {
  console.log('Building Firefox extension...');
  const firefoxDistDir = join(distDir, 'firefox');

  // Clean
  if (existsSync(firefoxDistDir)) {
    rmSync(firefoxDistDir, { recursive: true });
  }
  mkdirSync(firefoxDistDir, { recursive: true });

  const firefoxSrcDir = join(srcDir, 'firefox');
  const sharedDir = join(srcDir, 'shared');

  // Copy Firefox-specific manifest.json
  copyIfExists(join(firefoxSrcDir, 'manifest.json'), join(firefoxDistDir, 'manifest.json'));
  console.log('  Copied: manifest.json');

  // Copy Firefox-specific devtools files
  copyIfExists(join(firefoxSrcDir, 'devtools.html'), join(firefoxDistDir, 'devtools.html'));
  // If Firefox has its own devtools.html, use it; otherwise use Chrome's
  if (!existsSync(join(firefoxSrcDir, 'devtools.html'))) {
    copyIfExists(join(srcDir, 'chrome', 'devtools.html'), join(firefoxDistDir, 'devtools.html'));
  }
  copyIfExists(join(firefoxSrcDir, 'devtools.js'), join(firefoxDistDir, 'devtools.js'));
  console.log('  Copied: devtools.html, devtools.js');

  // Copy panel UI files
  const panelDir = join(firefoxDistDir, 'panel');
  mkdirSync(panelDir, { recursive: true });
  copyIfExists(join(sharedDir, 'ui', 'panel.html'), join(panelDir, 'panel.html'));
  copyIfExists(join(sharedDir, 'ui', 'panel.css'), join(panelDir, 'panel.css'));
  console.log('  Copied: panel/panel.html, panel/panel.css');

  // Bundle Firefox-specific panel.js with shared modules
  bundlePanelJs(firefoxSrcDir, firefoxDistDir);

  // Copy popup UI files
  const popupDir = join(firefoxDistDir, 'popup');
  mkdirSync(popupDir, { recursive: true });
  copyIfExists(join(sharedDir, 'ui', 'popup.html'), join(popupDir, 'popup.html'));
  copyIfExists(join(sharedDir, 'ui', 'popup.css'), join(popupDir, 'popup.css'));
  copyIfExists(join(sharedDir, 'ui', 'popup.js'), join(popupDir, 'popup.js'));
  console.log('  Copied: popup/popup.html, popup.css, popup.js');

  // Copy Opal libraries
  const libSrcDir = join(sharedDir, 'lib');
  const libDestDir = join(firefoxDistDir, 'lib');
  if (existsSync(libSrcDir)) {
    copyDir(libSrcDir, libDestDir);
    console.log('  Copied: lib/opal.js, lib/opal-parser.js, lib/native.js');
  } else {
    console.log('  Warning: lib/ not found. Run "npm run build-opal" first.');
  }

  // Copy icons
  const iconsSrcDir = join(projectRoot, 'icons');
  const iconsDestDir = join(firefoxDistDir, 'icons');
  if (existsSync(iconsSrcDir)) {
    copyDir(iconsSrcDir, iconsDestDir);
    console.log('  Copied: icons/');
  }

  console.log(`  Output: dist/firefox/`);
  console.log('');
}

/**
 * Main build function
 */
function build() {
  console.log('Opal Browser REPL - Build');
  console.log('========================');
  console.log('');

  if (target === 'all' || target === 'chrome') {
    buildChrome();
  }

  if (target === 'all' || target === 'edge') {
    buildEdge();
  }

  if (target === 'all' || target === 'firefox') {
    buildFirefox();
  }

  console.log('Build complete!');
}

// Run build
build();

// Watch mode (simple polling)
if (watchMode) {
  console.log('');
  console.log('Watching for changes... (Ctrl+C to stop)');

  const { watch } = await import('fs');

  const watchDirs = [
    join(srcDir, 'shared'),
    join(srcDir, 'chrome'),
    join(srcDir, 'edge'),
    join(srcDir, 'firefox')
  ];

  for (const dir of watchDirs) {
    if (existsSync(dir)) {
      watch(dir, { recursive: true }, (eventType, filename) => {
        console.log(`Change detected: ${filename}`);
        build();
      });
    }
  }
}
