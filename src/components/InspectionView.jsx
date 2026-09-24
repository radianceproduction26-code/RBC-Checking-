import React, { useRef, useEffect, useState, useCallback } from 'react';
import { 
  Play, Square, RefreshCw, AlertTriangle, CheckCircle, 
  Wrench, Camera, Zap, AlertCircle, Maximize2, Minimize2, 
  Scan, Sparkles, Volume2, VolumeX, Bug, Lock, ArrowRight,
  RotateCcw, Sliders, Check, ShieldCheck, Timer, Eye
} from 'lucide-react';
import confetti from 'canvas-confetti';
import DebugPanel from './DebugPanel';

export default function InspectionView({
  cvEngine,
  cvReady,
  masterProfile,
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

  const { 
    startAlarm, 
    stopAlarm, 
    triggerSingleBeep,
    triggerPassChime, 
    triggerFailBuzz, 
    initAudio, 
    isMuted, 
    toggleMute 
  } = useAudioAlertHook;

  // Scan Mode: 'manual' (Tap to Scan, Recommended) | 'auto_lock' (Auto-Detect on Steady Part)
  const [scanMode, setScanMode] = useState(settings?.scanMode || 'manual');
  const [scanSpeedMs, setScanSpeedMs] = useState(settings?.inspectionIntervalMs || 220);

  const [isInspecting, setIsInspecting] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isDebugMode, setIsDebugMode] = useState(false);
  const [activeThreshold, setActiveThreshold] = useState(settings?.sleeveConfidenceThreshold ?? 0.38);

  // Inspection State Machine: 'IDLE' | 'POSITIONING' | 'STABILIZING' | 'LOCKED'
  const [cycleState, setCycleState] = useState('IDLE');
  const [stabilityCounter, setStabilityCounter] = useState(0); // consecutive stable frames

  // Shift QC Statistics (counted strictly once per unique locked part verdict)
  const [qcStats, setQcStats] = useState({
    total: 0,
    passed: 0,
    failed: 0,
  });

  const [inspectionResult, setInspectionResult] = useState({
    partDetected: false,
    matchedFeatures: 0,
    sleeve1: 'unknown',
    sleeve2: 'unknown',
    sleeve3: 'unknown',
    result: 'IDLE',
    status: 'IDLE',
    message: 'Press "Start Inspection" to begin',
    sleeves: [],
    missingCount: 0,
    debug: {},
  });

  const containerRef = useRef(null);
  const overlayCanvasRef = useRef(null);
  const animationFrameIdRef = useRef(null);
  const lastProcessTimeRef = useRef(0);
  const stableFramesRequired = settings?.stabilityFrames || 3;

  const totalTargetSleeves = masterProfile?.sleeves?.length || 3;

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopAlarm();
      if (animationFrameIdRef.current) cancelAnimationFrame(animationFrameIdRef.current);
    };
  }, [stopAlarm]);

  // Start Inspection flow
  const handleStartInspection = async () => {
    initAudio();
    if (!isSimulating && !isCameraActive) {
      const ok = await startCamera();
      if (!ok) return;
    }
    setIsInspecting(true);
    setCycleState('POSITIONING');
    setStabilityCounter(0);

    setInspectionResult({
      partDetected: false,
      matchedFeatures: 0,
      sleeve1: 'unknown',
      sleeve2: 'unknown',
      sleeve3: 'unknown',
      result: 'SEARCHING',
      status: 'SEARCHING',
      message: 'Position PA6-GF50 Part in Center Reticle',
      sleeves: [],
      missingCount: 0,
      debug: {},
    });
  };

  // Stop Inspection flow
  const handleStopInspection = () => {
    setIsInspecting(false);
    setCycleState('IDLE');
    setStabilityCounter(0);
    stopAlarm();

    if (animationFrameIdRef.current) {
      cancelAnimationFrame(animationFrameIdRef.current);
    }

    setInspectionResult({
      partDetected: false,
      matchedFeatures: 0,
      sleeve1: 'unknown',
      sleeve2: 'unknown',
      sleeve3: 'unknown',
      result: 'IDLE',
      status: 'IDLE',
      message: 'Inspection stopped',
      sleeves: [],
      missingCount: 0,
      debug: {},
    });

    const canvas = overlayCanvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  };

  // Unlock and prepare for the NEXT PART (Operator explicitly clicks "Next Part")
  const unlockAndReadyNextPart = useCallback(() => {
    setStabilityCounter(0);
    setCycleState('POSITIONING');
    stopAlarm();

    const canvas = overlayCanvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }

    setInspectionResult({
      partDetected: false,
      matchedFeatures: 0,
      sleeve1: 'unknown',
      sleeve2: 'unknown',
      sleeve3: 'unknown',
      result: 'SEARCHING',
      status: 'SEARCHING',
      message: 'Ready for Next Part • Align in Center Reticle',
      sleeves: [],
      missingCount: 0,
      debug: {},
    });
  }, [stopAlarm]);

  // Lock a final verdict on screen (STOPS and holds until operator clicks "Next Part")
  const lockVerdict = useCallback((evalResult) => {
    setCycleState('LOCKED');
    setInspectionResult(evalResult);

    const isPass = evalResult.status === 'PASS' || evalResult.result === 'PASS';

    // Update Shift QC Statistics strictly once per part
    setQcStats((prev) => ({
      total: prev.total + 1,
      passed: prev.passed + (isPass ? 1 : 0),
      failed: prev.failed + (isPass ? 0 : 1),
    }));

    // Trigger Audio Alert once
    if (isPass) {
      triggerPassChime();
      try {
        confetti({
          particleCount: 30,
          spread: 60,
          origin: { y: 0.25 },
          colors: ['#10b981', '#059669', '#34d399', '#ffffff'],
        });
      } catch (e) {}
    } else {
      triggerFailBuzz();
    }
    // Note: NEVER set any auto-clearing timer here!
    // As requested: The verdict STAYS solid on screen until operator clicks "Next Part"!
  }, [triggerPassChime, triggerFailBuzz]);

  // Manual Trigger Scan Execution (Analyzes the part in reticle, alerts if empty)
  const handleManualTriggerScan = useCallback(() => {
    if (!cvEngine) return;
    const sourceElement = isSimulating ? simulatedCanvas : videoRef.current;
    if (!sourceElement) return;

    try {
      const activeSettings = {
        ...settings,
        sleeveConfidenceThreshold: activeThreshold,
      };
      const result = cvEngine.processFrame(sourceElement, activeSettings);
      if (result) {
        if (!result.partDetected) {
          // Camera sees no part! Never give OK or NOT OK, never count.
          setInspectionResult((prev) => ({
            ...prev,
            status: 'NO_PART',
            message: 'No Part Detected! Place PA6-GF50 Part in Center Reticle First.',
          }));
          return;
        }

        drawOverlay(result, sourceElement);
        lockVerdict(result);
      }
    } catch (err) {
      console.warn('Manual scan error:', err);
    }
  }, [cvEngine, isSimulating, simulatedCanvas, videoRef, settings, activeThreshold, lockVerdict]);

  // Keyboard shortcut: Spacebar triggers scan or moves to next part
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.code === 'Space' && isInspecting) {
        e.preventDefault();
        if (cycleState === 'LOCKED') {
          unlockAndReadyNextPart();
        } else {
          handleManualTriggerScan();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isInspecting, cycleState, unlockAndReadyNextPart, handleManualTriggerScan]);

  // Process one frame according to the state machine
  const processCurrentFrame = useCallback(() => {
    if (!cvEngine || !isInspecting) return;

    // Do NOT process or change state if currently LOCKED on a final verdict
    if (cycleState === 'LOCKED') return;

    const sourceElement = isSimulating ? simulatedCanvas : videoRef.current;
    if (!sourceElement) return;

    const w = sourceElement.videoWidth || sourceElement.width;
    const h = sourceElement.videoHeight || sourceElement.height;
    if (!w || !h || w <= 0 || h <= 0) return;

    try {
      const activeSettings = {
        ...settings,
        sleeveConfidenceThreshold: activeThreshold,
      };

      const result = cvEngine.processFrame(sourceElement, activeSettings);
      if (!result) return;

      drawOverlay(result, sourceElement);

      const partInView = Boolean(result.partDetected);

      // Manual mode: live reticle feedback without auto-locking
      if (scanMode === 'manual') {
        setInspectionResult({
          ...result,
          status: partInView ? 'READY' : 'SEARCHING',
          message: partInView
            ? 'Part Detected in Reticle • Tap "SCAN PART" to Inspect'
            : 'Align PA6-GF50 Part in Center Reticle',
        });
        setCycleState(partInView ? 'STABILIZING' : 'POSITIONING');
        return;
      }

      // Auto-Lock Cycle: Only triggers when part is genuinely detected in reticle
      if (scanMode === 'auto_lock') {
        if (partInView) {
          setStabilityCounter((prev) => {
            const nextCount = prev + 1;
            setCycleState('STABILIZING');

            if (nextCount >= stableFramesRequired) {
              // Stable frame condition met! Lock final verdict.
              lockVerdict(result);
              return 0;
            } else {
              setInspectionResult({
                ...result,
                status: 'SEARCHING',
                message: `Analyzing part... (${nextCount}/${stableFramesRequired})`,
              });
              return nextCount;
            }
          });
        } else {
          // Part not in view, reset stability counter
          setStabilityCounter(0);
          setCycleState('POSITIONING');
          setInspectionResult({
            ...result,
            status: 'SEARCHING',
            message: 'Align PA6-GF50 Part in Center Reticle',
          });
        }
      }
    } catch (err) {
      console.warn('Scan frame error:', err);
    }
  }, [
    cvEngine,
    isInspecting,
    cycleState,
    isSimulating,
    simulatedCanvas,
    videoRef,
    settings,
    activeThreshold,
    scanMode,
    stableFramesRequired,
    lockVerdict,
  ]);

  // Inspection Loop throttled to calibrated scanSpeedMs
  const runInspectionLoop = useCallback(() => {
    if (!isInspecting) return;

    const now = performance.now();
    if (now - lastProcessTimeRef.current >= scanSpeedMs) {
      lastProcessTimeRef.current = now;
      processCurrentFrame();
    }

    animationFrameIdRef.current = requestAnimationFrame(runInspectionLoop);
  }, [isInspecting, scanSpeedMs, processCurrentFrame]);

  useEffect(() => {
    if (isInspecting) {
      animationFrameIdRef.current = requestAnimationFrame(runInspectionLoop);
    } else {
      if (animationFrameIdRef.current) cancelAnimationFrame(animationFrameIdRef.current);
    }
    return () => {
      if (animationFrameIdRef.current) cancelAnimationFrame(animationFrameIdRef.current);
    };
  }, [isInspecting, runInspectionLoop]);

  // Toggle Fullscreen
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen?.().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen?.().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  // Draw HUD Overlays, Alignment Crosshair, and Sleeve Rings
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
    const isLocked = cycleState === 'LOCKED';

    // 1. Draw Homography Bounding Box if Part is Detected
    if (result.partDetected && result.debug?.corners && result.debug.corners.length === 4) {
      const corners = result.debug.corners;
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(corners[0].x, corners[0].y);
      for (let i = 1; i < 4; i++) {
        ctx.lineTo(corners[i].x, corners[i].y);
      }
      ctx.closePath();
      ctx.strokeStyle = isLocked 
        ? (result.status === 'PASS' ? 'rgba(16, 185, 129, 0.95)' : 'rgba(239, 68, 68, 0.95)')
        : 'rgba(14, 165, 233, 0.9)';
      ctx.lineWidth = 3.5;
      ctx.stroke();

      ctx.fillStyle = isLocked
        ? (result.status === 'PASS' ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)')
        : 'rgba(14, 165, 233, 0.08)';
      ctx.fill();
      ctx.restore();
    } else if (!isLocked) {
      // Draw Circular Industrial Reticle for Hub Placement
      const reticleR = Math.min(canvas.width, canvas.height) * 0.24;
      ctx.save();
      ctx.strokeStyle = result.partDetected ? 'rgba(14, 165, 233, 0.9)' : 'rgba(217, 119, 6, 0.8)';
      ctx.lineWidth = 2.5;
      ctx.setLineDash(result.partDetected ? [] : [8, 6]);
      ctx.beginPath();
      ctx.arc(cx, cy, reticleR, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      // Center crosshair
      ctx.beginPath();
      ctx.moveTo(cx - 16, cy); ctx.lineTo(cx + 16, cy);
      ctx.moveTo(cx, cy - 16); ctx.lineTo(cx, cy + 16);
      ctx.strokeStyle = result.partDetected ? 'rgba(14, 165, 233, 0.95)' : 'rgba(217, 119, 6, 0.9)';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.font = 'bold 12px sans-serif';
      ctx.fillStyle = result.partDetected ? 'rgba(14, 165, 233, 0.95)' : 'rgba(217, 119, 6, 0.95)';
      ctx.textAlign = 'center';
      ctx.fillText(
        result.partDetected ? '✓ PART IN RETICLE • READY' : 'ALIGN MOTOR HUB IN CENTER',
        cx,
        cy + reticleR + 24
      );
      ctx.restore();
    }

    // 2. Draw Sleeve Inspection Regions (Position 1, 2, 3) - Only if part is detected or locked
    if ((isLocked || result.partDetected) && result.sleeves && result.sleeves.length > 0) {
      result.sleeves.forEach((sleeve, idx) => {
        const { x, y, radius, present } = sleeve;
        const isOk = present;

        ctx.save();
        const circleRadius = Math.max(18, radius);

        // Outer glow
        ctx.beginPath();
        ctx.arc(x, y, circleRadius + 6, 0, Math.PI * 2);
        ctx.strokeStyle = isOk ? 'rgba(16, 185, 129, 0.5)' : 'rgba(239, 68, 68, 0.8)';
        ctx.lineWidth = 3.5;
        ctx.stroke();

        // Main Circle: GREEN for PRESENT, RED for MISSING
        ctx.beginPath();
        ctx.arc(x, y, circleRadius, 0, Math.PI * 2);
        ctx.strokeStyle = isOk ? '#059669' : '#dc2626';
        ctx.lineWidth = 4;
        ctx.fillStyle = isOk ? 'rgba(16, 185, 129, 0.25)' : 'rgba(239, 68, 68, 0.35)';
        ctx.fill();
        ctx.stroke();

        // Center Icon
        ctx.font = `bold ${Math.round(circleRadius * 0.85)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#ffffff';
        ctx.fillText(isOk ? '✓' : '✕', x, y);

        // Status Tag
        ctx.font = 'bold 11px sans-serif';
        const posName = sleeve.name ? sleeve.name.split(' ')[0] + ' ' + (idx + 1) : `Sleeve ${idx + 1}`;
        const confText = sleeve.confidence !== undefined ? ` (${sleeve.confidence}%)` : '';
        const label = isOk ? `${posName}: OK${confText}` : `${posName}: MISSING`;
        const textWidth = ctx.measureText(label).width;

        const tagY = y - circleRadius - 14;
        ctx.fillStyle = isOk ? '#059669' : '#dc2626';
        ctx.fillRect(x - textWidth / 2 - 5, tagY - 9, textWidth + 10, 18);

        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.2;
        ctx.strokeRect(x - textWidth / 2 - 5, tagY - 9, textWidth + 10, 18);

        ctx.fillStyle = '#ffffff';
        ctx.fillText(label, x, tagY);
        ctx.restore();
      });
    }
  };

  const isLocked = cycleState === 'LOCKED';
  const isPass = isLocked && (inspectionResult.status === 'PASS' || inspectionResult.result === 'PASS');
  const isFail = isLocked && (inspectionResult.status === 'FAIL' || inspectionResult.result === 'FAIL');
  const partDetected = inspectionResult.partDetected;

  return (
    <div
      ref={containerRef}
      className="relative flex-1 w-full h-[100dvh] bg-slate-950 overflow-hidden flex flex-col select-none touch-manipulation"
    >
      {/* 1. Camera Video Feed */}
      <video
        ref={videoRef}
        playsInline
        muted
        autoPlay
        className={`absolute inset-0 w-full h-full object-cover z-0 ${
          isSimulating ? 'hidden' : 'block'
        }`}
      />

      {/* Virtual Simulator Stream */}
      {isSimulating && (
        <div className="absolute inset-0 w-full h-full flex items-center justify-center bg-slate-900 z-0">
          <div className="text-white text-xs font-bold bg-indigo-600/90 px-3 py-1.5 rounded-full absolute top-3 left-3 z-20 shadow">
            ● Virtual Test Bench Active
          </div>
        </div>
      )}

      {/* HUD Canvas Overlay */}
      <canvas
        ref={overlayCanvasRef}
        className="absolute inset-0 w-full h-full object-cover pointer-events-none z-10"
      />

      {/* 2. TOP RESULT BANNER & STATS (Mobile-Optimized) */}
      <div className="absolute top-2 sm:top-3 left-2 sm:left-3 right-2 sm:right-3 z-30 flex flex-col items-center pointer-events-none space-y-1.5">
        {/* Main Verdict Card */}
        <div
          className={`w-full max-w-lg p-2.5 sm:p-3.5 rounded-2xl transition-all duration-300 shadow-2xl flex items-center justify-between pointer-events-auto backdrop-blur-md ${
            isPass
              ? 'bg-emerald-600/95 text-white border-2 border-emerald-300 ring-4 ring-emerald-500/30'
              : isFail
              ? 'bg-rose-600/95 text-white border-2 border-rose-300 ring-4 ring-rose-500/30'
              : partDetected
              ? 'bg-slate-900/90 text-white border-2 border-sky-400 shadow-xl'
              : 'bg-slate-900/85 text-white border border-slate-700 shadow-lg'
          }`}
        >
          <div className="flex items-center space-x-2.5 sm:space-x-3 min-w-0">
            {isPass && (
              <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
                <CheckCircle className="w-7 h-7 sm:w-8 sm:h-8 text-white" />
              </div>
            )}
            {isFail && (
              <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-7 h-7 sm:w-8 sm:h-8 text-white" />
              </div>
            )}
            {!isLocked && partDetected && (
              <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-sky-500/20 border border-sky-400 flex items-center justify-center text-sky-400 shrink-0">
                <Scan className="w-5 h-5 animate-pulse" />
              </div>
            )}
            {!isLocked && !partDetected && isInspecting && (
              <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-amber-500/20 border border-amber-400 flex items-center justify-center text-amber-400 shrink-0">
                <Eye className="w-5 h-5" />
              </div>
            )}
            {!isInspecting && (
              <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300 shrink-0">
                <Zap className="w-5 h-5 text-indigo-400" />
              </div>
            )}

            <div className="min-w-0">
              <div className="flex items-center space-x-2">
                <span className="text-base sm:text-2xl font-black tracking-wide leading-tight truncate">
                  {isPass
                    ? 'PASS (OK PART)'
                    : isFail
                    ? 'REJECT (DEFECT)'
                    : partDetected
                    ? 'PART DETECTED'
                    : isInspecting
                    ? 'ALIGN PART'
                    : 'READY'}
                </span>
                {isLocked && (
                  <span className="px-1.5 py-0.5 rounded-full bg-white/25 text-white text-[9px] font-black uppercase tracking-wider shrink-0">
                    LOCKED
                  </span>
                )}
              </div>
              <span className="text-[11px] sm:text-xs font-semibold opacity-95 block truncate">
                {isPass
                  ? `All ${totalTargetSleeves} metal sleeves verified present and seated`
                  : isFail
                  ? `${inspectionResult.missingCount} sleeve missing — remove part from line`
                  : partDetected
                  ? (scanMode === 'manual' ? 'Tap "SCAN PART" to analyze' : 'Holding steady...')
                  : isInspecting
                  ? 'Center circular hub in the reticle'
                  : 'Press "Start Live Inspection" to begin'}
              </span>
            </div>
          </div>

          {/* Quick Action Button on Banner */}
          <div className="flex items-center space-x-1.5 shrink-0 ml-2">
            {isLocked ? (
              <button
                onClick={unlockAndReadyNextPart}
                className="flex items-center space-x-1 px-3 sm:px-4 py-2 rounded-xl bg-white text-slate-900 text-xs sm:text-sm font-black shadow-lg hover:bg-slate-100 transition active:scale-95 cursor-pointer"
              >
                <span>Next Part</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                onClick={toggleFullscreen}
                className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white border border-white/20 transition cursor-pointer"
                title="Toggle Fullscreen"
              >
                {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              </button>
            )}
          </div>
        </div>

        {/* Shift QC Statistics Strip (Mobile Compact) */}
        <div className="flex items-center space-x-2 bg-slate-900/90 backdrop-blur-md px-3 py-1 rounded-full border border-slate-700 text-white text-[11px] font-bold shadow-md pointer-events-auto">
          <span className="text-slate-400">Shift QC:</span>
          <span>Total: <strong className="text-white font-mono">{qcStats.total}</strong></span>
          <span className="text-slate-600">•</span>
          <span className="text-emerald-400">OK: <strong className="font-mono">{qcStats.passed}</strong></span>
          <span className="text-slate-600">•</span>
          <span className="text-rose-400">Defect: <strong className="font-mono">{qcStats.failed}</strong></span>
          <span className="text-slate-600">•</span>
          <span className="text-amber-300">
            Yield: <strong className="font-mono">{qcStats.total > 0 ? Math.round((qcStats.passed / qcStats.total) * 100) : 100}%</strong>
          </span>
          {qcStats.total > 0 && (
            <button
              onClick={() => setQcStats({ total: 0, passed: 0, failed: 0 })}
              className="ml-1 text-slate-400 hover:text-white transition cursor-pointer"
              title="Reset Shift Counter"
            >
              <RotateCcw className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* 3. DEBUG TELEMETRY PANEL */}
      <DebugPanel
        inspectionResult={inspectionResult}
        isVisible={isDebugMode && isInspecting}
        onToggleVisible={() => setIsDebugMode(false)}
      />

      {/* 4. IDLE WELCOME CARD */}
      {!isInspecting && !isCameraActive && !isSimulating && (
        <div className="absolute inset-0 z-20 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm">
          <div className="flex flex-col items-center justify-center p-5 sm:p-6 text-center max-w-sm w-full bg-white rounded-3xl shadow-2xl border border-slate-200">
            <div className="h-14 sm:h-16 px-4 py-2 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-center mb-3 shadow-xs">
              <img
                src="/radiance-polymer-logo.png"
                alt="Radiance Polymer Logo"
                className="h-10 sm:h-12 w-auto max-w-[140px] object-contain"
              />
            </div>
            <h3 className="text-lg sm:text-xl font-black text-slate-900 mb-0.5">Radiance Quality Control</h3>
            <p className="text-[11px] font-bold text-indigo-700 uppercase tracking-wider mb-2">
              PA6-GF50 Fan Shroud (3 Metal Sleeves)
            </p>
            <p className="text-xs text-slate-500 mb-5 leading-relaxed">
              Align part in reticle, tap <strong>Scan Part</strong> to inspect, view definitive PASSED/FAILED verdict, and tap <strong>Next Part</strong> for the next piece.
            </p>

            <button
              onClick={handleStartInspection}
              className="w-full py-3.5 px-4 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-base shadow-lg shadow-emerald-600/30 transition flex items-center justify-center space-x-2 cursor-pointer active:scale-95 mb-2.5"
            >
              <Camera className="w-5 h-5" />
              <span>Start Live Inspection</span>
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

      {/* Camera Error Alert */}
      {cameraError && (
        <div className="absolute top-16 left-3 right-3 z-40 p-3.5 rounded-2xl bg-rose-50 border-2 border-rose-400 text-rose-900 text-xs shadow-2xl flex items-center space-x-3">
          <AlertCircle className="w-6 h-6 text-rose-600 shrink-0" />
          <div>
            <span className="font-bold block">Camera Error</span>
            <span>{cameraError}</span>
          </div>
        </div>
      )}

      {/* 5. FLOATING BOTTOM ACTION BAR (Mobile-First Touch Ergonomics) */}
      <div className="absolute bottom-3 sm:bottom-4 left-2 sm:left-4 right-2 sm:right-4 z-30 flex justify-center pointer-events-none pb-[env(safe-area-inset-bottom,0px)]">
        <div className="w-full max-w-lg p-2 sm:p-2.5 rounded-2xl bg-slate-900/90 backdrop-blur-md border border-slate-700 shadow-2xl flex items-center justify-between gap-2 pointer-events-auto">
          {/* STATE A: VERDICT LOCKED -> Primary Action is NEXT PART */}
          {isLocked ? (
            <>
              {/* Massive "Next Part" button */}
              <button
                onClick={unlockAndReadyNextPart}
                className="flex-1 py-3.5 sm:py-4 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-sm sm:text-base shadow-lg shadow-emerald-600/30 transition-all active:scale-95 cursor-pointer flex items-center justify-center space-x-2"
              >
                <span>Ready for Next Part</span>
                <ArrowRight className="w-5 h-5" />
              </button>

              {/* Re-Scan Current Part Button */}
              <button
                onClick={handleManualTriggerScan}
                className="p-3.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition active:scale-95 cursor-pointer"
                title="Re-inspect current part"
              >
                <RefreshCw className="w-4 h-4" />
              </button>

              {/* Stop Inspection Button */}
              <button
                onClick={handleStopInspection}
                className="p-3.5 rounded-xl bg-rose-900/50 hover:bg-rose-900 text-rose-300 border border-rose-800 transition active:scale-95 cursor-pointer"
                title="Stop Inspection"
              >
                <Square className="w-4 h-4 fill-current" />
              </button>
            </>
          ) : (
            /* STATE B: LIVE INSPECTION / POSITIONING */
            <>
              {isInspecting ? (
                <>
                  {/* Primary "SCAN PART" Button */}
                  <button
                    onClick={handleManualTriggerScan}
                    className="flex-1 py-3.5 sm:py-4 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-black text-sm sm:text-base shadow-lg shadow-indigo-600/30 transition-all active:scale-95 cursor-pointer flex items-center justify-center space-x-2"
                  >
                    <Scan className="w-5 h-5" />
                    <span>Scan Part</span>
                  </button>

                  {/* Mode Selector Pill (Tap vs Auto) */}
                  <button
                    onClick={() => setScanMode(scanMode === 'manual' ? 'auto_lock' : 'manual')}
                    className={`px-3 py-3 rounded-xl text-xs font-bold border transition cursor-pointer shrink-0 ${
                      scanMode === 'auto_lock'
                        ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                        : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                    }`}
                    title="Toggle between Tap to Scan and Auto-Detect"
                  >
                    <span>{scanMode === 'auto_lock' ? 'Auto' : 'Tap'}</span>
                  </button>

                  {/* Flip Camera (Switch Front/Back on Phone) */}
                  <button
                    onClick={switchCamera}
                    disabled={!isCameraActive || isSimulating}
                    className="p-3.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition active:scale-95 cursor-pointer disabled:opacity-40"
                    title="Switch Front/Rear Phone Camera"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </button>

                  {/* Stop Inspection */}
                  <button
                    onClick={handleStopInspection}
                    className="p-3.5 rounded-xl bg-rose-900/50 hover:bg-rose-900 text-rose-300 border border-rose-800 transition active:scale-95 cursor-pointer"
                    title="Stop Inspection"
                  >
                    <Square className="w-4 h-4 fill-current" />
                  </button>
                </>
              ) : (
                /* STATE C: IDLE */
                <button
                  onClick={handleStartInspection}
                  className="flex-1 py-3.5 sm:py-4 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-sm sm:text-base shadow-lg shadow-emerald-600/30 transition-all active:scale-95 cursor-pointer flex items-center justify-center space-x-2"
                >
                  <Play className="w-5 h-5 fill-current" />
                  <span>Start Inspection</span>
                </button>
              )}

              {/* Master Setup Quick Icon */}
              <button
                onClick={() => {
                  handleStopInspection();
                  onOpenMasterSetup();
                }}
                className="p-3.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-indigo-300 border border-slate-700 transition active:scale-95 cursor-pointer"
                title="Master Learning Setup"
              >
                <Wrench className="w-4 h-4" />
              </button>

              {/* Debug Telemetry Toggle */}
              <button
                onClick={() => setIsDebugMode(!isDebugMode)}
                className={`p-3.5 rounded-xl border transition active:scale-95 cursor-pointer ${
                  isDebugMode
                    ? 'bg-indigo-600 text-white border-indigo-400'
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-400 border-slate-700'
                }`}
                title="Toggle Debug Telemetry"
              >
                <Bug className="w-4 h-4" />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
