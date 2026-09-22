import { useState, useRef, useCallback, useEffect } from 'react';

/**
 * Camera management hook for mobile & desktop browsers
 */
export function useCamera() {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [isActive, setIsActive] = useState(false);
  const [facingMode, setFacingMode] = useState('environment'); // default to rear camera
  const [hasMultipleCameras, setHasMultipleCameras] = useState(false);
  const [error, setError] = useState(null);
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);

  // Check available video input devices
  useEffect(() => {
    if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
      navigator.mediaDevices.enumerateDevices()
        .then((devices) => {
          const videoInputs = devices.filter((d) => d.kind === 'videoinput');
          setHasMultipleCameras(videoInputs.length > 1);
        })
        .catch(() => {});
    }
  }, []);

  const startCamera = useCallback(async (preferredFacingMode = facingMode) => {
    setError(null);
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }

      const constraints = {
        audio: false,
        video: {
          facingMode: { ideal: preferredFacingMode },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      };

      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch (err) {
        // Fallback to basic video without constraints if specific resolution/facingMode fails
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      }

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      // Check torch support
      const track = stream.getVideoTracks()[0];
      if (track && track.getCapabilities) {
        const capabilities = track.getCapabilities();
        if (capabilities.torch) {
          setTorchSupported(true);
        }
      }

      setIsActive(true);
      setFacingMode(preferredFacingMode);
      return true;
    } catch (err) {
      console.error('Failed to open camera:', err);
      setError(err.name === 'NotAllowedError' 
        ? 'Camera permission denied. Please allow camera access in browser settings.' 
        : `Camera error: ${err.message || 'Unable to access camera'}`);
      setIsActive(false);
      return false;
    }
  }, [facingMode]);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsActive(false);
    setTorchOn(false);
  }, []);

  const switchCamera = useCallback(async () => {
    const nextMode = facingMode === 'environment' ? 'user' : 'environment';
    await startCamera(nextMode);
  }, [facingMode, startCamera]);

  const toggleTorch = useCallback(async () => {
    if (!streamRef.current || !torchSupported) return;
    try {
      const track = streamRef.current.getVideoTracks()[0];
      const nextTorch = !torchOn;
      await track.applyConstraints({
        advanced: [{ torch: nextTorch }],
      });
      setTorchOn(nextTorch);
    } catch (e) {
      console.warn('Torch toggle failed:', e);
    }
  }, [torchOn, torchSupported]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [stopCamera]);

  return {
    videoRef,
    isActive,
    facingMode,
    hasMultipleCameras,
    error,
    startCamera,
    stopCamera,
    switchCamera,
    torchSupported,
    torchOn,
    toggleTorch,
  };
}
