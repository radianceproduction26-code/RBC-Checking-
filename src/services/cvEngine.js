/**
 * Computer Vision Engine for Metal Sleeve Inspection
 * Dual-Engine:
 * 1. Fast Real-Time Metal Sleeve & Annular Ring Scanner (Quick Scan < 30ms)
 * 2. Feature Matching & Homography Alignment (ORB)
 */

export class CVInspectionEngine {
  constructor(cv) {
    this.cv = cv;
    this.masterData = null;
    this.masterMat = null;
    this.masterGray = null;
    this.masterKeypoints = null;
    this.masterDescriptors = null;
    this.orb = null;
    this.bfMatcher = null;
    this.isMasterReady = false;
    this.tempCanvas = null;
  }

  /**
   * Initializes master reference image for alignment
   */
  async loadMaster(masterPartData) {
    if (!this.cv || !this.cv.Mat) {
      console.warn('OpenCV.js is not initialized yet');
      return false;
    }

    this.cleanupMaster();
    this.masterData = masterPartData;

    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'Anonymous';
      img.onload = () => {
        try {
          const cv = this.cv;
          const canvas = document.createElement('canvas');
          canvas.width = img.naturalWidth || masterPartData.width || 640;
          canvas.height = img.naturalHeight || masterPartData.height || 480;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

          const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          this.masterMat = cv.matFromImageData(imgData);
          this.masterGray = new cv.Mat();
          cv.cvtColor(this.masterMat, this.masterGray, cv.COLOR_RGBA2GRAY);

          if (!this.orb) {
            this.orb = new cv.ORB(500);
          }

          this.masterKeypoints = new cv.KeyPointVector();
          this.masterDescriptors = new cv.Mat();
          const mask = new cv.Mat();

          this.orb.detectAndCompute(this.masterGray, mask, this.masterKeypoints, this.masterDescriptors);
          mask.delete();

          if (!this.bfMatcher) {
            this.bfMatcher = new cv.BFMatcher(cv.NORM_HAMMING, false);
          }

          this.isMasterReady = this.masterDescriptors.rows >= 6;
          resolve(this.isMasterReady);
        } catch (err) {
          console.warn('Error processing master in OpenCV:', err);
          resolve(false);
        }
      };
      img.onerror = () => resolve(false);
      img.src = masterPartData.imageUrl;
    });
  }

  /**
   * Process a single video frame with ultra-fast quick scan & homography fallback
   */
  processFrame(sourceCanvasOrVideo, settings = {}) {
    let width = sourceCanvasOrVideo.videoWidth || sourceCanvasOrVideo.width;
    let height = sourceCanvasOrVideo.videoHeight || sourceCanvasOrVideo.height;

    if (!width || !height || width <= 0 || height <= 0) {
      return {
        status: 'WAITING_FRAME',
        message: 'Waiting for camera feed...',
        sleeves: [],
        partDetected: false,
      };
    }

    // Processing resolution: scale down to 480p for instant 30+ FPS scanning
    const targetDim = 480;
    let scale = 1.0;
    if (width > targetDim || height > targetDim) {
      scale = targetDim / Math.max(width, height);
    }
    const processWidth = Math.round(width * scale);
    const processHeight = Math.round(height * scale);

    if (!this.tempCanvas) {
      this.tempCanvas = document.createElement('canvas');
    }
    this.tempCanvas.width = processWidth;
    this.tempCanvas.height = processHeight;
    const ctx = this.tempCanvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(sourceCanvasOrVideo, 0, 0, processWidth, processHeight);

    const frameImgData = ctx.getImageData(0, 0, processWidth, processHeight);

    // If OpenCV is available, run computer vision pipeline
    if (this.cv && this.cv.Mat) {
      // 1. First attempt: Homography alignment with master if master is loaded
      if (this.isMasterReady && this.masterMat) {
        const homographyResult = this.tryHomographyAlignment(
          frameImgData,
          processWidth,
          processHeight,
          scale,
          settings
        );
        if (homographyResult && homographyResult.partDetected) {
          return homographyResult;
        }
      }

      // 2. Second attempt: Direct Fast Metal Sleeve Quick Scan
      const quickScanResult = this.runFastSleeveScanner(
        frameImgData,
        processWidth,
        processHeight,
        scale,
        settings
      );
      if (quickScanResult && quickScanResult.partDetected) {
        return quickScanResult;
      }
    }

    // 3. Fallback / Target Guide Zone Scan (Analyzes the on-screen target reticle directly)
    return this.runTargetReticleScan(frameImgData, processWidth, processHeight, scale, settings);
  }

  /**
   * Fast Circular Metallic Sleeve Scanner (OpenCV Hough + Metallic Color Filter)
   */
  runFastSleeveScanner(frameImgData, width, height, scale, settings) {
    const cv = this.cv;
    let src = null;
    let gray = null;
    let blurred = null;
    let circles = null;

    try {
      src = cv.matFromImageData(frameImgData);
      gray = new cv.Mat();
      blurred = new cv.Mat();
      circles = new cv.Mat();

      cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
      cv.GaussianBlur(gray, blurred, new cv.Size(7, 7), 1.5, 1.5);

      const minRadius = Math.round(Math.min(width, height) * 0.035);
      const maxRadius = Math.round(Math.min(width, height) * 0.14);
      const minDist = Math.round(minRadius * 2.2);

      cv.HoughCircles(
        blurred,
        circles,
        cv.HOUGH_GRADIENT,
        1.2,
        minDist,
        80,
        28,
        minRadius,
        maxRadius
      );

      const detectedSleeves = [];
      const threshold = settings.sleeveConfidenceThreshold ?? 0.55;

      for (let i = 0; i < circles.cols; ++i) {
        const cx = circles.data32F[i * 3];
        const cy = circles.data32F[i * 3 + 1];
        const r = circles.data32F[i * 3 + 2];

        const presence = this.verifySleevePresence(frameImgData, cx, cy, r, threshold);

        // Include candidate sleeves that exhibit metallic reflection or hole profile
        if (presence.confidence >= 0.35 || presence.metrics?.maxSpecular > 140) {
          detectedSleeves.push({
            id: i + 1,
            x: cx / scale,
            y: cy / scale,
            radius: r / scale,
            present: presence.present,
            confidence: presence.confidence,
          });
        }
      }

      // If 3 metallic sleeves are found -> PASS!
      if (detectedSleeves.length === 3) {
        const allPresent = detectedSleeves.every((s) => s.present);
        const missingCount = detectedSleeves.filter((s) => !s.present).length;
        return {
          status: allPresent ? 'PASS' : 'FAIL',
          message: allPresent ? 'PASS - All 3 Sleeves Present' : `FAIL - ${missingCount} Missing Sleeve Detected`,
          sleeves: detectedSleeves,
          partDetected: true,
          allPresent,
          missingCount,
        };
      }

      // If 2 metallic sleeves found, estimate position of 3rd sleeve based on triangular geometry
      if (detectedSleeves.length === 2 && detectedSleeves.some((s) => s.present)) {
        const s1 = detectedSleeves[0];
        const s2 = detectedSleeves[1];

        // Estimated 3rd apex of triangle
        const midX = (s1.x + s2.x) / 2;
        const midY = (s1.y + s2.y) / 2;
        const dx = s2.x - s1.x;
        const dy = s2.y - s1.y;
        const dist = Math.hypot(dx, dy);

        // Perpendicular offset for 3rd sleeve
        const s3X = midX - (dy / dist) * (dist * 0.7);
        const s3Y = midY + (dx / dist) * (dist * 0.7);
        const rAvg = (s1.radius + s2.radius) / 2;

        const presence3 = this.verifySleevePresence(
          frameImgData,
          s3X * scale,
          s3Y * scale,
          rAvg * scale,
          threshold
        );

        detectedSleeves.push({
          id: 3,
          x: s3X,
          y: s3Y,
          radius: rAvg,
          present: presence3.present,
          confidence: presence3.confidence,
        });

        const allPresent = detectedSleeves.every((s) => s.present);
        const missingCount = detectedSleeves.filter((s) => !s.present).length;

        return {
          status: allPresent ? 'PASS' : 'FAIL',
          message: allPresent ? 'PASS - All 3 Sleeves Present' : `FAIL - ${missingCount} Missing Sleeve Detected`,
          sleeves: detectedSleeves,
          partDetected: true,
          allPresent,
          missingCount,
        };
      }

      return null;
    } catch (e) {
      return null;
    } finally {
      if (src) src.delete();
      if (gray) gray.delete();
      if (blurred) blurred.delete();
      if (circles) circles.delete();
    }
  }

  /**
   * Fast Homography Alignment (ORB keypoints with RANSAC)
   */
  tryHomographyAlignment(frameImgData, width, height, scale, settings) {
    const cv = this.cv;
    let liveMat = null;
    let liveGray = null;
    let liveKeypoints = null;
    let liveDescriptors = null;
    let knnMatches = null;
    let srcPoints = null;
    let dstPoints = null;
    let inlierMask = null;
    let H = null;

    try {
      liveMat = cv.matFromImageData(frameImgData);
      liveGray = new cv.Mat();
      cv.cvtColor(liveMat, liveGray, cv.COLOR_RGBA2GRAY);

      liveKeypoints = new cv.KeyPointVector();
      liveDescriptors = new cv.Mat();
      const mask = new cv.Mat();
      this.orb.detectAndCompute(liveGray, mask, liveKeypoints, liveDescriptors);
      mask.delete();

      if (liveDescriptors.rows < 6) return null;

      knnMatches = new cv.DMatchVectorVector();
      this.bfMatcher.knnMatch(this.masterDescriptors, liveDescriptors, knnMatches, 2);

      const goodMatches = [];
      for (let i = 0; i < knnMatches.size(); i++) {
        const match = knnMatches.get(i);
        if (match.size() >= 2) {
          const m1 = match.get(0);
          const m2 = match.get(1);
          if (m1.distance < 0.8 * m2.distance) {
            goodMatches.push(m1);
          }
        }
      }

      const minInliers = Math.min(settings.minInlierMatches ?? 8, 8);
      if (goodMatches.length < minInliers) return null;

      const srcCoords = [];
      const dstCoords = [];
      for (let i = 0; i < goodMatches.length; i++) {
        const m = goodMatches[i];
        const kpMaster = this.masterKeypoints.get(m.queryIdx);
        const kpLive = liveKeypoints.get(m.trainIdx);
        srcCoords.push(kpMaster.pt.x, kpMaster.pt.y);
        dstCoords.push(kpLive.pt.x, kpLive.pt.y);
      }

      srcPoints = cv.matFromArray(goodMatches.length, 1, cv.CV_32FC2, srcCoords);
      dstPoints = cv.matFromArray(goodMatches.length, 1, cv.CV_32FC2, dstCoords);
      inlierMask = new cv.Mat();

      H = cv.findHomography(srcPoints, dstPoints, cv.RANSAC, 6.0, inlierMask);

      if (H.empty() || H.rows !== 3 || H.cols !== 3) return null;

      let inlierCount = 0;
      for (let i = 0; i < inlierMask.rows; i++) {
        if (inlierMask.data[i] === 1) inlierCount++;
      }

      if (inlierCount < 5) return null;

      const hData = H.data64F;
      const masterW = this.masterMat.cols;
      const masterH = this.masterMat.rows;

      const corners = [
        { x: 0, y: 0 },
        { x: masterW, y: 0 },
        { x: masterW, y: masterH },
        { x: 0, y: masterH },
      ];

      const projectedCorners = corners.map((c) => {
        const pt = this.transformPoint(c.x, c.y, hData);
        return { x: pt.x / scale, y: pt.y / scale };
      });

      const masterSleeves = this.masterData.sleeves || [];
      const sleevesResult = [];
      let allPresent = true;
      const threshold = settings.sleeveConfidenceThreshold ?? 0.55;

      for (const sleeve of masterSleeves) {
        const liveCenter = this.transformPoint(sleeve.x, sleeve.y, hData);
        const liveEdge = this.transformPoint(sleeve.x + sleeve.radius, sleeve.y, hData);
        const liveRadius = Math.hypot(liveEdge.x - liveCenter.x, liveEdge.y - liveCenter.y);

        const presence = this.verifySleevePresence(
          frameImgData,
          liveCenter.x,
          liveCenter.y,
          liveRadius,
          threshold
        );

        sleevesResult.push({
          id: sleeve.id,
          x: liveCenter.x / scale,
          y: liveCenter.y / scale,
          radius: Math.max(16, liveRadius / scale),
          present: presence.present,
          confidence: presence.confidence,
        });

        if (!presence.present) allPresent = false;
      }

      const missingCount = sleevesResult.filter((s) => !s.present).length;

      return {
        status: allPresent ? 'PASS' : 'FAIL',
        message: allPresent ? 'PASS - All 3 Sleeves Present' : `FAIL - ${missingCount} Missing Sleeve Detected`,
        sleeves: sleevesResult,
        partDetected: true,
        partCorners: projectedCorners,
        allPresent,
        missingCount,
      };
    } catch (e) {
      return null;
    } finally {
      if (liveMat) liveMat.delete();
      if (liveGray) liveGray.delete();
      if (liveKeypoints) liveKeypoints.delete();
      if (liveDescriptors) liveDescriptors.delete();
      if (knnMatches) knnMatches.delete();
      if (srcPoints) srcPoints.delete();
      if (dstPoints) dstPoints.delete();
      if (inlierMask) inlierMask.delete();
      if (H) H.delete();
    }
  }

  /**
   * Target Reticle Scan: Instant Quick Scan inside the center alignment reticle
   */
  runTargetReticleScan(frameImgData, width, height, scale, settings) {
    const cx = width / 2;
    const cy = height / 2;
    const radius = Math.round(Math.min(width, height) * 0.065);
    const spreadX = Math.round(width * 0.22);
    const spreadY = Math.round(height * 0.15);

    // Default 3 target sleeve zones (Top-Left, Top-Right, Bottom-Center)
    const zones = [
      { id: 1, x: cx - spreadX, y: cy - spreadY, radius },
      { id: 2, x: cx + spreadX, y: cy - spreadY, radius },
      { id: 3, x: cx, y: cy + spreadY, radius },
    ];

    const threshold = settings.sleeveConfidenceThreshold ?? 0.55;
    const sleevesResult = [];
    let presentCount = 0;

    for (const zone of zones) {
      const presence = this.verifySleevePresence(
        frameImgData,
        zone.x,
        zone.y,
        zone.radius,
        threshold
      );

      sleevesResult.push({
        id: zone.id,
        x: zone.x / scale,
        y: zone.y / scale,
        radius: zone.radius / scale,
        present: presence.present,
        confidence: presence.confidence,
      });

      if (presence.present) presentCount++;
    }

    // Check if at least 1 sleeve or part is in the reticle
    const partDetected = presentCount > 0 || sleevesResult.some((s) => s.confidence > 0.35);

    if (!partDetected) {
      return {
        status: 'SEARCHING',
        message: 'Point camera at plastic part • Quick Scan Active',
        sleeves: [],
        partDetected: false,
        missingCount: 0,
      };
    }

    const allPresent = presentCount === 3;
    const missingCount = 3 - presentCount;

    return {
      status: allPresent ? 'PASS' : 'FAIL',
      message: allPresent ? 'PASS - All 3 Sleeves Present' : `FAIL - ${missingCount} Missing Sleeve Detected`,
      sleeves: sleevesResult,
      partDetected: true,
      allPresent,
      missingCount,
    };
  }

  transformPoint(x, y, h) {
    const w = h[6] * x + h[7] * y + h[8];
    const nx = (h[0] * x + h[1] * y + h[2]) / (w || 1e-7);
    const ny = (h[3] * x + h[4] * y + h[5]) / (w || 1e-7);
    return { x: nx, y: ny };
  }

  verifySleevePresence(imgData, cx, cy, radius, threshold) {
    const width = imgData.width;
    const height = imgData.height;
    const data = imgData.data;

    if (cx < radius || cy < radius || cx > width - radius || cy > height - radius) {
      return { present: false, confidence: 0, metrics: {} };
    }

    const rInt = Math.max(8, Math.round(radius));
    let metallicPixels = 0;
    let ringPixels = 0;
    let ringIntensitySum = 0;
    let centerIntensitySum = 0;
    let centerCount = 0;
    let maxSpecular = 0;

    const minR = Math.round(rInt * 0.5);
    const maxR = Math.round(rInt * 1.15);

    for (let dy = -maxR; dy <= maxR; dy++) {
      for (let dx = -maxR; dx <= maxR; dx++) {
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
          ringIntensitySum += brightness;

          // Brass golden hue or metallic reflection
          const isBrass = (r > b + 20 && g > b + 10 && r > 65);
          const isSpecular = brightness > 155 && Math.abs(r - g) < 35;

          if (isBrass || isSpecular) {
            metallicPixels++;
          }
          if (brightness > maxSpecular) {
            maxSpecular = brightness;
          }
        } else if (dist < minR * 0.5) {
          centerIntensitySum += brightness;
          centerCount++;
        }
      }
    }

    const avgRingBrightness = ringPixels > 0 ? ringIntensitySum / ringPixels : 0;
    const avgCenterBrightness = centerCount > 0 ? centerIntensitySum / centerCount : 0;
    const metallicRatio = ringPixels > 0 ? metallicPixels / ringPixels : 0;
    const contrastRatio = Math.max(0, avgRingBrightness - avgCenterBrightness) / 255;

    const confidence = (metallicRatio * 0.65) + (contrastRatio * 0.2) + (Math.min(1, maxSpecular / 220) * 0.15);
    const present = confidence >= threshold || metallicRatio > 0.45;

    return {
      present,
      confidence: Math.round(confidence * 100) / 100,
      metrics: {
        metallicRatio: Math.round(metallicRatio * 100) / 100,
        maxSpecular,
        avgRingBrightness: Math.round(avgRingBrightness),
      },
    };
  }

  autoDetectSleeves(canvasOrImage) {
    if (!this.cv || !this.cv.Mat) return [];
    const cv = this.cv;
    let src = null;
    let gray = null;
    let blurred = null;
    let circles = null;

    try {
      let canvas = canvasOrImage;
      if (canvasOrImage instanceof HTMLImageElement) {
        canvas = document.createElement('canvas');
        canvas.width = canvasOrImage.naturalWidth;
        canvas.height = canvasOrImage.naturalHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(canvasOrImage, 0, 0);
      }

      const ctx = canvas.getContext('2d');
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      src = cv.matFromImageData(imgData);
      gray = new cv.Mat();
      blurred = new cv.Mat();
      circles = new cv.Mat();

      cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
      cv.medianBlur(gray, blurred, 5);

      const minRadius = Math.round(canvas.width * 0.02);
      const maxRadius = Math.round(canvas.width * 0.12);
      const minDist = Math.round(canvas.width * 0.08);

      cv.HoughCircles(blurred, circles, cv.HOUGH_GRADIENT, 1, minDist, 100, 30, minRadius, maxRadius);

      const detected = [];
      for (let i = 0; i < circles.cols; ++i) {
        detected.push({
          id: i + 1,
          x: Math.round(circles.data32F[i * 3]),
          y: Math.round(circles.data32F[i * 3 + 1]),
          radius: Math.round(circles.data32F[i * 3 + 2]),
        });
      }
      return detected;
    } catch (e) {
      return [];
    } finally {
      if (src) src.delete();
      if (gray) gray.delete();
      if (blurred) blurred.delete();
      if (circles) circles.delete();
    }
  }

  cleanupMaster() {
    if (this.masterMat) {
      this.masterMat.delete();
      this.masterMat = null;
    }
    if (this.masterGray) {
      this.masterGray.delete();
      this.masterGray = null;
    }
    if (this.masterKeypoints) {
      this.masterKeypoints.delete();
      this.masterKeypoints = null;
    }
    if (this.masterDescriptors) {
      this.masterDescriptors.delete();
      this.masterDescriptors = null;
    }
    this.isMasterReady = false;
  }

  destroy() {
    this.cleanupMaster();
    if (this.orb) {
      this.orb.delete();
      this.orb = null;
    }
    if (this.bfMatcher) {
      this.bfMatcher.delete();
      this.bfMatcher = null;
    }
  }
}
