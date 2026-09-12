// generate-thumbnails.js
// Run with: node generate-thumbnails.js
// (from your project root, where the "public" folder lives)
//
// Reads public/1.png, public/2.jpg, etc. (any of your numbered 1-20
// photos, either extension) and writes small versions to
// public/thumbs/1.jpg, public/thumbs/2.jpg, etc. -- always .jpg output
// regardless of the source extension, since a compressed JPEG thumbnail
// is what you want for a tiny scrolling tile either way.
//
// Re-run this any time you add/replace photos in public/ -- it just
// overwrites the thumbs folder each time, safe to run repeatedly.
//
// Written as an ES module (import/export) since this project's
// package.json has "type": "module" -- Node treats every .js file as an
// ES module by default in that case, so require() isn't available here.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PUBLIC_DIR = path.join(__dirname, 'public');
const THUMBS_DIR = path.join(PUBLIC_DIR, 'thumbs');
const COUNT = 20;
const THUMB_SIZE = 400; // px -- displayed at ~180px, this covers retina screens with room to spare
const THUMB_QUALITY = 72; // JPEG quality -- low enough to be tiny, high enough nobody notices in a 180px tile

async function run() {
  if (!fs.existsSync(THUMBS_DIR)) {
    fs.mkdirSync(THUMBS_DIR, { recursive: true });
  }

  let made = 0;
  let skipped = 0;

  for (let n = 1; n <= COUNT; n++) {
    const pngPath = path.join(PUBLIC_DIR, `${n}.png`);
    const jpgPath = path.join(PUBLIC_DIR, `${n}.jpg`);
    const sourcePath = fs.existsSync(pngPath) ? pngPath : fs.existsSync(jpgPath) ? jpgPath : null;

    if (!sourcePath) {
      skipped++;
      continue;
    }

    const outPath = path.join(THUMBS_DIR, `${n}.jpg`);
    try {
      await sharp(sourcePath)
        .resize(THUMB_SIZE, THUMB_SIZE, { fit: 'cover' })
        .jpeg({ quality: THUMB_QUALITY })
        .toFile(outPath);
      const sourceSize = (fs.statSync(sourcePath).size / 1024).toFixed(0);
      const outSize = (fs.statSync(outPath).size / 1024).toFixed(0);
      console.log(`✓ ${n}: ${sourceSize}KB -> ${outSize}KB`);
      made++;
    } catch (err) {
      console.error(`✗ ${n}: failed -- ${err.message}`);
    }
  }

  console.log(`\nDone. ${made} thumbnails generated, ${skipped} numbers had no photo (fine, skipped).`);
}

run();
