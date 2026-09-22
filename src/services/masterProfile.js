import { generatePartImage } from './demoPartGenerator';

const MASTER_PROFILE_KEY = 'rbc_master_part_profile_v4';

/**
 * Compresses an image dataUrl to JPEG to stay well within browser localStorage quota
 */
function compressImageDataUrl(dataUrl, maxDim = 480, quality = 0.65) {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.onload = () => {
      const scale = Math.min(1.0, maxDim / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);

      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

/**
 * Generates a default multi-image Master Part Profile
 * containing 6 variations: Normal, Rotated 45°, Rotated 90°, Rotated 180°, Close-up, and Workbench
 */
export function generateDefaultMasterProfile() {
  const variations = [
    { label: 'Front Standard (0°)', rotation: 0, scale: 1.0, translateX: 0, translateY: 0 },
    { label: 'Rotated 45°', rotation: 45, scale: 1.0, translateX: 0, translateY: 0 },
    { label: 'Rotated 90°', rotation: 90, scale: 1.0, translateX: 0, translateY: 0 },
    { label: 'Rotated 180°', rotation: 180, scale: 1.0, translateX: 0, translateY: 0 },
    { label: 'Close-Up (+20% Scale)', rotation: 15, scale: 1.2, translateX: 10, translateY: -10 },
    { label: 'Distance View (-15% Scale)', rotation: -30, scale: 0.85, translateX: -15, translateY: 15 },
  ];

  const images = variations.map((v, idx) => {
    const generated = generatePartImage({
      width: 480,
      height: 360,
      rotation: v.rotation,
      scale: v.scale,
      translateX: v.translateX,
      translateY: v.translateY,
      backgroundType: idx % 2 === 0 ? 'clean' : 'shopfloor',
      sleeves: [
        { id: 1, x: 150, y: 135, radius: 20, present: true },
        { id: 2, x: 330, y: 135, radius: 20, present: true },
        { id: 3, x: 240, y: 236, radius: 20, present: true },
      ],
    });

    // JPEG compressed dataUrl (~25KB each)
    const compressedUrl = generated.canvas.toDataURL('image/jpeg', 0.65);

    return {
      id: `master_img_${idx + 1}`,
      label: v.label,
      dataUrl: compressedUrl,
      width: 480,
      height: 360,
    };
  });

  return {
    partNumber: 'PL-BRKT-3X',
    name: 'Injection Molded Bracket (3-Sleeve Master Profile)',
    primaryIndex: 0,
    images,
    sleeves: [
      { id: 1, name: 'Position A', x: 200, y: 180, radius: 25 },
      { id: 2, name: 'Position B', x: 440, y: 180, radius: 25 },
      { id: 3, name: 'Position C', x: 320, y: 315, radius: 25 },
    ],
    updatedAt: new Date().toISOString(),
  };
}

export function loadMasterProfile() {
  try {
    const raw = localStorage.getItem(MASTER_PROFILE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.images) && parsed.images.length > 0 && Array.isArray(parsed.sleeves)) {
        return parsed;
      }
    }
  } catch (err) {
    console.warn('Failed to load master profile from localStorage:', err);
  }
  const defaultProfile = generateDefaultMasterProfile();
  saveMasterProfile(defaultProfile);
  return defaultProfile;
}

export function saveMasterProfile(profile) {
  try {
    // Keep only compact images
    const compactProfile = {
      ...profile,
      images: profile.images.slice(0, 8),
    };
    localStorage.setItem(MASTER_PROFILE_KEY, JSON.stringify(compactProfile));
    return true;
  } catch (err) {
    console.warn('LocalStorage save failed, quota exceeded:', err);
    // Safe fallback: try pruning to top 4 images if quota exceeded
    try {
      const minimalProfile = {
        ...profile,
        images: profile.images.slice(0, 4),
      };
      localStorage.setItem(MASTER_PROFILE_KEY, JSON.stringify(minimalProfile));
      return true;
    } catch (e2) {
      console.error('Final fallback save failed:', e2);
      return false;
    }
  }
}
