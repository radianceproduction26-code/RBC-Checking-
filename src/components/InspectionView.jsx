import React, { useRef, useEffect, useState, useCallback } from 'react';
import { 
  Play, Square, RefreshCw, AlertTriangle, CheckCircle, 
  Wrench, Camera, Zap, AlertCircle, Maximize2, Minimize2, 
  Scan, Sparkles, Volume2, VolumeX
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
  simulatedCanvas,
  isSimulating,
}) {
  const {
    videoRef,
    isActive: isCameraActive,
    startCamera,
    stopCamera,
    switchCamera,
    error: cameraError,
  } = useCameraHook;

  const { startAlarm, stopAlarm, initAudio, isMuted, toggleMute } = useAudioAlertHook;

  const [isInspecting, setIsInspecting] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [activeThreshold, setActiveThreshold] = useState(settings?.sleeveConfidenceThreshold ?? 0.38);
  const [inspectionResult, setInspectionResult] = useState({
    status: 'IDLE',
    message: 'Press "Start Inspection" to begin',
    sleeves: [],
    partDetected: false,
    missingCount: 0,
  });

  const containerRef = useRef(null);
  const overlayCanvasRef = useRef(null);
  const animationFrameIdRef = useRef(null);
  const lastProcessTimeRef = useRef(0);

  const totalTargetSleeves = masterPart?.sleeves?.length || 3;

  // Cleanup on unmount
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

  // Start Inspection flow with full camera activation
  const handleStartInspection = async () => {
    initAudio();
    if (!isSimulating && !isCameraActive) {
      const ok = await startCamera();
      if (!ok) return;
    }
    setIsInspecting(true);
    setInspectionResult({
      status: 'SEARCHING',
      message: 'Quick Scan Active • Point camera at part',
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

    const canvas = overlayCanvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  };

  // Single Quick Scan (Immediate one-tap scan)
  const handleQuickScanNow = () => {
    initAudio();
    if (!isCameraActive && !isSimulating) {
      handleStartInspection();
      return;
    }
    processCurrentFrame();
  };

  // Process one frame
  const processCurrentFrame = useCallback(() => {
    if (!cvEngine) return;
    const sourceElement = isSimulating ? simulatedCanvas : videoRef.current;
    if (!sourceElement) return;

    const w = sourceElement.videoWidth || sourceElement.width;
    const h = sourceElement.videoHeight || sourceElement.height;
    if (!w || !h || w <= 0 || h <= 0) return;

    try {
      const activeSettings = { ...settings, sleeveConfidenceThreshold: activeThreshold };
      const result = cvEngine.processFrame(sourceElement, activeSettings);
      if (result) {
        setInspectionResult(result);
        drawOverlay(result, sourceElement);
      }
    } catch (err) {
      console.warn('Scan frame error:', err);
    }
  }, [cvEngine, isSimulating, simulatedCanvas, videoRef, settings, activeThreshold]);

  // Continuous Inspection Loop
  const runInspectionLoop = useCallback(() => {
    if (!isInspecting) return;

    const now = performance.now();
    const interval = settings?.inspectionIntervalMs || 80;

    if (now - lastProcessTimeRef.current >= interval) {
      lastProcessTimeRef.current = now;
      processCurrentFrame();
    }

    animationFrameIdRef.current = requestAnimationFrame(runInspectionLoop);
  }, [isInspecting, settings, processCurrentFrame]);

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

  // Toggle Fullscreen on device
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen?.().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen?.().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  // Draw HUD Overlays (Reticle, Green/Red circles, labels)
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

    const cx = canvas.width / 2;
    const cy = canvas.height / 2;

    // Draw Sleek Alignment Reticle
    const reticleW = Math.min(canvas.width, canvas.height) * 0.75;
    const reticleH = reticleW * 0.7;

    ctx.save();
    // Corner target brackets
    ctx.strokeStyle = result.partDetected ? 'rgba(14, 165, 233, 0.9)' : 'rgba(217, 119, 6, 0.8)';
    ctx.lineWidth = 4;
    const cornerSize = 28;

    const left = cx - reticleW / 2;
    const right = cx + reticleW / 2;
    const top = cy - reticleH / 2;
    const bottom = cy + reticleH / 2;

    // Top-Left
    ctx.beginPath();
    ctx.moveTo(left, top + cornerSize);
    ctx.lineTo(left, top);
    ctx.lineTo(left + cornerSize, top);
    ctx.stroke();

    // Top-Right
    ctx.beginPath();
    ctx.moveTo(right - cornerSize, top);
    ctx.lineTo(right, top);
    ctx.lineTo(right, top + cornerSize);
    ctx.stroke();

    // Bottom-Left
    ctx.beginPath();
    ctx.moveTo(left, bottom - cornerSize);
    ctx.lineTo(left, bottom);
    ctx.lineTo(left + cornerSize, bottom);
    ctx.stroke();

    // Bottom-Right
    ctx.beginPath();
    ctx.moveTo(right - cornerSize, bottom);
    ctx.lineTo(right, bottom);
    ctx.lineTo(right, bottom - cornerSize);
    ctx.stroke();

    // Subtle guide text
    ctx.font = 'bold 13px sans-serif';
    ctx.fillStyle = result.partDetected ? 'rgba(14, 165, 233, 0.95)' : 'rgba(217, 119, 6, 0.95)';
    ctx.textAlign = 'center';
    ctx.fillText(result.partDetected ? 'PART DETECTED • 3-SLEEVE SCAN' : 'ALIGN 3-SLEEVE PART HERE', cx, top - 12);
    ctx.restore();

    // Draw Sleeves
    result.sleeves.forEach((sleeve, idx) => {
      const { x, y, radius, present } = sleeve;
      const isOk = present;

      ctx.save();
      const circleRadius = Math.max(22, radius);

      // Outer glow
      ctx.beginPath();
      ctx.arc(x, y, circleRadius + 7, 0, Math.PI * 2);
      ctx.strokeStyle = isOk ? 'rgba(16, 185, 129, 0.45)' : 'rgba(239, 68, 68, 0.8)';
      ctx.lineWidth = 4;
      ctx.stroke();

      // Main Circle
      ctx.beginPath();
      ctx.arc(x, y, circleRadius, 0, Math.PI * 2);
      ctx.strokeStyle = isOk ? '#059669' : '#dc2626';
      ctx.lineWidth = 5;
      ctx.fillStyle = isOk ? 'rgba(16, 185, 129, 0.28)' : 'rgba(239, 68, 68, 0.45)';
      ctx.fill();
      ctx.stroke();

      // Center Icon
      ctx.font = `bold ${Math.round(circleRadius * 0.9)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(isOk ? '✓' : '✕', x, y);

      // Status Tag with real-time confidence percentage
      ctx.font = 'bold 12px sans-serif';
      const confText = sleeve.confidence !== undefined ? ` (${sleeve.confidence}%)` : '';
      const label = isOk ? `Sleeve #${idx + 1} OK${confText}` : `Sleeve #${idx + 1} MISSING${confText}`;
      const textWidth = ctx.measureText(label).width;

      const tagY = y - circleRadius - 18;
      ctx.fillStyle = isOk ? '#059669' : '#dc2626';
      ctx.fillRect(x - textWidth / 2 - 8, tagY - 11, textWidth + 16, 22);

      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x - textWidth / 2 - 8, tagY - 11, textWidth + 16, 22);

      ctx.fillStyle = '#ffffff';
      ctx.fillText(label, x, tagY);

      ctx.restore();
    });
  };

  const status = inspectionResult.status;
  const presentCount = inspectionResult.sleeves.filter((s) => s.present).length;

  return (
    <div
      ref={containerRef}
      className="relative flex-1 w-full h-full bg-black overflow-hidden flex flex-col select-none"
    >
      {/* 1. TRUE EDGE-TO-EDGE FULL SCREEN CAMERA FEED */}
      <video
        ref={videoRef}
        playsInline
        muted
        autoPlay
        className={`absolute inset-0 w-full h-full object-cover z-0 ${
          isSimulating ? 'hidden' : 'block'
        }`}
      />

      {/* Virtual Simulator Canvas (if simulating) */}
      {isSimulating && (
        <div className="absolute inset-0 w-full h-full flex items-center justify-center bg-slate-900 z-0">
          <div className="text-white text-xs font-bold bg-indigo-600/90 px-3 py-1.5 rounded-full absolute top-4 left-4 z-20 shadow">
            ● Virtual Test Bench Stream Active (3 Sleeves)
          </div>
        </div>
      )}

      {/* HUD Overlay Canvas (Positioned exactly over video) */}
      <canvas
        ref={overlayCanvasRef}
        className="absolute inset-0 w-full h-full object-cover pointer-events-none z-10"
      />

      {/* Fast Scanline Effect */}
      {isInspecting && <div className="scanline-effect z-10" />}

      {/* 2. FLOATING TOP RESULT BANNER (Heads-Up Display) */}
      <div className="absolute top-3 left-3 right-3 z-30 flex flex-col items-center pointer-events-none">
        <div
          className={`w-full max-w-xl py-3 px-4 rounded-2xl transition-all duration-200 shadow-2xl flex items-center justify-between pointer-events-auto backdrop-blur-md ${
            status === 'PASS'
              ? 'bg-emerald-600/95 text-white border-2 border-emerald-300'
              : status === 'FAIL'
              ? 'bg-red-600/95 text-white border-2 border-red-300 animate-pulse-fast'
              : status === 'SEARCHING'
              ? 'bg-amber-500/95 text-white border-2 border-amber-200'
              : 'bg-white/95 text-slate-800 border border-slate-200 shadow-lg'
          }`}
        >
          <div className="flex items-center space-x-3">
            {status === 'PASS' && <CheckCircle className="w-8 h-8 sm:w-10 sm:h-10 text-white animate-bounce shrink-0" />}
            {status === 'FAIL' && <AlertTriangle className="w-8 h-8 sm:w-10 sm:h-10 text-white animate-pulse shrink-0" />}
            {status === 'SEARCHING' && <RefreshCw className="w-7 h-7 sm:w-8 sm:h-8 text-white animate-spin shrink-0" />}
            {status === 'IDLE' && <Zap className="w-7 h-7 text-indigo-600 shrink-0" />}

            <div>
              <span className="text-2xl sm:text-4xl font-black tracking-wider drop-shadow-sm block leading-tight">
                {status === 'PASS' ? 'PASS' : status === 'FAIL' ? 'FAIL' : status === 'SEARCHING' ? 'SCANNING...' : 'READY'}
              </span>
              <span className="text-xs sm:text-sm font-bold opacity-95 block">
                {status === 'PASS'
                  ? `All ${totalTargetSleeves} Sleeves Present (${presentCount}/${totalTargetSleeves})`
                  : status === 'FAIL'
                  ? `Missing Sleeve Detected (${inspectionResult.missingCount} Missing)`
                  : status === 'SEARCHING'
                  ? 'Quick Scan Active • Point at Part'
                  : 'Press "Start Inspection" for Fullscreen Camera'}
              </span>
            </div>
          </div>

          {/* Quick HUD Action Buttons */}
          <div className="flex items-center space-x-1.5">
            <button
              onClick={toggleMute}
              className={`p-2 rounded-xl border transition ${
                isMuted ? 'bg-rose-100 text-rose-700 border-rose-300' : 'bg-white/80 text-slate-700 border-slate-200'
              }`}
              title={isMuted ? 'Unmute' : 'Mute'}
            >
              {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>
            <button
              onClick={toggleFullscreen}
              className="p-2 rounded-xl bg-white/80 text-slate-700 border border-slate-200 hover:bg-white transition"
              title="Toggle Fullscreen"
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Quick Lighting / Sensitivity Preset Selector */}
        {isInspecting && (
          <div className="flex items-center space-x-1.5 mt-2 bg-white/95 backdrop-blur-md px-3 py-1.5 rounded-full border border-slate-300 shadow-md pointer-events-auto text-[11px] font-bold text-slate-800">
            <span className="text-slate-500 font-semibold">Lighting:</span>
            <button
              onClick={() => setActiveThreshold(0.28)}
              className={`px-2.5 py-0.5 rounded-full transition cursor-pointer ${
                activeThreshold === 0.28 ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              Dim (28%)
            </button>
            <button
              onClick={() => setActiveThreshold(0.38)}
              className={`px-2.5 py-0.5 rounded-full transition cursor-pointer ${
                activeThreshold === 0.38 ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              Normal (38%)
            </button>
            <button
              onClick={() => setActiveThreshold(0.48)}
              className={`px-2.5 py-0.5 rounded-full transition cursor-pointer ${
                activeThreshold === 0.48 ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              Bright (48%)
            </button>
          </div>
        )}
      </div>

      {/* 3. IDLE WELCOME CARD (Shown when camera not yet opened) */}
      {!isInspecting && !isCameraActive && !isSimulating && (
        <div className="absolute inset-0 z-20 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="flex flex-col items-center justify-center p-6 text-center max-w-sm w-full bg-white rounded-3xl shadow-2xl border border-slate-200">
            <div className="h-16 px-4 py-2 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-center mb-4 shadow-sm">
              <img
                src="/radiance-polymer-logo.png"
                alt="Radiance Polymer Logo"
                className="h-12 w-auto max-w-[160px] object-contain"
              />
            </div>
            <h3 className="text-xl font-black text-slate-900 mb-1">Radiance Polymer Inspection</h3>
            <p className="text-xs font-bold text-indigo-700 uppercase tracking-wider mb-2">
              Full-Screen Quick Scanner (3 Sleeves)
            </p>
            <p className="text-xs text-slate-500 mb-5 leading-relaxed">
              Opens full-screen mobile camera with real-time detection of metal sleeves and missing sleeve audio alarms.
            </p>

            <button
              onClick={handleStartInspection}
              className="w-full py-3.5 px-4 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-base shadow-lg shadow-emerald-600/30 transition flex items-center justify-center space-x-2 cursor-pointer active:scale-95 mb-2.5"
            >
              <Camera className="w-5 h-5" />
              <span>Open Full-Screen Camera</span>
            </button>

            <button
              onClick={onOpenSimulator}
              className="w-full py-2.5 px-4 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-xs border border-indigo-200 transition cursor-pointer"
            >
              Open Virtual Test Bench
            </button>
          </div>
        </div>
      )}

      {/* Camera Error Message */}
      {cameraError && (
        <div className="absolute top-20 left-4 right-4 z-40 p-4 rounded-2xl bg-rose-50 border-2 border-rose-400 text-rose-900 text-xs shadow-2xl flex items-center space-x-3">
          <AlertCircle className="w-6 h-6 text-rose-600 shrink-0" />
          <div>
            <span className="font-bold block">Camera Error</span>
            <span>{cameraError}</span>
          </div>
        </div>
      )}

      {/* 4. FLOATING BOTTOM CONTROL BAR */}
      <div className="absolute bottom-4 left-3 right-3 z-30 flex justify-center pointer-events-none">
        <div className="w-full max-w-xl p-2.5 sm:p-3 rounded-2xl bg-white/95 backdrop-blur-md border border-slate-200 shadow-2xl flex items-center justify-between gap-2 pointer-events-auto">
          {/* Quick Scan One-Tap Button */}
          <button
            onClick={handleQuickScanNow}
            className="flex-1 flex items-center justify-center space-x-1.5 py-3 px-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs sm:text-sm shadow-sm transition active:scale-95 cursor-pointer"
          >
            <Scan className="w-4 h-4" />
            <span>Quick Scan</span>
          </button>

          {/* Start/Stop Toggle Button */}
          {isInspecting ? (
            <button
              onClick={handleStopInspection}
              className="flex-1 flex items-center justify-center space-x-1.5 py-3 px-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-black text-xs sm:text-sm shadow-sm transition active:scale-95 cursor-pointer"
            >
              <Square className="w-4 h-4 fill-current" />
              <span>Stop</span>
            </button>
          ) : (
            <button
              onClick={handleStartInspection}
              className="flex-1 flex items-center justify-center space-x-1.5 py-3 px-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs sm:text-sm shadow-sm transition active:scale-95 cursor-pointer"
            >
              <Play className="w-4 h-4 fill-current" />
              <span>Live Inspect</span>
            </button>
          )}

          {/* Flip Camera Button */}
          <button
            onClick={switchCamera}
            disabled={!isCameraActive || isSimulating}
            className="p-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 transition active:scale-95 cursor-pointer disabled:opacity-40"
            title="Switch Front/Rear Camera"
          >
            <RefreshCw className="w-4 h-4" />
          </button>

          {/* Master Setup Button */}
          <button
            onClick={() => {
              handleStopInspection();
              onOpenMasterSetup();
            }}
            className="p-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-indigo-700 border border-slate-200 transition active:scale-95 cursor-pointer"
            title="Master Setup"
          >
            <Wrench className="w-4 h-4" />
          </button>

          {/* Fullscreen Button */}
          <button
            onClick={toggleFullscreen}
            className="p-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 transition active:scale-95 cursor-pointer"
            title="Toggle Fullscreen"
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}
