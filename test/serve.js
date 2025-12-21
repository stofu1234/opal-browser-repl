/**
 * Simple HTTP server for E2E testing
 * Serves test fixtures and built extension files from dist/chrome
 */

import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { extname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = resolve(__dirname, '..');
const DIST_DIR = resolve(ROOT, 'dist/chrome');
const FIXTURES_DIR = resolve(__dirname, 'fixtures');

const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

const PORT = process.env.PORT || 4000;

const server = createServer(async (req, res) => {
  let filePath;

  if (req.url === '/') {
    // Serve test fixture index.html
    filePath = join(FIXTURES_DIR, 'index.html');
  } else if (req.url.startsWith('/lib/')) {
    // Serve from dist/chrome/lib (opal.js, opal-parser.js, etc.)
    filePath = join(DIST_DIR, req.url);
  } else if (req.url.startsWith('/popup/')) {
    // Serve popup files from dist/chrome/popup/
    filePath = join(DIST_DIR, req.url);
  } else {
    // Try fixtures first, then dist
    filePath = join(FIXTURES_DIR, req.url);
  }

  try {
    const content = await readFile(filePath);
    const ext = extname(filePath);
    const mimeType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, { 'Content-Type': mimeType });
    res.end(content);
  } catch (err) {
    if (err.code === 'ENOENT') {
      res.writeHead(404);
      res.end('Not Found');
    } else {
      res.writeHead(500);
      res.end('Internal Server Error');
    }
  }
});

server.listen(PORT, () => {
  console.log(`Test server running at http://localhost:${PORT}/`);
  console.log(`Serving fixtures from: ${FIXTURES_DIR}`);
  console.log(`Serving lib from: ${DIST_DIR}/lib`);
});
