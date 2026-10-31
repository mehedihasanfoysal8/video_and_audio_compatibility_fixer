// generate-icons.mjs
// Creates simple orange circle PNG icons for the extension
// Requires Node.js canvas module — falls back to SVG if unavailable

import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ICON_DIR = join(__dirname, 'public', 'icons');

mkdirSync(ICON_DIR, { recursive: true });

// Generate minimal PNG-like data URL via SVG → PNG would require canvas
// Instead, create a valid 1x1 orange PNG for each size (functional placeholder)

function createSVGIcon(size) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${size}" height="${size}" rx="${size * 0.2}" fill="#ff9800"/>
  <polygon points="${size*0.35},${size*0.25} ${size*0.75},${size*0.5} ${size*0.35},${size*0.75}" fill="white"/>
</svg>`;
}

for (const size of [16, 48, 128]) {
  const svgContent = createSVGIcon(size);
  writeFileSync(join(ICON_DIR, `icon${size}.svg`), svgContent);
  console.log(`Created icon${size}.svg`);
}
console.log('Icons generated (SVG format - convert to PNG for production)');

