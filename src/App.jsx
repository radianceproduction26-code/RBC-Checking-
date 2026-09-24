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
import { loadMasterProfile, saveMasterProfile } from './services/masterProfile';
import { loadSettings, DEFAULT_SETTINGS } from './services/storage';

export default function App() {
  const { isLoaded: cvReady, loadProgress, cv } = useOpenCV();
  const cameraHook = useCamera();
  const audioHook = useAudioAlert();

  const [activeTab, setActiveTab] = useState('INSPECTION'); // 'INSPECTION' | 'MASTER_SETUP'
  const [masterProfile, setMasterProfile] = useState(() => loadMasterProfile());
  const [settings, setSettings] = useState(() => loadSettings());
  const [isSimulatorOpen, setIsSimulatorOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isSimulating, setIsSimulating] = useState(false);

  // Initialize CV Engine immediately so fast scanning is available from millisecond zero
  const cvEngineRef = useRef(new CVInspectionEngine(null));
  const simulatedCanvasRef = useRef(null);

  // Attach OpenCV.js when WebAssembly finishes compiling in background
  useEffect(() => {
    if (cvReady && cv && cvEngineRef.current) {
      cvEngineRef.current.cv = cv;
      if (masterProfile) {
        cvEngineRef.current.loadMasterProfile(masterProfile).catch((err) => {
          console.warn('Failed to register master profile in CV engine:', err);
        });
      }
    }
  }, [cvReady, cv, masterProfile]);

  const handleProfileSaved = (updatedProfile) => {
    setMasterProfile(updatedProfile);
    if (cvEngineRef.current) {
      cvEngineRef.current.loadMasterProfile(updatedProfile);
    }
    setActiveTab('INSPECTION');
  };

  return (
    <div className="flex flex-col h-[100dvh] w-full overflow-hidden bg-slate-100 text-slate-900">
      {/* Hidden virtual canvas for simulated stream */}
      <canvas ref={simulatedCanvasRef} className="hidden" width={640} height={480} />

      {/* Main Header */}
      <Header
        cvReady={cvReady}
        cvStatus={loadProgress}
        masterPart={masterProfile}
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
            masterProfile={masterProfile}
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
            currentProfile={masterProfile}
            onProfileSaved={handleProfileSaved}
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
