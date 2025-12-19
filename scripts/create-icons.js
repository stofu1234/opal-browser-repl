#!/usr/bin/env node

/**
 * Create simple placeholder icons for the extension
 * Uses pure Node.js to generate PNG files
 */

import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { deflateSync } from 'zlib';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');
const iconsDir = join(projectRoot, 'icons');

// CRC32 calculation
function makeCrcTable() {
  const crcTable = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    crcTable[n] = c;
  }
  return crcTable;
}

const crcTable = makeCrcTable();

function crc32(data) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < data.length; i++) {
    crc = crcTable[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function createChunk(type, data) {
  const typeBytes = Buffer.from(type);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crcData = Buffer.concat([typeBytes, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(crcData), 0);
  return Buffer.concat([length, typeBytes, data, crc]);
}

// Create a simple Opal-themed icon (red gem shape)
function createOpalIcon(size) {
  const data = new Uint8Array(size * size * 4);

  const center = size / 2;
  const radius = size * 0.4;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;

      // Calculate distance from center
      const dx = x - center;
      const dy = y - center;

      // Diamond shape
      const dist = Math.abs(dx) / radius + Math.abs(dy) / radius;

      if (dist <= 1) {
        // Inside the gem
        // Gradient from red to darker red
        const gradient = (y / size);
        data[idx] = Math.round(220 - gradient * 50);     // R
        data[idx + 1] = Math.round(50 + gradient * 30);  // G
        data[idx + 2] = Math.round(50);                   // B
        data[idx + 3] = 255;                              // A

        // Add some shine effect
        if (dx < 0 && dy < 0 && dist < 0.6) {
          data[idx] = Math.min(255, data[idx] + 40);
          data[idx + 1] = Math.min(255, data[idx + 1] + 40);
          data[idx + 2] = Math.min(255, data[idx + 2] + 40);
        }
      } else {
        // Transparent background
        data[idx] = 0;
        data[idx + 1] = 0;
        data[idx + 2] = 0;
        data[idx + 3] = 0;
      }
    }
  }

  return data;
}

function createPNG(size, iconData) {
  const signature = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);

  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // color type (RGBA)
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  // Raw data with filter bytes
  const rawData = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    rawData[y * (size * 4 + 1)] = 0; // filter type: none
    for (let x = 0; x < size; x++) {
      const srcIdx = (y * size + x) * 4;
      const dstIdx = y * (size * 4 + 1) + 1 + x * 4;
      rawData[dstIdx] = iconData[srcIdx];
      rawData[dstIdx + 1] = iconData[srcIdx + 1];
      rawData[dstIdx + 2] = iconData[srcIdx + 2];
      rawData[dstIdx + 3] = iconData[srcIdx + 3];
    }
  }

  const compressed = deflateSync(rawData, { level: 9 });

  return Buffer.concat([
    signature,
    createChunk('IHDR', ihdr),
    createChunk('IDAT', compressed),
    createChunk('IEND', Buffer.alloc(0))
  ]);
}

function main() {
  // Ensure icons directory exists
  if (!existsSync(iconsDir)) {
    mkdirSync(iconsDir, { recursive: true });
  }

  const sizes = [16, 48, 128];

  console.log('Creating icons...');

  for (const size of sizes) {
    const iconData = createOpalIcon(size);
    const png = createPNG(size, iconData);

    const filename = `opal-${size}.png`;
    writeFileSync(join(iconsDir, filename), png);
    console.log(`  Created: ${filename}`);
  }

  console.log('');
  console.log('Icons created successfully!');
}

main();
