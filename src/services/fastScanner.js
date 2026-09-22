/**
 * Ultra-Fast Shop-Floor Metal Sleeve Inspection Engine
 * Runs at 60 FPS directly via optimized Canvas/TypedArray processing with zero delay.
 * Works instantly without waiting for WebAssembly compilation.
 */

export class FastSleeveScanner {
  constructor() {
    this.analysisCanvas = document.createElement('canvas');
    this.analysisCtx = this.analysisCanvas.getContext('2d', { willReadFrequently: true });
    
    // Default 3-sleeve part layout (normalized 0..1 relative to target box)
    this.defaultNormalizedSleeves = [
      { id: 1, nx: 0.30, ny: 0.36, nr: 0.09 }, // Top-Left
      { id: 2, nx: 0.70, ny: 0.36, nr: 0.09 }, // Top-Right
      { id: 3, nx: 0.50, ny: 0.68, nr: 0.09 }, // Bottom-Center
    ];
  }

  /**
   * Fast scan on live video or canvas frame
   */
  scan(sourceElement, options = {}, masterPart = null) {
    const videoW = sourceElement.videoWidth || sourceElement.width;
    const videoH = sourceElement.videoHeight || sourceElement.height;

    if (!videoW || !videoH || videoW <= 0 || videoH <= 0) {
      return {
        status: 'WAITING_FRAME',
        message: 'Waiting for camera feed...',
        sleeves: [],
        partDetected: false,
      };
    }

    // Downscale to 360p for instant 60 FPS pixel analysis
    const sampleW = 360;
    const sampleH = Math.round((videoH / videoW) * 360) || 270;

    if (this.analysisCanvas.width !== sampleW || this.analysisCanvas.height !== sampleH) {
      this.analysisCanvas.width = sampleW;
      this.analysisCanvas.height = sampleH;
    }

    const ctx = this.analysisCtx;
    ctx.drawImage(sourceElement, 0, 0, sampleW, sampleH);

    const imgData = ctx.getImageData(0, 0, sampleW, sampleH);
    const data = imgData.data;

    // Center target box dimensions on the frame
    const boxW = sampleW * 0.82;
    const boxH = sampleH * 0.76;
    const boxLeft = (sampleW - boxW) / 2;
    const boxTop = (sampleH - boxH) / 2;

    const scaleX = videoW / sampleW;
    const scaleY = videoH / sampleH;

    // Detection sensitivity threshold (0.35 - 0.40 is optimal for factory lighting)
    const threshold = options.sleeveConfidenceThreshold ?? 0.38;

    // Determine sleeve locations: use calibrated master sleeves if available
    let sleevesToScan = this.defaultNormalizedSleeves;
    if (masterPart && Array.isArray(masterPart.sleeves) && masterPart.sleeves.length === 3 && masterPart.width && masterPart.height) {
      const mw = masterPart.width;
      const mh = masterPart.height;
      sleevesToScan = masterPart.sleeves.map((s, idx) => ({
        id: s.id || idx + 1,
        nx: s.x / mw,
        ny: s.y / mh,
        nr: s.radius / Math.min(mw, mh),
      }));
    }

    // Sample background plastic brightness around center of part
    let plasticBrightnessSum = 0;
    let plasticSampleCount = 0;
    const bgPoints = [
      { x: Math.round(boxLeft + boxW * 0.5), y: Math.round(boxTop + boxH * 0.48) },
      { x: Math.round(boxLeft + boxW * 0.4), y: Math.round(boxTop + boxH * 0.55) },
      { x: Math.round(boxLeft + boxW * 0.6), y: Math.round(boxTop + boxH * 0.55) },
    ];

    for (const pt of bgPoints) {
      if (pt.x >= 0 && pt.x < sampleW && pt.y >= 0 && pt.y < sampleH) {
        const idx = (pt.y * sampleW + pt.x) * 4;
        plasticBrightnessSum += (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
        plasticSampleCount++;
      }
    }
    const baselinePlasticBrightness = plasticSampleCount > 0 ? plasticBrightnessSum / plasticSampleCount : 45;

    // Inspect each of the 3 target sleeve zones
    const sleevesResult = [];
    let presentCount = 0;

    for (const ns of sleevesToScan) {
      const cx = boxLeft + ns.nx * boxW;
      const cy = boxTop + ns.ny * boxH;
      const r = ns.nr * Math.min(boxW, boxH);

      const evalResult = this.evaluateZone(data, sampleW, sampleH, cx, cy, r, baselinePlasticBrightness);

      const isPresent = evalResult.confidence >= threshold;
      if (isPresent) presentCount++;

      sleevesResult.push({
        id: ns.id,
        x: cx * scaleX,
        y: cy * scaleY,
        radius: Math.max(18, r * ((scaleX + scaleY) / 2)),
        present: isPresent,
        confidence: Math.round(evalResult.confidence * 100),
        details: evalResult,
      });
    }

    const allPresent = presentCount === 3;
    const missingCount = 3 - presentCount;

    // Part detected if there are sleeves or part contrast in target zone
    const partInView = presentCount > 0 || sleevesResult.some((s) => s.confidence > 25);

    const status = allPresent ? 'PASS' : 'FAIL';

    return {
      status,
      message: allPresent 
        ? 'PASS - All 3 Sleeves Present' 
        : `FAIL - ${missingCount} Missing Sleeve${missingCount > 1 ? 's' : ''} Detected`,
      sleeves: sleevesResult,
      partDetected: partInView,
      allPresent,
      missingCount,
      presentCount,
      targetBox: {
        x: boxLeft * scaleX,
        y: boxTop * scaleY,
        width: boxW * scaleX,
        height: boxH * scaleY,
      },
    };
  }

  /**
   * Fast annular evaluation of metal sleeve presence
   */
  evaluateZone(data, width, height, cx, cy, radius, baselinePlastic) {
    const rInt = Math.max(6, Math.round(radius));
    const minR = Math.round(rInt * 0.40);
    const maxR = Math.round(rInt * 1.20);

    let ringPixels = 0;
    let ringBrightnessSum = 0;
    let metallicPixelCount = 0;
    let maxSpecular = 0;

    let centerPixels = 0;
    let centerBrightnessSum = 0;

    for (let dy = -maxR; dy <= maxR; dy += 2) {
      for (let dx = -maxR; dx <= maxR; dx += 2) {
        const dist = Math.hypot(dx, dy);
        const px = Math.round(cx + dx);
        const py = Math.round(cy + dy);

        if (px < 0 || px >= width || py < 0 || py >= height) continue;

        const idx = (py * width + px) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        const brightness = (r + g + b) / 3;

        if (dist >= minR && dist <= maxR) {
          ringPixels++;
          ringBrightnessSum += brightness;

          if (brightness > maxSpecular) {
            maxSpecular = brightness;
          }

          // Brass golden hue: Red & Green prominent, Blue lower
          const isBrass = (r > b + 12 && g > b + 6 && r > 55);
          // Steel/metallic specular sheen:
          const isSpecular = (brightness > 120 && Math.abs(r - g) < 40 && brightness > baselinePlastic + 15);

          if (isBrass || isSpecular) {
            metallicPixelCount++;
          }
        } else if (dist < minR * 0.6) {
          centerPixels++;
          centerBrightnessSum += brightness;
        }
      }
    }

    const avgRingBrightness = ringPixels > 0 ? ringBrightnessSum / ringPixels : 0;
    const avgCenterBrightness = centerPixels > 0 ? centerBrightnessSum / centerPixels : 0;
    const metallicRatio = ringPixels > 0 ? metallicPixelCount / ringPixels : 0;

    // Contrast between metallic ring and inner hole / surrounding dark plastic
    const contrastVsPlastic = Math.max(0, avgRingBrightness - baselinePlastic) / 160;
    const annularContrast = Math.max(0, avgRingBrightness - avgCenterBrightness) / 160;

    // Combined presence score [0..1]
    const confidence = Math.min(
      1.0,
      (metallicRatio * 0.50) +
      (contrastVsPlastic * 0.25) +
      (annularContrast * 0.15) +
      (Math.min(1.0, maxSpecular / 180) * 0.10)
    );

    return {
      confidence,
      metallicRatio: Math.round(metallicRatio * 100),
      avgRingBrightness: Math.round(avgRingBrightness),
      maxSpecular,
    };
  }
}
