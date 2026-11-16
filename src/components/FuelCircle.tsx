import { Fuel } from 'lucide-react';
import { useEffect, useState } from 'react';

interface FuelCircleProps {
  fuel: number;
  fuelMax: number;
  nearestFuelDistance: number;
  nearFuelStation: boolean;
  highlighted?: boolean;
  onInspect?: () => void;
}

export function FuelCircle({
  fuel,
  fuelMax,
  nearestFuelDistance,
  nearFuelStation,
  highlighted = false,
  onInspect,
}: FuelCircleProps) {
  const [tooltipOpen, setTooltipOpen] = useState(false);

  const safeMax = Math.max(1, fuelMax);
  const pct = Math.max(0, Math.min(100, (fuel / safeMax) * 100));
  const roundedPct = fuel <= 0.05 ? 0 : Math.round(pct);

  // Ring color: >40% green, 20-40% yellow, <20% red
  const isRed = pct < 20;
  const isYellow = pct >= 20 && pct <= 40;
  const strokeColor = isRed ? '#f43f5e' : isYellow ? '#facc15' : '#10b981';
  const textColorClass = isRed
    ? 'text-rose-400'
    : isYellow
    ? 'text-yellow-300'
    : 'text-emerald-300';

  const size = 56;
  const center = size / 2;
  const radius = 23.5;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - pct / 100);

  useEffect(() => {
    if (!tooltipOpen) return;
    const timer = window.setTimeout(() => setTooltipOpen(false), 4000);
    return () => window.clearTimeout(timer);
  }, [tooltipOpen]);

  const handleToggle = () => {
    setTooltipOpen((prev) => !prev);
    onInspect?.();
  };

  return (
    <div className="fixed right-3 sm:right-4 top-20 sm:top-16 z-20 pointer-events-auto">
      {tooltipOpen && (
        <div
          role="status"
          className="absolute right-full mr-2.5 top-1/2 -translate-y-1/2 whitespace-nowrap rounded-lg bg-slate-950/95 border border-white/15 px-3 py-1.5 text-xs text-slate-100 shadow-xl"
        >
          <div className="font-semibold text-sky-300">
            {nearFuelStation
              ? 'At gas station'
              : `Nearest gas station: ${nearestFuelDistance} m`}
          </div>
          {fuel <= 0.05 && (
            <div className="text-[11px] text-rose-300 mt-0.5">
              Out of fuel — use Emergency Refuel
            </div>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={handleToggle}
        aria-label={`Fuel ${roundedPct}%, nearest gas station ${nearestFuelDistance} meters`}
        title="Tap for nearest gas station distance"
        className={`relative w-14 h-14 rounded-full bg-slate-950/92 flex flex-col items-center justify-center shadow-lg cursor-pointer select-none transition-transform active:scale-95 ${
          isRed ? 'animate-fuel-pulse' : ''
        } ${highlighted ? 'animate-tutorial-highlight' : ''}`}
      >
        {/* 56px SVG progress ring outline */}
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          className="absolute inset-0 -rotate-90 pointer-events-none"
          aria-hidden="true"
        >
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke="rgba(255, 255, 255, 0.14)"
            strokeWidth={4}
          />
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke={strokeColor}
            strokeWidth={4}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            className="transition-[stroke-dashoffset,stroke] duration-200"
          />
        </svg>

        <Fuel className={`w-4 h-4 ${textColorClass} relative z-10`} aria-hidden="true" />
        <span
          className={`font-mono-num text-[11px] font-bold leading-none mt-0.5 relative z-10 ${textColorClass}`}
        >
          {roundedPct}%
        </span>
      </button>
    </div>
  );
}
