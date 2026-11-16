import { ArrowLeft, ArrowRight, ChevronDown, ChevronUp, Compass, Zap } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ControlInput } from '../types/game';

interface DriveControlsProps {
  speedKmh: number;
  showTouchControls: boolean;
  highlighted?: boolean;
  onControlChange: (input: ControlInput) => void;
}

type TouchAction = 'left' | 'right' | 'gas' | 'brake';

interface DeviceOrientationWithPermission extends DeviceOrientationEvent {
  requestPermission?: () => Promise<'granted' | 'denied'>;
}

export function DriveControls({
  speedKmh,
  showTouchControls,
  highlighted = false,
  onControlChange,
}: DriveControlsProps) {
  const keysRef = useRef<Set<string>>(new Set());
  const touchMapRef = useRef<Map<number, TouchAction>>(new Map());
  const activeTouchStateRef = useRef<Record<TouchAction, boolean>>({
    left: false,
    right: false,
    gas: false,
    brake: false,
  });

  const [tiltEnabled, setTiltEnabled] = useState(false);
  const [tiltAvailable, setTiltAvailable] = useState(true);
  const [tiltDisplay, setTiltDisplay] = useState(0);
  const [autoAccel, setAutoAccel] = useState(false);

  const tiltSteerRef = useRef(0);
  const tiltEnabledRef = useRef(false);
  const autoAccelRef = useRef(false);

  useEffect(() => {
    tiltEnabledRef.current = tiltEnabled;
  }, [tiltEnabled]);

  useEffect(() => {
    autoAccelRef.current = autoAccel;
  }, [autoAccel]);

  const emitCombinedInput = useCallback(() => {
    const keys = keysRef.current;
    const touch = activeTouchStateRef.current;

    const up = keys.has('KeyW') || keys.has('ArrowUp') || touch.gas;
    const down = keys.has('KeyS') || keys.has('ArrowDown') || touch.brake;
    const left = keys.has('KeyA') || keys.has('ArrowLeft') || touch.left;
    const right = keys.has('KeyD') || keys.has('ArrowRight') || touch.right;
    const space = keys.has('Space');

    let throttle = 0;
    if (down) {
      throttle = -1;
    } else if (up || (autoAccelRef.current && !space)) {
      throttle = 1;
    }

    let steer = right && !left ? 1 : left && !right ? -1 : 0;
    if (steer === 0 && tiltEnabledRef.current) {
      steer = tiltSteerRef.current;
    }

    onControlChange({
      throttle,
      steer,
      brake: space,
    });
  }, [onControlChange]);

  useEffect(() => {
    emitCombinedInput();
  }, [autoAccel, emitCombinedInput]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
        e.preventDefault();
      }
      keysRef.current.add(e.code);
      emitCombinedInput();
    };

    const onKeyUp = (e: KeyboardEvent) => {
      keysRef.current.delete(e.code);
      emitCombinedInput();
    };

    const onBlur = () => {
      keysRef.current.clear();
      touchMapRef.current.clear();
      activeTouchStateRef.current = { left: false, right: false, gas: false, brake: false };
      tiltSteerRef.current = 0;
      setTiltDisplay(0);
      emitCombinedInput();
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [emitCombinedInput]);

  useEffect(() => {
    if (!tiltEnabled || !showTouchControls) {
      tiltSteerRef.current = 0;
      setTiltDisplay(0);
      emitCombinedInput();
      return;
    }

    const onOrientation = (event: DeviceOrientationEvent) => {
      const isLandscape = window.innerWidth > window.innerHeight;
      let rawDeg = 0;
      if (isLandscape) {
        const angle = window.screen?.orientation?.angle ?? 0;
        const beta = event.beta ?? 0;
        rawDeg = angle === 270 || angle === -90 ? -beta : beta;
      } else {
        rawDeg = event.gamma ?? 0;
      }

      const deadzone = 4;
      const maxTilt = 26;
      let normalized = 0;
      if (Math.abs(rawDeg) > deadzone) {
        const sign = Math.sign(rawDeg);
        normalized = sign * Math.min(1, (Math.abs(rawDeg) - deadzone) / (maxTilt - deadzone));
      }

      tiltSteerRef.current = normalized;
      setTiltDisplay(normalized);
      emitCombinedInput();
    };

    window.addEventListener('deviceorientation', onOrientation);
    return () => {
      window.removeEventListener('deviceorientation', onOrientation);
    };
  }, [tiltEnabled, showTouchControls, emitCombinedInput]);

  const handleToggleTilt = async () => {
    if (tiltEnabled) {
      setTiltEnabled(false);
      return;
    }

    if (typeof window === 'undefined' || !('DeviceOrientationEvent' in window)) {
      setTiltAvailable(false);
      return;
    }

    const DeviceOrientCtor = window.DeviceOrientationEvent as unknown as DeviceOrientationWithPermission;
    if (typeof DeviceOrientCtor.requestPermission === 'function') {
      try {
        const result = await DeviceOrientCtor.requestPermission();
        if (result !== 'granted') {
          setTiltAvailable(false);
          return;
        }
      } catch {
        setTiltAvailable(false);
        return;
      }
    }

    setTiltAvailable(true);
    setTiltEnabled(true);
  };

  const syncTouchFlags = () => {
    const next: Record<TouchAction, boolean> = {
      left: false,
      right: false,
      gas: false,
      brake: false,
    };
    touchMapRef.current.forEach((act) => {
      next[act] = true;
    });
    activeTouchStateRef.current = next;
    emitCombinedInput();
  };

  const handlePointerDown = (action: TouchAction) => (e: React.PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    touchMapRef.current.set(e.pointerId, action);
    syncTouchFlags();
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    touchMapRef.current.delete(e.pointerId);
    syncTouchFlags();
  };

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-20 p-3 sm:p-5 flex items-end justify-between gap-3">
      {/* Left: Refined Touch Steering + Tilt & Auto Toggles */}
      {showTouchControls ? (
        <div className="pointer-events-auto flex flex-col items-start gap-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleToggleTilt}
              aria-pressed={tiltEnabled}
              title="Toggle tilt steering"
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer touch-none select-none ${
                tiltEnabled
                  ? 'bg-amber-500 text-slate-950 border-amber-300'
                  : 'bg-slate-950/85 text-slate-200 border-white/15 hover:bg-slate-900'
              }`}
            >
              <Compass className="w-3.5 h-3.5" />
              <span>{tiltAvailable ? 'Tilt' : 'No Sensor'}</span>
            </button>

            <button
              type="button"
              onClick={() => setAutoAccel((prev) => !prev)}
              aria-pressed={autoAccel}
              title="Toggle auto acceleration"
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer touch-none select-none ${
                autoAccel
                  ? 'bg-emerald-500 text-slate-950 border-emerald-300'
                  : 'bg-slate-950/85 text-slate-200 border-white/15 hover:bg-slate-900'
              }`}
            >
              <Zap className="w-3.5 h-3.5" />
              <span>Auto</span>
            </button>

            {tiltEnabled && (
              <div className="w-16 h-2 rounded-full bg-slate-950/90 border border-white/15 relative overflow-hidden">
                <div
                  className="absolute top-0 bottom-0 w-3 rounded-full bg-amber-400 transition-transform duration-75"
                  style={{
                    left: '50%',
                    transform: `translateX(calc(-50% + ${tiltDisplay * 24}px))`,
                  }}
                />
              </div>
            )}
          </div>

          <div className={`flex items-center gap-3 rounded-2xl ${highlighted ? 'animate-tutorial-highlight' : ''}`}>
            <button
              type="button"
              aria-label="Steer Left"
              onPointerDown={handlePointerDown('left')}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              onContextMenu={(e) => e.preventDefault()}
              className="w-20 h-20 rounded-2xl bg-slate-950/85 active:bg-amber-500 active:text-slate-950 active:scale-95 transition-transform border border-white/20 text-slate-100 flex items-center justify-center shadow-lg touch-none select-none cursor-pointer"
            >
              <ArrowLeft className="w-8 h-8" />
            </button>
            <button
              type="button"
              aria-label="Steer Right"
              onPointerDown={handlePointerDown('right')}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              onContextMenu={(e) => e.preventDefault()}
              className="w-20 h-20 rounded-2xl bg-slate-950/85 active:bg-amber-500 active:text-slate-950 active:scale-95 transition-transform border border-white/20 text-slate-100 flex items-center justify-center shadow-lg touch-none select-none cursor-pointer"
            >
              <ArrowRight className="w-8 h-8" />
            </button>
          </div>
        </div>
      ) : (
        <div
          className={`pointer-events-auto hidden md:flex items-center gap-2.5 px-3 py-1.5 rounded-lg bg-slate-950/85 border text-xs text-slate-300 ${
            highlighted ? 'border-amber-400 animate-tutorial-highlight' : 'border-white/10'
          }`}
        >
          <span className="font-mono-num text-slate-100 font-semibold">WASD / Arrows</span>
          <span className="text-slate-600" aria-hidden="true">·</span>
          <span className="font-mono-num text-slate-100 font-semibold">Space</span>
          <span className="text-slate-600" aria-hidden="true">·</span>
          <span className="font-mono-num text-slate-100 font-semibold">E</span>
          <span>Shop</span>
          <span className="text-slate-600" aria-hidden="true">·</span>
          <button
            type="button"
            onClick={() => setAutoAccel((prev) => !prev)}
            aria-pressed={autoAccel}
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium transition-colors cursor-pointer ${
              autoAccel
                ? 'bg-emerald-500 text-slate-950'
                : 'bg-slate-800 text-slate-300 hover:text-white'
            }`}
          >
            <Zap className="w-3 h-3" />
            <span>Auto</span>
          </button>
        </div>
      )}

      {/* Center: Compact Speedometer */}
      <div className="px-3.5 py-1.5 rounded-lg bg-slate-950/88 border border-white/12 flex items-baseline gap-1.5">
        <span className="font-display text-2xl sm:text-3xl font-bold text-amber-400 tabular-nums leading-none">
          {String(speedKmh).padStart(2, '0')}
        </span>
        <span className="text-[11px] font-medium text-slate-400">km/h</span>
      </div>

      {/* Right: Refined Icon-Only Brake & Acceleration Controls */}
      {showTouchControls ? (
        <div className={`pointer-events-auto flex items-end gap-2.5 rounded-2xl ${highlighted ? 'animate-tutorial-highlight' : ''}`}>
          <button
            type="button"
            aria-label="Brake or Reverse"
            onPointerDown={handlePointerDown('brake')}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onContextMenu={(e) => e.preventDefault()}
            className="w-16 h-16 sm:w-18 sm:h-18 rounded-2xl bg-slate-950/85 active:bg-rose-500 active:text-white active:scale-95 transition-transform border border-rose-400/35 text-rose-300 flex items-center justify-center shadow-lg touch-none select-none cursor-pointer"
          >
            <ChevronDown className="w-7 h-7" />
          </button>
          <button
            type="button"
            aria-label="Accelerate"
            onPointerDown={handlePointerDown('gas')}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onContextMenu={(e) => e.preventDefault()}
            className={`w-18 h-22 sm:w-20 sm:h-24 rounded-2xl active:bg-emerald-500 active:text-slate-950 active:scale-95 transition-transform border flex items-center justify-center shadow-lg touch-none select-none cursor-pointer ${
              autoAccel
                ? 'bg-emerald-950/85 border-emerald-400/60 text-emerald-300'
                : 'bg-slate-950/85 border-emerald-400/35 text-emerald-300'
            }`}
          >
            <ChevronUp className="w-8 h-8" />
          </button>
        </div>
      ) : (
        <div className="hidden md:block w-36" />
      )}
    </div>
  );
}
