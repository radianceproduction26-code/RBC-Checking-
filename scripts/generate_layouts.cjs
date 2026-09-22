const fs = require('fs');
const jpeg = require('jpeg-js');

if (!fs.existsSync('public/layouts')) fs.mkdirSync('public/layouts', { recursive: true });
if (!fs.existsSync('src/assets/layouts')) fs.mkdirSync('src/assets/layouts', { recursive: true });
if (!fs.existsSync('src/data')) fs.mkdirSync('src/data', { recursive: true });

const raw = fs.readFileSync('public/master_ok_clean.jpg');
const srcImg = jpeg.decode(raw, { useTArray: true });
const sw = srcImg.width;
const sh = srcImg.height;
const sdata = srcImg.data;

const cx = 508;
const cy = 560;

const baseSleeves = [
  { id: 1, name: 'Sleeve 1 (Left Boss)', x: 369, y: 560, r: 28 },
  { id: 2, name: 'Sleeve 2 (Top-Right Boss)', x: 583, y: 442, r: 28 },
  { id: 3, name: 'Sleeve 3 (Bottom-Right Boss)', x: 583, y: 677, r: 28 }
];

const tw = 640;
const th = 640;
const tcx = tw / 2;
const tcy = th / 2;

const layoutConfigs = [
  { id: 'layout_0deg', name: 'Layout 1: 0° Standard Factory', desc: 'Standard mounting fixture orientation (Sleeve 1 at Left 9 o\'clock)', angleDeg: 0, scale: 0.60 },
  { id: 'layout_90deg', name: 'Layout 2: 90° CW Conveyor Feed', desc: 'Conveyor 90° feed position (Sleeve 1 at Top 12 o\'clock)', angleDeg: 90, scale: 0.60 },
  { id: 'layout_180deg', name: 'Layout 3: 180° Inverted', desc: 'Reverse 180° fixture placement (Sleeve 1 at Right 3 o\'clock)', angleDeg: 180, scale: 0.60 },
  { id: 'layout_270deg', name: 'Layout 4: 270° CW Feed', desc: 'Counter-clockwise conveyor orientation (Sleeve 1 at Bottom 6 o\'clock)', angleDeg: 270, scale: 0.60 },
  { id: 'layout_45deg', name: 'Layout 5: 45° Diagonal Tilt', desc: 'Handheld operator tilt at 45° angle', angleDeg: 45, scale: 0.60 },
  { id: 'layout_closeup', name: 'Layout 6: Close-Up Macro (+25%)', desc: 'Close-distance camera positioning focused on sleeve bosses', angleDeg: 0, scale: 0.75 },
  { id: 'layout_standoff', name: 'Layout 7: Wide Standoff (-20%)', desc: 'Far distance / wide camera view showing complete outer shroud', angleDeg: 0, scale: 0.48 }
];

const generatedLayouts = [];

for (const cfg of layoutConfigs) {
  const rad = (cfg.angleDeg * Math.PI) / 180;
  const cosA = Math.cos(rad);
  const sinA = Math.sin(rad);
  const s = cfg.scale;

  const sleevesTransformed = baseSleeves.map(slv => {
    const dx = (slv.x - cx) * s;
    const dy = (slv.y - cy) * s;
    const rx = dx * cosA - dy * sinA;
    const ry = dx * sinA + dy * cosA;
    const tx = tcx + rx;
    const ty = tcy + ry;
    const tr = slv.r * s;

    return {
      id: slv.id,
      name: slv.name,
      pixelX: Math.round(tx),
      pixelY: Math.round(ty),
      pixelRadius: Math.round(tr),
      normX: +(tx / tw).toFixed(4),
      normY: +(ty / th).toFixed(4),
      normRadius: +(tr / tw).toFixed(4),
      nominalAngleDeg: Math.round((Math.atan2(ty - tcy, tx - tcx) * 180 / Math.PI + 360) % 360),
      distanceFromHubNorm: +(Math.hypot(tx - tcx, ty - tcy) / tw).toFixed(4),
      baselineMetrics: {
        metalBrightness: 202,
        edgeDensity: 0.46,
        circularity: 0.91,
        contrastRatio: 4.8
      }
    };
  });

  const outData = new Uint8Array(tw * th * 4);
  const invCos = Math.cos(-rad);
  const invSin = Math.sin(-rad);

  for (let ty = 0; ty < th; ty++) {
    for (let tx = 0; tx < tw; tx++) {
      const odx = tx - tcx;
      const ody = ty - tcy;
      const rox = odx * invCos - ody * invSin;
      const roy = odx * invSin + ody * invCos;
      const sx = cx + rox / s;
      const sy = cy + roy / s;
      const outIdx = (ty * tw + tx) * 4;

      if (sx >= 0 && sx < sw - 1 && sy >= 0 && sy < sh - 1) {
        const x0 = Math.floor(sx);
        const y0 = Math.floor(sy);
        const fx = sx - x0;
        const fy = sy - y0;
        const idx00 = (y0 * sw + x0) * 4;
        const idx10 = (y0 * sw + (x0 + 1)) * 4;
        const idx01 = ((y0 + 1) * sw + x0) * 4;
        const idx11 = ((y0 + 1) * sw + (x0 + 1)) * 4;

        for (let c = 0; c < 3; c++) {
          const top = sdata[idx00 + c] * (1 - fx) + sdata[idx10 + c] * fx;
          const bot = sdata[idx01 + c] * (1 - fx) + sdata[idx11 + c] * fx;
          outData[outIdx + c] = Math.round(top * (1 - fy) + bot * fy);
        }
        outData[outIdx + 3] = 255;
      } else {
        outData[outIdx] = 24;
        outData[outIdx + 1] = 26;
        outData[outIdx + 2] = 30;
        outData[outIdx + 3] = 255;
      }
    }
  }

  // Compress to lightweight JPEG quality 78 (~25-30KB each) to keep memory tiny
  const outJpeg = jpeg.encode({ data: outData, width: tw, height: th }, 78);
  const fileName = cfg.id + '.jpg';
  fs.writeFileSync('public/layouts/' + fileName, outJpeg.data);
  fs.writeFileSync('src/assets/layouts/' + fileName, outJpeg.data);

  const base64Url = 'data:image/jpeg;base64,' + outJpeg.data.toString('base64');

  generatedLayouts.push({
    id: cfg.id,
    name: cfg.name,
    description: cfg.desc,
    rotation: cfg.angleDeg,
    scale: cfg.scale,
    width: tw,
    height: th,
    hub: {
      pixelX: tcx,
      pixelY: tcy,
      normX: +(tcx / tw).toFixed(4),
      normY: +(tcy / th).toFixed(4),
      normRadius: +(180 * s / tw).toFixed(4)
    },
    sleeves: sleevesTransformed,
    interSleeveDistances: {
      d12: +(Math.hypot(sleevesTransformed[0].normX - sleevesTransformed[1].normX, sleevesTransformed[0].normY - sleevesTransformed[1].normY)).toFixed(4),
      d23: +(Math.hypot(sleevesTransformed[1].normX - sleevesTransformed[2].normX, sleevesTransformed[1].normY - sleevesTransformed[2].normY)).toFixed(4),
      d31: +(Math.hypot(sleevesTransformed[2].normX - sleevesTransformed[0].normX, sleevesTransformed[2].normY - sleevesTransformed[0].normY)).toFixed(4)
    },
    imagePath: '/layouts/' + fileName,
    imageBase64: base64Url
  });
}

fs.writeFileSync('src/data/master_layouts_data.json', JSON.stringify(generatedLayouts, null, 2));

const partInfo = {
  partName: 'PA6-GF50 Radiator Fan Shroud',
  material: 'Polyamide 6 with 50% Glass Fiber (>PA6-GF50<)',
  totalSleeves: 3,
  customer: 'Radiance Polymer',
  toleranceRadiusNorm: 0.05,
  hubCenterNorm: { x: 0.5, y: 0.5 },
  geometryInvariants: {
    d12_over_d23: 1.0,
    d31_over_d23: 1.0,
    angularSpacingDeg: [122.5, 115.0, 122.5]
  },
  thresholds: {
    minMetalBrightness: 115,
    minEdgeDensity: 0.22,
    minCircularity: 0.58,
    minFeatureMatches: 8,
    minInlierRatio: 0.35
  }
};

const code = 'export const PART_INFO = ' + JSON.stringify(partInfo, null, 2) + ';\n\n' +
             'export const PRELOADED_LAYOUTS = ' + JSON.stringify(generatedLayouts, null, 2) + ';\n\n' +
             'export default { PART_INFO, PRELOADED_LAYOUTS };\n';

fs.writeFileSync('src/data/defaultMasterPart.js', code);
console.log('Script finished! Saved layouts and defaultMasterPart.js');
