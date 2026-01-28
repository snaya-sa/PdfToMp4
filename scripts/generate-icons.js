// Simple script to generate PWA icons from SVG
// Run with: node scripts/generate-icons.js

import { writeFileSync, readFileSync } from 'fs';
import { createCanvas, loadImage } from 'canvas';

const sizes = [192, 512];
const svgPath = './public/favicon.svg';

async function generateIcons() {
  try {
    const canvas = createCanvas(512, 512);
    const ctx = canvas.getContext('2d');

    // Draw gradient background
    const gradient = ctx.createLinearGradient(0, 0, 512, 512);
    gradient.addColorStop(0, '#6366f1');
    gradient.addColorStop(1, '#8b5cf6');

    // Rounded rectangle
    const radius = 100;
    ctx.beginPath();
    ctx.roundRect(0, 0, 512, 512, radius);
    ctx.fillStyle = gradient;
    ctx.fill();

    // Draw PDF icon (left side)
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath();
    ctx.roundRect(100, 75, 130, 165, 15);
    ctx.fill();

    // PDF lines
    ctx.fillStyle = '#6366f1';
    ctx.fillRect(125, 110, 80, 12);
    ctx.fillRect(125, 135, 60, 12);
    ctx.fillRect(125, 160, 80, 12);
    ctx.fillRect(125, 185, 45, 12);

    // Arrow
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 20;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(256, 230);
    ctx.lineTo(256, 310);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(210, 265);
    ctx.lineTo(256, 230);
    ctx.lineTo(302, 265);
    ctx.stroke();

    // Video icon (right side)
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath();
    ctx.roundRect(282, 270, 130, 165, 15);
    ctx.fill();

    // Play button
    ctx.fillStyle = '#6366f1';
    ctx.beginPath();
    ctx.moveTo(320, 315);
    ctx.lineTo(320, 400);
    ctx.lineTo(395, 357);
    ctx.closePath();
    ctx.fill();

    for (const size of sizes) {
      const resizedCanvas = createCanvas(size, size);
      const resizedCtx = resizedCanvas.getContext('2d');
      resizedCtx.drawImage(canvas, 0, 0, size, size);

      const buffer = resizedCanvas.toBuffer('image/png');
      writeFileSync(`./public/icons/icon-${size}.png`, buffer);
      console.log(`Created icon-${size}.png`);
    }

    console.log('Icons generated successfully!');
  } catch (error) {
    console.error('Error generating icons:', error);
    console.log('Creating placeholder icons...');
    createPlaceholderIcons();
  }
}

function createPlaceholderIcons() {
  // Create minimal valid PNG files as placeholders
  // These are 1x1 pixel purple PNGs, will work but should be replaced
  const purplePixelPNG = Buffer.from([
    0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, // PNG signature
    0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52, // IHDR chunk
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, // 1x1
    0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
    0xDE, 0x00, 0x00, 0x00, 0x0C, 0x49, 0x44, 0x41,
    0x54, 0x08, 0xD7, 0x63, 0x68, 0x66, 0xF8, 0x0F,
    0x00, 0x01, 0x04, 0x01, 0x00, 0x18, 0xDD, 0x8D,
    0xB4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E,
    0x44, 0xAE, 0x42, 0x60, 0x82
  ]);

  sizes.forEach(size => {
    writeFileSync(`./public/icons/icon-${size}.png`, purplePixelPNG);
    console.log(`Created placeholder icon-${size}.png (replace with proper icons)`);
  });
}

generateIcons();
