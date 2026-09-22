import { useRef, useCallback, useState, useEffect } from 'react';

/**
 * Web Audio API based audio hook for shop-floor inspection.
 * Supports:
 * - Pass Chime: pleasant confirmation dual-tone
 * - Fail Buzzer: distinct shop-floor warning tone
 * - Alarm Modes: repeating buzzer pulses for continuous alert
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

  // Positive Pass Chime (D5 -> A5)
  const triggerPassChime = useCallback(() => {
    if (isMuted) return;
    try {
      const ctx = getAudioContext();
      if (!ctx) return;
      const now = ctx.currentTime;

      // Note 1
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(587.33, now);
      gain1.gain.setValueAtTime(0.001, now);
      gain1.gain.exponentialRampToValueAtTime(0.35, now + 0.02);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.13);

      // Note 2
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(880, now + 0.11);
      gain2.gain.setValueAtTime(0.001, now + 0.11);
      gain2.gain.exponentialRampToValueAtTime(0.45, now + 0.13);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.34);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + 0.11);
      osc2.stop(now + 0.35);
    } catch (e) {
      console.warn('Pass chime error:', e);
    }
  }, [isMuted, getAudioContext]);

  // Distinct Reject / Fail Buzz
  const triggerFailBuzz = useCallback(() => {
    if (isMuted) return;
    try {
      const ctx = getAudioContext();
      if (!ctx) return;
      const now = ctx.currentTime;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(240, now);
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.exponentialRampToValueAtTime(0.65, now + 0.02);
      gain.gain.setValueAtTime(0.65, now + 0.30);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.38);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.40);
    } catch (e) {
      console.warn('Fail buzz error:', e);
    }
  }, [isMuted, getAudioContext]);

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
      osc1.frequency.setValueAtTime(880, now);

      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(1760, now);

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
  const startAlarm = useCallback((missingCount = 1) => {
    const isUrgent = missingCount >= 2;
    const intervalMs = isUrgent ? 320 : 1000;

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

  // Stop alarm immediately
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
    triggerPassChime,
    triggerFailBuzz,
    isPlaying,
    isMuted,
    toggleMute,
    initAudio: getAudioContext,
  };
}
