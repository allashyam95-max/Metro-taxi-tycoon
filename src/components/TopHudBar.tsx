import { Camera, Pause, ShoppingBag, SlidersHorizontal, Smartphone, Star, Volume2, VolumeX } from 'lucide-react';
import { getStageSpec } from '../config/stages';
import { GameSaveState } from '../types/game';

interface TopHudBarProps {
  state: GameSaveState;
  showTouchControls: boolean;
  optionsOpen: boolean;
  highlightShop?: boolean;
  onOpenOptions: () => void;
  onOpenShop: () => void;
  onOpenPause: () => void;
  onToggleCamera: () => void;
  onToggleSound: () => void;
  onToggleTouch: () => void;
}

export function TopHudBar({
  state,
  showTouchControls,
  optionsOpen,
  highlightShop = false,
  onOpenOptions,
  onOpenShop,
  onOpenPause,
  onToggleCamera,
  onToggleSound,
  onToggleTouch,
}: TopHudBarProps) {
  const stage = getStageSpec(state.currentStage);
  const isOverdraft = state.money < 0;
  const rentCountdown = Math.max(0, Math.ceil(state.dayTimeRemaining));

  return (
    <header className="pointer-events-auto flex flex-wrap items-center justify-between gap-2 px-3 py-2 sm:px-4 bg-slate-950/90 border-b border-white/10 text-slate-100">
      {/* Left / Metrics Cluster */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 min-w-0">
        {/* Money */}
        <div className="flex items-baseline gap-1.5">
          <span className="text-xs font-medium text-slate-400">Cash</span>
          <span
            className={`font-display text-lg sm:text-xl font-bold tabular-nums tracking-tight ${
              isOverdraft ? 'text-rose-400' : 'text-emerald-400'
            }`}
          >
            {isOverdraft
              ? `-$${Math.abs(state.money).toFixed(2)}`
              : `$${state.money.toFixed(2)}`}
          </span>
        </div>

        <span className="hidden sm:inline text-slate-600" aria-hidden="true">·</span>

        {/* Passenger Rating */}
        <div className="flex items-center gap-1">
          <Star className="w-4 h-4 text-amber-400 fill-amber-400 shrink-0" />
          <span className="font-mono-num text-xs sm:text-sm font-semibold text-slate-100">
            {state.rating.toFixed(1)}
          </span>
          <span className="text-xs text-slate-400 hidden md:inline">
            ({state.completedTrips} rides)
          </span>
        </div>

        <span className="hidden md:inline text-slate-600" aria-hidden="true">·</span>

        {/* Current Stage & Daily Rental Fee */}
        <div className="hidden md:flex items-center gap-2 text-xs text-slate-300">
          <span className="font-semibold text-amber-400 whitespace-nowrap">
            {stage.shortTitle}
          </span>
          <span className="text-slate-500" aria-hidden="true">·</span>
          <span className="font-mono-num text-slate-300 whitespace-nowrap">
            {stage.dailyRentalFee > 0
              ? `Day ${state.currentDay} · $${stage.dailyRentalFee} fee in ${rentCountdown}s`
              : `Day ${state.currentDay} · $0 rental`}
          </span>
        </div>
      </div>

      {/* Right / Action Buttons */}
      <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">

        <button
          type="button"
          onClick={onToggleTouch}
          title="Toggle on-screen touch controls"
          className={`hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
            showTouchControls
              ? 'bg-amber-500/20 border-amber-400/40 text-amber-300'
              : 'bg-slate-900 border-white/10 text-slate-300 hover:bg-slate-800'
          }`}
        >
          <Smartphone className="w-3.5 h-3.5" />
          <span>Pad</span>
        </button>

        <button
          type="button"
          onClick={onToggleCamera}
          title="Switch camera view"
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium bg-slate-900 border border-white/10 text-slate-200 hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer min-h-[34px]"
        >
          <Camera className="w-3.5 h-3.5 text-slate-400" />
          <span className="hidden sm:inline">
            {state.cameraMode === 'chase' ? 'Chase' : 'Top'}
          </span>
        </button>

        <button
          type="button"
          onClick={onOpenOptions}
          title="Sound options"
          className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium border transition-colors whitespace-nowrap shrink-0 cursor-pointer min-h-[34px] ${
            optionsOpen
              ? 'bg-amber-500/20 border-amber-400/40 text-amber-300'
              : 'bg-slate-900 border-white/10 text-slate-200 hover:bg-slate-800'
          }`}
        >
          <SlidersHorizontal className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Options</span>
        </button>

        <button
          type="button"
          onClick={onToggleSound}
          title={state.soundEnabled ? 'Mute sound' : 'Enable sound'}
          className="inline-flex items-center justify-center p-1.5 rounded-md bg-slate-900 border border-white/10 text-slate-200 hover:bg-slate-800 transition-colors shrink-0 cursor-pointer min-h-[34px] min-w-[34px]"
        >
          {state.soundEnabled ? (
            <Volume2 className="w-4 h-4 text-slate-200" />
          ) : (
            <VolumeX className="w-4 h-4 text-slate-500" />
          )}
        </button>

        <button
          type="button"
          onClick={onOpenPause}
          title="Pause menu (Esc / P)"
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium bg-slate-900 border border-white/10 text-slate-200 hover:bg-slate-800 transition-colors shrink-0 cursor-pointer min-h-[34px]"
        >
          <Pause className="w-3.5 h-3.5 text-slate-200" />
          <span className="hidden sm:inline">Pause</span>
        </button>

        <button
          type="button"
          onClick={onOpenShop}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold bg-amber-500 text-slate-950 hover:bg-amber-400 transition-colors whitespace-nowrap shrink-0 cursor-pointer min-h-[34px] ${
            highlightShop ? 'animate-tutorial-highlight' : ''
          }`}
        >
          <ShoppingBag className="w-3.5 h-3.5" />
          <span>Shop & Stages</span>
        </button>
      </div>
    </header>
  );
}
