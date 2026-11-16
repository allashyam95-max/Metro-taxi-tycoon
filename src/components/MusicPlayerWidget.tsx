import {
  Music,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { useState } from 'react';
import { MusicPlayerSnapshot } from '../audio/musicPlayer';

interface MusicPlayerWidgetProps {
  snapshot: MusicPlayerSnapshot;
  showTouchControls: boolean;
  onTogglePlay: () => void;
  onNext: () => void;
  onPrev: () => void;
  onChangeVolume: (volume: number) => void;
  onToggleMute: () => void;
  onToggleAutoSwitch: () => void;
}

export function MusicPlayerWidget({
  snapshot,
  showTouchControls,
  onTogglePlay,
  onNext,
  onPrev,
  onChangeVolume,
  onToggleMute,
  onToggleAutoSwitch,
}: MusicPlayerWidgetProps) {
  const [open, setOpen] = useState(false);

  const bottomOffsetClass = showTouchControls ? 'bottom-32 sm:bottom-36' : 'bottom-4';

  return (
    <div className={`fixed right-3 sm:right-4 ${bottomOffsetClass} z-30 pointer-events-auto`}>
      {open && (
        <div
          role="dialog"
          aria-label="Music player"
          className="absolute bottom-full right-0 mb-2 w-72 rounded-xl bg-slate-950/95 border border-white/15 p-3.5 text-slate-100 shadow-2xl"
        >
          <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-white/10">
            <div className="flex items-center gap-1.5 min-w-0">
              <Music className="w-4 h-4 text-amber-400 shrink-0" />
              <span className="font-display text-xs font-semibold uppercase tracking-wider text-slate-300">
                Music Player
              </span>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close music panel"
              className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Current Track Info */}
          <div className="mt-2.5 rounded-lg bg-slate-900/90 border border-white/10 px-3 py-2">
            <div className="text-sm font-semibold text-white truncate">
              {snapshot.currentTrack.title}
            </div>
            <div className="text-xs text-slate-400 truncate mt-0.5">
              {snapshot.currentTrack.artist} · {snapshot.currentTrack.fileName}
            </div>
            {snapshot.allTracksFailed && (
              <div className="mt-1.5 text-[11px] text-amber-300 leading-snug">
                No audio files found in /public/music/ — add MP3 files to play.
              </div>
            )}
            {!snapshot.allTracksFailed && !snapshot.isUnlocked && (
              <div className="mt-1.5 text-[11px] text-slate-400">
                Tap screen or press Play to start music.
              </div>
            )}
          </div>

          {/* Playback Controls: Prev / Play-Pause / Next */}
          <div className="mt-3 flex items-center justify-center gap-2">
            <button
              type="button"
              onClick={onPrev}
              aria-label="Previous track"
              title="Previous track"
              className="p-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-white/10 text-slate-200 transition-colors cursor-pointer"
            >
              <SkipBack className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={onTogglePlay}
              aria-label={snapshot.isPlaying ? 'Pause music' : 'Play music'}
              title={snapshot.isPlaying ? 'Pause' : 'Play'}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 px-4 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs transition-colors cursor-pointer"
            >
              {snapshot.isPlaying ? (
                <>
                  <Pause className="w-4 h-4 fill-slate-950" />
                  <span>Pause</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-slate-950" />
                  <span>Play</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={onNext}
              aria-label="Next track"
              title="Next track"
              className="p-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-white/10 text-slate-200 transition-colors cursor-pointer"
            >
              <SkipForward className="w-4 h-4" />
            </button>
          </div>

          {/* Volume Slider & Mute */}
          <div className="mt-3 flex items-center gap-2.5">
            <button
              type="button"
              onClick={onToggleMute}
              aria-label={snapshot.muted ? 'Unmute music' : 'Mute music'}
              title={snapshot.muted ? 'Unmute music' : 'Mute music'}
              className={`p-2 rounded-lg border transition-colors cursor-pointer shrink-0 ${
                snapshot.muted
                  ? 'bg-rose-500/20 border-rose-400/40 text-rose-300'
                  : 'bg-slate-900 border-white/10 text-slate-200 hover:bg-slate-800'
              }`}
            >
              {snapshot.muted || snapshot.volume === 0 ? (
                <VolumeX className="w-4 h-4" />
              ) : (
                <Volume2 className="w-4 h-4" />
              )}
            </button>

            <input
              type="range"
              min={0}
              max={1}
              step={0.02}
              value={snapshot.muted ? 0 : snapshot.volume}
              onChange={(e) => onChangeVolume(parseFloat(e.target.value))}
              aria-label="Music volume"
              className="flex-1 accent-amber-400 cursor-pointer h-1.5"
            />

            <span className="font-mono-num text-[11px] text-slate-300 w-8 text-right tabular-nums">
              {snapshot.muted ? '0%' : `${Math.round(snapshot.volume * 100)}%`}
            </span>
          </div>

          {/* Context Auto-Switch Toggle */}
          <label className="mt-3 pt-2.5 border-t border-white/10 flex items-center justify-between gap-2 text-xs text-slate-300 cursor-pointer">
            <span>Auto-switch on ride / free roam</span>
            <input
              type="checkbox"
              checked={snapshot.autoSwitch}
              onChange={onToggleAutoSwitch}
              className="accent-amber-400 w-4 h-4 cursor-pointer"
            />
          </label>
        </div>
      )}

      {/* Corner Trigger Button */}
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-label="Toggle music player"
        title={`Music: ${snapshot.currentTrack.title}`}
        className={`flex items-center gap-2 px-3 py-2 rounded-xl border shadow-lg transition-colors cursor-pointer ${
          open || snapshot.isPlaying
            ? 'bg-slate-950/95 border-amber-400/40 text-amber-300 hover:bg-slate-900'
            : 'bg-slate-950/90 border-white/15 text-slate-200 hover:bg-slate-900'
        }`}
      >
        <Music className="w-4 h-4 shrink-0" />
        <span className="hidden sm:inline text-xs font-medium max-w-[110px] truncate">
          {snapshot.muted ? 'Muted' : snapshot.currentTrack.title}
        </span>
      </button>
    </div>
  );
}
