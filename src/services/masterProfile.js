import { PART_INFO, PRELOADED_LAYOUTS } from '../data/defaultMasterPart';

const MASTER_PROFILE_KEY = 'rbc_master_part_profile_v5';

/**
 * Compresses an image dataUrl to JPEG to stay well within browser localStorage quota
 */
export function compressImageDataUrl(dataUrl, maxDim = 480, quality = 0.65) {
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
 * Returns the factory pre-trained Master Part Profile for Radiance Polymer PA6-GF50 Fan Shroud
 * Contains all 7 multi-orientation layouts and learned physical variables.
 */
export function generateDefaultMasterProfile() {
  const images = PRELOADED_LAYOUTS.map((layout, idx) => ({
    id: layout.id,
    label: layout.name,
    description: layout.description,
    rotation: layout.rotation,
    scale: layout.scale,
    dataUrl: layout.imageBase64,
    width: layout.width,
    height: layout.height,
    sleeves: layout.sleeves,
    interSleeveDistances: layout.interSleeveDistances,
  }));

  // Default to standard 0° layout
  const primaryLayout = PRELOADED_LAYOUTS[0];

  return {
    partNumber: 'PA6-GF50-FAN-SHROUD',
    name: 'Radiance PA6-GF50 Fan Shroud (3 Metal Sleeves)',
    material: PART_INFO.material,
    totalSleeves: PART_INFO.totalSleeves,
    primaryIndex: 0,
    activeLayoutId: primaryLayout.id,
    images,
    // Reference 3-sleeve positions
    sleeves: primaryLayout.sleeves.map((s) => ({
      id: s.id,
      name: s.name,
      x: s.pixelX,
      y: s.pixelY,
      radius: s.pixelRadius,
      normX: s.normX,
      normY: s.normY,
      normRadius: s.normRadius,
      nominalAngleDeg: s.nominalAngleDeg,
      baselineMetrics: s.baselineMetrics,
    })),
    hubCenter: primaryLayout.hub,
    geometryInvariants: PART_INFO.geometryInvariants,
    thresholds: PART_INFO.thresholds,
    allLayouts: PRELOADED_LAYOUTS.map((l) => ({
      id: l.id,
      name: l.name,
      description: l.description,
      rotation: l.rotation,
      scale: l.scale,
      interSleeveDistances: l.interSleeveDistances,
    })),
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Loads master profile from localStorage, or initializes with preloaded factory profile
 */
export function loadMasterProfile() {
  try {
    const raw = localStorage.getItem(MASTER_PROFILE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (
        parsed &&
        parsed.partNumber === 'PA6-GF50-FAN-SHROUD' &&
        Array.isArray(parsed.images) &&
        parsed.images.length > 0 &&
        Array.isArray(parsed.sleeves) &&
        parsed.sleeves.length === 3
      ) {
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

/**
 * Saves master profile with compact payload to avoid browser quota errors
 */
export function saveMasterProfile(profile) {
  try {
    // Keep top 8 images with compact format
    const compactProfile = {
      ...profile,
      images: (profile.images || []).slice(0, 8),
    };
    localStorage.setItem(MASTER_PROFILE_KEY, JSON.stringify(compactProfile));
    return true;
  } catch (err) {
    console.warn('LocalStorage save failed, quota exceeded:', err);
    try {
      // Emergency reduction if storage is full
      const minimalProfile = {
        ...profile,
        images: (profile.images || []).slice(0, 4),
      };
      localStorage.setItem(MASTER_PROFILE_KEY, JSON.stringify(minimalProfile));
      return true;
    } catch (e2) {
      console.error('Final fallback save failed:', e2);
      return false;
    }
  }
}

/**
 * Returns available pre-loaded factory layouts
 */
export function getPreloadedLayouts() {
  return PRELOADED_LAYOUTS;
}
