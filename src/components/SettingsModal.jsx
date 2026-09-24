import React, { useState } from 'react';
import { X, Sliders, Volume2, Shield, RotateCcw, Check } from 'lucide-react';
import { DEFAULT_SETTINGS, saveSettings } from '../services/storage';

export default function SettingsModal({
  isOpen,
  onClose,
  settings,
  onUpdateSettings,
  testBeep,
}) {
  const [current, setCurrent] = useState(settings || DEFAULT_SETTINGS);
  const [saved, setSaved] = useState(false);

  if (!isOpen) return null;

  const handleChange = (key, val) => {
    setCurrent((prev) => ({ ...prev, [key]: val }));
  };

  const handleSave = () => {
    saveSettings(current);
    onUpdateSettings(current);
    setSaved(true);
    setTimeout(() => {
      setSaved(false);
      onClose();
    }, 800);
  };

  const handleReset = () => {
    setCurrent(DEFAULT_SETTINGS);
    saveSettings(DEFAULT_SETTINGS);
    onUpdateSettings(DEFAULT_SETTINGS);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-sm select-none">
      <div className="bg-white border border-slate-300 rounded-2xl w-full max-w-lg max-h-[90dvh] shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-3.5 sm:p-4 border-b border-slate-200 shrink-0">
          <div className="flex items-center space-x-2">
            <Sliders className="w-5 h-5 text-indigo-600" />
            <h3 className="font-black text-slate-900 text-sm sm:text-base">Inspection System Settings</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg bg-slate-100 text-slate-500 hover:text-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-3.5 sm:p-4 space-y-4 text-xs overflow-y-auto flex-1">
          {saved && (
            <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-300 text-emerald-800 font-bold flex items-center space-x-2 shadow-sm">
              <Check className="w-4 h-4 text-emerald-600" />
              <span>Settings saved successfully</span>
            </div>
          )}

          {/* Sleeve Detection Sensitivity */}
          <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
            <div className="flex justify-between">
              <span className="font-bold text-slate-800">Sleeve Presence Sensitivity</span>
              <span className="font-mono font-bold text-indigo-600">
                {Math.round(current.sleeveConfidenceThreshold * 100)}%
              </span>
            </div>
            <input
              type="range"
              min="0.30"
              max="0.85"
              step="0.02"
              value={current.sleeveConfidenceThreshold}
              onChange={(e) => handleChange('sleeveConfidenceThreshold', parseFloat(e.target.value))}
              className="w-full accent-indigo-600 cursor-pointer"
            />
            <p className="text-[11px] text-slate-500">
              Higher value requires stronger metallic specular reflection and knurled ring contrast.
            </p>
          </div>

          {/* Feature Matching Inliers */}
          <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
            <div className="flex justify-between">
              <span className="font-bold text-slate-800">Minimum Alignment Inliers</span>
              <span className="font-mono font-bold text-indigo-600">{current.minInlierMatches} matches</span>
            </div>
            <input
              type="range"
              min="6"
              max="25"
              step="1"
              value={current.minInlierMatches}
              onChange={(e) => handleChange('minInlierMatches', parseInt(e.target.value, 10))}
              className="w-full accent-indigo-600 cursor-pointer"
            />
            <p className="text-[11px] text-slate-500">
              Minimum keypoint feature matches required to lock onto part rotation and position.
            </p>
          </div>

          {/* Scan Mode & Cadence */}
          <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
            <div>
              <span className="font-bold text-slate-800 block mb-1">Inspection Mode</span>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => handleChange('scanMode', 'auto_lock')}
                  className={`py-1.5 px-2 rounded-lg text-center font-bold transition cursor-pointer border ${
                    current.scanMode === 'auto_lock'
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                  }`}
                >
                  Auto-Lock
                </button>
                <button
                  type="button"
                  onClick={() => handleChange('scanMode', 'manual')}
                  className={`py-1.5 px-2 rounded-lg text-center font-bold transition cursor-pointer border ${
                    current.scanMode === 'manual'
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                  }`}
                >
                  Tap to Scan
                </button>
                <button
                  type="button"
                  onClick={() => handleChange('scanMode', 'continuous')}
                  className={`py-1.5 px-2 rounded-lg text-center font-bold transition cursor-pointer border ${
                    current.scanMode === 'continuous'
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                  }`}
                >
                  Continuous
                </button>
              </div>
            </div>

            <div>
              <div className="flex justify-between mb-1">
                <span className="font-bold text-slate-800">Scan Cadence (Interval)</span>
                <span className="font-mono font-bold text-indigo-600">{current.inspectionIntervalMs || 220} ms</span>
              </div>
              <input
                type="range"
                min="100"
                max="400"
                step="20"
                value={current.inspectionIntervalMs || 220}
                onChange={(e) => handleChange('inspectionIntervalMs', parseInt(e.target.value, 10))}
                className="w-full accent-indigo-600 cursor-pointer"
              />
              <p className="text-[11px] text-slate-500">
                Calibrated 200–250ms prevents frantic scanning and stabilizes operator camera motion.
              </p>
            </div>

            <div>
              <div className="flex justify-between mb-1">
                <span className="font-bold text-slate-800">Verdict Hold Duration</span>
                <span className="font-mono font-bold text-indigo-600">{((current.lockDurationMs || 2500) / 1000).toFixed(1)} s</span>
              </div>
              <input
                type="range"
                min="1500"
                max="5000"
                step="250"
                value={current.lockDurationMs || 2500}
                onChange={(e) => handleChange('lockDurationMs', parseInt(e.target.value, 10))}
                className="w-full accent-indigo-600 cursor-pointer"
              />
              <p className="text-[11px] text-slate-500">
                Time the screen freezes and displays the PASS/FAIL verdict solid before readying next part.
              </p>
            </div>
          </div>

          {/* Audio Alarm Test */}
          <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between">
            <div>
              <span className="font-bold text-slate-800 block">Audio Buzzer Test</span>
              <span className="text-[11px] text-slate-500">
                Test shop-floor loud acoustic alarm (880Hz)
              </span>
            </div>
            <button
              onClick={testBeep}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-white hover:bg-slate-100 text-amber-700 font-bold border border-slate-300 shadow-sm cursor-pointer"
            >
              <Volume2 className="w-4 h-4" />
              <span>Test Tone</span>
            </button>
          </div>

          {/* Visual Overlays */}
          <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between">
            <div>
              <span className="font-bold text-slate-800 block">Draw Part Boundary Polygon</span>
              <span className="text-[11px] text-slate-500">
                Shows bounding outline when homography is locked
              </span>
            </div>
            <button
              onClick={() => handleChange('drawPartOutline', !current.drawPartOutline)}
              className={`px-3 py-1 rounded text-xs font-bold transition cursor-pointer ${
                current.drawPartOutline ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-700'
              }`}
            >
              {current.drawPartOutline ? 'ON' : 'OFF'}
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="p-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <button
            onClick={handleReset}
            className="flex items-center space-x-1 text-slate-600 hover:text-slate-900 text-xs font-semibold cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Defaults</span>
          </button>
          <div className="flex space-x-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 text-xs font-bold shadow-sm cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black shadow-sm cursor-pointer"
            >
              Save Settings
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
