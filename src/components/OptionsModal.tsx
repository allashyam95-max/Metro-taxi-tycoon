import { Car, Music, RotateCcw, SlidersHorizontal, Trees, Volume2, VolumeX, X } from 'lucide-react';

interface OptionsModalProps {
  carSoundVolume: number;
  backgroundSoundVolume: number;
  musicVolume: number;
  musicMuted: boolean;
  masterSoundEnabled: boolean;
  onChangeCarSoundVolume: (vol: number) => void;
  onChangeBackgroundSoundVolume: (vol: number) => void;
  onChangeMusicVolume: (vol: number) => void;
  onToggleMusicMute: () => void;
  onResetDefaults: () => void;
  onClose: () => void;
}

export function OptionsModal({
  carSoundVolume,
  backgroundSoundVolume,
  musicVolume,
  musicMuted,
  masterSoundEnabled,
  onChangeCarSoundVolume,
  onChangeBackgroundSoundVolume,
  onChangeMusicVolume,
  onToggleMusicMute,
  onResetDefaults,
  onClose,
}: OptionsModalProps) {
  const effectiveMusicVolume = musicMuted ? 0 : musicVolume;

  return (
    <div
      role="dialog"
      aria-label="Audio Options"
      className="fixed top-14 right-3 sm:right-4 z-40 w-80 max-w-[calc(100vw-1.5rem)] rounded-xl bg-slate-950/95 border border-white/15 text-slate-100 shadow-2xl overflow-hidden pointer-events-auto"
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="w-4 h-4 text-amber-400" />
          <h2 className="font-display text-sm font-bold uppercase tracking-wide text-white">
            Sound Options
          </h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close options"
          className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="p-4 space-y-4">
        {!masterSoundEnabled && (
          <div className="rounded-lg bg-amber-500/15 border border-amber-400/30 px-3 py-2 text-[11px] text-amber-200">
            Master audio is muted in the top bar. Unmute to hear changes.
          </div>
        )}

        {/* 1. Car Sound */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <Car className="w-4 h-4 text-amber-400 shrink-0" />
              <span className="text-xs font-semibold text-white">1. Car sound</span>
            </div>
            <span className="font-mono-num text-xs text-slate-300 tabular-nums">
              {Math.round(carSoundVolume * 100)}%
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onChangeCarSoundVolume(carSoundVolume > 0 ? 0 : 0.75)}
              aria-label={carSoundVolume > 0 ? 'Mute car sound' : 'Unmute car sound'}
              className="p-1.5 rounded-md bg-slate-900 border border-white/10 text-slate-300 hover:bg-slate-800 cursor-pointer shrink-0"
            >
              {carSoundVolume > 0 ? (
                <Volume2 className="w-3.5 h-3.5" />
              ) : (
                <VolumeX className="w-3.5 h-3.5 text-slate-500" />
              )}
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.02}
              value={carSoundVolume}
              onChange={(e) => onChangeCarSoundVolume(parseFloat(e.target.value))}
              aria-label="Car sound volume"
              className="flex-1 accent-amber-400 cursor-pointer h-1.5"
            />
          </div>
          <p className="text-[11px] text-slate-400">
            Engine, road tires, off-road gravel &amp; drift squeal
          </p>
        </div>

        {/* 2. Background Sound */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <Trees className="w-4 h-4 text-emerald-400 shrink-0" />
              <span className="text-xs font-semibold text-white">2. Background sound</span>
            </div>
            <span className="font-mono-num text-xs text-slate-300 tabular-nums">
              {Math.round(backgroundSoundVolume * 100)}%
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onChangeBackgroundSoundVolume(backgroundSoundVolume > 0 ? 0 : 0.65)}
              aria-label={backgroundSoundVolume > 0 ? 'Mute background sound' : 'Unmute background sound'}
              className="p-1.5 rounded-md bg-slate-900 border border-white/10 text-slate-300 hover:bg-slate-800 cursor-pointer shrink-0"
            >
              {backgroundSoundVolume > 0 ? (
                <Volume2 className="w-3.5 h-3.5" />
              ) : (
                <VolumeX className="w-3.5 h-3.5 text-slate-500" />
              )}
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.02}
              value={backgroundSoundVolume}
              onChange={(e) => onChangeBackgroundSoundVolume(parseFloat(e.target.value))}
              aria-label="Background sound volume"
              className="flex-1 accent-emerald-400 cursor-pointer h-1.5"
            />
          </div>
          <p className="text-[11px] text-slate-400">
            Other vehicle horns, traffic drive sounds &amp; city/beach ambience
          </p>
        </div>

        {/* 3. Music Volume */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <Music className="w-4 h-4 text-sky-400 shrink-0" />
              <span className="text-xs font-semibold text-white">3. Music volume</span>
            </div>
            <span className="font-mono-num text-xs text-slate-300 tabular-nums">
              {Math.round(effectiveMusicVolume * 100)}%
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onToggleMusicMute}
              aria-label={musicMuted ? 'Unmute music' : 'Mute music'}
              className="p-1.5 rounded-md bg-slate-900 border border-white/10 text-slate-300 hover:bg-slate-800 cursor-pointer shrink-0"
            >
              {effectiveMusicVolume > 0 ? (
                <Volume2 className="w-3.5 h-3.5" />
              ) : (
                <VolumeX className="w-3.5 h-3.5 text-slate-500" />
              )}
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.02}
              value={effectiveMusicVolume}
              onChange={(e) => onChangeMusicVolume(parseFloat(e.target.value))}
              aria-label="Music volume"
              className="flex-1 accent-sky-400 cursor-pointer h-1.5"
            />
          </div>
          <p className="text-[11px] text-slate-400">
            In-game soundtrack tracks
          </p>
        </div>

        <div className="pt-2 border-t border-white/10 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={onResetDefaults}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-slate-900 hover:bg-slate-800 border border-white/10 text-slate-300 transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Defaults</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-slate-950 transition-colors cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
