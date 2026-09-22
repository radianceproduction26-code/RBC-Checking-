/**
 * Computer Vision Engine for Metal Sleeve Inspection
 * Uses OpenCV.js for ORB Keypoint detection, Feature Matching, Homography alignment,
 * and sleeve presence verification.
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
  }

  /**
   * Initializes master reference image for alignment
   */
  async loadMaster(masterPartData) {
    if (!this.cv || !this.cv.Mat) {
      throw new Error('OpenCV.js is not initialized yet');
    }

    this.cleanupMaster();
    this.masterData = masterPartData;

    return new Promise((resolve, reject) => {
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

          // Initialize ORB detector
          if (!this.orb) {
            this.orb = new cv.ORB(600);
          }

          this.masterKeypoints = new cv.KeyPointVector();
          this.masterDescriptors = new cv.Mat();
          const mask = new cv.Mat();

          this.orb.detectAndCompute(this.masterGray, mask, this.masterKeypoints, this.masterDescriptors);
          mask.delete();

          // Prepare matcher
          if (!this.bfMatcher) {
            this.bfMatcher = new cv.BFMatcher(cv.NORM_HAMMING, false);
          }

          this.isMasterReady = this.masterDescriptors.rows >= 10;
          resolve(this.isMasterReady);
        } catch (err) {
          console.error('Error processing master in OpenCV:', err);
          reject(err);
        }
      };
      img.onerror = (e) => reject(new Error('Failed to load master image URL'));
      img.src = masterPartData.imageUrl;
    });
  }

  /**
   * Process a single video frame or canvas
   */
  processFrame(sourceCanvasOrVideo, settings = {}) {
    if (!this.cv || !this.cv.Mat || !this.isMasterReady || !this.masterMat) {
      return {
        status: 'INITIALIZING',
        message: 'CV Engine or Master Part not ready',
        sleeves: [],
        partDetected: false,
      };
    }

    const cv = this.cv;
    const threshold = settings.sleeveConfidenceThreshold ?? 0.62;
    const minInliers = settings.minInlierMatches ?? 10;

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
      // 1. Capture Frame into OpenCV Mat
      let width = sourceCanvasOrVideo.videoWidth || sourceCanvasOrVideo.width;
      let height = sourceCanvasOrVideo.videoHeight || sourceCanvasOrVideo.height;

      if (!width || !height) {
        return { status: 'WAITING_FRAME', message: 'No frame input', sleeves: [], partDetected: false };
      }

      // Downscale if camera resolution is too high to ensure detection time < 1s
      let processWidth = width;
      let processHeight = height;
      const MAX_DIM = 640;
      let scale = 1.0;
      if (width > MAX_DIM || height > MAX_DIM) {
        scale = MAX_DIM / Math.max(width, height);
        processWidth = Math.round(width * scale);
        processHeight = Math.round(height * scale);
      }

      // Draw to temporary processing canvas
      if (!this.tempCanvas) {
        this.tempCanvas = document.createElement('canvas');
      }
      this.tempCanvas.width = processWidth;
      this.tempCanvas.height = processHeight;
      const ctx = this.tempCanvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(sourceCanvasOrVideo, 0, 0, processWidth, processHeight);

      const frameImgData = ctx.getImageData(0, 0, processWidth, processHeight);
      liveMat = cv.matFromImageData(frameImgData);
      liveGray = new cv.Mat();
      cv.cvtColor(liveMat, liveGray, cv.COLOR_RGBA2GRAY);

      // 2. Detect ORB features on live frame
      liveKeypoints = new cv.KeyPointVector();
      liveDescriptors = new cv.Mat();
      const mask = new cv.Mat();
      this.orb.detectAndCompute(liveGray, mask, liveKeypoints, liveDescriptors);
      mask.delete();

      if (liveDescriptors.rows < 8) {
        return {
          status: 'SEARCHING',
          message: 'Aligning part... (Low feature count)',
          sleeves: [],
          partDetected: false,
          scale,
        };
      }

      // 3. Match Features (kNN match with k=2 for ratio test)
      knnMatches = new cv.DMatchVectorVector();
      this.bfMatcher.knnMatch(this.masterDescriptors, liveDescriptors, knnMatches, 2);

      const goodMatches = [];
      for (let i = 0; i < knnMatches.size(); i++) {
        const match = knnMatches.get(i);
        if (match.size() >= 2) {
          const m1 = match.get(0);
          const m2 = match.get(1);
          // Lowe's ratio test (0.75)
          if (m1.distance < 0.75 * m2.distance) {
            goodMatches.push(m1);
          }
        }
      }

      if (goodMatches.length < minInliers) {
        return {
          status: 'SEARCHING',
          message: `Aligning part... (${goodMatches.length}/${minInliers} matches)`,
          sleeves: [],
          partDetected: false,
          scale,
        };
      }

      // 4. Compute Homography Alignment Matrix (H) via RANSAC
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

      H = cv.findHomography(srcPoints, dstPoints, cv.RANSAC, 5.0, inlierMask);

      if (H.empty() || H.rows !== 3 || H.cols !== 3) {
        return {
          status: 'SEARCHING',
          message: 'Aligning part... (Computing orientation)',
          sleeves: [],
          partDetected: false,
          scale,
        };
      }

      // Count RANSAC inliers
      let inlierCount = 0;
      for (let i = 0; i < inlierMask.rows; i++) {
        if (inlierMask.data[i] === 1) inlierCount++;
      }

      if (inlierCount < minInliers) {
        return {
          status: 'SEARCHING',
          message: `Aligning part... (Inliers: ${inlierCount}/${minInliers})`,
          sleeves: [],
          partDetected: false,
          scale,
        };
      }

      // 5. Part Successfully Located! Project Part Boundary
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

      // 6. Verify Each Metal Sleeve in Live Frame
      const sleevesResult = [];
      let allPresent = true;

      const masterSleeves = this.masterData.sleeves || [];
      for (const sleeve of masterSleeves) {
        // Project center coordinate
        const liveCenter = this.transformPoint(sleeve.x, sleeve.y, hData);
        // Project radius
        const liveEdge = this.transformPoint(sleeve.x + sleeve.radius, sleeve.y, hData);
        const liveRadius = Math.hypot(liveEdge.x - liveCenter.x, liveEdge.y - liveCenter.y);

        // Verify presence in the frame
        const presence = this.verifySleevePresence(
          frameImgData,
          liveCenter.x,
          liveCenter.y,
          liveRadius,
          threshold
        );

        const sleeveItem = {
          id: sleeve.id,
          x: liveCenter.x / scale,
          y: liveCenter.y / scale,
          radius: liveRadius / scale,
          present: presence.present,
          confidence: presence.confidence,
          metrics: presence.metrics,
        };

        if (!presence.present) {
          allPresent = false;
        }

        sleevesResult.push(sleeveItem);
      }

      const status = allPresent ? 'PASS' : 'FAIL';
      const missingCount = sleevesResult.filter((s) => !s.present).length;

      return {
        status,
        message: allPresent 
          ? 'PASS - All Sleeves Present' 
          : `FAIL - ${missingCount} Missing Sleeve${missingCount > 1 ? 's' : ''} Detected`,
        sleeves: sleevesResult,
        partDetected: true,
        partCorners: projectedCorners,
        inlierCount,
        allPresent,
        missingCount,
        scale,
      };
    } catch (err) {
      console.error('Error during frame CV processing:', err);
      return {
        status: 'ERROR',
        message: `Inspection error: ${err.message}`,
        sleeves: [],
        partDetected: false,
      };
    } finally {
      // Memory cleanup for OpenCV Mats
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
   * Applies 3x3 homography transformation to point (x, y)
   */
  transformPoint(x, y, h) {
    const w = h[6] * x + h[7] * y + h[8];
    const nx = (h[0] * x + h[1] * y + h[2]) / (w || 1e-7);
    const ny = (h[3] * x + h[4] * y + h[5]) / (w || 1e-7);
    return { x: nx, y: ny };
  }

  /**
   * Multi-factor verification of metal sleeve presence vs empty plastic cavity
   */
  verifySleevePresence(imgData, cx, cy, radius, threshold) {
    const width = imgData.width;
    const height = imgData.height;
    const data = imgData.data;

    // Check if sleeve is within image frame
    if (cx < radius || cy < radius || cx > width - radius || cy > height - radius) {
      return { present: false, confidence: 0, metrics: { reason: 'Out of frame' } };
    }

    const rInt = Math.max(8, Math.round(radius));
    let metallicPixels = 0;
    let ringPixels = 0;
    let ringIntensitySum = 0;
    let centerIntensitySum = 0;
    let centerCount = 0;
    let maxSpecular = 0;

    // Sample concentric annular band (where the brass insert or steel sleeve chamfer/teeth sit)
    const minR = Math.round(rInt * 0.55);
    const maxR = Math.round(rInt * 1.05);

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

          // Brass golden hue condition: Red & Green prominent, Blue low, or high metallic sheen
          const isBrass = (r > b + 25 && g > b + 15 && r > 70);
          // Steel/Aluminum specular highlight:
          const isSpecular = brightness > 165 && Math.abs(r - g) < 30;

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

    // Contrast between metallic ring and inner cavity/surrounding plastic
    const contrastRatio = Math.max(0, avgRingBrightness - avgCenterBrightness) / 255;

    // Combined confidence score
    // In missing sleeves, metallicRatio is close to 0 (< 0.15), and maxSpecular is low
    const confidence = (metallicRatio * 0.65) + (contrastRatio * 0.2) + (Math.min(1, maxSpecular / 220) * 0.15);

    const present = confidence >= threshold;

    return {
      present,
      confidence: Math.round(confidence * 100) / 100,
      metrics: {
        metallicRatio: Math.round(metallicRatio * 100) / 100,
        avgRingBrightness: Math.round(avgRingBrightness),
        contrastRatio: Math.round(contrastRatio * 100) / 100,
        maxSpecular,
      },
    };
  }

  /**
   * Auto-detect circular sleeves in a master image using Hough Circles
   */
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

      // Detect circular metal sleeves
      const minRadius = Math.round(canvas.width * 0.02);
      const maxRadius = Math.round(canvas.width * 0.12);
      const minDist = Math.round(canvas.width * 0.08);

      cv.HoughCircles(
        blurred,
        circles,
        cv.HOUGH_GRADIENT,
        1,
        minDist,
        100,
        30,
        minRadius,
        maxRadius
      );

      const detected = [];
      for (let i = 0; i < circles.cols; ++i) {
        const x = Math.round(circles.data32F[i * 3]);
        const y = Math.round(circles.data32F[i * 3 + 1]);
        const radius = Math.round(circles.data32F[i * 3 + 2]);
        detected.push({
          id: i + 1,
          x,
          y,
          radius,
        });
      }

      return detected;
    } catch (err) {
      console.warn('Auto-detect sleeves HoughCircles fallback:', err);
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
