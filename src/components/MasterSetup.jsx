import React, { useState, useRef, useEffect } from 'react';
import { 
  Upload, Camera, Check, Plus, Trash2, ArrowLeft, 
  Sparkles, Save, Info, Image as ImageIcon, Layers
} from 'lucide-react';
import { generateDefaultMasterProfile, saveMasterProfile } from '../services/masterProfile';

export default function MasterSetup({
  currentProfile,
  onProfileSaved,
  onBack,
  cvEngine,
  cvReady,
}) {
  const [profile, setProfile] = useState(currentProfile);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [sleeves, setSleeves] = useState(currentProfile?.sleeves || [
    { id: 1, name: 'Position A', x: 200, y: 180, radius: 25 },
    { id: 2, name: 'Position B', x: 440, y: 180, radius: 25 },
    { id: 3, name: 'Position C', x: 320, y: 315, radius: 25 },
  ]);
  const [selectedSleeveId, setSelectedSleeveId] = useState(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isCameraActive, setIsCameraActive] = useState(false);

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
      const label = sleeve.name || `Position ${String.fromCharCode(65 + idx)}`;
      const textWidth = ctx.measureText(label).width;
      ctx.fillStyle = isSelected ? '#0284c7' : '#059669';
      ctx.fillRect(x - textWidth / 2 - 4, y - radius - 20, textWidth + 8, 18);
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
    } else if (sleeves.length < 3) {
      const newSleeve = {
        id: Date.now(),
        name: `Position ${String.fromCharCode(65 + sleeves.length)}`,
        x: Math.round(x),
        y: Math.round(y),
        radius: 25,
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
      prev.map((s) =>
        s.id === id ? { ...s, x: Math.round(x + offsetX), y: Math.round(y + offsetY) } : s
      )
    );
  };

  const handleCanvasMouseUp = () => {
    draggingRef.current = null;
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
            height: 480,
          });
        };
        reader.readAsDataURL(file);
      });
    });

    Promise.all(readers).then((newImages) => {
      setProfile((prev) => ({
        ...prev,
        images: [...prev.images, ...newImages].slice(0, 10), // cap at 10 images
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
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const dataUrl = canvas.toDataURL('image/png');
    const newImage = {
      id: `photo_${Date.now()}`,
      label: `Snapshot ${profile.images.length + 1}`,
      dataUrl,
      width: canvas.width,
      height: canvas.height,
    };

    setProfile((prev) => ({
      ...prev,
      images: [...prev.images, newImage].slice(0, 10),
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

  // Reset to Default Multi-Angle Profile
  const handleResetToDefaultProfile = () => {
    const defaultProfile = generateDefaultMasterProfile();
    setProfile(defaultProfile);
    setSleeves(defaultProfile.sleeves);
    setSelectedImageIndex(0);
    setSelectedSleeveId(null);
  };

  // Save Master Part Profile
  const handleSaveProfile = async () => {
    if (sleeves.length !== 3) {
      alert('Please configure all 3 sleeve positions (A, B, C) before saving.');
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
            <h2 className="text-lg font-black text-slate-900 leading-tight">
              Master Learning – Multi-Image Profile
            </h2>
            <p className="text-xs text-slate-500 font-medium">
              Upload 5–10 images of a GOOD part at different angles & rotations to train ORB feature matching.
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center space-x-2">
          <button
            onClick={handleResetToDefaultProfile}
            className="px-3 py-2 rounded-xl bg-white hover:bg-slate-50 text-indigo-700 border border-slate-300 text-xs font-bold shadow-sm transition cursor-pointer"
          >
            Load 6-Angle Standard Profile
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
          <Check className="w-5 h-5 text-emerald-600" />
          <span>
            Master Profile trained successfully with {profile?.images?.length || 0} reference images and 3 sleeve regions!
          </span>
        </div>
      )}

      {/* Multi-Image Thumbnail Ribbon */}
      <div className="mt-4 p-3 bg-white border border-slate-300 rounded-2xl shadow-sm">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center space-x-2">
            <Layers className="w-4 h-4 text-indigo-600" />
            <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
              Master Learning Images ({profile?.images?.length || 0} / 10 Images)
            </span>
          </div>
          <span className="text-[11px] text-slate-500">
            Click thumbnail to view/annotate • Recommended: 5–10 images
          </span>
        </div>

        <div className="flex items-center space-x-2 overflow-x-auto pb-1">
          {profile?.images?.map((imgItem, idx) => (
            <div
              key={imgItem.id}
              onClick={() => setSelectedImageIndex(idx)}
              className={`relative flex-shrink-0 w-24 h-20 rounded-xl overflow-hidden border-2 cursor-pointer transition ${
                idx === selectedImageIndex
                  ? 'border-indigo-600 ring-2 ring-indigo-300 shadow-md'
                  : 'border-slate-300 hover:border-slate-400'
              }`}
            >
              <img
                src={imgItem.dataUrl}
                alt={imgItem.label}
                className="w-full h-full object-cover"
              />
              <span className="absolute bottom-0 inset-x-0 bg-black/70 text-white text-[9px] font-bold text-center py-0.5 truncate px-1">
                {imgItem.label || `#${idx + 1}`}
              </span>
              {profile.images.length > 1 && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    removeImage(idx);
                  }}
                  className="absolute top-1 right-1 p-0.5 rounded bg-rose-600 text-white hover:bg-rose-700"
                  title="Remove Image"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              )}
            </div>
          ))}

          {/* Add Image Button */}
          {profile?.images?.length < 10 && (
            <div className="flex-shrink-0 flex items-center space-x-1.5 pl-2">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleMultipleFilesUpload}
                accept="image/*"
                multiple
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex flex-col items-center justify-center w-24 h-20 rounded-xl border-2 border-dashed border-slate-300 hover:border-indigo-500 hover:bg-indigo-50/50 text-slate-500 hover:text-indigo-600 transition cursor-pointer"
              >
                <Plus className="w-5 h-5 mb-1" />
                <span className="text-[10px] font-bold">Add Images</span>
              </button>
            </div>
          )}
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
                <span>Upload Photos</span>
              </button>
              <button
                onClick={startCameraCapture}
                className="flex items-center space-x-1 px-3 py-1.5 rounded-xl bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 text-xs font-bold shadow-sm cursor-pointer"
              >
                <Camera className="w-3.5 h-3.5" />
                <span>Capture Angle with Camera</span>
              </button>
            </div>
            <div className="text-xs font-semibold text-slate-600 flex items-center space-x-1">
              <Info className="w-4 h-4 text-slate-400" />
              <span>Viewing: {activeImage?.label || `Image #${selectedImageIndex + 1}`} • Drag circles to position sleeves</span>
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
          <div className="relative flex-1 bg-slate-200 flex items-center justify-center p-3 overflow-hidden min-h-[360px]">
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

        {/* Right Sidebar: Predefined Sleeve Regions (A, B, C) */}
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
                  min="14"
                  max="55"
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
                    {String.fromCharCode(65 + idx)}
                  </span>
                  <div>
                    <span className="font-bold block">{sleeve.name}</span>
                    <span className="text-[10px] text-slate-500 font-mono">
                      ({sleeve.x}, {sleeve.y}) • r={sleeve.radius}px
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Master Learning Instructions */}
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-[11px] text-slate-600 space-y-1.5">
            <span className="font-bold text-slate-800 block">Master Learning Guidelines:</span>
            <p>• Upload 5–10 good parts at different rotations (0°, 45°, 90°, 180°).</p>
            <p>• Include slightly tilted and zoomed-in photos.</p>
            <p>• Click "Save & Train Profile" to generate multi-image ORB descriptors.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
