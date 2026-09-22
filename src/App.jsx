import React, { useState, useEffect, useRef } from 'react';
import Header from './components/Header';
import InspectionView from './components/InspectionView';
import MasterSetup from './components/MasterSetup';
import SimulatorModal from './components/SimulatorModal';
import SettingsModal from './components/SettingsModal';

import { useOpenCV } from './hooks/useOpenCV';
import { useCamera } from './hooks/useCamera';
import { useAudioAlert } from './hooks/useAudioAlert';

import { CVInspectionEngine } from './services/cvEngine';
import { loadMasterPart, loadSettings, DEFAULT_SETTINGS } from './services/storage';

export default function App() {
  const { isLoaded: cvReady, loadProgress, cv } = useOpenCV();
  const cameraHook = useCamera();
  const audioHook = useAudioAlert();

  const [activeTab, setActiveTab] = useState('INSPECTION'); // 'INSPECTION' | 'MASTER_SETUP'
  const [masterPart, setMasterPart] = useState(() => loadMasterPart());
  const [settings, setSettings] = useState(() => loadSettings());
  const [isSimulatorOpen, setIsSimulatorOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isSimulating, setIsSimulating] = useState(false);

  const cvEngineRef = useRef(null);
  const simulatedCanvasRef = useRef(null);

  // Initialize CV Engine when OpenCV.js is ready
  useEffect(() => {
    if (cvReady && cv && !cvEngineRef.current) {
      cvEngineRef.current = new CVInspectionEngine(cv);
    }
  }, [cvReady, cv]);

  // Load / update master part into CV Engine
  useEffect(() => {
    if (cvReady && cvEngineRef.current && masterPart) {
      cvEngineRef.current.loadMaster(masterPart).catch((err) => {
        console.warn('Failed to register master part in CV engine:', err);
      });
    }
  }, [cvReady, masterPart]);

  const handleMasterSaved = (updatedMaster) => {
    setMasterPart(updatedMaster);
    if (cvEngineRef.current) {
      cvEngineRef.current.loadMaster(updatedMaster);
    }
    setActiveTab('INSPECTION');
  };

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-slate-100 text-slate-900">
      {/* Hidden virtual canvas for simulated stream */}
      <canvas ref={simulatedCanvasRef} className="hidden" width={640} height={480} />

      {/* Main Header */}
      <Header
        cvReady={cvReady}
        cvStatus={loadProgress}
        masterPart={masterPart}
        isMuted={audioHook.isMuted}
        onToggleMute={audioHook.toggleMute}
        onOpenSimulator={() => setIsSimulatorOpen(true)}
        onOpenSettings={() => setIsSettingsOpen(true)}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
      />

      {/* Main Screen Content */}
      <main className="flex-1 flex flex-col overflow-hidden relative">
        {activeTab === 'INSPECTION' ? (
          <InspectionView
            cvEngine={cvEngineRef.current}
            cvReady={cvReady}
            masterPart={masterPart}
            onOpenMasterSetup={() => setActiveTab('MASTER_SETUP')}
            onOpenSimulator={() => setIsSimulatorOpen(true)}
            useCameraHook={cameraHook}
            useAudioAlertHook={audioHook}
            settings={settings}
            simulatedCanvas={simulatedCanvasRef.current}
            isSimulating={isSimulating}
          />
        ) : (
          <MasterSetup
            currentMaster={masterPart}
            onMasterSaved={handleMasterSaved}
            onBack={() => setActiveTab('INSPECTION')}
            cvEngine={cvEngineRef.current}
            cvReady={cvReady}
          />
        )}
      </main>

      {/* Virtual Shop Floor Simulator Modal */}
      <SimulatorModal
        isOpen={isSimulatorOpen}
        onClose={() => setIsSimulatorOpen(false)}
        isSimulating={isSimulating}
        setIsSimulating={setIsSimulating}
        simulatedCanvasRef={simulatedCanvasRef}
      />

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={settings}
        onUpdateSettings={setSettings}
        testBeep={() => audioHook.triggerSingleBeep()}
      />
    </div>
  );
}
