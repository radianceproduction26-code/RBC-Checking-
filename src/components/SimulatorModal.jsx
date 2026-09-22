import React, { useState, useEffect, useRef } from 'react';
import { X, Play, RotateCw, Move, Check, AlertCircle, RefreshCw } from 'lucide-react';
import { generatePartImage } from '../services/demoPartGenerator';

export default function SimulatorModal({
  isOpen,
  onClose,
  isSimulating,
  setIsSimulating,
  simulatedCanvasRef,
}) {
  const [rotation, setRotation] = useState(25); // initial test rotation (25 degrees)
  const [translateX, setTranslateX] = useState(10);
  const [translateY, setTranslateY] = useState(-8);
  // Exactly 3 metal sleeves configuration for Radiance PA6-GF50 fan shroud
  const [sleevesState, setSleevesState] = useState([
    { id: 1, present: true, label: 'Sleeve 1 (Left Boss - 180°)' },
    { id: 2, present: true, label: 'Sleeve 2 (Top-Right Boss - 302°)' },
    { id: 3, present: true, label: 'Sleeve 3 (Bottom-Right Boss - 57°)' },
  ]);
  const [handheldJitter, setHandheldJitter] = useState(false);

  const previewCanvasRef = useRef(null);

  // Render simulated frame to canvas
  useEffect(() => {
    let animId;

    const render = () => {
      let curRot = rotation;
      let curX = translateX;
      let curY = translateY;

      if (handheldJitter) {
        const t = performance.now() * 0.003;
        curRot += Math.sin(t) * 3;
        curX += Math.cos(t * 1.5) * 8;
        curY += Math.sin(t * 1.2) * 6;
      }

      const generated = generatePartImage({
        width: 640,
        height: 640,
        rotation: curRot,
        translateX: curX,
        translateY: curY,
        backgroundType: 'shopfloor',
        sleeves: [
          { id: 1, name: 'Sleeve 1 (Left Boss)', x: 237, y: 320, radius: 18, present: sleevesState[0]?.present ?? true },
          { id: 2, name: 'Sleeve 2 (Top-Right Boss)', x: 365, y: 249, radius: 18, present: sleevesState[1]?.present ?? true },
          { id: 3, name: 'Sleeve 3 (Bottom-Right Boss)', x: 365, y: 390, radius: 18, present: sleevesState[2]?.present ?? true },
        ],
      });

      // Update primary simulated canvas (used by inspection engine)
      if (simulatedCanvasRef.current) {
        const dest = simulatedCanvasRef.current;
        dest.width = 640;
        dest.height = 480;
        const dCtx = dest.getContext('2d');
        dCtx.drawImage(generated.canvas, 0, 0);
      }

      // Update modal preview canvas
      if (previewCanvasRef.current) {
        const pDest = previewCanvasRef.current;
        pDest.width = 640;
        pDest.height = 480;
        const pCtx = pDest.getContext('2d');
        pCtx.drawImage(generated.canvas, 0, 0);
      }

      if (handheldJitter) {
        animId = requestAnimationFrame(render);
      }
    };

    render();

    return () => {
      if (animId) cancelAnimationFrame(animId);
    };
  }, [rotation, translateX, translateY, sleevesState, handheldJitter, simulatedCanvasRef]);

  if (!isOpen) return null;

  const toggleSleeve = (id) => {
    setSleevesState((prev) =>
      prev.map((s) => (s.id === id ? { ...s, present: !s.present } : s))
    );
  };

  const setAllSleeves = (present) => {
    setSleevesState((prev) => prev.map((s) => ({ ...s, present })));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-slate-900/50 backdrop-blur-sm select-none">
      <div className="bg-white border border-slate-300 rounded-2xl w-full max-w-2xl max-h-[92vh] overflow-y-auto shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-200">
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-700">
              <RefreshCw className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-black text-slate-900 text-base">Virtual Shop Floor Test Bench (3 Sleeves)</h3>
              <p className="text-xs text-slate-500 font-medium">
                Test rotation, movement & missing sleeve detection without physical parts
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg bg-slate-100 text-slate-500 hover:text-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 space-y-4">
          {/* Feed Activation Banner */}
          <div className="flex items-center justify-between p-3.5 rounded-xl bg-indigo-50 border border-indigo-200">
            <div>
              <span className="text-sm font-bold text-indigo-950 block">
                Feed 3-Sleeve Virtual Stream to Inspector
              </span>
              <span className="text-xs text-indigo-700">
                {isSimulating
                  ? 'Simulated stream is active on the live inspection screen.'
                  : 'Enable this to test with the virtual 3-sleeve part instead of your camera.'}
              </span>
            </div>
            <button
              onClick={() => setIsSimulating(!isSimulating)}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition shadow-sm cursor-pointer ${
                isSimulating
                  ? 'bg-rose-600 hover:bg-rose-700 text-white'
                  : 'bg-emerald-600 hover:bg-emerald-700 text-white'
              }`}
            >
              {isSimulating ? 'Switch to Camera' : 'Use Virtual Feed'}
            </button>
          </div>

          {/* Virtual Canvas Preview */}
          <div className="relative rounded-xl overflow-hidden border border-slate-200 bg-slate-100 flex items-center justify-center p-2">
            <canvas
              ref={previewCanvasRef}
              className="max-w-full max-h-52 object-contain rounded-lg shadow-sm"
            />
          </div>

          {/* 3 Sleeve Presence Toggles */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-black text-slate-800 uppercase tracking-wider">
                Defect Simulator (3 Metal Sleeves)
              </label>
              <div className="space-x-2">
                <button
                  onClick={() => setAllSleeves(true)}
                  className="text-xs text-emerald-700 hover:underline font-bold cursor-pointer"
                >
                  All 3 Present (PASS)
                </button>
                <span className="text-slate-400">•</span>
                <button
                  onClick={() => {
                    setSleevesState([
                      { id: 1, present: true, label: 'Sleeve 1 (Top-Left)' },
                      { id: 2, present: false, label: 'Sleeve 2 (Top-Right)' }, // Defect
                      { id: 3, present: true, label: 'Sleeve 3 (Bottom-Center)' },
                    ]);
                  }}
                  className="text-xs text-rose-600 hover:underline font-bold cursor-pointer"
                >
                  Missing Sleeve 2 (FAIL)
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {sleevesState.map((sleeve) => (
                <button
                  key={sleeve.id}
                  onClick={() => toggleSleeve(sleeve.id)}
                  className={`flex items-center justify-between p-3 rounded-xl border text-xs font-bold transition cursor-pointer ${
                    sleeve.present
                      ? 'bg-emerald-50 border-emerald-300 text-emerald-900 hover:bg-emerald-100'
                      : 'bg-rose-50 border-rose-400 text-rose-900 animate-pulse hover:bg-rose-100'
                  }`}
                >
                  <span>{sleeve.label}</span>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-black ${
                      sleeve.present ? 'bg-emerald-200 text-emerald-800' : 'bg-rose-200 text-rose-800'
                    }`}
                  >
                    {sleeve.present ? 'PRESENT' : 'MISSING'}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Part Rotation & Position Sliders */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-3.5 bg-slate-50 rounded-xl border border-slate-200">
            {/* Rotation Slider */}
            <div>
              <div className="flex justify-between text-xs text-slate-700 font-semibold mb-1">
                <span className="flex items-center space-x-1">
                  <RotateCw className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Part Rotation: {rotation}°</span>
                </span>
                <button
                  onClick={() => setRotation(0)}
                  className="text-[11px] text-indigo-600 hover:underline cursor-pointer"
                >
                  Reset 0°
                </button>
              </div>
              <input
                type="range"
                min="-180"
                max="180"
                value={rotation}
                onChange={(e) => setRotation(parseInt(e.target.value, 10))}
                className="w-full accent-indigo-600 cursor-pointer"
              />
            </div>

            {/* Translation X Slider */}
            <div>
              <div className="flex justify-between text-xs text-slate-700 font-semibold mb-1">
                <span className="flex items-center space-x-1">
                  <Move className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Position Shift X: {translateX}px</span>
                </span>
                <button
                  onClick={() => setTranslateX(0)}
                  className="text-[11px] text-indigo-600 hover:underline cursor-pointer"
                >
                  Center
                </button>
              </div>
              <input
                type="range"
                min="-120"
                max="120"
                value={translateX}
                onChange={(e) => setTranslateX(parseInt(e.target.value, 10))}
                className="w-full accent-indigo-600 cursor-pointer"
              />
            </div>

            {/* Translation Y Slider */}
            <div>
              <div className="flex justify-between text-xs text-slate-700 font-semibold mb-1">
                <span className="flex items-center space-x-1">
                  <Move className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Position Shift Y: {translateY}px</span>
                </span>
                <button
                  onClick={() => setTranslateY(0)}
                  className="text-[11px] text-indigo-600 hover:underline cursor-pointer"
                >
                  Center
                </button>
              </div>
              <input
                type="range"
                min="-90"
                max="90"
                value={translateY}
                onChange={(e) => setTranslateY(parseInt(e.target.value, 10))}
                className="w-full accent-indigo-600 cursor-pointer"
              />
            </div>

            {/* Handheld Jitter Toggle */}
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-slate-800 block">Operator Handheld Shake</span>
                <span className="text-[11px] text-slate-500">Simulates operator holding part in hand</span>
              </div>
              <button
                onClick={() => setHandheldJitter(!handheldJitter)}
                className={`px-3 py-1.5 rounded-lg text-xs font-black transition cursor-pointer ${
                  handheldJitter ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-700'
                }`}
              >
                {handheldJitter ? 'ACTIVE' : 'OFF'}
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-3 bg-slate-50 border-t border-slate-200 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black shadow-sm cursor-pointer"
          >
            Apply & Inspect
          </button>
        </div>
      </div>
    </div>
  );
}
