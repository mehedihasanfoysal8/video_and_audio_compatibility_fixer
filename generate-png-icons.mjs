// Creates actual PNG icon files using pure JS (no canvas dependency)
// Uses a minimal PNG encoder to produce valid icons

import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));

function writePNG(filename, size) {
  // Create RGBA pixel data for an orange circle with play triangle
  const pixels = new Uint8Array(size * size * 4);
  const cx = size / 2, cy = size / 2, r = size * 0.48;
  const rounding = size * 0.2;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const rx = Math.min(x, size - 1 - x);
      const ry = Math.min(y, size - 1 - y);
      const inRounded = rx >= rounding || ry >= rounding ||
        Math.sqrt((rx - rounding) ** 2 + (ry - rounding) ** 2) <= rounding;

      if (inRounded) {
        // Orange background
        pixels[i] = 255;   // R
        pixels[i+1] = 152; // G
        pixels[i+2] = 0;   // B
        pixels[i+3] = 255; // A

        // White play triangle
        const tx = x / size, ty = y / size;
        const inTriangle = tx >= 0.3 && tx <= 0.75 &&
          ty >= 0.25 + (tx - 0.3) * 0.5 && ty <= 0.75 - (tx - 0.3) * 0.5;
        if (inTriangle) {
          pixels[i] = 255;
          pixels[i+1] = 255;
          pixels[i+2] = 255;
        }
      }
    }
  }

  // Minimal PNG encoder
  const png = encodePNG(pixels, size, size);
  writeFileSync(filename, png);
}

function encodePNG(pixels, width, height) {
  const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  
  function chunk(type, data) {
    const t = Buffer.from(type);
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const crcBuf = Buffer.concat([t, data]);
    const crc = crc32(crcBuf);
    const crcOut = Buffer.alloc(4);
    crcOut.writeUInt32BE(crc >>> 0);
    return Buffer.concat([len, t, data, crcOut]);
  }
  
  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 2;  // color type RGB
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  // Convert RGBA to RGB and add filter bytes
  const rows = [];
  for (let y = 0; y < height; y++) {
    const row = Buffer.alloc(1 + width * 3);
    row[0] = 0; // filter type None
    for (let x = 0; x < width; x++) {
      const si = (y * width + x) * 4;
      const di = 1 + x * 3;
      // Alpha blend onto black background
      const a = pixels[si + 3] / 255;
      row[di] = Math.round(pixels[si] * a);
      row[di+1] = Math.round(pixels[si+1] * a);
      row[di+2] = Math.round(pixels[si+2] * a);
    }
    rows.push(row);
  }

  const rawData = Buffer.concat(rows);
  const compressed = deflate(rawData);
  
  return Buffer.concat([
    SIGNATURE,
    chunk('IHDR', ihdr),
    chunk('IDAT', compressed),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// Simple CRC32
function crc32(buf) {
  let crc = -1;
  for (let i = 0; i < buf.length; i++) {
    let b = (crc ^ buf[i]) & 0xFF;
    for (let j = 0; j < 8; j++) {
      b = (b & 1) ? (0xEDB88320 ^ (b >>> 1)) : (b >>> 1);
    }
    crc = (crc >>> 8) ^ b;
  }
  return (crc ^ -1) >>> 0;
}

// Minimal deflate using Node.js zlib
import { deflateSync } from 'zlib';
function deflate(data) {
  return deflateSync(data, { level: 6 });
}

const ICON_DIR = join(__dirname, 'public', 'icons');
for (const size of [16, 48, 128]) {
  const filename = join(ICON_DIR, `icon${size}.png`);
  writePNG(filename, size);
  console.log(`Created ${filename} (${size}x${size})`);
}
console.log('PNG icons created successfully.');
