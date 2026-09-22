import React, { useRef, useEffect, useState, useCallback } from 'react';
import { 
  Play, Square, RefreshCw, AlertTriangle, CheckCircle, 
  Wrench, Camera, Zap, AlertCircle, Maximize2, Minimize2, 
  Scan, Sparkles, Volume2, VolumeX, Bug, Lock, ArrowRight,
  RotateCcw, Sliders, Check, ShieldCheck, Timer
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

  // Scan Modes: 'auto_lock' | 'manual' | 'continuous'
  const [scanMode, setScanMode] = useState(settings?.scanMode || 'auto_lock');
  const [scanSpeedMs, setScanSpeedMs] = useState(settings?.inspectionIntervalMs || 220);
  const [lockDurationMs, setLockDurationMs] = useState(settings?.lockDurationMs || 2500);

  const [isInspecting, setIsInspecting] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isDebugMode, setIsDebugMode] = useState(false);
  const [activeThreshold, setActiveThreshold] = useState(settings?.sleeveConfidenceThreshold ?? 0.38);

  // Inspection State Machine: 'IDLE' | 'POSITIONING' | 'STABILIZING' | 'LOCKED'
  const [cycleState, setCycleState] = useState('IDLE');
  const [lockProgress, setLockProgress] = useState(0); // 0..100% for locked timer bar
  const [stabilityCounter, setStabilityCounter] = useState(0); // consecutive stable frames

  // Shift QC Statistics
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
  const lockTimerRef = useRef(null);
  const lockStartTimeRef = useRef(0);
  const stableFramesRequired = settings?.stabilityFrames || 3;

  const totalTargetSleeves = masterProfile?.sleeves?.length || 3;

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopAlarm();
      if (animationFrameIdRef.current) cancelAnimationFrame(animationFrameIdRef.current);
      if (lockTimerRef.current) clearInterval(lockTimerRef.current);
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
    setLockProgress(0);

    setInspectionResult({
      partDetected: false,
      matchedFeatures: 0,
      sleeve1: 'unknown',
      sleeve2: 'unknown',
      sleeve3: 'unknown',
      result: 'SEARCHING',
      status: 'SEARCHING',
      message: 'Position PA6-GF50 Part in Target Reticle',
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
    setLockProgress(0);
    stopAlarm();

    if (animationFrameIdRef.current) {
      cancelAnimationFrame(animationFrameIdRef.current);
    }
    if (lockTimerRef.current) {
      clearInterval(lockTimerRef.current);
      lockTimerRef.current = null;
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

  // Unlock and prepare for the next part
  const unlockAndReadyNextPart = useCallback(() => {
    if (lockTimerRef.current) {
      clearInterval(lockTimerRef.current);
      lockTimerRef.current = null;
    }
    setLockProgress(0);
    setStabilityCounter(0);
    setCycleState('POSITIONING');
    stopAlarm();

    setInspectionResult((prev) => ({
      ...prev,
      result: 'SEARCHING',
      status: 'SEARCHING',
      message: 'Ready for Next Part • Align in Reticle',
    }));
  }, [stopAlarm]);

  // Lock a final verdict on screen
  const lockVerdict = useCallback((evalResult) => {
    setCycleState('LOCKED');
    setInspectionResult(evalResult);

    const isPass = evalResult.status === 'PASS' || evalResult.result === 'PASS';

    // Update Statistics
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
          particleCount: 28,
          spread: 60,
          origin: { y: 0.2 },
          colors: ['#10b981', '#059669', '#34d399', '#ffffff'],
        });
      } catch (e) {}
    } else {
      triggerFailBuzz();
    }

    // Auto-Lock Timer Countdown Bar
    if (scanMode === 'auto_lock') {
      const startTime = performance.now();
      lockStartTimeRef.current = startTime;
      if (lockTimerRef.current) clearInterval(lockTimerRef.current);

      lockTimerRef.current = setInterval(() => {
        const elapsed = performance.now() - lockStartTimeRef.current;
        const progress = Math.min(100, (elapsed / lockDurationMs) * 100);
        setLockProgress(progress);

        if (elapsed >= lockDurationMs) {
          clearInterval(lockTimerRef.current);
          lockTimerRef.current = null;
          unlockAndReadyNextPart();
        }
      }, 50);
    }
  }, [scanMode, lockDurationMs, triggerPassChime, triggerFailBuzz, unlockAndReadyNextPart]);

  // Manual Trigger Scan Execution (One definitive high-confidence snapshot)
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

    // Do NOT process frames if currently locked in a verdict hold
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

      // Handle Scan Modes:
      if (scanMode === 'continuous') {
        // Continuous smooth live scanning
        setInspectionResult(result);
        setCycleState(result.partDetected ? 'ANALYZING' : 'POSITIONING');
        return;
      }

      if (scanMode === 'manual') {
        // In manual mode, only update reticle guide without locking automatically
        setInspectionResult({
          ...result,
          message: result.partDetected
            ? 'Part Detected • Press "SCAN PART" to Inspect'
            : 'Align Part in Reticle • Press "SCAN PART"',
        });
        setCycleState(result.partDetected ? 'STABILIZING' : 'POSITIONING');
        return;
      }

      // Auto-Lock Cycle:
      if (scanMode === 'auto_lock') {
        const partInView = result.partDetected || result.sleeves.some((s) => s.confidence > 25);

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
                message: `Stabilizing part... (${nextCount}/${stableFramesRequired})`,
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

  // Inspection Loop throttled to calibrated scanSpeedMs (default 220ms)
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
      ctx.strokeStyle = cycleState === 'LOCKED' 
        ? (result.status === 'PASS' ? 'rgba(16, 185, 129, 0.95)' : 'rgba(239, 68, 68, 0.95)')
        : 'rgba(14, 165, 233, 0.9)';
      ctx.lineWidth = 3.5;
      ctx.stroke();

      ctx.fillStyle = cycleState === 'LOCKED'
        ? (result.status === 'PASS' ? 'rgba(16, 185, 129, 0.08)' : 'rgba(239, 68, 68, 0.08)')
        : 'rgba(14, 165, 233, 0.08)';
      ctx.fill();
      ctx.restore();
    } else if (!result.partDetected && cycleState !== 'LOCKED') {
      // Draw Circular Industrial Reticle for Hub Placement
      const reticleR = Math.min(canvas.width, canvas.height) * 0.22;
      ctx.save();
      ctx.strokeStyle = 'rgba(217, 119, 6, 0.75)';
      ctx.lineWidth = 2.5;
      ctx.setLineDash([8, 6]);
      ctx.beginPath();
      ctx.arc(cx, cy, reticleR, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      // Center crosshair
      ctx.beginPath();
      ctx.moveTo(cx - 16, cy); ctx.lineTo(cx + 16, cy);
      ctx.moveTo(cx, cy - 16); ctx.lineTo(cx, cy + 16);
      ctx.strokeStyle = 'rgba(217, 119, 6, 0.9)';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.font = 'bold 12px sans-serif';
      ctx.fillStyle = 'rgba(217, 119, 6, 0.95)';
      ctx.textAlign = 'center';
      ctx.fillText('ALIGN MOTOR HUB IN CENTER', cx, cy + reticleR + 24);
      ctx.restore();
    }

    // 2. Draw Sleeve Inspection Regions (Position 1, 2, 3)
    result.sleeves.forEach((sleeve, idx) => {
      const { x, y, radius, present } = sleeve;
      const isOk = present;

      ctx.save();
      const circleRadius = Math.max(20, radius);

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
      const posName = sleeve.name || `Sleeve ${idx + 1}`;
      const confText = sleeve.confidence !== undefined ? ` (${sleeve.confidence}%)` : '';
      const label = isOk ? `${posName}: OK${confText}` : `${posName}: MISSING${confText}`;
      const textWidth = ctx.measureText(label).width;

      const tagY = y - circleRadius - 16;
      ctx.fillStyle = isOk ? '#059669' : '#dc2626';
      ctx.fillRect(x - textWidth / 2 - 6, tagY - 10, textWidth + 12, 20);

      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.2;
      ctx.strokeRect(x - textWidth / 2 - 6, tagY - 10, textWidth + 12, 20);

      ctx.fillStyle = '#ffffff';
      ctx.fillText(label, x, tagY);
      ctx.restore();
    });
  };

  const isLocked = cycleState === 'LOCKED';
  const status = isLocked ? inspectionResult.status : (cycleState === 'STABILIZING' ? 'STABILIZING' : inspectionResult.status);
  const presentCount = inspectionResult.sleeves.filter((s) => s.present).length;

  return (
    <div
      ref={containerRef}
      className="relative flex-1 w-full h-full bg-slate-950 overflow-hidden flex flex-col select-none"
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
          <div className="text-white text-xs font-bold bg-indigo-600/90 px-3 py-1.5 rounded-full absolute top-4 left-4 z-20 shadow">
            ● Virtual PA6-GF50 Test Bench Active
          </div>
        </div>
      )}

      {/* HUD Canvas Overlay */}
      <canvas
        ref={overlayCanvasRef}
        className="absolute inset-0 w-full h-full object-cover pointer-events-none z-10"
      />

      {/* 2. FLOATING TOP RESULT BANNER & STATS */}
      <div className="absolute top-3 left-3 right-3 z-30 flex flex-col items-center pointer-events-none space-y-2">
        {/* Main Verdict Card */}
        <div
          className={`w-full max-w-xl py-2.5 px-4 rounded-2xl transition-all duration-300 shadow-2xl flex items-center justify-between pointer-events-auto backdrop-blur-md ${
            isLocked && status === 'PASS'
              ? 'bg-emerald-600/95 text-white border-2 border-emerald-300 ring-4 ring-emerald-500/30'
              : isLocked && status === 'FAIL'
              ? 'bg-rose-600/95 text-white border-2 border-rose-300 ring-4 ring-rose-500/30'
              : cycleState === 'STABILIZING'
              ? 'bg-indigo-600/95 text-white border-2 border-indigo-300'
              : 'bg-white/95 text-slate-800 border border-slate-300 shadow-lg'
          }`}
        >
          <div className="flex items-center space-x-3">
            {isLocked && status === 'PASS' && (
              <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
                <CheckCircle className="w-8 h-8 text-white shrink-0" />
              </div>
            )}
            {isLocked && status === 'FAIL' && (
              <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
                <AlertTriangle className="w-8 h-8 text-white shrink-0" />
              </div>
            )}
            {!isLocked && cycleState === 'STABILIZING' && (
              <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
                <Timer className="w-6 h-6 text-white animate-spin shrink-0" />
              </div>
            )}
            {!isLocked && cycleState === 'POSITIONING' && (
              <div className="w-9 h-9 rounded-xl bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-700">
                <Scan className="w-5 h-5" />
              </div>
            )}
            {!isInspecting && (
              <div className="w-9 h-9 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-700">
                <Zap className="w-5 h-5 text-indigo-600 shrink-0" />
              </div>
            )}

            <div>
              <div className="flex items-center space-x-2">
                <span className="text-xl sm:text-3xl font-black tracking-wide leading-tight">
                  {isLocked && status === 'PASS'
                    ? 'PASS (OK PART)'
                    : isLocked && status === 'FAIL'
                    ? 'REJECT (DEFECT)'
                    : cycleState === 'STABILIZING'
                    ? 'STABILIZING...'
                    : cycleState === 'POSITIONING'
                    ? 'ALIGN PART'
                    : 'READY'}
                </span>
                {isLocked && (
                  <span className="px-2 py-0.5 rounded-full bg-white/25 text-white text-[10px] font-black uppercase tracking-wider flex items-center space-x-1">
                    <Lock className="w-3 h-3" />
                    <span>LOCKED</span>
                  </span>
                )}
              </div>
              <span className="text-xs sm:text-sm font-semibold opacity-95 block">
                {isLocked && status === 'PASS'
                  ? `All ${totalTargetSleeves} metal sleeves verified present and seated`
                  : isLocked && status === 'FAIL'
                  ? `${inspectionResult.missingCount} metal sleeve missing — remove part from line`
                  : cycleState === 'STABILIZING'
                  ? `Holding steady (${stabilityCounter}/${stableFramesRequired})...`
                  : cycleState === 'POSITIONING'
                  ? 'Center the circular motor hub in the reticle'
                  : 'Press "Start Inspection" to begin shop-floor QC'}
              </span>
            </div>
          </div>

          {/* Right Action / Countdown Button */}
          <div className="flex items-center space-x-2">
            {isLocked ? (
              <button
                onClick={unlockAndReadyNextPart}
                className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-white text-slate-900 text-xs font-black shadow-lg hover:bg-slate-100 transition active:scale-95 cursor-pointer"
              >
                <span>Next Part</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            ) : (
              <div className="flex items-center space-x-1">
                <button
                  onClick={toggleMute}
                  className={`p-2 rounded-xl border transition cursor-pointer ${
                    isMuted ? 'bg-rose-100 text-rose-700 border-rose-300' : 'bg-white text-slate-700 border-slate-200'
                  }`}
                  title={isMuted ? 'Unmute Audio' : 'Mute Audio'}
                >
                  {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                </button>
                <button
                  onClick={toggleFullscreen}
                  className="p-2 rounded-xl bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 transition cursor-pointer"
                  title="Toggle Fullscreen"
                >
                  {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Hold Verdict Progress Bar (When Locked in Auto-Lock mode) */}
        {isLocked && scanMode === 'auto_lock' && (
          <div className="w-full max-w-xl h-2 bg-slate-800/80 rounded-full overflow-hidden border border-slate-700 pointer-events-auto shadow-md">
            <div
              className={`h-full transition-all duration-75 ${
                status === 'PASS' ? 'bg-emerald-400' : 'bg-rose-400'
              }`}
              style={{ width: `${lockProgress}%` }}
            />
          </div>
        )}

        {/* QC Shift Statistics Bar */}
        <div className="flex items-center space-x-2 bg-slate-900/85 backdrop-blur-md px-3.5 py-1 rounded-full border border-slate-700 text-white text-[11px] font-bold shadow-lg pointer-events-auto">
          <span className="text-slate-400">Shift QC:</span>
          <span>Total: <strong className="text-white font-mono">{qcStats.total}</strong></span>
          <span className="text-slate-600">•</span>
          <span className="text-emerald-400">Pass: <strong className="font-mono">{qcStats.passed}</strong></span>
          <span className="text-slate-600">•</span>
          <span className="text-rose-400">Fail: <strong className="font-mono">{qcStats.failed}</strong></span>
          <span className="text-slate-600">•</span>
          <span className="text-amber-300">
            Yield: <strong className="font-mono">{qcStats.total > 0 ? Math.round((qcStats.passed / qcStats.total) * 100) : 100}%</strong>
          </span>
          {qcStats.total > 0 && (
            <button
              onClick={() => setQcStats({ total: 0, passed: 0, failed: 0 })}
              className="ml-1 text-slate-400 hover:text-white transition"
              title="Reset Shift Counter"
            >
              <RotateCcw className="w-3 h-3" />
            </button>
          )}
        </div>

        {/* Mode Selector & Speed Switcher */}
        {isInspecting && (
          <div className="flex items-center space-x-2 bg-white/95 backdrop-blur-md px-3 py-1.5 rounded-2xl border border-slate-300 shadow-md pointer-events-auto text-[11px] font-bold text-slate-800">
            <span className="text-slate-500 font-semibold">Mode:</span>
            <button
              onClick={() => setScanMode('auto_lock')}
              className={`px-2.5 py-1 rounded-xl transition cursor-pointer ${
                scanMode === 'auto_lock'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              Auto-Lock (2.5s)
            </button>
            <button
              onClick={() => setScanMode('manual')}
              className={`px-2.5 py-1 rounded-xl transition cursor-pointer ${
                scanMode === 'manual'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              Tap to Scan
            </button>
            <button
              onClick={() => setScanMode('continuous')}
              className={`px-2.5 py-1 rounded-xl transition cursor-pointer ${
                scanMode === 'continuous'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              Continuous
            </button>

            <div className="h-4 w-px bg-slate-300 mx-1"></div>

            <span className="text-slate-500 font-semibold">Speed:</span>
            <button
              onClick={() => setScanSpeedMs(250)}
              className={`px-2 py-0.5 rounded-lg transition cursor-pointer ${
                scanSpeedMs === 250 ? 'bg-slate-800 text-white' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              Calibrated (250ms)
            </button>
            <button
              onClick={() => setScanSpeedMs(150)}
              className={`px-2 py-0.5 rounded-lg transition cursor-pointer ${
                scanSpeedMs === 150 ? 'bg-slate-800 text-white' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              Fast (150ms)
            </button>
          </div>
        )}
      </div>

      {/* 3. DEBUG MODE OVERLAY PANEL */}
      <DebugPanel
        inspectionResult={inspectionResult}
        isVisible={isDebugMode && isInspecting}
        onToggleVisible={() => setIsDebugMode(false)}
      />

      {/* 4. IDLE WELCOME CARD */}
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
            <h3 className="text-xl font-black text-slate-900 mb-1">Radiance Polymer Quality Control</h3>
            <p className="text-xs font-bold text-indigo-700 uppercase tracking-wider mb-2">
              PA6-GF50 Fan Shroud (3 Metal Sleeves)
            </p>
            <p className="text-xs text-slate-500 mb-5 leading-relaxed">
              Auto-Lock mode automatically stabilizes when part is aligned, gives definitive PASS/FAIL verdict, and holds for 2.5s without flickering.
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
        <div className="absolute top-20 left-4 right-4 z-40 p-4 rounded-2xl bg-rose-50 border-2 border-rose-400 text-rose-900 text-xs shadow-2xl flex items-center space-x-3">
          <AlertCircle className="w-6 h-6 text-rose-600 shrink-0" />
          <div>
            <span className="font-bold block">Camera Error</span>
            <span>{cameraError}</span>
          </div>
        </div>
      )}

      {/* 5. FLOATING BOTTOM CONTROL BAR */}
      <div className="absolute bottom-4 left-3 right-3 z-30 flex justify-center pointer-events-none">
        <div className="w-full max-w-xl p-2.5 sm:p-3 rounded-2xl bg-white/95 backdrop-blur-md border border-slate-200 shadow-2xl flex items-center justify-between gap-2 pointer-events-auto">
          {/* Start/Stop Toggle Button */}
          {isInspecting ? (
            <button
              onClick={handleStopInspection}
              className="flex-1 flex items-center justify-center space-x-1.5 py-3 px-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-black text-xs sm:text-sm shadow-sm transition active:scale-95 cursor-pointer"
            >
              <Square className="w-4 h-4 fill-current" />
              <span>Stop Inspection</span>
            </button>
          ) : (
            <button
              onClick={handleStartInspection}
              className="flex-1 flex items-center justify-center space-x-1.5 py-3 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs sm:text-sm shadow-sm transition active:scale-95 cursor-pointer"
            >
              <Play className="w-4 h-4 fill-current" />
              <span>Start Inspection</span>
            </button>
          )}

          {/* Manual Trigger Scan Button (When in Manual or whenever user wants instant scan) */}
          {isInspecting && (
            <button
              onClick={isLocked ? unlockAndReadyNextPart : handleManualTriggerScan}
              className={`flex items-center space-x-1.5 px-4 py-3 rounded-xl font-black text-xs sm:text-sm shadow-md transition active:scale-95 cursor-pointer ${
                isLocked
                  ? 'bg-slate-800 hover:bg-slate-900 text-white'
                  : 'bg-indigo-600 hover:bg-indigo-700 text-white'
              }`}
            >
              {isLocked ? (
                <>
                  <ArrowRight className="w-4 h-4" />
                  <span>Next Part</span>
                </>
              ) : (
                <>
                  <Scan className="w-4 h-4" />
                  <span>Scan Part</span>
                </>
              )}
            </button>
          )}

          {/* Flip Camera */}
          <button
            onClick={switchCamera}
            disabled={!isCameraActive || isSimulating}
            className="p-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 transition active:scale-95 cursor-pointer disabled:opacity-40"
            title="Switch Front/Rear Camera"
          >
            <RefreshCw className="w-4 h-4" />
          </button>

          {/* Master Learning Setup */}
          <button
            onClick={() => {
              handleStopInspection();
              onOpenMasterSetup();
            }}
            className="p-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-indigo-700 border border-slate-200 transition active:scale-95 cursor-pointer"
            title="Master Learning Setup"
          >
            <Wrench className="w-4 h-4" />
          </button>

          {/* Debug Toggle */}
          <button
            onClick={() => setIsDebugMode(!isDebugMode)}
            className={`p-3 rounded-xl border transition active:scale-95 cursor-pointer ${
              isDebugMode
                ? 'bg-indigo-600 text-white border-indigo-400'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'
            }`}
            title="Toggle Debug Telemetry"
          >
            <Bug className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
