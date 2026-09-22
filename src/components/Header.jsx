import React from 'react';
import { ShieldCheck, Cpu, Volume2, VolumeX, PlayCircle, Settings } from 'lucide-react';

export default function Header({
  cvReady,
  cvStatus,
  masterPart,
  isMuted,
  onToggleMute,
  onOpenSimulator,
  onOpenSettings,
  activeTab,
  setActiveTab,
}) {
  const sleeveCount = masterPart?.sleeves?.length || 3;

  return (
    <header className="bg-white border-b border-slate-200 px-4 py-2.5 flex items-center justify-between shadow-sm z-30 select-none">
      {/* Brand & Title */}
      <div className="flex items-center space-x-3">
        <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center shadow-md shadow-indigo-600/20">
          <ShieldCheck className="w-6 h-6 text-white" />
        </div>
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-base sm:text-lg font-black text-slate-900 tracking-tight leading-tight">
              Metal Sleeve Inspection System
            </h1>
            <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300">
              3-Sleeve Spec
            </span>
          </div>
          <p className="text-xs text-slate-500 font-medium">
            Shop Floor Injection Molded Part Inspection • {sleeveCount} Sleeves Target
          </p>
        </div>
      </div>

      {/* Status Badges & Quick Action Controls */}
      <div className="flex items-center space-x-2">
        {/* CV Engine Status */}
        <div
          title={cvStatus}
          className={`hidden sm:flex items-center space-x-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border ${
            cvReady
              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
              : 'bg-amber-50 text-amber-700 border-amber-200 animate-pulse'
          }`}
        >
          <Cpu className="w-3.5 h-3.5 text-emerald-600" />
          <span>{cvReady ? 'OpenCV Ready' : 'Loading CV...'}</span>
        </div>

        {/* Master Part Tag */}
        <div className="hidden md:flex items-center text-xs font-semibold px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 border border-slate-200">
          <span className="w-2 h-2 rounded-full bg-indigo-500 mr-1.5"></span>
          <span>{masterPart ? `${masterPart.name} (${sleeveCount} Sleeves)` : '3 Sleeves'}</span>
        </div>

        {/* Audio Mute/Unmute Toggle */}
        <button
          onClick={onToggleMute}
          title={isMuted ? 'Unmute Audio Alarm' : 'Mute Audio Alarm'}
          className={`p-2 rounded-lg border transition-all cursor-pointer ${
            isMuted
              ? 'bg-rose-50 border-rose-200 text-rose-600 hover:bg-rose-100'
              : 'bg-slate-100 border-slate-200 text-emerald-600 hover:bg-slate-200'
          }`}
        >
          {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
        </button>

        {/* Test Simulator Button */}
        <button
          onClick={onOpenSimulator}
          title="Open Virtual Shop Floor Test Bench"
          className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-sm shadow-indigo-600/20 transition-all cursor-pointer"
        >
          <PlayCircle className="w-4 h-4" />
          <span className="hidden sm:inline">Virtual Test Bench</span>
        </button>

        {/* Settings Button */}
        <button
          onClick={onOpenSettings}
          title="Inspection Settings"
          className="p-2 rounded-lg bg-slate-100 border border-slate-200 text-slate-700 hover:bg-slate-200 transition-all cursor-pointer"
        >
          <Settings className="w-5 h-5" />
        </button>
      </div>
    </header>
  );
}
