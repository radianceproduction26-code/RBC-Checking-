import { useRef, useCallback, useState, useEffect } from 'react';

/**
 * Web Audio API based alarm hook for instant shop-floor alerts.
 * Generates an attention-grabbing industrial beep (880Hz square/sine pulse)
 * repeating every 1 second when defect is detected.
 */
export function useAudioAlert() {
  const [isMuted, setIsMuted] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const audioCtxRef = useRef(null);
  const intervalRef = useRef(null);

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
  const triggerSingleBeep = useCallback(() => {
    if (isMuted) return;
    try {
      const ctx = getAudioContext();
      if (!ctx) return;

      const now = ctx.currentTime;
      
      // Dual oscillator for rich industrial buzzer tone
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();

      osc1.type = 'sawtooth';
      osc1.frequency.setValueAtTime(880, now); // A5 note

      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(1760, now); // Harmonic

      // Envelope: Fast attack, hold, quick release (180ms total)
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.exponentialRampToValueAtTime(0.8, now + 0.02);
      gain.gain.setValueAtTime(0.8, now + 0.14);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);

      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + 0.2);
      osc2.stop(now + 0.2);
    } catch (e) {
      console.warn('Audio alert error:', e);
    }
  }, [isMuted, getAudioContext]);

  // Start repeating alarm (every 1 second) while defect remains visible
  const startAlarm = useCallback(() => {
    if (intervalRef.current) return; // already active
    setIsPlaying(true);
    triggerSingleBeep();
    intervalRef.current = setInterval(() => {
      triggerSingleBeep();
    }, 1000);
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
