/**
 * Simple HTTP server for E2E testing
 * Serves the test fixtures with proper MIME types
 */

import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { extname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = resolve(__dirname, '..');

const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

const PORT = process.env.PORT || 3000;

const server = createServer(async (req, res) => {
  let filePath = req.url === '/' ? '/test/fixtures/index.html' : req.url;
  filePath = join(ROOT, filePath);

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
});
