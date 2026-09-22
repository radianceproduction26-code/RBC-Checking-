import { generatePartImage } from './demoPartGenerator';

const MASTER_PROFILE_KEY = 'rbc_master_part_profile_v3';

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
      width: 640,
      height: 480,
      rotation: v.rotation,
      scale: v.scale,
      translateX: v.translateX,
      translateY: v.translateY,
      backgroundType: idx % 2 === 0 ? 'clean' : 'shopfloor',
      sleeves: [
        { id: 1, x: 200, y: 180, radius: 25, present: true },
        { id: 2, x: 440, y: 180, radius: 25, present: true },
        { id: 3, x: 320, y: 315, radius: 25, present: true },
      ],
    });

    return {
      id: `master_img_${idx + 1}`,
      label: v.label,
      dataUrl: generated.dataUrl,
      width: 640,
      height: 480,
    };
  });

  return {
    partNumber: 'PL-BRKT-3X',
    name: 'Injection Molded Bracket (3-Sleeve Master Profile)',
    primaryIndex: 0, // primary image used for sleeve coordinate annotations
    images,
    sleeves: [
      { id: 1, name: 'Sleeve Position A', x: 200, y: 180, radius: 25 },
      { id: 2, name: 'Sleeve Position B', x: 440, y: 180, radius: 25 },
      { id: 3, name: 'Sleeve Position C', x: 320, y: 315, radius: 25 },
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
    localStorage.setItem(MASTER_PROFILE_KEY, JSON.stringify(profile));
    return true;
  } catch (err) {
    console.error('Failed to save master profile:', err);
    return false;
  }
}
