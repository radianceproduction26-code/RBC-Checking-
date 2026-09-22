/**
 * Realistic Part Simulator for Radiance Polymer PA6-GF50 3-Sleeve Fan Shroud.
 * Renders the actual factory OK part image with rotation, translation, scaling,
 * and allows turning individual metal sleeves ON / OFF to simulate defect detection.
 */

import { PRELOADED_LAYOUTS } from '../data/defaultMasterPart';

// Preload the factory clean master image
let cachedMasterImage = null;
if (typeof window !== 'undefined') {
  cachedMasterImage = new Image();
  cachedMasterImage.crossOrigin = 'Anonymous';
  cachedMasterImage.src = PRELOADED_LAYOUTS[0]?.imageBase64 || '/master_ok_clean.jpg';
}

export function generatePartImage({
  width = 640,
  height = 480,
  rotation = 0, // degrees
  translateX = 0,
  translateY = 0,
  scale = 1.0,
  sleeves = [
    { id: 1, name: 'Sleeve 1 (Left Boss)', x: 237, y: 320, radius: 18, present: true },
    { id: 2, name: 'Sleeve 2 (Top-Right Boss)', x: 365, y: 249, radius: 18, present: true },
    { id: 3, name: 'Sleeve 3 (Bottom-Right Boss)', x: 365, y: 390, radius: 18, present: true },
  ],
  backgroundType = 'shopfloor', // 'clean' | 'shopfloor'
} = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  // 1. Draw Industrial Inspection Background
  if (backgroundType === 'shopfloor') {
    const bgGrad = ctx.createRadialGradient(width / 2, height / 2, 80, width / 2, height / 2, width * 0.7);
    bgGrad.addColorStop(0, '#f1f5f9');
    bgGrad.addColorStop(1, '#cbd5e1');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);

    // Subtle calibration grid
    ctx.strokeStyle = 'rgba(100, 116, 139, 0.15)';
    ctx.lineWidth = 1;
    for (let x = 0; x < width; x += 32) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = 0; y < height; y += 32) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
  } else {
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, width, height);
  }

  // 2. Transform context for part position & rotation
  ctx.save();
  ctx.translate(width / 2 + translateX, height / 2 + translateY);
  ctx.rotate((rotation * Math.PI) / 180);
  ctx.scale(scale, scale);

  // Center is at (320, 320)
  ctx.translate(-320, -320);

  // 3. Draw Real Part Image if loaded, or render vector fan shroud fallback
  if (cachedMasterImage && cachedMasterImage.complete && cachedMasterImage.naturalWidth > 0) {
    ctx.save();
    ctx.shadowColor = 'rgba(15, 23, 42, 0.35)';
    ctx.shadowBlur = 18;
    ctx.shadowOffsetX = 6;
    ctx.shadowOffsetY = 10;
    ctx.drawImage(cachedMasterImage, 0, 0, 640, 640);
    ctx.restore();
  } else {
    // High-quality vector fallback for PA6-GF50 fan shroud
    ctx.save();
    ctx.shadowColor = 'rgba(15, 23, 42, 0.35)';
    ctx.shadowBlur = 18;
    ctx.beginPath();
    ctx.arc(320, 320, 260, 0, Math.PI * 2);
    ctx.fillStyle = '#1e293b';
    ctx.fill();

    ctx.beginPath();
    ctx.arc(320, 320, 95, 0, Math.PI * 2);
    ctx.fillStyle = '#0f172a';
    ctx.fill();
    ctx.restore();
  }

  // 4. Handle Sleeve Defect Simulation (Missing Sleeves)
  sleeves.forEach((sleeve) => {
    const { x, y, radius, present } = sleeve;

    if (!present) {
      // OVERLAY MISSING SLEEVE DEFECT:
      // Dark empty plastic through-hole / core cavity without metallic bushing
      ctx.save();
      ctx.beginPath();
      ctx.arc(x, y, radius + 3, 0, Math.PI * 2);
      ctx.fillStyle = '#181b20'; // PA6-GF50 black plastic
      ctx.fill();

      // Empty bore hole cavity
      ctx.beginPath();
      ctx.arc(x, y, radius - 2, 0, Math.PI * 2);
      const emptyGrad = ctx.createRadialGradient(x + 2, y + 2, 1, x, y, radius - 2);
      emptyGrad.addColorStop(0, '#06080b'); // deep shadow hole
      emptyGrad.addColorStop(0.7, '#111419');
      emptyGrad.addColorStop(1, '#1f242c');
      ctx.fillStyle = emptyGrad;
      ctx.fill();

      // Tooling ring
      ctx.strokeStyle = '#0a0d12';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Internal pin center
      ctx.beginPath();
      ctx.arc(x, y, radius * 0.40, 0, Math.PI * 2);
      ctx.fillStyle = '#090c10';
      ctx.fill();
      ctx.restore();
    }
  });

  ctx.restore();

  return {
    canvas,
    dataUrl: canvas.toDataURL('image/jpeg', 0.82),
    width,
    height,
    sleeves: sleeves.map((s) => ({
      id: s.id,
      name: s.name,
      x: s.x,
      y: s.y,
      radius: s.radius,
    })),
  };
}

/**
 * Returns the default master part data calibrated for PA6-GF50 Fan Shroud
 */
export function getDefaultMasterPart() {
  const generated = generatePartImage({
    width: 640,
    height: 640,
    rotation: 0,
    translateX: 0,
    translateY: 0,
    backgroundType: 'clean',
    sleeves: [
      { id: 1, name: 'Sleeve 1 (Left Boss)', x: 237, y: 320, radius: 18, present: true },
      { id: 2, name: 'Sleeve 2 (Top-Right Boss)', x: 365, y: 249, radius: 18, present: true },
      { id: 3, name: 'Sleeve 3 (Bottom-Right Boss)', x: 365, y: 390, radius: 18, present: true },
    ],
  });

  return {
    id: 'radiance_pa6_gf50_fan_shroud',
    name: 'Radiance PA6-GF50 Fan Shroud',
    partNumber: 'PA6-GF50-FAN-SHROUD',
    imageUrl: generated.dataUrl,
    width: 640,
    height: 640,
    sleeves: generated.sleeves,
    updatedAt: new Date().toISOString(),
  };
}
