import {
  ArrowLeft,
  Car,
  Check,
  Compass,
  Copy,
  Download,
  HelpCircle,
  Music,
  Play,
  RefreshCw,
  RotateCcw,
  ShoppingBag,
  SlidersHorizontal,
  Upload,
  X,
} from 'lucide-react';
import { useState } from 'react';
import { MUSIC_TRACKS } from '../config/musicTracks';
import { APP_VERSION } from '../config/version';
import { GameMode } from '../types/game';

interface PauseModalProps {
  gameMode: GameMode;
  activeVehicleTaxiCapable: boolean;
  canInstall: boolean;
  updateAvailable: boolean;
  onInstallApp: () => void;
  onApplyUpdate: () => void;
  onExportSave: () => string;
  onImportSave: (text: string) => { ok: boolean; error?: string };
  onSetGameMode: (mode: GameMode) => void;
  onOpenShop: () => void;
  onOpenOptions: () => void;
  onReplayTutorial: () => void;
  onResetCar: () => void;
  onResume: () => void;
}

export function PauseModal({
  gameMode,
  activeVehicleTaxiCapable,
  canInstall,
  updateAvailable,
  onInstallApp,
  onApplyUpdate,
  onExportSave,
  onImportSave,
  onSetGameMode,
  onOpenShop,
  onOpenOptions,
  onReplayTutorial,
  onResetCar,
  onResume,
}: PauseModalProps) {
  const [showCredits, setShowCredits] = useState(false);
  const [savePanel, setSavePanel] = useState<'none' | 'export' | 'import'>('none');
  const [exportedText, setExportedText] = useState('');
  const [copiedFeedback, setCopiedFeedback] = useState(false);
  const [importInput, setImportInput] = useState('');
  const [importFeedback, setImportFeedback] = useState<{
    tone: 'error' | 'success';
    text: string;
  } | null>(null);

  const handleExportClick = async () => {
    const text = onExportSave();
    setExportedText(text);
    setSavePanel('export');
    setImportFeedback(null);
    setCopiedFeedback(false);
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        setCopiedFeedback(true);
      }
    } catch {
      // Clipboard API may be blocked in some iframes; fallback textarea stays visible
    }
  };

  const handleOpenImport = () => {
    setSavePanel((prev) => (prev === 'import' ? 'none' : 'import'));
    setImportFeedback(null);
  };

  const handleConfirmImport = () => {
    const res = onImportSave(importInput);
    if (res.ok) {
      setImportFeedback({ tone: 'success', text: 'Save restored successfully!' });
      setImportInput('');
    } else {
      setImportFeedback({
        tone: 'error',
        text: res.error ?? 'Invalid save text.',
      });
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-slate-950/75">
      <div className="w-full max-w-sm max-h-[90vh] flex flex-col rounded-xl bg-slate-900 border border-white/15 text-slate-100 shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-2">
            {showCredits && (
              <button
                type="button"
                onClick={() => setShowCredits(false)}
                className="p-1 rounded-md text-slate-300 hover:text-white hover:bg-slate-800 cursor-pointer"
                aria-label="Back to pause menu"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
            <h2 className="font-display text-lg font-bold text-white">
              {showCredits ? 'Music Credits' : 'Paused'}
            </h2>
            {!showCredits && (
              <span className="px-1.5 py-0.5 rounded bg-slate-800 border border-white/10 text-[11px] font-mono-num text-slate-300">
                {APP_VERSION}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onResume}
            className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
            aria-label="Resume driving"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {showCredits ? (
          <div className="p-5 space-y-3 overflow-y-auto">
            <p className="text-xs text-slate-400">
              In-game soundtrack tracks and attribution:
            </p>
            <div className="max-h-64 overflow-y-auto space-y-2.5 pr-1">
              {MUSIC_TRACKS.map((track) => (
                <div
                  key={track.id}
                  className="rounded-lg bg-slate-950/80 border border-white/10 p-3 space-y-1"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-white">
                      {track.title}
                    </span>
                    <span className="text-[11px] font-mono-num text-slate-400">
                      {track.fileName}
                    </span>
                  </div>
                  <div className="text-xs text-slate-300">
                    Artist: {track.artist}
                  </div>
                  <div className="text-xs text-slate-400">
                    License: {track.license}
                  </div>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setShowCredits(false)}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-semibold bg-slate-800 hover:bg-slate-700 border border-white/10 text-slate-100 transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back to Pause Menu</span>
            </button>
          </div>
        ) : (
          <div className="p-5 space-y-4 overflow-y-auto">
            {updateAvailable && (
              <button
                type="button"
                onClick={onApplyUpdate}
                className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-semibold bg-sky-500/20 hover:bg-sky-500/30 border border-sky-400/50 text-sky-200 transition-colors cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Update available. Tap to reload.</span>
              </button>
            )}

            {/* Free roam / Taxi job toggle */}
            <div>
              <div className="text-xs font-medium text-slate-400 mb-2">World Mode</div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => onSetGameMode('freeroam')}
                  className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg text-sm font-semibold border transition-colors cursor-pointer ${
                    gameMode === 'freeroam'
                      ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300'
                      : 'bg-slate-950/70 border-white/10 text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  <Compass className="w-4 h-4" />
                  <span>Free roam</span>
                </button>

                <button
                  type="button"
                  onClick={() => onSetGameMode('taxi')}
                  className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg text-sm font-semibold border transition-colors cursor-pointer ${
                    gameMode === 'taxi'
                      ? 'bg-amber-500/20 border-amber-400 text-amber-300'
                      : 'bg-slate-950/70 border-white/10 text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  <Car className="w-4 h-4" />
                  <span>Taxi job</span>
                </button>
              </div>
              <p className="mt-2 text-xs text-slate-400">
                {!activeVehicleTaxiCapable
                  ? 'Private car active — free driving only. Switch to a taxi-capable car in the shop for fares.'
                  : gameMode === 'freeroam'
                  ? 'Explore downtown, suburbs, countryside, highway, and the beach freely.'
                  : 'Optional passenger pickups and fares are active across the map.'}
              </p>
            </div>

            {/* Actions */}
            <div className="pt-1 space-y-2">
              <button
                type="button"
                onClick={onOpenShop}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-semibold bg-slate-800 hover:bg-slate-700 border border-white/10 text-slate-100 transition-colors cursor-pointer"
              >
                <ShoppingBag className="w-4 h-4 text-emerald-400" />
                <span>Open shop</span>
              </button>

              <button
                type="button"
                onClick={onResetCar}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-semibold bg-slate-800 hover:bg-slate-700 border border-white/10 text-slate-100 transition-colors cursor-pointer"
              >
                <RotateCcw className="w-4 h-4 text-amber-400" />
                <span>Reset Car to Road</span>
              </button>

              <button
                type="button"
                onClick={onOpenOptions}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-semibold bg-slate-800 hover:bg-slate-700 border border-white/10 text-slate-100 transition-colors cursor-pointer"
              >
                <SlidersHorizontal className="w-4 h-4 text-amber-300" />
                <span>Sound Options</span>
              </button>

              <button
                type="button"
                onClick={onReplayTutorial}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-semibold bg-slate-800 hover:bg-slate-700 border border-white/10 text-slate-100 transition-colors cursor-pointer"
              >
                <HelpCircle className="w-4 h-4 text-emerald-300" />
                <span>Replay tutorial</span>
              </button>

              <button
                type="button"
                onClick={() => setShowCredits(true)}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-semibold bg-slate-800 hover:bg-slate-700 border border-white/10 text-slate-100 transition-colors cursor-pointer"
              >
                <Music className="w-4 h-4 text-sky-400" />
                <span>Credits</span>
              </button>

              {/* Export & Import Save Backup */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={handleExportClick}
                  className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 border border-white/10 text-slate-100 transition-colors cursor-pointer"
                >
                  {copiedFeedback ? (
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="w-3.5 h-3.5 text-slate-300" />
                  )}
                  <span>Export save</span>
                </button>

                <button
                  type="button"
                  onClick={handleOpenImport}
                  className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 border border-white/10 text-slate-100 transition-colors cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5 text-slate-300" />
                  <span>Import save</span>
                </button>
              </div>

              {savePanel === 'export' && (
                <div className="rounded-lg bg-slate-950/90 border border-white/10 p-2.5 space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] text-slate-300">
                    <span>
                      {copiedFeedback
                        ? 'Copied save text to clipboard!'
                        : 'Copy your save text below:'}
                    </span>
                    <button
                      type="button"
                      onClick={() => setSavePanel('none')}
                      className="text-slate-400 hover:text-white cursor-pointer"
                    >
                      Close
                    </button>
                  </div>
                  <textarea
                    readOnly
                    value={exportedText}
                    onFocus={(e) => e.currentTarget.select()}
                    rows={3}
                    className="w-full rounded bg-slate-900 border border-white/10 p-2 text-[11px] font-mono-num text-slate-200 focus:outline-none focus:border-amber-400"
                  />
                </div>
              )}

              {savePanel === 'import' && (
                <div className="rounded-lg bg-slate-950/90 border border-white/10 p-2.5 space-y-2">
                  <div className="flex items-center justify-between text-[11px] text-slate-300">
                    <span>Paste exported save text:</span>
                    <button
                      type="button"
                      onClick={() => setSavePanel('none')}
                      className="text-slate-400 hover:text-white cursor-pointer"
                    >
                      Close
                    </button>
                  </div>
                  <textarea
                    value={importInput}
                    onChange={(e) => setImportInput(e.target.value)}
                    placeholder='{"version":4,"money":...}'
                    rows={3}
                    className="w-full rounded bg-slate-900 border border-white/10 p-2 text-[11px] font-mono-num text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-amber-400"
                  />
                  {importFeedback && (
                    <p
                      className={`text-[11px] ${
                        importFeedback.tone === 'success'
                          ? 'text-emerald-400'
                          : 'text-rose-400'
                      }`}
                    >
                      {importFeedback.text}
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={handleConfirmImport}
                    className="w-full py-1.5 px-3 rounded bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-semibold transition-colors cursor-pointer"
                  >
                    Restore Save
                  </button>
                </div>
              )}

              {/* Install app button shown ONLY when browser allows installing */}
              {canInstall && (
                <button
                  type="button"
                  onClick={onInstallApp}
                  className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-semibold bg-sky-500/20 hover:bg-sky-500/30 border border-sky-400/50 text-sky-200 transition-colors cursor-pointer"
                >
                  <Download className="w-4 h-4 text-sky-300" />
                  <span>Install app</span>
                </button>
              )}

              <button
                type="button"
                onClick={onResume}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-semibold bg-amber-500 hover:bg-amber-400 text-slate-950 transition-colors cursor-pointer"
              >
                <Play className="w-4 h-4 fill-slate-950" />
                <span>Resume</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
