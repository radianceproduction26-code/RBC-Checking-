import { getDefaultMasterPart } from './demoPartGenerator';

const MASTER_STORAGE_KEY = 'metal_sleeve_inspection_master_v2'; // Bump key to ensure 3-sleeve migration
const SETTINGS_STORAGE_KEY = 'metal_sleeve_inspection_settings';

export const DEFAULT_SETTINGS = {
  sleeveConfidenceThreshold: 0.60, // correlation / metallic score threshold for sleeve presence
  minInlierMatches: 10,           // minimum feature inliers to lock onto part
  maxFeatures: 500,               // ORB max features
  alarmEnabled: true,             // audio alarm state
  drawPartOutline: true,          // draw bounding polygon
  drawKeypoints: false,           // debug feature points
  inspectionIntervalMs: 120,      // interval between live CV frames (~8 FPS for smooth mobile performance)
};

export function loadMasterPart() {
  try {
    const raw = localStorage.getItem(MASTER_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.imageUrl && Array.isArray(parsed.sleeves) && parsed.sleeves.length === 3) {
        return parsed;
      }
    }
  } catch (err) {
    console.warn('Failed to load master part from localStorage:', err);
  }
  // Initialize with standard 3-sleeve part
  const defaultPart = getDefaultMasterPart();
  saveMasterPart(defaultPart);
  return defaultPart;
}

export function saveMasterPart(masterData) {
  try {
    localStorage.setItem(MASTER_STORAGE_KEY, JSON.stringify(masterData));
    return true;
  } catch (err) {
    console.error('Failed to save master part to localStorage:', err);
    return false;
  }
}

export function resetToDefaultMaster() {
  const defaultPart = getDefaultMasterPart();
  saveMasterPart(defaultPart);
  return defaultPart;
}

export function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (raw) {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
    }
  } catch (err) {
    console.warn('Failed to load settings:', err);
  }
  return DEFAULT_SETTINGS;
}

export function saveSettings(settings) {
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    return true;
  } catch (err) {
    console.error('Failed to save settings:', err);
    return false;
  }
}
