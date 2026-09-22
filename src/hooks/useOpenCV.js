import { useState, useEffect } from 'react';

/**
 * Hook to load and track OpenCV.js initialization
 */
export function useOpenCV() {
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState(null);
  const [loadProgress, setLoadProgress] = useState('Initializing...');

  useEffect(() => {
    // Check if cv is already initialized and ready
    if (window.cv && window.cv.Mat) {
      setIsLoaded(true);
      setLoadProgress('Ready');
      return;
    }

    let isMounted = true;

    // Check if script tag already exists
    let script = document.getElementById('opencv-script');

    const handleReady = () => {
      if (isMounted) {
        setIsLoaded(true);
        setLoadProgress('Ready');
      }
    };

    if (!script) {
      setLoadProgress('Loading OpenCV.js WebAssembly runtime...');
      script = document.createElement('script');
      script.id = 'opencv-script';
      script.async = true;
      script.src = '/opencv.js';
      
      // OpenCV calls onRuntimeInitialized when wasm finishes compiling
      window.Module = window.Module || {};
      const prevInitialized = window.Module.onRuntimeInitialized;
      window.Module.onRuntimeInitialized = () => {
        if (prevInitialized) prevInitialized();
        handleReady();
      };

      script.onload = () => {
        if (window.cv && window.cv.Mat) {
          handleReady();
        } else if (window.cv) {
          window.cv.onRuntimeInitialized = handleReady;
        }
      };

      script.onerror = (err) => {
        if (isMounted) {
          setError('Failed to load OpenCV.js script from /opencv.js');
          setLoadProgress('Load Error');
        }
      };

      document.body.appendChild(script);
    } else {
      // Script is already in DOM, check readiness periodically
      const interval = setInterval(() => {
        if (window.cv && window.cv.Mat) {
          clearInterval(interval);
          handleReady();
        }
      }, 100);

      return () => clearInterval(interval);
    }

    return () => {
      isMounted = false;
    };
  }, []);

  return { isLoaded, error, loadProgress, cv: window.cv };
}
