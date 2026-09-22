import React, { useState, useRef, useEffect } from 'react';
import { 
  Upload, Camera, Check, Plus, Trash2, ArrowLeft, 
  Sparkles, Save, Info, Layers,
  RotateCw, RotateCcw, Cpu, Compass, CheckCircle2, Sliders, ShieldCheck
} from 'lucide-react';
import { generateDefaultMasterProfile, saveMasterProfile } from '../services/masterProfile';
import { PRELOADED_LAYOUTS, PART_INFO } from '../data/defaultMasterPart';

export default function MasterSetup({
  currentProfile,
  onProfileSaved,
  onBack,
  cvEngine,
  cvReady,
}) {
  const [profile, setProfile] = useState(currentProfile);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [sleeves, setSleeves] = useState(
    currentProfile?.sleeves || PRELOADED_LAYOUTS[0]?.sleeves.map((s) => ({
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
    }))
  );
  const [selectedSleeveId, setSelectedSleeveId] = useState(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [showVariablesPanel, setShowVariablesPanel] = useState(true);

  const canvasRef = useRef(null);
  const imageRef = useRef(new Image());
  const fileInputRef = useRef(null);
  const cameraVideoRef = useRef(null);
  const cameraStreamRef = useRef(null);
  const draggingRef = useRef(null);

  const activeImage = profile?.images?.[selectedImageIndex];

  // Redraw canvas whenever active image or sleeves change
  useEffect(() => {
    if (!activeImage?.dataUrl) return;
    const img = imageRef.current;
    img.crossOrigin = 'Anonymous';
    img.src = activeImage.dataUrl;
    img.onload = () => {
      redrawCanvas();
    };
  }, [activeImage, sleeves, selectedSleeveId]);

  const redrawCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const img = imageRef.current;

    if (!img.complete || img.naturalWidth === 0) return;

    canvas.width = img.naturalWidth || 640;
    canvas.height = img.naturalHeight || 640;

    // Draw reference image
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    // Draw central hub reticle
    const hubCx = canvas.width / 2;
    const hubCy = canvas.height / 2;
    ctx.save();
    ctx.beginPath();
    ctx.arc(hubCx, hubCy, 6, 0, Math.PI * 2);
    ctx.fillStyle = '#0284c7';
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Central hub reference circle connecting the 3 sleeves
    const avgDist = sleeves.reduce((sum, s) => sum + Math.hypot(s.x - hubCx, s.y - hubCy), 0) / (sleeves.length || 1);
    ctx.beginPath();
    ctx.arc(hubCx, hubCy, avgDist, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(2, 132, 199, 0.35)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    // Draw each annotated sleeve
    sleeves.forEach((sleeve, idx) => {
      const isSelected = sleeve.id === selectedSleeveId;
      const { x, y, radius } = sleeve;

      // Radial strut connector line from hub to sleeve boss
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(hubCx, hubCy);
      ctx.lineTo(x, y);
      ctx.strokeStyle = isSelected ? 'rgba(2, 132, 199, 0.8)' : 'rgba(5, 150, 105, 0.4)';
      ctx.lineWidth = isSelected ? 2 : 1.5;
      ctx.stroke();
      ctx.restore();

      // Outer halo
      ctx.beginPath();
      ctx.arc(x, y, radius + 6, 0, Math.PI * 2);
      ctx.strokeStyle = isSelected ? 'rgba(2, 132, 199, 0.95)' : 'rgba(5, 150, 105, 0.6)';
      ctx.lineWidth = isSelected ? 3.5 : 2;
      ctx.stroke();

      // Main Sleeve Circle
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.strokeStyle = isSelected ? '#0284c7' : '#059669';
      ctx.lineWidth = isSelected ? 4 : 3;
      ctx.fillStyle = isSelected ? 'rgba(2, 132, 199, 0.3)' : 'rgba(5, 150, 105, 0.2)';
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
      ctx.font = 'bold 11px sans-serif';
      const label = sleeve.name || `Sleeve ${idx + 1}`;
      const textWidth = ctx.measureText(label).width;
      ctx.fillStyle = isSelected ? '#0284c7' : '#059669';
      ctx.fillRect(x - textWidth / 2 - 5, y - radius - 20, textWidth + 10, 18);
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, x, y - radius - 11);
    });
  };

  // Canvas Mouse & Touch Interaction
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
    const hitSleeve = sleeves.find((s) => Math.hypot(s.x - x, s.y - y) <= s.radius + 8);

    if (hitSleeve) {
      setSelectedSleeveId(hitSleeve.id);
      draggingRef.current = {
        id: hitSleeve.id,
        offsetX: hitSleeve.x - x,
        offsetY: hitSleeve.y - y,
      };
    }
  };

  const handleCanvasMouseMove = (e) => {
    if (!draggingRef.current) return;
    const { x, y } = getCanvasCoords(e);
    const { id, offsetX, offsetY } = draggingRef.current;

    setSleeves((prev) =>
      prev.map((s) =>
        s.id === id ? { ...s, x: Math.round(x + offsetX), y: Math.round(y + offsetY) } : s
      )
    );
  };

  const handleCanvasMouseUp = () => {
    draggingRef.current = null;
  };

  // Switch to a preloaded layout
  const handleSelectPreloadedLayout = (layout) => {
    // Find index in profile images
    let targetIndex = profile?.images?.findIndex((img) => img.id === layout.id);
    if (targetIndex === -1) {
      targetIndex = 0;
    }
    setSelectedImageIndex(targetIndex);

    // Apply layout sleeves
    const newSleeves = layout.sleeves.map((s) => ({
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
    }));

    setSleeves(newSleeves);
    setProfile((prev) => ({
      ...prev,
      activeLayoutId: layout.id,
      sleeves: newSleeves,
    }));
  };

  // Multi-Image Upload
  const handleMultipleFilesUpload = (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const readers = files.map((file, idx) => {
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (ev) => {
          resolve({
            id: `upload_${Date.now()}_${idx}`,
            label: `Upload ${profile.images.length + idx + 1} (${file.name})`,
            dataUrl: ev.target.result,
            width: 640,
            height: 640,
          });
        };
        reader.readAsDataURL(file);
      });
    });

    Promise.all(readers).then((newImages) => {
      setProfile((prev) => ({
        ...prev,
        images: [...prev.images, ...newImages].slice(0, 12),
      }));
    });
  };

  // Capture Camera Snapshot into Master Profile
  const startCameraCapture = async () => {
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
      alert(`Camera error: ${err.message}`);
      setIsCameraActive(false);
    }
  };

  const takePhotoAndAdd = () => {
    const video = cameraVideoRef.current;
    if (!video) return;

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 640;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
    const newImage = {
      id: `photo_${Date.now()}`,
      label: `Snapshot ${profile.images.length + 1}`,
      dataUrl,
      width: canvas.width,
      height: canvas.height,
    };

    setProfile((prev) => ({
      ...prev,
      images: [...prev.images, newImage].slice(0, 12),
    }));

    if (cameraStreamRef.current) {
      cameraStreamRef.current.getTracks().forEach((t) => t.stop());
    }
    setIsCameraActive(false);
  };

  // Remove Master Image from Profile
  const removeImage = (index) => {
    if (profile.images.length <= 1) {
      alert('Master profile must have at least 1 image.');
      return;
    }
    setProfile((prev) => {
      const updated = prev.images.filter((_, i) => i !== index);
      return { ...prev, images: updated };
    });
    if (selectedImageIndex >= profile.images.length - 1) {
      setSelectedImageIndex(Math.max(0, profile.images.length - 2));
    }
  };

  // Reset to Default Multi-Layout Factory Profile
  const handleResetToDefaultProfile = async () => {
    const defaultProfile = generateDefaultMasterProfile();
    setProfile(defaultProfile);
    setSleeves(defaultProfile.sleeves);
    setSelectedImageIndex(0);
    setSelectedSleeveId(null);
    saveMasterProfile(defaultProfile);

    if (cvEngine) {
      await cvEngine.loadMasterProfile(defaultProfile);
    }

    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2500);
  };

  // Save Master Part Profile
  const handleSaveProfile = async () => {
    if (sleeves.length !== 3) {
      alert('Please configure all 3 sleeve positions before saving.');
      return;
    }

    const updatedProfile = {
      ...profile,
      sleeves,
      updatedAt: new Date().toISOString(),
    };

    saveMasterProfile(updatedProfile);
    setProfile(updatedProfile);

    // Extract descriptors in CV Engine
    if (cvEngine) {
      await cvEngine.loadMasterProfile(updatedProfile);
    }

    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2500);

    if (onProfileSaved) {
      onProfileSaved(updatedProfile);
    }
  };

  // Rotate active master image and synchronously adjust sleeve coordinates
  const rotateActiveImage = (angleDeg = 90) => {
    if (!activeImage?.dataUrl) return;
    const img = imageRef.current;
    if (!img.complete) return;

    const canvas = document.createElement('canvas');
    const rad = (angleDeg * Math.PI) / 180;
    const isQuarterTurn = Math.abs(angleDeg % 180) === 90;

    const newW = isQuarterTurn ? img.naturalHeight : img.naturalWidth;
    const newH = isQuarterTurn ? img.naturalWidth : img.naturalHeight;

    canvas.width = newW;
    canvas.height = newH;
    const ctx = canvas.getContext('2d');

    ctx.translate(newW / 2, newH / 2);
    ctx.rotate(rad);
    ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);

    const rotatedDataUrl = canvas.toDataURL('image/jpeg', 0.82);

    const origCx = img.naturalWidth / 2;
    const origCy = img.naturalHeight / 2;
    const newCx = newW / 2;
    const newCy = newH / 2;

    const cos = Math.cos(rad);
    const sin = Math.sin(rad);

    const rotatedSleeves = sleeves.map((s) => {
      const dx = s.x - origCx;
      const dy = s.y - origCy;
      const rx = dx * cos - dy * sin;
      const ry = dx * sin + dy * cos;
      return {
        ...s,
        x: Math.round(newCx + rx),
        y: Math.round(newCy + ry),
      };
    });

    setSleeves(rotatedSleeves);

    setProfile((prev) => {
      const updatedImages = [...prev.images];
      updatedImages[selectedImageIndex] = {
        ...updatedImages[selectedImageIndex],
        dataUrl: rotatedDataUrl,
        width: newW,
        height: newH,
      };
      return {
        ...prev,
        images: updatedImages,
        sleeves: rotatedSleeves,
      };
    });
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
            <span>Back to Live Inspection</span>
          </button>
          <div>
            <div className="flex items-center space-x-2">
              <h2 className="text-lg font-black text-slate-900 leading-tight">
                Master Part Learning – Radiance PA6-GF50 Fan Shroud
              </h2>
              <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-black border border-emerald-300 uppercase tracking-wide">
                7 Pre-Trained Layouts
              </span>
            </div>
            <p className="text-xs text-slate-500 font-medium">
              Multi-layout learning variables generated from the OK part image (Rotations 0°–360°, Tilt & Scale).
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center space-x-2">
          <button
            onClick={handleResetToDefaultProfile}
            className="flex items-center space-x-1.5 px-3 py-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-xs font-bold shadow-sm transition cursor-pointer"
            title="Reload all 7 pre-learned OK part layouts"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Reload Default OK Part Layouts</span>
          </button>
          <button
            onClick={handleSaveProfile}
            className="flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-black shadow-sm transition cursor-pointer"
          >
            <Save className="w-4 h-4" />
            <span>Save & Train Profile</span>
          </button>
        </div>
      </div>

      {saveSuccess && (
        <div className="mt-3 p-3 rounded-xl bg-emerald-50 border border-emerald-300 text-emerald-800 text-sm font-bold flex items-center space-x-2 shadow-sm">
          <Check className="w-5 h-5 text-emerald-600 flex-shrink-0" />
          <span>
            Master Part Profile and all 7 layout learning variables successfully trained into inspection engine!
          </span>
        </div>
      )}

      {/* Preloaded Layouts Ribbon */}
      <div className="mt-4 p-3 bg-white border border-slate-300 rounded-2xl shadow-sm">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center space-x-2">
            <Compass className="w-4 h-4 text-indigo-600" />
            <span className="text-xs font-black text-slate-800 uppercase tracking-wider">
              Pre-Learned OK Part Layouts ({PRELOADED_LAYOUTS.length} Layouts Available)
            </span>
          </div>
          <span className="text-[11px] text-slate-500">
            Click any layout to inspect transformed sleeve coordinates & orientation
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2">
          {PRELOADED_LAYOUTS.map((layout) => {
            const isActive = profile?.images?.[selectedImageIndex]?.id === layout.id;
            return (
              <button
                key={layout.id}
                onClick={() => handleSelectPreloadedLayout(layout)}
                className={`flex flex-col items-center p-2 rounded-xl border text-left transition cursor-pointer ${
                  isActive
                    ? 'border-indigo-600 bg-indigo-50/80 ring-2 ring-indigo-300 shadow-sm'
                    : 'border-slate-200 bg-slate-50/60 hover:bg-slate-100 hover:border-slate-300'
                }`}
              >
                <div className="relative w-full aspect-square rounded-lg overflow-hidden border border-slate-200 bg-slate-900 mb-1.5">
                  <img
                    src={layout.imageBase64}
                    alt={layout.name}
                    className="w-full h-full object-cover"
                  />
                  <span className="absolute top-1 right-1 bg-black/75 text-white text-[9px] font-mono px-1 rounded">
                    {layout.rotation}°
                  </span>
                </div>
                <span className="text-[11px] font-bold text-slate-900 truncate w-full text-center">
                  {layout.name.replace('Layout ', 'L')}
                </span>
                <span className="text-[9px] text-slate-500 truncate w-full text-center">
                  scale: {Math.round(layout.scale * 100)}%
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 mt-4 flex-1">
        {/* Left/Center: Primary Image Annotation Canvas */}
        <div className="lg:col-span-3 flex flex-col bg-white border border-slate-300 rounded-2xl overflow-hidden shadow-sm">
          <div className="p-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center space-x-2">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center space-x-1 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-sm cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Upload Part Image</span>
              </button>
              <button
                onClick={startCameraCapture}
                className="flex items-center space-x-1 px-3 py-1.5 rounded-xl bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 text-xs font-bold shadow-sm cursor-pointer"
              >
                <Camera className="w-3.5 h-3.5" />
                <span>Camera Snap</span>
              </button>

              <div className="h-6 w-px bg-slate-300 mx-1 hidden sm:block"></div>

              {/* Rotate Image Controls */}
              <button
                onClick={() => rotateActiveImage(90)}
                className="flex items-center space-x-1 px-2.5 py-1.5 rounded-xl bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 text-xs font-bold shadow-sm transition cursor-pointer"
                title="Rotate image 90° Clockwise"
              >
                <RotateCw className="w-3.5 h-3.5 text-indigo-600" />
                <span>Rotate 90°</span>
              </button>
              <button
                onClick={() => rotateActiveImage(-90)}
                className="flex items-center space-x-1 px-2 py-1.5 rounded-xl bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 text-xs font-bold shadow-sm transition cursor-pointer"
                title="Rotate image 90° Counter-Clockwise"
              >
                <RotateCcw className="w-3.5 h-3.5 text-indigo-600" />
                <span>-90°</span>
              </button>
              <button
                onClick={() => rotateActiveImage(180)}
                className="px-2.5 py-1.5 rounded-xl bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 text-xs font-bold shadow-sm transition cursor-pointer"
                title="Flip image 180°"
              >
                <span>Flip 180°</span>
              </button>

              <div className="h-6 w-px bg-slate-300 mx-1 hidden sm:block"></div>

              <button
                onClick={() => setShowVariablesPanel(!showVariablesPanel)}
                className={`flex items-center space-x-1 px-2.5 py-1.5 rounded-xl border text-xs font-bold shadow-sm transition cursor-pointer ${
                  showVariablesPanel
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                }`}
              >
                <Sliders className="w-3.5 h-3.5" />
                <span>Learning Variables</span>
              </button>
            </div>

            <div className="text-xs font-semibold text-slate-600 flex items-center space-x-1">
              <Info className="w-4 h-4 text-slate-400" />
              <span>Viewing: {activeImage?.label || `Image #${selectedImageIndex + 1}`} • Drag sleeves to fine-tune</span>
            </div>
          </div>

          {/* Camera Capture Modal */}
          {isCameraActive && (
            <div className="p-4 bg-slate-900 flex flex-col items-center justify-center border-b border-slate-800">
              <div className="relative max-w-lg w-full rounded-2xl overflow-hidden border border-slate-700 shadow-2xl">
                <video ref={cameraVideoRef} className="w-full h-auto bg-black" playsInline muted autoPlay />
                <div className="absolute inset-0 border-2 border-dashed border-indigo-400/70 pointer-events-none flex items-center justify-center">
                  <span className="text-xs font-bold text-indigo-900 bg-white/95 px-3 py-1 rounded-full shadow">
                    Capture Part at Different Angle / Rotation
                  </span>
                </div>
              </div>
              <div className="flex items-center space-x-3 mt-3">
                <button
                  onClick={takePhotoAndAdd}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-bold shadow cursor-pointer"
                >
                  Snap & Add to Master
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

          {/* Canvas Area */}
          <div className="relative flex-1 bg-slate-200 flex items-center justify-center p-3 overflow-hidden min-h-[400px]">
            <canvas
              ref={canvasRef}
              onMouseDown={handleCanvasMouseDown}
              onMouseMove={handleCanvasMouseMove}
              onMouseUp={handleCanvasMouseUp}
              onTouchStart={handleCanvasMouseDown}
              onTouchMove={handleCanvasMouseMove}
              onTouchEnd={handleCanvasMouseUp}
              className="max-w-full max-h-[62vh] object-contain border border-slate-300 rounded-xl shadow-md cursor-crosshair bg-white"
            />
          </div>

          {/* Learning Variables & Invariants Drawer */}
          {showVariablesPanel && (
            <div className="p-3.5 bg-slate-50 border-t border-slate-200">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center space-x-2">
                  <Cpu className="w-4 h-4 text-indigo-600" />
                  <span className="text-xs font-black text-slate-800 uppercase tracking-wide">
                    Calibrated Learning Variables & Invariants (PA6-GF50 Fan Shroud)
                  </span>
                </div>
                <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-md border border-emerald-200">
                  Rigid Body Invariants: Calibrated
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                <div className="bg-white p-2.5 rounded-xl border border-slate-200 shadow-xs">
                  <span className="block text-[10px] font-bold text-slate-400 uppercase">Part Material</span>
                  <span className="font-bold text-slate-900">PA6-GF50 Polyamide</span>
                  <span className="block text-[10px] text-slate-500">50% Glass Filled</span>
                </div>

                <div className="bg-white p-2.5 rounded-xl border border-slate-200 shadow-xs">
                  <span className="block text-[10px] font-bold text-slate-400 uppercase">Required Sleeves</span>
                  <span className="font-bold text-emerald-700">Exactly 3 Metal Bushings</span>
                  <span className="block text-[10px] text-slate-500">Around Motor Hub</span>
                </div>

                <div className="bg-white p-2.5 rounded-xl border border-slate-200 shadow-xs">
                  <span className="block text-[10px] font-bold text-slate-400 uppercase">Hub Center (Norm)</span>
                  <span className="font-mono font-bold text-indigo-900">X: 0.500, Y: 0.500</span>
                  <span className="block text-[10px] text-slate-500">Radius: 0.135 frame</span>
                </div>

                <div className="bg-white p-2.5 rounded-xl border border-slate-200 shadow-xs">
                  <span className="block text-[10px] font-bold text-slate-400 uppercase">Metal Sheen Metric</span>
                  <span className="font-mono font-bold text-amber-600">202 / 255 luminance</span>
                  <span className="block text-[10px] text-slate-500">Min Threshold: 115</span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-2 text-xs">
                <div className="bg-white p-2.5 rounded-xl border border-slate-200 shadow-xs">
                  <div className="flex justify-between items-center mb-1">
                    <span className="font-bold text-slate-900">Sleeve 1 (Left Boss)</span>
                    <span className="font-mono text-[11px] font-bold text-emerald-700">180°</span>
                  </div>
                  <div className="text-[10px] text-slate-500 space-y-0.5 font-mono">
                    <div>Norm: (0.370, 0.500)</div>
                    <div>Distance: 0.130 • Circularity: 0.91</div>
                  </div>
                </div>

                <div className="bg-white p-2.5 rounded-xl border border-slate-200 shadow-xs">
                  <div className="flex justify-between items-center mb-1">
                    <span className="font-bold text-slate-900">Sleeve 2 (Top-Right)</span>
                    <span className="font-mono text-[11px] font-bold text-emerald-700">302.5°</span>
                  </div>
                  <div className="text-[10px] text-slate-500 space-y-0.5 font-mono">
                    <div>Norm: (0.570, 0.389)</div>
                    <div>Distance: 0.131 • Circularity: 0.91</div>
                  </div>
                </div>

                <div className="bg-white p-2.5 rounded-xl border border-slate-200 shadow-xs">
                  <div className="flex justify-between items-center mb-1">
                    <span className="font-bold text-slate-900">Sleeve 3 (Bottom-Right)</span>
                    <span className="font-mono text-[11px] font-bold text-emerald-700">57.5°</span>
                  </div>
                  <div className="text-[10px] text-slate-500 space-y-0.5 font-mono">
                    <div>Norm: (0.570, 0.610)</div>
                    <div>Distance: 0.130 • Circularity: 0.91</div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right Sidebar: Predefined Sleeve Regions (1, 2, 3) */}
        <div className="lg:col-span-1 bg-white border border-slate-300 rounded-2xl p-4 flex flex-col shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-slate-200">
            <h3 className="font-black text-slate-900 text-sm">Sleeve Regions (3 Positions)</h3>
            <span className="text-xs text-indigo-600 font-bold font-mono">3 / 3</span>
          </div>

          {/* Selected Sleeve Adjuster */}
          {selectedSleeve && (
            <div className="p-3.5 rounded-xl bg-indigo-50 border border-indigo-200 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-indigo-950">
                  {selectedSleeve.name}
                </span>
                <span className="text-[11px] font-mono text-indigo-700 font-bold">
                  r={selectedSleeve.radius}px
                </span>
              </div>

              <div>
                <div className="flex justify-between text-xs text-slate-700 font-semibold mb-1">
                  <span>Inspection Radius</span>
                  <span>{selectedSleeve.radius}px</span>
                </div>
                <input
                  type="range"
                  min="12"
                  max="45"
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
          )}

          {/* Sleeve Region List */}
          <div className="space-y-2">
            {sleeves.map((sleeve, idx) => (
              <div
                key={sleeve.id}
                onClick={() => setSelectedSleeveId(sleeve.id)}
                className={`flex items-center justify-between p-3 rounded-xl border text-xs cursor-pointer transition ${
                  sleeve.id === selectedSleeveId
                    ? 'bg-indigo-50 border-indigo-400 text-indigo-950 font-bold'
                    : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                }`}
              >
                <div className="flex items-center space-x-2">
                  <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-800 font-black flex items-center justify-center text-xs border border-emerald-300">
                    {idx + 1}
                  </span>
                  <div>
                    <span className="font-bold block">{sleeve.name}</span>
                    <span className="text-[10px] text-slate-500 font-mono">
                      ({sleeve.x}, {sleeve.y}) • r={sleeve.radius}px
                    </span>
                  </div>
                </div>
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              </div>
            ))}
          </div>

          {/* Master Learning Guidelines */}
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-[11px] text-slate-600 space-y-1.5">
            <span className="font-bold text-slate-800 block">Pre-Fed OK Part Status:</span>
            <p className="text-emerald-700 font-semibold">✓ 7 layout variations pre-calculated from your OK part image.</p>
            <p>• Fast 60 FPS scanner automatically resolves part rotation 0°–360°.</p>
            <p>• OpenCV ORB extracts keypoint descriptors across all 7 layouts.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
