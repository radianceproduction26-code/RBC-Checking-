import React, { useState } from 'react';
import { Terminal, ChevronDown, ChevronUp, Activity, Check, X, Shield } from 'lucide-react';

export default function DebugPanel({ inspectionResult, isVisible, onToggleVisible }) {
  const [copied, setCopied] = useState(false);

  if (!isVisible) return null;

  const telemetryJson = {
    partDetected: inspectionResult.partDetected ?? false,
    matchedFeatures: inspectionResult.matchedFeatures ?? 0,
    sleeve1: inspectionResult.sleeve1 ?? (inspectionResult.sleeves?.[0]?.present ? 'present' : 'missing'),
    sleeve2: inspectionResult.sleeve2 ?? (inspectionResult.sleeves?.[1]?.present ? 'present' : 'missing'),
    sleeve3: inspectionResult.sleeve3 ?? (inspectionResult.sleeves?.[2]?.present ? 'present' : 'missing'),
    result: inspectionResult.result || inspectionResult.status || 'SEARCHING',
  };

  const handleCopyJson = () => {
    navigator.clipboard.writeText(JSON.stringify(telemetryJson, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="absolute top-20 right-3 z-40 max-w-sm w-full bg-slate-900/95 text-slate-100 rounded-2xl shadow-2xl border border-slate-700 backdrop-blur-md overflow-hidden select-none text-xs">
      {/* Header */}
      <div className="flex items-center justify-between p-3 bg-slate-800/90 border-b border-slate-700">
        <div className="flex items-center space-x-2 font-mono font-bold text-indigo-300">
          <Terminal className="w-4 h-4 text-emerald-400" />
          <span>CV Telemetry & Debug</span>
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={handleCopyJson}
            className="px-2 py-0.5 rounded bg-slate-700 hover:bg-slate-600 text-[10px] text-slate-300 font-semibold cursor-pointer"
          >
            {copied ? 'Copied!' : 'Copy JSON'}
          </button>
          <button
            onClick={onToggleVisible}
            className="p-1 text-slate-400 hover:text-white"
          >
            <ChevronUp className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="p-3 space-y-3 max-h-80 overflow-y-auto font-mono text-[11px]">
        {/* Real-Time Frame JSON Output */}
        <div>
          <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">
            Frame Output JSON:
          </span>
          <pre className="p-2 rounded-xl bg-black/60 border border-slate-800 text-emerald-300 text-[10px] overflow-x-auto">
            {JSON.stringify(telemetryJson, null, 2)}
          </pre>
        </div>

        {/* Feature Matching Stats */}
        <div className="grid grid-cols-2 gap-2 text-slate-300">
          <div className="bg-slate-800/80 p-2 rounded-lg border border-slate-700">
            <span className="text-[10px] text-slate-400 block">Matched Features</span>
            <span className="text-sm font-bold text-indigo-400 font-mono">
              {inspectionResult.matchedFeatures || inspectionResult.debug?.matchedFeatures || 0}
            </span>
          </div>
          <div className="bg-slate-800/80 p-2 rounded-lg border border-slate-700">
            <span className="text-[10px] text-slate-400 block">RANSAC Inliers</span>
            <span className="text-sm font-bold text-emerald-400 font-mono">
              {inspectionResult.debug?.inliers ?? 0}
            </span>
          </div>
        </div>

        {/* 3-Metric Breakdown per Sleeve */}
        <div>
          <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">
            3-Metric Sleeve Verification:
          </span>
          <div className="space-y-1.5">
            {inspectionResult.sleeves?.map((sleeve, idx) => (
              <div
                key={sleeve.id}
                className="p-2 rounded-lg bg-slate-800/70 border border-slate-700 space-y-1"
              >
                <div className="flex items-center justify-between font-bold">
                  <span className={sleeve.present ? 'text-emerald-400' : 'text-rose-400'}>
                    Sleeve {idx + 1} ({sleeve.name || `Position ${String.fromCharCode(65 + idx)}`}): {sleeve.present ? 'PRESENT' : 'MISSING'}
                  </span>
                  <span className="text-indigo-300">{sleeve.confidence}%</span>
                </div>
                {sleeve.metrics && (
                  <div className="grid grid-cols-3 gap-1 text-[10px] text-slate-400">
                    <div>
                      Brightness: <span className="text-slate-200">{Math.round(sleeve.metrics.metalBrightness * 100)}%</span>
                    </div>
                    <div>
                      Edges: <span className="text-slate-200">{Math.round(sleeve.metrics.edgeDensity * 100)}%</span>
                    </div>
                    <div>
                      Circularity: <span className="text-slate-200">{Math.round(sleeve.metrics.circularGeometry * 100)}%</span>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
