import React, { useState, useRef, useEffect } from 'react';
import { 
  Upload, Camera, Check, Plus, Trash2, ArrowLeft, 
  RotateCcw, Sparkles, HelpCircle, Save, Info
} from 'lucide-react';
import { generatePartImage, getDefaultMasterPart } from '../services/demoPartGenerator';
import { saveMasterPart } from '../services/storage';

export default function MasterSetup({
  currentMaster,
  onMasterSaved,
  onBack,
  cvEngine,
  cvReady
}) {
  const [masterPart, setMasterPart] = useState(currentMaster);
  const [activeImage, setActiveImage] = useState(currentMaster?.imageUrl || '');
  const [sleeves, setSleeves] = useState(currentMaster?.sleeves || []);
  const [selectedSleeveId, setSelectedSleeveId] = useState(null);
  const [defaultRadius, setDefaultRadius] = useState(25);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isDetecting, setIsDetecting] = useState(false);
  const [isCameraActive, setIsCameraActive] = useState(false);

  const canvasRef = useRef(null);
  const imageRef = useRef(new Image());
  const fileInputRef = useRef(null);
  const cameraVideoRef = useRef(null);
  const cameraStreamRef = useRef(null);
  const draggingRef = useRef(null);

  // Load image onto canvas when activeImage changes
  useEffect(() => {
    if (!activeImage) return;
    const img = imageRef.current;
    img.crossOrigin = 'Anonymous';
    img.src = activeImage;
    img.onload = () => {
      redrawCanvas();
    };
  }, [activeImage, sleeves, selectedSleeveId]);

  // Redraw canvas with master image & sleeve markers
  const redrawCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const img = imageRef.current;

    if (!img.complete || img.naturalWidth === 0) return;

    canvas.width = img.naturalWidth || 640;
    canvas.height = img.naturalHeight || 480;

    // Draw reference image
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    // Draw each annotated sleeve
    sleeves.forEach((sleeve, idx) => {
      const isSelected = sleeve.id === selectedSleeveId;
      const { x, y, radius } = sleeve;

      // Outer halo
      ctx.beginPath();
      ctx.arc(x, y, radius + 5, 0, Math.PI * 2);
      ctx.strokeStyle = isSelected ? 'rgba(2, 132, 199, 0.9)' : 'rgba(5, 150, 105, 0.5)';
      ctx.lineWidth = isSelected ? 3.5 : 2;
      ctx.stroke();

      // Main Sleeve Circle
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.strokeStyle = isSelected ? '#0284c7' : '#059669';
      ctx.lineWidth = isSelected ? 4 : 3;
      ctx.fillStyle = isSelected ? 'rgba(2, 132, 199, 0.25)' : 'rgba(5, 150, 105, 0.2)';
      ctx.fill();
      ctx.stroke();

      // Center crosshair
      ctx.beginPath();
      ctx.moveTo(x - 6, y);
      ctx.lineTo(x + 6, y);
      ctx.moveTo(x, y - 6);
      ctx.lineTo(x, y + 6);
      ctx.strokeStyle = isSelected ? '#0284c7' : '#059669';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Badge Label
      ctx.font = 'bold 12px sans-serif';
      const label = `Sleeve #${idx + 1}`;
      const textWidth = ctx.measureText(label).width;
      ctx.fillStyle = isSelected ? '#0284c7' : '#059669';
      ctx.fillRect(x - textWidth / 2 - 4, y - radius - 20, textWidth + 8, 18);
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, x, y - radius - 11);
    });
  };

  // Canvas Mouse & Touch Interaction (Add / Drag Sleeves)
  const getCanvasCoords = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    const clientX = e.clientX ?? e.touches?.[0]?.clientX;
    const clientY = e.clientY ?? e.touches?.[0]?.clientY;

    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  };

  const handleCanvasMouseDown = (e) => {
    const { x, y } = getCanvasCoords(e);

    // Check if clicked inside existing sleeve
    const hitSleeve = sleeves.find((s) => Math.hypot(s.x - x, s.y - y) <= s.radius + 6);

    if (hitSleeve) {
      setSelectedSleeveId(hitSleeve.id);
      draggingRef.current = {
        id: hitSleeve.id,
        offsetX: hitSleeve.x - x,
        offsetY: hitSleeve.y - y,
      };
    } else {
      // Add new sleeve at click point
      const newSleeve = {
        id: Date.now(),
        x: Math.round(x),
        y: Math.round(y),
        radius: defaultRadius,
      };
      setSleeves((prev) => [...prev, newSleeve]);
      setSelectedSleeveId(newSleeve.id);
    }
  };

  const handleCanvasMouseMove = (e) => {
    if (!draggingRef.current) return;
    const { x, y } = getCanvasCoords(e);
    const { id, offsetX, offsetY } = draggingRef.current;

    setSleeves((prev) =>
      prev.map((s) => (s.id === id ? { ...s, x: Math.round(x + offsetX), y: Math.round(y + offsetY) } : s))
    );
  };

  const handleCanvasMouseUp = () => {
    draggingRef.current = null;
  };

  // Upload image file
  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target.result;
      setActiveImage(dataUrl);
      setSelectedSleeveId(null);
    };
    reader.readAsDataURL(file);
  };

  // Auto-detect sleeves with OpenCV Hough Circles
  const handleAutoDetect = () => {
    if (!cvEngine || !cvReady || !canvasRef.current) return;
    setIsDetecting(true);
    try {
      const detected = cvEngine.autoDetectSleeves(canvasRef.current);
      if (detected && detected.length > 0) {
        setSleeves(detected);
        if (detected.length > 0) setSelectedSleeveId(detected[0].id);
      } else {
        alert('No circular sleeves automatically detected. Tap directly on the image to add sleeve positions manually.');
      }
    } catch (err) {
      console.warn('Auto-detect error:', err);
    } finally {
      setIsDetecting(false);
    }
  };

  // Start snapshot camera
  const startSnapshotCamera = async () => {
    try {
      setIsCameraActive(true);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } },
      });
      cameraStreamRef.current = stream;
      if (cameraVideoRef.current) {
        cameraVideoRef.current.srcObject = stream;
        cameraVideoRef.current.play();
      }
    } catch (err) {
      alert(`Camera capture error: ${err.message}`);
      setIsCameraActive(false);
    }
  };

  // Take photo from camera
  const capturePhoto = () => {
    const video = cameraVideoRef.current;
    if (!video) return;

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const dataUrl = canvas.toDataURL('image/png');
    setActiveImage(dataUrl);

    // Stop snapshot camera
    if (cameraStreamRef.current) {
      cameraStreamRef.current.getTracks().forEach((t) => t.stop());
    }
    setIsCameraActive(false);
  };

  // Load standard factory sample (3 sleeves)
  const handleLoadSample = () => {
    const sample = getDefaultMasterPart();
    setActiveImage(sample.imageUrl);
    setSleeves(sample.sleeves);
    setSelectedSleeveId(null);
  };

  // Save Master Part
  const handleSaveMaster = () => {
    if (sleeves.length === 0) {
      alert('Please add at least 1 metal sleeve position before saving.');
      return;
    }

    const canvas = canvasRef.current;
    const updatedMaster = {
      id: masterPart?.id || `master_${Date.now()}`,
      name: masterPart?.name || 'Injection Molded Plastic Bracket (3-Sleeve)',
      partNumber: masterPart?.partNumber || 'PL-BRKT-3X',
      imageUrl: activeImage,
      width: canvas?.width || 640,
      height: canvas?.height || 480,
      sleeves: sleeves.map((s, idx) => ({
        id: idx + 1,
        x: s.x,
        y: s.y,
        radius: s.radius,
      })),
      updatedAt: new Date().toISOString(),
    };

    saveMasterPart(updatedMaster);
    setMasterPart(updatedMaster);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2500);

    if (onMasterSaved) {
      onMasterSaved(updatedMaster);
    }
  };

  const selectedSleeve = sleeves.find((s) => s.id === selectedSleeveId);

  return (
    <div className="flex-1 flex flex-col bg-slate-100 text-slate-900 overflow-y-auto p-3 sm:p-5 select-none">
      {/* Top Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-300">
        <div className="flex items-center space-x-3">
          <button
            onClick={onBack}
            className="flex items-center space-x-1.5 px-3 py-2 rounded-xl bg-white hover:bg-slate-50 text-slate-800 text-sm font-bold border border-slate-300 shadow-sm transition cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Inspection</span>
          </button>
          <div>
            <h2 className="text-lg font-black text-slate-900 leading-tight">Master Setup & Sleeve Annotation</h2>
            <p className="text-xs text-slate-500 font-medium">
              Upload a GOOD plastic part with all 3 metal sleeves present. Mark sleeve positions.
            </p>
          </div>
        </div>

        {/* Master Action Buttons */}
        <div className="flex items-center space-x-2">
          <button
            onClick={handleLoadSample}
            className="px-3 py-2 rounded-xl bg-white hover:bg-slate-50 text-indigo-700 border border-slate-300 text-xs font-bold shadow-sm transition cursor-pointer"
          >
            Load 3-Sleeve Standard Part
          </button>
          <button
            onClick={handleSaveMaster}
            className="flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-black shadow-sm transition cursor-pointer"
          >
            <Save className="w-4 h-4" />
            <span>Save Master</span>
          </button>
        </div>
      </div>

      {saveSuccess && (
        <div className="mt-3 p-3 rounded-xl bg-emerald-50 border border-emerald-300 text-emerald-800 text-sm font-bold flex items-center space-x-2 shadow-sm">
          <Check className="w-5 h-5 text-emerald-600" />
          <span>Master reference part and {sleeves.length} sleeve coordinates saved successfully!</span>
        </div>
      )}

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 mt-4 flex-1">
        {/* Left/Center: Canvas Workspace */}
        <div className="lg:col-span-3 flex flex-col bg-white border border-slate-300 rounded-2xl overflow-hidden shadow-sm">
          {/* Canvas Toolbar */}
          <div className="p-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center space-x-2">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileUpload}
                accept="image/*"
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center space-x-1 px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-sm cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Upload Master Image</span>
              </button>
              <button
                onClick={startSnapshotCamera}
                className="flex items-center space-x-1 px-3 py-2 rounded-xl bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 text-xs font-bold shadow-sm cursor-pointer"
              >
                <Camera className="w-3.5 h-3.5" />
                <span>Take Camera Photo</span>
              </button>
              <button
                onClick={handleAutoDetect}
                disabled={isDetecting || !cvReady}
                className="flex items-center space-x-1 px-3 py-2 rounded-xl bg-white hover:bg-slate-50 text-amber-700 border border-slate-300 text-xs font-bold shadow-sm cursor-pointer disabled:opacity-50"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>{isDetecting ? 'Detecting...' : 'Auto-Detect Circles'}</span>
              </button>
            </div>

            <div className="flex items-center space-x-1.5 text-xs text-slate-600 font-medium">
              <Info className="w-4 h-4 text-slate-500" />
              <span>Tap on image to add sleeve • Drag to move</span>
            </div>
          </div>

          {/* Camera Snapshot Modal Overlay if active */}
          {isCameraActive && (
            <div className="p-4 bg-slate-900 flex flex-col items-center justify-center border-b border-slate-800">
              <div className="relative max-w-lg w-full rounded-xl overflow-hidden border border-slate-700 shadow-2xl">
                <video ref={cameraVideoRef} className="w-full h-auto bg-black" playsInline muted autoPlay />
                <div className="absolute inset-0 border-2 border-dashed border-indigo-400/70 pointer-events-none flex items-center justify-center">
                  <span className="text-xs font-bold text-indigo-900 bg-white/90 px-3 py-1 rounded-full shadow">
                    Align Good 3-Sleeve Part in Frame
                  </span>
                </div>
              </div>
              <div className="flex items-center space-x-3 mt-3">
                <button
                  onClick={capturePhoto}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-bold shadow cursor-pointer"
                >
                  Capture Photo
                </button>
                <button
                  onClick={() => {
                    if (cameraStreamRef.current) {
                      cameraStreamRef.current.getTracks().forEach((t) => t.stop());
                    }
                    setIsCameraActive(false);
                  }}
                  className="px-4 py-2 bg-white text-slate-800 rounded-xl text-sm font-bold shadow cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Master Canvas Area */}
          <div className="relative flex-1 bg-slate-200 flex items-center justify-center p-3 overflow-hidden select-none min-h-[360px]">
            <canvas
              ref={canvasRef}
              onMouseDown={handleCanvasMouseDown}
              onMouseMove={handleCanvasMouseMove}
              onMouseUp={handleCanvasMouseUp}
              onTouchStart={handleCanvasMouseDown}
              onTouchMove={handleCanvasMouseMove}
              onTouchEnd={handleCanvasMouseUp}
              className="max-w-full max-h-[60vh] object-contain border border-slate-300 rounded-xl shadow-md cursor-crosshair bg-white"
            />
          </div>
        </div>

        {/* Right Sidebar: Sleeves Management */}
        <div className="lg:col-span-1 bg-white border border-slate-300 rounded-2xl p-4 flex flex-col shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-slate-200">
            <h3 className="font-black text-slate-900 text-sm">Configured Sleeves ({sleeves.length})</h3>
            <button
              onClick={() => {
                setSleeves([]);
                setSelectedSleeveId(null);
              }}
              className="text-xs text-rose-600 hover:text-rose-700 font-bold cursor-pointer"
            >
              Clear All
            </button>
          </div>

          {/* Selected Sleeve Adjuster */}
          {selectedSleeve ? (
            <div className="p-3.5 rounded-xl bg-indigo-50 border border-indigo-200 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-indigo-950">
                  Editing Sleeve #{sleeves.findIndex((s) => s.id === selectedSleeve.id) + 1}
                </span>
                <button
                  onClick={() => {
                    setSleeves((prev) => prev.filter((s) => s.id !== selectedSleeve.id));
                    setSelectedSleeveId(null);
                  }}
                  className="p-1.5 rounded-lg bg-rose-100 text-rose-700 hover:bg-rose-200 transition"
                  title="Delete Sleeve"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>

              <div>
                <div className="flex justify-between text-xs text-slate-700 font-semibold mb-1">
                  <span>Radius: {selectedSleeve.radius}px</span>
                </div>
                <input
                  type="range"
                  min="12"
                  max="60"
                  value={selectedSleeve.radius}
                  onChange={(e) => {
                    const r = parseInt(e.target.value, 10);
                    setSleeves((prev) =>
                      prev.map((s) => (s.id === selectedSleeve.id ? { ...s, radius: r } : s))
                    );
                  }}
                  className="w-full accent-indigo-600 cursor-pointer"
                />
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs text-slate-600">
                <div className="bg-white p-2 rounded-lg border border-slate-200">
                  <span className="block text-[10px] font-semibold text-slate-400">X Position</span>
                  <span className="font-mono font-bold text-slate-800">{selectedSleeve.x}px</span>
                </div>
                <div className="bg-white p-2 rounded-lg border border-slate-200">
                  <span className="block text-[10px] font-semibold text-slate-400">Y Position</span>
                  <span className="font-mono font-bold text-slate-800">{selectedSleeve.y}px</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-500 text-center font-medium">
              Tap any sleeve circle on the image to inspect or adjust its radius.
            </div>
          )}

          {/* Sleeve List */}
          <div className="flex-1 overflow-y-auto space-y-2 max-h-56 pr-1">
            {sleeves.length === 0 ? (
              <div className="text-center py-6 text-xs text-slate-400">
                No sleeves marked yet. Tap anywhere on the part image to mark a metal sleeve.
              </div>
            ) : (
              sleeves.map((sleeve, idx) => (
                <div
                  key={sleeve.id}
                  onClick={() => setSelectedSleeveId(sleeve.id)}
                  className={`flex items-center justify-between p-2.5 rounded-xl border text-xs cursor-pointer transition ${
                    sleeve.id === selectedSleeveId
                      ? 'bg-indigo-50 border-indigo-400 text-indigo-950 font-bold'
                      : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <div className="flex items-center space-x-2">
                    <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-800 font-black flex items-center justify-center text-[10px] border border-emerald-300">
                      {idx + 1}
                    </span>
                    <span className="font-bold">Sleeve #{idx + 1}</span>
                  </div>
                  <div className="flex items-center space-x-2 text-slate-500 font-mono text-[11px]">
                    <span>r={sleeve.radius}px</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSleeves((prev) => prev.filter((s) => s.id !== sleeve.id));
                        if (selectedSleeveId === sleeve.id) setSelectedSleeveId(null);
                      }}
                      className="p-1 hover:text-rose-600 transition"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Instructions Box */}
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-[11px] text-slate-600 space-y-1">
            <span className="font-bold text-slate-800 block">Supervisor Instructions:</span>
            <p>1. Ensure all 3 brass/metal sleeves are inserted in the master part.</p>
            <p>2. Keep the plastic part reasonably flat and well-lit.</p>
            <p>3. Click "Save Master" once all 3 positions are circled in green.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
