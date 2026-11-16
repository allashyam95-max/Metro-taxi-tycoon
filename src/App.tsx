/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { MusicPlayerSnapshot, musicPlayer } from './audio/musicPlayer';
import { soundEngine } from './audio/soundEngine';
import { CareerGoalPanel } from './components/CareerGoalPanel';
import { CityRadar } from './components/CityRadar';
import { DriveControls } from './components/DriveControls';
import { FuelCircle } from './components/FuelCircle';
import { MusicPlayerWidget } from './components/MusicPlayerWidget';
import { OptionsModal } from './components/OptionsModal';
import { PauseModal } from './components/PauseModal';
import { ShopModal, ShopTab } from './components/ShopModal';
import { TopHudBar } from './components/TopHudBar';
import { TripHudBanner } from './components/TripHudBanner';
import { TutorialOverlay, TutorialStep } from './components/TutorialOverlay';
import { VEHICLE_CATALOG } from './config/vehicles';
import { TaxiEngine } from './game/TaxiEngine';
import { usePWAInstall } from './hooks/usePWAInstall';
import { usePWAUpdate } from './hooks/usePWAUpdate';
import {
  exportSaveText,
  importSaveText,
  loadSaveState,
  loadSaveStateWithStatus,
  resetSaveState,
} from './storage/saveSystem';
import {
  ControlInput,
  DaySummary,
  FareReceipt,
  GameMode,
  GameSaveState,
  MinimapSnapshot,
  StageUpEvent,
  VehicleId,
  VehicleServiceMode,
} from './types/game';

function detectTouchCapable(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(pointer: coarse)').matches ||
    'ontouchstart' in window ||
    window.innerWidth < 768
  );
}

export default function App() {
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<TaxiEngine | null>(null);

  const initialReportRef = useRef<ReturnType<typeof loadSaveStateWithStatus> | null>(null);
  if (!initialReportRef.current) {
    initialReportRef.current = loadSaveStateWithStatus();
  }

  const [gameState, setGameState] = useState<GameSaveState>(() => initialReportRef.current!.state);
  const [minimap, setMinimap] = useState<MinimapSnapshot | null>(null);
  const [fareReceipt, setFareReceipt] = useState<FareReceipt | null>(null);
  const [daySummary, setDaySummary] = useState<DaySummary | null>(null);
  const [stageUp, setStageUp] = useState<StageUpEvent | null>(null);
  const [notice, setNotice] = useState<{ text: string; tone: 'info' | 'warning' | 'success' } | null>(null);
  const [shopOpen, setShopOpen] = useState(false);
  const [shopInitialTab, setShopInitialTab] = useState<ShopTab>('shop');
  const [pauseOpen, setPauseOpen] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [showTouchControls, setShowTouchControls] = useState<boolean>(() => detectTouchCapable());
  const [musicSnap, setMusicSnap] = useState<MusicPlayerSnapshot>(() => musicPlayer.getSnapshot());
  const [tutorialStep, setTutorialStep] = useState<TutorialStep | null>(() =>
    initialReportRef.current!.state.tutorialDone ? null : 1,
  );
  const [tutorialCompletionBonus, setTutorialCompletionBonus] = useState<number | null>(null);
  const [step1DistMeters, setStep1DistMeters] = useState(0);
  const [webglError, setWebglError] = useState<string | null>(null);

  const { canInstall, install: installPwa } = usePWAInstall();
  const { updateAvailable, applyUpdate } = usePWAUpdate();

  const receiptTimerRef = useRef<number | null>(null);
  const dayTimerRef = useRef<number | null>(null);
  const stageUpTimerRef = useRef<number | null>(null);
  const noticeTimerRef = useRef<number | null>(null);
  const tutorialBonusTimerRef = useRef<number | null>(null);
  const step1OriginRef = useRef<{ x: number; z: number } | null>(null);
  const tutorialStepRef = useRef<TutorialStep | null>(tutorialStep);

  useEffect(() => {
    tutorialStepRef.current = tutorialStep;
  }, [tutorialStep]);

  const showTimedNotice = useCallback((text: string, tone: 'info' | 'warning' | 'success') => {
    setNotice({ text, tone });
    if (noticeTimerRef.current) window.clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = window.setTimeout(() => setNotice(null), 4200);
  }, []);

  useEffect(() => {
    const mount = canvasMountRef.current;
    if (!mount) return;

    const initial = initialReportRef.current?.state ?? loadSaveState();
    if (initialReportRef.current?.wasCorrupted) {
      showTimedNotice('Corrupted save backed up. Started a fresh save.', 'warning');
    }
    soundEngine.setEnabled(initial.soundEnabled);
    soundEngine.setCarSoundVolume(initial.carSoundVolume);
    soundEngine.setBackgroundSoundVolume(initial.backgroundSoundVolume);

    const unsubscribeMusic = musicPlayer.subscribe((snap) => setMusicSnap(snap));
    musicPlayer.init({
      trackId: initial.musicTrackId,
      volume: initial.musicVolume,
      muted: initial.musicMuted,
      autoSwitch: initial.musicAutoSwitch,
      onTrackPersist: (trackId) => {
        const cur = musicPlayer.getSnapshot();
        engineRef.current?.setMusicPreferences(
          trackId,
          cur.volume,
          cur.muted,
          cur.autoSwitch,
        );
      },
    });

    let engine: TaxiEngine | null = null;
    try {
      engine = new TaxiEngine(mount, initial, {
        onStateChange: (next) => setGameState(next),
        onMinimapUpdate: (snap) => setMinimap(snap),
        onFareComplete: (receipt) => {
          setFareReceipt(receipt);
          if (receiptTimerRef.current) window.clearTimeout(receiptTimerRef.current);
          receiptTimerRef.current = window.setTimeout(() => setFareReceipt(null), 6500);
          if (tutorialStepRef.current === 4) {
            setTutorialStep(5);
          }
        },
        onDayComplete: (summary) => {
          setDaySummary(summary);
          if (dayTimerRef.current) window.clearTimeout(dayTimerRef.current);
          dayTimerRef.current = window.setTimeout(() => setDaySummary(null), 5500);
        },
        onStageUp: (event) => {
          setStageUp(event);
          if (stageUpTimerRef.current) window.clearTimeout(stageUpTimerRef.current);
          stageUpTimerRef.current = window.setTimeout(() => setStageUp(null), 7000);
        },
        onAchievementUnlock: (ach) => {
          showTimedNotice(`Achievement Unlocked: ${ach.title}!`, 'success');
        },
        onNotice: showTimedNotice,
        onWebglError: (msg) => setWebglError(msg),
      });
      engineRef.current = engine;
    } catch {
      setWebglError('WebGL 3D rendering is unavailable in this browser environment.');
    }

    const unlockAudio = () => {
      soundEngine.unlock();
      musicPlayer.unlockOnFirstTap();
    };
    window.addEventListener('pointerdown', unlockAudio, { once: true });
    window.addEventListener('keydown', unlockAudio, { once: true });

    return () => {
      window.removeEventListener('pointerdown', unlockAudio);
      window.removeEventListener('keydown', unlockAudio);
      if (receiptTimerRef.current) window.clearTimeout(receiptTimerRef.current);
      if (dayTimerRef.current) window.clearTimeout(dayTimerRef.current);
      if (stageUpTimerRef.current) window.clearTimeout(stageUpTimerRef.current);
      if (noticeTimerRef.current) window.clearTimeout(noticeTimerRef.current);
      if (tutorialBonusTimerRef.current) window.clearTimeout(tutorialBonusTimerRef.current);
      unsubscribeMusic();
      musicPlayer.dispose();
      engine?.dispose();
      engineRef.current = null;
    };
  }, [showTimedNotice]);

  // Tutorial step 1 (drive forward >= 8 m) and step 3 (passenger pickup) auto-advance
  useEffect(() => {
    if (!minimap || tutorialStep === null) return;

    if (tutorialStep === 1) {
      if (!step1OriginRef.current) {
        step1OriginRef.current = { x: minimap.playerX, z: minimap.playerZ };
      }
      const distMeters =
        Math.hypot(
          minimap.playerX - step1OriginRef.current.x,
          minimap.playerZ - step1OriginRef.current.z,
        ) * 5;
      setStep1DistMeters(distMeters);
      if (distMeters >= 8) {
        setTutorialStep(2);
      }
    } else if (tutorialStep === 3 && minimap.activeTrip) {
      setTutorialStep(4);
    }
  }, [minimap, tutorialStep]);

  // Optionally crossfade to taxi/VIP track when a ride starts and calm track in free roam
  useEffect(() => {
    if (minimap?.activeTrip) {
      musicPlayer.setDrivingContext(minimap.activeTrip.isVVIP ? 'trip-vip' : 'trip');
    } else if (gameState.gameMode === 'freeroam') {
      musicPlayer.setDrivingContext('freeroam');
    } else {
      musicPlayer.setDrivingContext('taxi-idle');
    }
  }, [minimap?.activeTrip, gameState.gameMode]);

  // Pause simulation while garage/shop or pause modal is open
  useEffect(() => {
    engineRef.current?.setPaused(shopOpen || pauseOpen);
  }, [shopOpen, pauseOpen]);

  // Keyboard shortcuts: E for Shop, P or Escape for Pause/Close
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'KeyE' && !e.repeat) {
        setPauseOpen(false);
        setOptionsOpen(false);
        setShopInitialTab('shop');
        setShopOpen((prev) => !prev);
      } else if (e.code === 'KeyP' && !e.repeat) {
        setShopOpen(false);
        setOptionsOpen(false);
        setPauseOpen((prev) => !prev);
      } else if (e.code === 'Escape' && !e.repeat) {
        if (optionsOpen) {
          setOptionsOpen(false);
        } else if (shopOpen) {
          setShopOpen(false);
        } else {
          setPauseOpen((prev) => !prev);
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [shopOpen, optionsOpen]);

  const handleControlChange = useCallback((input: ControlInput) => {
    engineRef.current?.setControlInput(input);
  }, []);

  const handleToggleCamera = useCallback(() => {
    const next = gameState.cameraMode === 'chase' ? 'overhead' : 'chase';
    engineRef.current?.setCameraMode(next);
  }, [gameState.cameraMode]);

  const handleToggleSound = useCallback(() => {
    soundEngine.unlock();
    engineRef.current?.setSoundEnabled(!gameState.soundEnabled);
  }, [gameState.soundEnabled]);

  const handleRefuelFull = useCallback(() => {
    engineRef.current?.refuelAtStation(true);
  }, []);

  const handleEmergencyFuel = useCallback(() => {
    engineRef.current?.callEmergencyFuel();
  }, []);

  const handleResetSave = useCallback(() => {
    const fresh = resetSaveState();
    engineRef.current?.applyResetState(fresh);
    soundEngine.setEnabled(fresh.soundEnabled);
    soundEngine.setCarSoundVolume(fresh.carSoundVolume);
    soundEngine.setBackgroundSoundVolume(fresh.backgroundSoundVolume);
    musicPlayer.setVolume(fresh.musicVolume);
    musicPlayer.setMuted(fresh.musicMuted);
    setFareReceipt(null);
    setDaySummary(null);
    setStageUp(null);
    setShopOpen(false);
    step1OriginRef.current = null;
    setStep1DistMeters(0);
    setTutorialCompletionBonus(null);
    setTutorialStep(1);
  }, []);

  const handleExportSave = useCallback(() => {
    return exportSaveText(gameState);
  }, [gameState]);

  const handleImportSave = useCallback(
    (rawText: string) => {
      const result = importSaveText(rawText);
      if (!result.ok || !result.state) {
        return { ok: false, error: result.error };
      }
      const imported = result.state;
      engineRef.current?.applyImportedState(imported);
      soundEngine.setEnabled(imported.soundEnabled);
      soundEngine.setCarSoundVolume(imported.carSoundVolume);
      soundEngine.setBackgroundSoundVolume(imported.backgroundSoundVolume);
      musicPlayer.setVolume(imported.musicVolume);
      musicPlayer.setMuted(imported.musicMuted);
      musicPlayer.setAutoSwitch(imported.musicAutoSwitch);
      setFareReceipt(null);
      setDaySummary(null);
      setStageUp(null);
      step1OriginRef.current = null;
      setStep1DistMeters(0);
      setTutorialCompletionBonus(null);
      setTutorialStep(imported.tutorialDone ? null : 1);
      return { ok: true };
    },
    [],
  );

  const handleSetGameMode = useCallback((mode: GameMode) => {
    engineRef.current?.setGameMode(mode);
  }, []);

  const handleResetCar = useCallback(() => {
    engineRef.current?.resetCarPosition();
    setPauseOpen(false);
  }, []);

  const handleBuyVehicle = useCallback((id: VehicleId) => {
    if (!engineRef.current) return { ok: false, reason: 'Game engine not ready.' };
    return engineRef.current.buyVehicle(id);
  }, []);

  const handleSelectVehicle = useCallback((id: VehicleId) => {
    engineRef.current?.selectVehicle(id);
  }, []);

  const handleSetVehicleMode = useCallback((id: VehicleId, mode: VehicleServiceMode) => {
    engineRef.current?.setVehicleServiceMode(id, mode);
  }, []);

  const persistCurrentMusicPrefs = useCallback(() => {
    const snap = musicPlayer.getSnapshot();
    engineRef.current?.setMusicPreferences(
      snap.currentTrackId,
      snap.volume,
      snap.muted,
      snap.autoSwitch,
    );
  }, []);

  const handleToggleMusicPlay = useCallback(() => {
    soundEngine.unlock();
    musicPlayer.togglePlay();
    persistCurrentMusicPrefs();
  }, [persistCurrentMusicPrefs]);

  const handleNextMusicTrack = useCallback(() => {
    soundEngine.unlock();
    musicPlayer.nextTrack();
    persistCurrentMusicPrefs();
  }, [persistCurrentMusicPrefs]);

  const handlePrevMusicTrack = useCallback(() => {
    soundEngine.unlock();
    musicPlayer.previousTrack();
    persistCurrentMusicPrefs();
  }, [persistCurrentMusicPrefs]);

  const handleChangeMusicVolume = useCallback(
    (volume: number) => {
      soundEngine.unlock();
      if (volume > 0 && musicPlayer.getSnapshot().muted) {
        musicPlayer.setMuted(false);
      }
      musicPlayer.setVolume(volume);
      persistCurrentMusicPrefs();
    },
    [persistCurrentMusicPrefs],
  );

  const handleToggleMusicMute = useCallback(() => {
    soundEngine.unlock();
    musicPlayer.setMuted(!musicPlayer.getSnapshot().muted);
    persistCurrentMusicPrefs();
  }, [persistCurrentMusicPrefs]);

  const handleToggleMusicAutoSwitch = useCallback(() => {
    musicPlayer.setAutoSwitch(!musicPlayer.getSnapshot().autoSwitch);
    persistCurrentMusicPrefs();
  }, [persistCurrentMusicPrefs]);

  const handleChangeCarSoundVolume = useCallback(
    (vol: number) => {
      soundEngine.unlock();
      engineRef.current?.setAudioVolumes(vol, gameState.backgroundSoundVolume);
    },
    [gameState.backgroundSoundVolume],
  );

  const handleChangeBackgroundSoundVolume = useCallback(
    (vol: number) => {
      soundEngine.unlock();
      engineRef.current?.setAudioVolumes(gameState.carSoundVolume, vol);
    },
    [gameState.carSoundVolume],
  );

  const handleResetAudioDefaults = useCallback(() => {
    soundEngine.unlock();
    engineRef.current?.setAudioVolumes(0.75, 0.65);
    musicPlayer.setMuted(false);
    musicPlayer.setVolume(0.55);
    persistCurrentMusicPrefs();
  }, [persistCurrentMusicPrefs]);

  const handleTutorialNext = useCallback(() => {
    setTutorialStep((prev) => {
      if (!prev || prev >= 7) return prev;
      return (prev + 1) as TutorialStep;
    });
  }, []);

  const handleTutorialSkip = useCallback(() => {
    setTutorialStep(null);
    setTutorialCompletionBonus(null);
    engineRef.current?.markTutorialDone(false);
  }, []);

  const handleTutorialFinish = useCallback(() => {
    setTutorialStep(null);
    const awarded = engineRef.current?.markTutorialDone(true) ?? 0;
    setTutorialCompletionBonus(awarded);
    if (tutorialBonusTimerRef.current) window.clearTimeout(tutorialBonusTimerRef.current);
    tutorialBonusTimerRef.current = window.setTimeout(() => {
      setTutorialCompletionBonus(null);
    }, 6000);
  }, []);

  const handleReplayTutorial = useCallback(() => {
    step1OriginRef.current = null;
    setStep1DistMeters(0);
    setTutorialCompletionBonus(null);
    setPauseOpen(false);
    setShopOpen(false);
    setOptionsOpen(false);
    setTutorialStep(1);
  }, []);

  const activeSpec = VEHICLE_CATALOG[gameState.activeVehicle];

  return (
    <div className="relative w-full h-full overflow-hidden bg-slate-950 select-none">
      {/* Dedicated WebGL Mount Container */}
      <div ref={canvasMountRef} className="fixed inset-0 w-full h-full" />

      {/* WebGL Error Fallback */}
      {webglError && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-slate-950/95 text-center">
          <div className="max-w-md rounded-xl bg-slate-900 border border-white/15 p-6">
            <h1 className="font-display text-xl font-bold text-amber-400">
              Metro Cab Tycoon
            </h1>
            <p className="mt-2 text-sm text-slate-300">{webglError}</p>
          </div>
        </div>
      )}

      {/* Top HUD & Minimap Overlay */}
      <div className="pointer-events-none fixed inset-x-0 top-0 z-20 flex flex-col">
        <TopHudBar
          state={gameState}
          showTouchControls={showTouchControls}
          optionsOpen={optionsOpen}
          highlightShop={tutorialStep === 7}
          onOpenOptions={() => {
            setShopOpen(false);
            setPauseOpen(false);
            setOptionsOpen((prev) => !prev);
          }}
          onOpenShop={() => {
            if (tutorialStep === 7) {
              handleTutorialFinish();
            }
            setPauseOpen(false);
            setOptionsOpen(false);
            setShopInitialTab('shop');
            setShopOpen(true);
          }}
          onOpenPause={() => {
            setShopOpen(false);
            setOptionsOpen(false);
            setPauseOpen(true);
          }}
          onToggleCamera={handleToggleCamera}
          onToggleSound={handleToggleSound}
          onToggleTouch={() => setShowTouchControls((prev) => !prev)}
        />

        <div className="p-2.5 pr-18 sm:p-4 sm:pr-20 flex items-start justify-between gap-2 sm:gap-3">
          <div className="flex flex-col items-start gap-1.5 shrink-0">
            <CityRadar
              snapshot={minimap}
              highlighted={tutorialStep === 2}
              onInspect={() => {
                if (tutorialStep === 2) {
                  setTutorialStep(3);
                }
              }}
            />
            <CareerGoalPanel
              state={gameState}
              onOpenStagesTab={() => {
                setPauseOpen(false);
                setOptionsOpen(false);
                setShopInitialTab('service');
                setShopOpen(true);
              }}
            />
          </div>
          <div className="flex-1 flex justify-center min-w-0">
            <TripHudBanner
              snapshot={minimap}
              receipt={fareReceipt}
              daySummary={daySummary}
              stageUp={stageUp}
              notice={notice}
              tutorialHighlight={
                tutorialStep === 3
                  ? 'pickup'
                  : tutorialStep === 4
                  ? 'dropoff'
                  : tutorialStep === 5
                  ? 'fare'
                  : null
              }
              onDismissReceipt={() => setFareReceipt(null)}
              onDismissDaySummary={() => setDaySummary(null)}
              onDismissStageUp={() => setStageUp(null)}
              onQuickRefuel={handleRefuelFull}
              onEmergencyFuel={handleEmergencyFuel}
              onOpenShop={() => {
                setPauseOpen(false);
                setShopInitialTab('shop');
                setShopOpen(true);
              }}
            />
          </div>
          {/* Spacer to keep TripHudBanner optically centered on desktop */}
          <div className="hidden sm:block w-[116px] shrink-0" />
        </div>
      </div>

      {/* Compact 56px Circular Fuel Gauge */}
      <FuelCircle
        fuel={gameState.fuel}
        fuelMax={gameState.fuelMax}
        nearestFuelDistance={minimap?.nearestFuelDistance ?? 0}
        nearFuelStation={minimap?.nearFuelStation ?? false}
        highlighted={tutorialStep === 6}
      />

      {/* Mobile & Desktop Drive Controls */}
      {!shopOpen && !pauseOpen && (
        <DriveControls
          speedKmh={minimap?.speedKmh ?? 0}
          showTouchControls={showTouchControls}
          highlighted={tutorialStep === 1}
          onControlChange={handleControlChange}
        />
      )}

      {/* Non-blocking 7-Step Tutorial Overlay */}
      {!shopOpen && !pauseOpen && !optionsOpen && (tutorialStep !== null || tutorialCompletionBonus !== null) && (
        <TutorialOverlay
          step={tutorialStep}
          completionBonus={tutorialCompletionBonus}
          showTouchControls={showTouchControls}
          step1DistanceMeters={step1DistMeters}
          hasActiveTrip={Boolean(minimap?.activeTrip)}
          onNext={handleTutorialNext}
          onSkip={handleTutorialSkip}
          onFinish={handleTutorialFinish}
          onDismissCompletion={() => setTutorialCompletionBonus(null)}
        />
      )}

      {/* Corner Music Player Button & Panel */}
      {!shopOpen && !pauseOpen && (
        <MusicPlayerWidget
          snapshot={musicSnap}
          showTouchControls={showTouchControls}
          onTogglePlay={handleToggleMusicPlay}
          onNext={handleNextMusicTrack}
          onPrev={handlePrevMusicTrack}
          onChangeVolume={handleChangeMusicVolume}
          onToggleMute={handleToggleMusicMute}
          onToggleAutoSwitch={handleToggleMusicAutoSwitch}
        />
      )}

      {/* Small Audio Options Menu (Car sound, Background sound, Music volume) */}
      {optionsOpen && !shopOpen && !pauseOpen && (
        <OptionsModal
          carSoundVolume={gameState.carSoundVolume}
          backgroundSoundVolume={gameState.backgroundSoundVolume}
          musicVolume={musicSnap.volume}
          musicMuted={musicSnap.muted}
          masterSoundEnabled={gameState.soundEnabled}
          onChangeCarSoundVolume={handleChangeCarSoundVolume}
          onChangeBackgroundSoundVolume={handleChangeBackgroundSoundVolume}
          onChangeMusicVolume={handleChangeMusicVolume}
          onToggleMusicMute={handleToggleMusicMute}
          onResetDefaults={handleResetAudioDefaults}
          onClose={() => setOptionsOpen(false)}
        />
      )}

      {/* Safe Update Banner (only reloads when player taps, never auto-reloads mid-ride) */}
      {updateAvailable && !pauseOpen && (
        <div className="fixed bottom-3 left-1/2 -translate-x-1/2 z-30 pointer-events-auto">
          <button
            type="button"
            onClick={applyUpdate}
            className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-slate-900/95 hover:bg-slate-800 border border-sky-400/50 text-sky-200 text-xs font-semibold shadow-xl transition-colors cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5 text-sky-300" />
            <span>Update available. Tap to reload.</span>
          </button>
        </div>
      )}

      {/* Pause Menu (Free roam / Taxi job toggle + Open shop + Replay tutorial + Reset Car + PWA/Save tools) */}
      {pauseOpen && (
        <PauseModal
          gameMode={gameState.gameMode}
          activeVehicleTaxiCapable={activeSpec?.taxiCapable ?? true}
          canInstall={canInstall}
          updateAvailable={updateAvailable}
          onInstallApp={() => {
            void installPwa();
          }}
          onApplyUpdate={applyUpdate}
          onExportSave={handleExportSave}
          onImportSave={handleImportSave}
          onSetGameMode={handleSetGameMode}
          onOpenShop={() => {
            setPauseOpen(false);
            setShopInitialTab('shop');
            setShopOpen(true);
          }}
          onOpenOptions={() => {
            setPauseOpen(false);
            setOptionsOpen(true);
          }}
          onReplayTutorial={handleReplayTutorial}
          onResetCar={handleResetCar}
          onResume={() => setPauseOpen(false)}
        />
      )}

      {/* Shop, Garage & Career Stages Modal */}
      {shopOpen && (
        <ShopModal
          state={gameState}
          initialTab={shopInitialTab}
          onClose={() => setShopOpen(false)}
          onBuyVehicle={handleBuyVehicle}
          onSelectVehicle={handleSelectVehicle}
          onSetVehicleMode={handleSetVehicleMode}
          onRefuelFull={handleRefuelFull}
          onEmergencyFuel={handleEmergencyFuel}
          onResetSave={handleResetSave}
        />
      )}
    </div>
  );
}
