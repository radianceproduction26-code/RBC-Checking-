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
    <header className="bg-white border-b border-slate-200 px-3 sm:px-4 py-2 flex items-center justify-between shadow-xs z-30 select-none shrink-0">
      {/* Brand & Logo */}
      <div className="flex items-center space-x-2 sm:space-x-3 min-w-0">
        <div className="h-9 sm:h-10 px-1.5 py-0.5 rounded-lg bg-white border border-slate-200 flex items-center justify-center shadow-xs shrink-0">
          <img
            src="/radiance-polymer-logo.png"
            alt="Radiance Polymer Logo"
            className="h-7 sm:h-8 w-auto max-w-[90px] sm:max-w-[120px] object-contain"
          />
        </div>
        <div className="min-w-0">
          <div className="flex items-center space-x-1.5">
            <h1 className="text-sm sm:text-base md:text-lg font-black text-slate-900 tracking-tight leading-tight truncate">
              RBC Check
            </h1>
            <span className="text-[9px] sm:text-[10px] uppercase font-black tracking-wider px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 shrink-0">
              3-Sleeve
            </span>
          </div>
          <p className="text-[10px] sm:text-xs text-slate-500 font-semibold truncate hidden xs:block">
            Radiance Polymer • Quality Control
          </p>
        </div>
      </div>

      {/* Status Badges & Quick Action Controls */}
      <div className="flex items-center space-x-1.5 sm:space-x-2 shrink-0">
        {/* CV Engine Status */}
        <div
          title={cvStatus}
          className={`flex items-center space-x-1 text-[11px] font-semibold px-2 py-1 rounded-full border ${
            cvReady
              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
              : 'bg-amber-50 text-amber-700 border-amber-200 animate-pulse'
          }`}
        >
          <span className={`w-2 h-2 rounded-full ${cvReady ? 'bg-emerald-500' : 'bg-amber-500 animate-ping'}`} />
          <span className="hidden sm:inline">{cvReady ? 'CV Ready' : 'Loading CV...'}</span>
          <span className="sm:hidden text-[10px] font-bold">{cvReady ? 'Ready' : 'CV...'}</span>
        </div>

        {/* Master Part Tag (Desktop only) */}
        <div className="hidden lg:flex items-center text-xs font-semibold px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 border border-slate-200">
          <span className="w-2 h-2 rounded-full bg-indigo-500 mr-1.5"></span>
          <span>{masterPart ? `${masterPart.name} (${sleeveCount} Sleeves)` : '3 Sleeves'}</span>
        </div>

        {/* Audio Mute/Unmute Toggle */}
        <button
          onClick={onToggleMute}
          title={isMuted ? 'Unmute Audio Alarm' : 'Mute Audio Alarm'}
          className={`p-2 rounded-xl border transition-all cursor-pointer ${
            isMuted
              ? 'bg-rose-50 border-rose-200 text-rose-600 hover:bg-rose-100'
              : 'bg-slate-100 border-slate-200 text-emerald-600 hover:bg-slate-200'
          }`}
        >
          {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
        </button>

        {/* Test Simulator Button */}
        <button
          onClick={onOpenSimulator}
          title="Open Virtual Shop Floor Test Bench"
          className="flex items-center space-x-1 sm:space-x-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-xs transition-all cursor-pointer"
        >
          <PlayCircle className="w-4 h-4" />
          <span className="hidden md:inline">Test Bench</span>
        </button>

        {/* Settings Button */}
        <button
          onClick={onOpenSettings}
          title="Inspection Settings"
          className="p-2 rounded-xl bg-slate-100 border border-slate-200 text-slate-700 hover:bg-slate-200 transition-all cursor-pointer"
        >
          <Settings className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
}
