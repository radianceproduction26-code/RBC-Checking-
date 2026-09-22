import { useRef, useCallback, useState, useEffect } from 'react';

/**
 * Web Audio API based alarm hook for instant shop-floor alerts.
 * Supports:
 * - Warning beep (1 missing): repeating beep every 1000ms
 * - Continuous warning beep (2+ missing): fast urgent pulse every 300ms
 */
export function useAudioAlert() {
  const [isMuted, setIsMuted] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const audioCtxRef = useRef(null);
  const intervalRef = useRef(null);
  const currentSeverityRef = useRef(1);

  // Initialize or resume AudioContext
  const getAudioContext = useCallback(() => {
    if (!audioCtxRef.current) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        audioCtxRef.current = new AudioCtx();
      }
    }
    if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume();
    }
    return audioCtxRef.current;
  }, []);

  // Single high-pitched penetrating shop-floor alert beep
  const triggerSingleBeep = useCallback((durationMs = 180) => {
    if (isMuted) return;
    try {
      const ctx = getAudioContext();
      if (!ctx) return;

      const now = ctx.currentTime;
      const durSec = durationMs / 1000;
      
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();

      osc1.type = 'sawtooth';
      osc1.frequency.setValueAtTime(880, now); // A5 note

      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(1760, now); // Harmonic

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.exponentialRampToValueAtTime(0.8, now + 0.02);
      gain.gain.setValueAtTime(0.8, now + (durSec - 0.04));
      gain.gain.exponentialRampToValueAtTime(0.001, now + durSec);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);

      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + durSec + 0.02);
      osc2.stop(now + durSec + 0.02);
    } catch (e) {
      console.warn('Audio alert error:', e);
    }
  }, [isMuted, getAudioContext]);

  // Start repeating alarm
  // missingCount = 1 -> 1 beep per second
  // missingCount >= 2 -> continuous urgent beep every 300ms
  const startAlarm = useCallback((missingCount = 1) => {
    const isUrgent = missingCount >= 2;
    const intervalMs = isUrgent ? 320 : 1000;

    // If already running with same severity, don't restart
    if (intervalRef.current && currentSeverityRef.current === missingCount) {
      return;
    }

    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    currentSeverityRef.current = missingCount;
    setIsPlaying(true);
    triggerSingleBeep(isUrgent ? 140 : 180);

    intervalRef.current = setInterval(() => {
      triggerSingleBeep(isUrgent ? 140 : 180);
    }, intervalMs);
  }, [triggerSingleBeep]);

  // Stop alarm immediately when defect disappears or inspection stops
  const stopAlarm = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setIsPlaying(false);
  }, []);

  const toggleMute = useCallback(() => {
    setIsMuted((prev) => !prev);
  }, []);

  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      if (audioCtxRef.current) {
        audioCtxRef.current.close().catch(() => {});
      }
    };
  }, []);

  return {
    startAlarm,
    stopAlarm,
    triggerSingleBeep,
    isPlaying,
    isMuted,
    toggleMute,
    initAudio: getAudioContext,
  };
}
