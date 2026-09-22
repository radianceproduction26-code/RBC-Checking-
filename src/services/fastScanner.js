/**
 * Ultra-Fast Shop-Floor Metal Sleeve Inspection Engine
 * Calibrated for Radiance Polymer PA6-GF50 3-Sleeve Fan Shroud.
 * Runs at 60 FPS directly via optimized Canvas/TypedArray processing with zero delay.
 * Includes instant 360° rotational peak detection around central hub.
 */

export class FastSleeveScanner {
  constructor() {
    this.analysisCanvas = document.createElement('canvas');
    this.analysisCtx = this.analysisCanvas.getContext('2d', { willReadFrequently: true });

    // Calibrated 3-sleeve positions for PA6-GF50 cooling fan shroud
    // Hub Center at (0.50, 0.50)
    this.nominalHub = { nx: 0.50, ny: 0.50 };
    this.nominalRadius = 0.135; // distance from hub center to sleeve centers

    // Sleeve nominal angular offsets from hub center:
    // Sleeve 1: 180° (Left boss)
    // Sleeve 2: 302.5° (Top-Right boss)
    // Sleeve 3: 57.5° (Bottom-Right boss)
    this.nominalAnglesDeg = [180, 302.5, 57.5];

    this.defaultNormalizedSleeves = [
      { id: 1, name: 'Sleeve 1 (Left Boss)', nx: 0.3697, ny: 0.5000, nr: 0.038, angleDeg: 180 },
      { id: 2, name: 'Sleeve 2 (Top-Right Boss)', nx: 0.5703, ny: 0.3894, nr: 0.038, angleDeg: 302.5 },
      { id: 3, name: 'Sleeve 3 (Bottom-Right Boss)', nx: 0.5703, ny: 0.6097, nr: 0.038, angleDeg: 57.5 },
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

    // Center target inspection box
    const boxW = sampleW * 0.84;
    const boxH = sampleH * 0.80;
    const boxLeft = (sampleW - boxW) / 2;
    const boxTop = (sampleH - boxH) / 2;
    const boxCx = boxLeft + boxW * 0.5;
    const boxCy = boxTop + boxH * 0.5;

    const scaleX = videoW / sampleW;
    const scaleY = videoH / sampleH;

    // Detection threshold (0.35 - 0.40 optimal for shop-floor ambient light)
    const threshold = options.sleeveConfidenceThreshold ?? 0.38;

    // 1. Measure baseline PA6-GF50 black plastic brightness at central hub
    let plasticBrightnessSum = 0;
    let plasticSampleCount = 0;
    const hubSampleRadius = boxW * 0.06;
    for (let dy = -hubSampleRadius; dy <= hubSampleRadius; dy += 4) {
      for (let dx = -hubSampleRadius; dx <= hubSampleRadius; dx += 4) {
        const px = Math.round(boxCx + dx);
        const py = Math.round(boxCy + dy);
        if (px >= 0 && px < sampleW && py >= 0 && py < sampleH) {
          const idx = (py * sampleW + px) * 4;
          plasticBrightnessSum += (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
          plasticSampleCount++;
        }
      }
    }
    const baselinePlastic = plasticSampleCount > 0 ? plasticBrightnessSum / plasticSampleCount : 35;

    // 2. High-speed 360° Rotational Angle Alignment
    // Scan circular sleeve ring around hub to find part rotation orientation
    const ringRadiusPx = this.nominalRadius * boxW;
    let bestRotAngle = 0;
    let maxRotScore = -1;

    for (let angle = 0; angle < 360; angle += 10) {
      let scoreSum = 0;
      for (const na of this.nominalAnglesDeg) {
        const totalRad = ((na + angle) % 360) * (Math.PI / 180);
        const sx = Math.round(boxCx + Math.cos(totalRad) * ringRadiusPx);
        const sy = Math.round(boxCy + Math.sin(totalRad) * ringRadiusPx);
        if (sx >= 0 && sx < sampleW && sy >= 0 && sy < sampleH) {
          const idx = (sy * sampleW + sx) * 4;
          scoreSum += (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
        }
      }
      if (scoreSum > maxRotScore) {
        maxRotScore = scoreSum;
        bestRotAngle = angle;
      }
    }

    // Refine rotation ±8° with 2° resolution around best coarse peak
    let refinedAngle = bestRotAngle;
    let refinedMaxScore = maxRotScore;
    for (let delta = -8; delta <= 8; delta += 2) {
      const angle = (bestRotAngle + delta + 360) % 360;
      let scoreSum = 0;
      for (const na of this.nominalAnglesDeg) {
        const totalRad = ((na + angle) % 360) * (Math.PI / 180);
        const sx = Math.round(boxCx + Math.cos(totalRad) * ringRadiusPx);
        const sy = Math.round(boxCy + Math.sin(totalRad) * ringRadiusPx);
        if (sx >= 0 && sx < sampleW && sy >= 0 && sy < sampleH) {
          const idx = (sy * sampleW + sx) * 4;
          scoreSum += (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
        }
      }
      if (scoreSum > refinedMaxScore) {
        refinedMaxScore = scoreSum;
        refinedAngle = angle;
      }
    }

    // If part rotation peak is significantly brighter than plastic, use detected rotation
    const rotationDetected = (refinedMaxScore / 3) > (baselinePlastic + 30);
    const activeAngle = rotationDetected ? refinedAngle : 0;

    // 3. Inspect each of the 3 Sleeves at active rotation
    const sleevesResult = [];
    let presentCount = 0;
    const sleeveRadiusPx = Math.max(10, boxW * 0.038);

    const sleeveDefs = [
      { id: 1, name: 'Sleeve 1 (Left Boss)', nominalAngle: 180 },
      { id: 2, name: 'Sleeve 2 (Top-Right Boss)', nominalAngle: 302.5 },
      { id: 3, name: 'Sleeve 3 (Bottom-Right Boss)', nominalAngle: 57.5 },
    ];

    for (const def of sleeveDefs) {
      const finalAngleRad = ((def.nominalAngle + activeAngle) % 360) * (Math.PI / 180);
      const cx = boxCx + Math.cos(finalAngleRad) * ringRadiusPx;
      const cy = boxCy + Math.sin(finalAngleRad) * ringRadiusPx;

      const evalResult = this.evaluateZone(
        data,
        sampleW,
        sampleH,
        cx,
        cy,
        sleeveRadiusPx,
        baselinePlastic
      );

      const isPresent = evalResult.confidence >= threshold;
      if (isPresent) presentCount++;

      sleevesResult.push({
        id: def.id,
        name: def.name,
        x: cx * scaleX,
        y: cy * scaleY,
        radius: Math.max(16, sleeveRadiusPx * ((scaleX + scaleY) / 2)),
        present: isPresent,
        confidence: Math.round(evalResult.confidence * 100),
        angleDeg: Math.round(((def.nominalAngle + activeAngle) % 360)),
        details: evalResult,
      });
    }

    const allPresent = presentCount === 3;
    const missingCount = 3 - presentCount;
    const partInView = presentCount > 0 || rotationDetected || sleevesResult.some((s) => s.confidence > 25);
    const status = allPresent ? 'PASS' : 'FAIL';

    return {
      status,
      message: allPresent
        ? 'PASS - All 3 Sleeves Present'
        : `FAIL - ${missingCount} Missing Sleeve${missingCount > 1 ? 's' : ''} Detected`,
      sleeves: sleevesResult,
      partDetected: partInView,
      detectedRotationDeg: Math.round(activeAngle),
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
    const minR = Math.round(rInt * 0.35);
    const maxR = Math.round(rInt * 1.25);

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

          // Metallic reflection: significantly brighter than black PA6-GF50 plastic
          const isSpecular = brightness > 110 && brightness > baselinePlastic + 25;
          const isMetalHue = (r > 60 && g > 55) || (brightness > 130);

          if (isSpecular || isMetalHue) {
            metallicPixelCount++;
          }
        } else if (dist < minR * 0.7) {
          centerPixels++;
          centerBrightnessSum += brightness;
        }
      }
    }

    const avgRingBrightness = ringPixels > 0 ? ringBrightnessSum / ringPixels : 0;
    const avgCenterBrightness = centerPixels > 0 ? centerBrightnessSum / centerPixels : 0;
    const metallicRatio = ringPixels > 0 ? metallicPixelCount / ringPixels : 0;

    // Contrast against black polymer baseline
    const contrastVsPlastic = Math.max(0, avgRingBrightness - baselinePlastic) / 140;
    // Contrast of outer bright rim against dark inner through-hole
    const annularHoleContrast = Math.max(0, avgRingBrightness - avgCenterBrightness) / 120;

    // Combined score
    const confidence = Math.min(
      1.0,
      metallicRatio * 0.45 +
      contrastVsPlastic * 0.30 +
      annularHoleContrast * 0.15 +
      Math.min(1.0, maxSpecular / 180) * 0.10
    );

    return {
      confidence,
      metallicRatio: Math.round(metallicRatio * 100),
      avgRingBrightness: Math.round(avgRingBrightness),
      maxSpecular: Math.round(maxSpecular),
      baselinePlastic: Math.round(baselinePlastic),
    };
  }
}
