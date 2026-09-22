import React, { useRef, useEffect, useState, useCallback } from 'react';
import { 
  Play, Square, RefreshCw, AlertTriangle, CheckCircle, 
  Wrench, Camera, ShieldAlert, Zap, AlertCircle
} from 'lucide-react';

export default function InspectionView({
  cvEngine,
  cvReady,
  masterPart,
  onOpenMasterSetup,
  onOpenSimulator,
  useCameraHook,
  useAudioAlertHook,
  settings,
  simulatedCanvas, // Optional virtual test bench canvas stream
  isSimulating,
}) {
  const {
    videoRef,
    isActive: isCameraActive,
    facingMode,
    hasMultipleCameras,
    startCamera,
    stopCamera,
    switchCamera,
    error: cameraError,
  } = useCameraHook;

  const { startAlarm, stopAlarm, initAudio, isMuted } = useAudioAlertHook;

  const [isInspecting, setIsInspecting] = useState(false);
  const [inspectionResult, setInspectionResult] = useState({
    status: 'IDLE', // 'IDLE' | 'SEARCHING' | 'PASS' | 'FAIL'
    message: 'Press "Start Inspection" to begin',
    sleeves: [],
    partDetected: false,
    missingCount: 0,
  });

  const overlayCanvasRef = useRef(null);
  const animationFrameIdRef = useRef(null);
  const lastProcessTimeRef = useRef(0);

  const totalTargetSleeves = masterPart?.sleeves?.length || 3;

  // Stop inspection and alarm on unmount
  useEffect(() => {
    return () => {
      stopAlarm();
      if (animationFrameIdRef.current) {
        cancelAnimationFrame(animationFrameIdRef.current);
      }
    };
  }, [stopAlarm]);

  // Audio alarm triggering based on inspection result
  useEffect(() => {
    if (!isInspecting) {
      stopAlarm();
      return;
    }

    if (inspectionResult.status === 'FAIL') {
      startAlarm();
    } else {
      stopAlarm();
    }
  }, [inspectionResult.status, isInspecting, startAlarm, stopAlarm]);

  // Start Inspection flow
  const handleStartInspection = async () => {
    initAudio(); // Unlock audio context on user gesture
    if (!isSimulating && !isCameraActive) {
      const ok = await startCamera();
      if (!ok) return;
    }
    setIsInspecting(true);
    setInspectionResult({
      status: 'SEARCHING',
      message: 'Searching for plastic part...',
      sleeves: [],
      partDetected: false,
      missingCount: 0,
    });
  };

  // Stop Inspection flow
  const handleStopInspection = () => {
    setIsInspecting(false);
    stopAlarm();
    if (animationFrameIdRef.current) {
      cancelAnimationFrame(animationFrameIdRef.current);
    }
    setInspectionResult({
      status: 'IDLE',
      message: 'Inspection stopped',
      sleeves: [],
      partDetected: false,
      missingCount: 0,
    });

    // Clear overlay canvas
    const canvas = overlayCanvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  };

  // Continuous Inspection Loop
  const runInspectionLoop = useCallback(() => {
    if (!isInspecting || !cvEngine || !cvReady) return;

    const now = performance.now();
    const interval = settings?.inspectionIntervalMs || 100;

    if (now - lastProcessTimeRef.current >= interval) {
      lastProcessTimeRef.current = now;

      // Select active frame source: Simulated bench or live video
      const sourceElement = isSimulating ? simulatedCanvas : videoRef.current;

      if (sourceElement && (sourceElement.videoWidth > 0 || sourceElement.width > 0)) {
        try {
          const result = cvEngine.processFrame(sourceElement, settings);
          setInspectionResult(result);
          drawOverlay(result, sourceElement);
        } catch (err) {
          console.error('Frame inspection error:', err);
        }
      }
    }

    animationFrameIdRef.current = requestAnimationFrame(runInspectionLoop);
  }, [isInspecting, cvEngine, cvReady, settings, isSimulating, simulatedCanvas, videoRef]);

  useEffect(() => {
    if (isInspecting) {
      animationFrameIdRef.current = requestAnimationFrame(runInspectionLoop);
    } else {
      if (animationFrameIdRef.current) {
        cancelAnimationFrame(animationFrameIdRef.current);
      }
    }
    return () => {
      if (animationFrameIdRef.current) {
        cancelAnimationFrame(animationFrameIdRef.current);
      }
    };
  }, [isInspecting, runInspectionLoop]);

  // Draw HUD Overlays (Green/Red circles, labels, part boundary)
  const drawOverlay = (result, source) => {
    const canvas = overlayCanvasRef.current;
    if (!canvas) return;

    const sourceW = source.videoWidth || source.width || 640;
    const sourceH = source.videoHeight || source.height || 480;

    if (canvas.width !== sourceW || canvas.height !== sourceH) {
      canvas.width = sourceW;
      canvas.height = sourceH;
    }

    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!result.partDetected) {
      // Draw subtle target reticle when searching for part
      const cx = canvas.width / 2;
      const cy = canvas.height / 2;
      const r = Math.min(canvas.width, canvas.height) * 0.32;

      ctx.save();
      ctx.strokeStyle = 'rgba(217, 119, 6, 0.7)';
      ctx.setLineDash([8, 6]);
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();

      ctx.font = 'bold 14px sans-serif';
      ctx.fillStyle = '#b45309';
      ctx.textAlign = 'center';
      ctx.fillText('TARGET PART ZONE', cx, cy - r - 12);
      ctx.restore();
      return;
    }

    // 1. Draw Part Oriented Boundary (shows homography lock)
    if (settings?.drawPartOutline && result.partCorners && result.partCorners.length === 4) {
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(result.partCorners[0].x, result.partCorners[0].y);
      for (let i = 1; i < 4; i++) {
        ctx.lineTo(result.partCorners[i].x, result.partCorners[i].y);
      }
      ctx.closePath();
      ctx.strokeStyle = 'rgba(14, 165, 233, 0.9)';
      ctx.lineWidth = 3.5;
      ctx.setLineDash([8, 4]);
      ctx.stroke();

      ctx.fillStyle = 'rgba(14, 165, 233, 0.08)';
      ctx.fill();
      ctx.restore();
    }

    // 2. Draw Sleeve Indicators: Green Circles (Present) & Red Circles (Missing)
    result.sleeves.forEach((sleeve, idx) => {
      const { x, y, radius, present } = sleeve;
      const isOk = present;

      ctx.save();
      const circleRadius = Math.max(18, radius);

      // Outer halo
      ctx.beginPath();
      ctx.arc(x, y, circleRadius + 6, 0, Math.PI * 2);
      ctx.strokeStyle = isOk ? 'rgba(16, 185, 129, 0.4)' : 'rgba(239, 68, 68, 0.7)';
      ctx.lineWidth = isOk ? 3 : 5;
      ctx.stroke();

      // Main Circle: GREEN for PRESENT, RED for MISSING
      ctx.beginPath();
      ctx.arc(x, y, circleRadius, 0, Math.PI * 2);
      ctx.strokeStyle = isOk ? '#059669' : '#dc2626';
      ctx.lineWidth = isOk ? 4.5 : 5.5;
      ctx.fillStyle = isOk ? 'rgba(16, 185, 129, 0.22)' : 'rgba(239, 68, 68, 0.35)';
      ctx.fill();
      ctx.stroke();

      // Center Icon
      ctx.font = `bold ${Math.round(circleRadius * 0.9)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = isOk ? '#047857' : '#b91c1c';
      ctx.fillText(isOk ? '✓' : '✕', x, y);

      // Status Pill Tag
      ctx.font = 'bold 12px sans-serif';
      const label = isOk ? `Sleeve #${idx + 1} OK` : `Sleeve #${idx + 1} MISSING`;
      const textWidth = ctx.measureText(label).width;

      const tagY = y - circleRadius - 16;
      ctx.fillStyle = isOk ? '#059669' : '#dc2626';
      ctx.fillRect(x - textWidth / 2 - 6, tagY - 10, textWidth + 12, 20);

      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x - textWidth / 2 - 6, tagY - 10, textWidth + 12, 20);

      ctx.fillStyle = '#ffffff';
      ctx.fillText(label, x, tagY);

      ctx.restore();
    });
  };

  const status = inspectionResult.status;
  const presentCount = inspectionResult.sleeves.filter(s => s.present).length;

  return (
    <div className="flex-1 flex flex-col bg-slate-100 text-slate-900 relative select-none">
      {/* 1. ULTRA HIGH-VISIBILITY RESULT BANNER (Visible from distance) */}
      <div
        className={`w-full py-4 sm:py-5 px-4 transition-all duration-300 shadow-md flex flex-col items-center justify-center text-center ${
          status === 'PASS'
            ? 'bg-emerald-600 text-white shadow-emerald-600/30'
            : status === 'FAIL'
            ? 'bg-red-600 text-white animate-pulse-fast shadow-red-600/40'
            : status === 'SEARCHING'
            ? 'bg-amber-500 text-white shadow-amber-500/20'
            : 'bg-white text-slate-800 border-b border-slate-200'
        }`}
      >
        <div className="flex items-center space-x-3">
          {status === 'PASS' && <CheckCircle className="w-10 h-10 sm:w-12 sm:h-12 text-white animate-bounce" />}
          {status === 'FAIL' && <AlertTriangle className="w-10 h-10 sm:w-12 sm:h-12 text-white animate-pulse" />}
          {status === 'SEARCHING' && <RefreshCw className="w-8 h-8 sm:w-10 sm:h-10 text-white animate-spin" />}
          {status === 'IDLE' && <Zap className="w-8 h-8 text-indigo-600" />}

          {/* LARGE RESULT TEXT */}
          <span className="text-4xl sm:text-6xl font-black tracking-wider drop-shadow-sm">
            {status === 'PASS' ? 'PASS' : status === 'FAIL' ? 'FAIL' : status === 'SEARCHING' ? 'ALIGNING...' : 'READY'}
          </span>
        </div>

        {/* Status Subtitle Banner */}
        <p className="text-sm sm:text-base font-bold tracking-wide mt-1 drop-shadow-sm uppercase opacity-95">
          {status === 'PASS'
            ? `PASS - All ${totalTargetSleeves} Sleeves Present (${presentCount}/${totalTargetSleeves})`
            : status === 'FAIL'
            ? `FAIL - Missing Sleeve Detected (${inspectionResult.missingCount} of ${totalTargetSleeves} Missing)`
            : status === 'SEARCHING'
            ? `Point camera toward part • Target: ${totalTargetSleeves} Metal Sleeves`
            : 'Press "Start Inspection" to open camera'}
        </p>
      </div>

      {/* 2. CAMERA / VIDEO FEED AREA (Bright industrial frame, full screen mobile) */}
      <div className="relative flex-1 bg-slate-200 border-y border-slate-300 flex items-center justify-center overflow-hidden min-h-[380px]">
        {/* Live Camera Stream */}
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          className={`absolute inset-0 w-full h-full object-contain ${
            isSimulating ? 'hidden' : 'block'
          }`}
        />

        {/* Virtual Simulator Canvas (if running in test simulation mode) */}
        {isSimulating && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="absolute top-3 left-3 bg-white/95 border border-indigo-300 text-indigo-800 text-xs font-bold px-3 py-1.5 rounded-lg shadow-md z-20 flex items-center space-x-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
              <span>Virtual Test Bench Stream Active (3 Sleeves)</span>
            </div>
          </div>
        )}

        {/* Scanline Animation while Inspecting */}
        {isInspecting && <div className="scanline-effect z-10" />}

        {/* Canvas Overlay for Computer Vision (Circles & Bounding Box) */}
        <canvas
          ref={overlayCanvasRef}
          className="absolute inset-0 w-full h-full object-contain pointer-events-none z-10"
        />

        {/* Idle / Error Placeholders */}
        {!isInspecting && !isCameraActive && !isSimulating && (
          <div className="z-10 flex flex-col items-center justify-center p-6 text-center max-w-md bg-white/95 border border-slate-300 rounded-2xl shadow-xl m-4">
            <div className="w-16 h-16 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center mb-4 border border-indigo-100 shadow-sm">
              <Camera className="w-8 h-8" />
            </div>
            <h3 className="text-xl font-black text-slate-900 mb-2">Camera Feed Inactive</h3>
            <p className="text-sm text-slate-600 mb-5 leading-relaxed">
              Target configuration: <strong>{totalTargetSleeves} metal sleeves</strong>. Point camera at the injection molded part and press Start Inspection.
            </p>
            <div className="flex flex-wrap gap-2.5 justify-center">
              <button
                onClick={handleStartInspection}
                className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm shadow-md shadow-emerald-600/20 transition cursor-pointer flex items-center space-x-2"
              >
                <Play className="w-4 h-4 fill-current" />
                <span>Start Inspection</span>
              </button>
              <button
                onClick={onOpenSimulator}
                className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm shadow-md shadow-indigo-600/20 transition cursor-pointer"
              >
                Open Virtual Test Bench
              </button>
            </div>
          </div>
        )}

        {/* Camera Permission / Access Error */}
        {cameraError && (
          <div className="absolute top-4 left-4 right-4 z-20 p-4 rounded-xl bg-rose-50 border border-rose-300 text-rose-800 text-sm flex items-center space-x-3 shadow-lg">
            <AlertCircle className="w-6 h-6 text-rose-600 shrink-0" />
            <div>
              <span className="font-bold block">Camera Error</span>
              <span>{cameraError}</span>
            </div>
          </div>
        )}

        {/* On-Screen Fast Status Corner */}
        {isInspecting && (
          <div className="absolute bottom-3 left-3 z-20 flex flex-col space-y-1">
            <div className="bg-white/90 backdrop-blur border border-slate-300 rounded-lg px-2.5 py-1 text-xs font-semibold text-slate-700 shadow-sm">
              Part Tracking: <span className={inspectionResult.partDetected ? 'text-emerald-700 font-bold' : 'text-amber-700'}>
                {inspectionResult.partDetected ? 'LOCKED ON' : 'SEARCHING'}
              </span>
            </div>
            {inspectionResult.partDetected && (
              <div className="bg-white/90 backdrop-blur border border-slate-300 rounded-lg px-2.5 py-1 text-xs font-semibold text-slate-700 shadow-sm">
                Sleeves: <span className="text-emerald-700 font-bold">{presentCount} of {totalTargetSleeves} OK</span>
                {inspectionResult.missingCount > 0 && (
                  <span className="text-red-600 font-bold ml-1.5">
                    ({inspectionResult.missingCount} Missing)
                  </span>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 3. FOOTER ACTION BUTTONS (Bright Touch Buttons for Shop Floor) */}
      <div className="p-3 sm:p-4 bg-white border-t border-slate-200 shadow-lg z-20">
        <div className="max-w-4xl mx-auto grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3">
          {/* Start Inspection Button */}
          <button
            onClick={handleStartInspection}
            disabled={isInspecting}
            className={`flex items-center justify-center space-x-2 py-3.5 px-4 rounded-xl font-black text-base shadow-sm transition active:scale-95 cursor-pointer ${
              isInspecting
                ? 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200'
                : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/20'
            }`}
          >
            <Play className="w-5 h-5 fill-current" />
            <span>Start Inspection</span>
          </button>

          {/* Stop Inspection Button */}
          <button
            onClick={handleStopInspection}
            disabled={!isInspecting}
            className={`flex items-center justify-center space-x-2 py-3.5 px-4 rounded-xl font-black text-base shadow-sm transition active:scale-95 cursor-pointer ${
              !isInspecting
                ? 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200'
                : 'bg-rose-600 hover:bg-rose-700 text-white shadow-rose-600/20'
            }`}
          >
            <Square className="w-5 h-5 fill-current" />
            <span>Stop Inspection</span>
          </button>

          {/* Master Setup Button */}
          <button
            onClick={() => {
              handleStopInspection();
              onOpenMasterSetup();
            }}
            className="flex items-center justify-center space-x-2 py-3.5 px-4 rounded-xl bg-slate-50 hover:bg-slate-100 text-indigo-700 border border-slate-300 font-bold text-sm shadow-sm transition active:scale-95 cursor-pointer"
          >
            <Wrench className="w-5 h-5" />
            <span>Master Setup</span>
          </button>

          {/* Camera Switcher (Flip Front/Rear) */}
          <button
            onClick={switchCamera}
            disabled={!isCameraActive || isSimulating}
            className="flex items-center justify-center space-x-2 py-3.5 px-4 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-800 border border-slate-300 font-bold text-sm shadow-sm transition active:scale-95 cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className="w-5 h-5" />
            <span>Switch Camera</span>
          </button>
        </div>
      </div>
    </div>
  );
}
