import { AlertTriangle, Award, CheckCircle2, Fuel, Navigation, ShoppingBag, X } from 'lucide-react';
import { EMERGENCY_FUEL_COST } from '../config/stages';
import { DaySummary, FareReceipt, MinimapSnapshot, StageUpEvent } from '../types/game';

interface TripHudBannerProps {
  snapshot: MinimapSnapshot | null;
  receipt: FareReceipt | null;
  daySummary: DaySummary | null;
  stageUp: StageUpEvent | null;
  notice: { text: string; tone: 'info' | 'warning' | 'success' } | null;
  tutorialHighlight?: 'pickup' | 'dropoff' | 'fare' | null;
  onDismissReceipt: () => void;
  onDismissDaySummary: () => void;
  onDismissStageUp: () => void;
  onQuickRefuel: () => void;
  onEmergencyFuel: () => void;
  onOpenShop: () => void;
}

export function TripHudBanner({
  snapshot,
  receipt,
  daySummary,
  stageUp,
  notice,
  tutorialHighlight = null,
  onDismissReceipt,
  onDismissDaySummary,
  onDismissStageUp,
  onQuickRefuel,
  onEmergencyFuel,
  onOpenShop,
}: TripHudBannerProps) {
  const trip = snapshot?.activeTrip ?? null;
  const isOutOfFuel = snapshot ? snapshot.fuel <= 0.05 : false;
  const isNearFuel = snapshot?.nearFuelStation ?? false;
  const isNearShop = snapshot?.nearRentalShop ?? false;
  const needsFuel = snapshot ? snapshot.fuel < snapshot.fuelMax - 1 : false;
  const distMeters = snapshot?.distanceToTarget ?? 0;

  // Countdown timer colors: Green -> Yellow -> Red & flashing in last 10s
  let timeRemaining = 0;
  let overtime = 0;
  let timerColorClass = 'text-emerald-400 border-emerald-500/40';
  let isFlashing = false;

  if (trip) {
    timeRemaining = Math.max(0, trip.parTime - trip.elapsedTime);
    overtime = Math.max(0, trip.elapsedTime - trip.parTime);
    if (timeRemaining <= 10) {
      timerColorClass = 'text-rose-400 border-rose-500/60';
      isFlashing = true;
    } else if (timeRemaining <= Math.max(10, trip.parTime * 0.5)) {
      timerColorClass = 'text-amber-300 border-amber-400/50';
    }
  }

  return (
    <div className="pointer-events-none flex flex-col items-center gap-2 w-full max-w-md mx-auto px-2">
      {/* Top-Center Status, Distance & Large Countdown Timer */}
      {trip ? (
        <div
          className={`pointer-events-auto w-full rounded-lg bg-slate-950/92 border px-4 py-2 text-slate-100 ${timerColorClass} ${
            isFlashing ? 'animate-timer-flash' : ''
          } ${tutorialHighlight === 'dropoff' ? 'animate-tutorial-highlight' : ''}`}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-emerald-300 text-xs sm:text-sm font-semibold">
                <Navigation className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">Take passenger to destination</span>
              </div>
              <div className="text-[11px] text-slate-300 truncate mt-0.5">
                {trip.passengerName} · {trip.dropoffLabel} ·{' '}
                <span className="font-mono-num font-semibold text-white">{distMeters} m</span>
              </div>
            </div>

            {/* Large Countdown Timer */}
            <div className="text-right shrink-0">
              <div className="font-display text-3xl sm:text-4xl font-bold tabular-nums leading-none">
                {overtime > 0 ? '0.0s' : `${timeRemaining.toFixed(1)}s`}
              </div>
              <div className="text-[10px] font-mono-num text-slate-400 mt-0.5">
                {overtime > 0
                  ? `Late +${overtime.toFixed(1)}s`
                  : `Est. $${trip.baseFare.toFixed(2)}`}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-center gap-2">
          {snapshot?.gameMode === 'freeroam' ? (
            <div className="rounded-lg bg-slate-950/90 border border-emerald-400/35 px-3.5 py-1.5 text-xs sm:text-sm text-slate-100 flex items-center gap-2.5">
              <span className="font-semibold text-emerald-300">Free roam</span>
              <span className="text-slate-500" aria-hidden="true">·</span>
              <span className="text-slate-300">Drive anywhere</span>
            </div>
          ) : snapshot && !snapshot.taxiServiceActive ? (
            <div className="rounded-lg bg-slate-950/90 border border-sky-400/35 px-3.5 py-1.5 text-xs sm:text-sm text-slate-100 flex items-center gap-2.5">
              <span className="font-semibold text-sky-300">Private drive</span>
              <span className="text-slate-500" aria-hidden="true">·</span>
              <span className="text-slate-300">
                {snapshot.activeVehicleTaxiCapable ? 'Private mode' : 'Private car'}
              </span>
            </div>
          ) : (
            <div
              className={`rounded-lg bg-slate-950/90 border border-amber-400/35 px-3.5 py-1.5 text-xs sm:text-sm text-slate-100 flex items-center gap-2.5 ${
                tutorialHighlight === 'pickup' ? 'animate-tutorial-highlight' : ''
              }`}
            >
              <span className="font-semibold text-amber-300">Go to pickup</span>
              <span className="text-slate-500" aria-hidden="true">·</span>
              <span className="font-mono-num font-bold text-white">{distMeters} m</span>
            </div>
          )}

          {isNearShop && (
            <button
              type="button"
              onClick={onOpenShop}
              className="pointer-events-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold bg-amber-500 text-slate-950 hover:bg-amber-400 transition-colors cursor-pointer"
            >
              <ShoppingBag className="w-3.5 h-3.5" />
              <span>Open Car Shop</span>
            </button>
          )}

          {isNearFuel && needsFuel && (
            <button
              type="button"
              onClick={onQuickRefuel}
              className="pointer-events-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold bg-sky-500 text-slate-950 hover:bg-sky-400 transition-colors cursor-pointer"
            >
              <Fuel className="w-3.5 h-3.5" />
              <span>Refuel Now</span>
            </button>
          )}
        </div>
      )}

      {/* Refuel shortcut if parked on gas station pad even during an active ride */}
      {trip && isNearFuel && needsFuel && (
        <button
          type="button"
          onClick={onQuickRefuel}
          className="pointer-events-auto inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold bg-sky-500 text-slate-950 hover:bg-sky-400 transition-colors cursor-pointer"
        >
          <Fuel className="w-3.5 h-3.5" />
          <span>Refuel Tank</span>
        </button>
      )}

      {/* Out of Fuel Alert & Emergency Refuel */}
      {isOutOfFuel && (
        <div className="pointer-events-auto flex items-center gap-3 rounded-lg bg-rose-950/95 border border-rose-500/50 px-3.5 py-2 text-xs text-rose-100">
          <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
          <span className="font-semibold">Out of fuel</span>
          <button
            type="button"
            onClick={onEmergencyFuel}
            className="px-2.5 py-1 rounded bg-rose-500 text-white font-semibold hover:bg-rose-400 transition-colors whitespace-nowrap cursor-pointer"
          >
            Emergency Refuel (${EMERGENCY_FUEL_COST})
          </button>
        </div>
      )}

      {/* Post-Ride Breakdown Receipt (or Tutorial Step 5 preview) */}
      {(receipt || tutorialHighlight === 'fare') && (
        <div
          className={`pointer-events-auto w-full rounded-lg bg-slate-950/95 border border-emerald-400/40 px-4 py-2.5 text-slate-100 ${
            tutorialHighlight === 'fare' ? 'animate-tutorial-highlight' : ''
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span className="text-xs sm:text-sm font-semibold">
                {receipt
                  ? `Arrived at ${receipt.dropoffLabel} (${receipt.distanceMeters} m)`
                  : 'Example Fare Breakdown (300 m ride)'}
              </span>
            </div>
            {receipt && (
              <button
                type="button"
                onClick={onDismissReceipt}
                className="text-slate-400 hover:text-white p-0.5 cursor-pointer"
                aria-label="Close receipt"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="mt-2 grid grid-cols-5 gap-1.5 text-[11px] font-mono-num text-slate-300 border-t border-white/10 pt-2">
            <div>
              <div className="text-slate-400">Base</div>
              <div className="text-slate-100 font-semibold">
                ${(receipt ? receipt.baseFare : 7.5).toFixed(2)}
              </div>
            </div>
            <div>
              <div className="text-slate-400">Tip</div>
              <div className="text-amber-300 font-semibold">
                +${(receipt ? receipt.tipBonus : 1.95).toFixed(2)}
              </div>
            </div>
            <div>
              <div className="text-slate-400">Late</div>
              <div className="text-rose-300 font-semibold">
                {receipt && receipt.latePenalty > 0 ? `-$${receipt.latePenalty.toFixed(2)}` : '$0.00'}
              </div>
            </div>
            <div>
              <div className="text-slate-400">Fuel</div>
              <div className="text-sky-300 font-semibold">
                ${(receipt ? receipt.fuelCost : 0.4).toFixed(2)}
              </div>
            </div>
            <div className="text-right">
              <div className="text-slate-400">Earned</div>
              <div className="text-emerald-400 font-bold text-xs sm:text-sm">
                +${(receipt ? receipt.totalEarned : 9.45).toFixed(2)}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Stage Up Reward Banner */}
      {stageUp && (
        <div className="pointer-events-auto w-full rounded-lg bg-slate-950/95 border border-amber-400/70 px-4 py-2.5 text-slate-100 shadow-xl">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <Award className="w-4 h-4 text-amber-400 shrink-0" />
              <span className="font-display text-xs sm:text-sm font-bold text-amber-300 truncate">
                Stage Up! Stage {stageUp.toStage} · {stageUp.title}
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="font-mono-num text-xs font-bold text-emerald-400">
                +${stageUp.reward}
              </span>
              <button
                type="button"
                onClick={onDismissStageUp}
                className="text-slate-400 hover:text-white p-0.5 cursor-pointer"
                aria-label="Dismiss stage up message"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
          <p className="mt-1 text-xs text-slate-300">{stageUp.summary}</p>
        </div>
      )}

      {/* Daily Rental Fee Settlement Notice */}
      {daySummary && (
        <div className="pointer-events-auto w-full rounded-lg bg-slate-950/95 border border-amber-400/45 px-4 py-2.5 text-slate-100">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs sm:text-sm font-semibold text-amber-300">
              Day {daySummary.day} Complete ·{' '}
              {daySummary.rentalFee > 0 ? 'Daily Rental Charged' : 'No Rental Fee'}
            </span>
            <button
              type="button"
              onClick={onDismissDaySummary}
              className="text-slate-400 hover:text-white p-0.5 cursor-pointer"
              aria-label="Dismiss day summary"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="mt-1 flex items-center justify-between text-xs font-mono-num text-slate-300">
            <span>
              {daySummary.tripsCompleted} rides · Earned ${daySummary.grossEarnings.toFixed(2)}
            </span>
            {daySummary.rentalFee > 0 ? (
              <span className="text-rose-300 font-semibold">
                -${daySummary.rentalFee.toFixed(2)} rental fee
              </span>
            ) : (
              <span className="text-emerald-400 font-semibold">$0 rental fee</span>
            )}
          </div>
        </div>
      )}

      {/* Subtle Transient Notice */}
      {notice && !receipt && !daySummary && !stageUp && (
        <div
          className={`rounded-md px-3 py-1 text-xs font-medium border ${
            notice.tone === 'warning'
              ? 'bg-rose-950/90 border-rose-500/40 text-rose-200'
              : notice.tone === 'success'
              ? 'bg-emerald-950/90 border-emerald-500/40 text-emerald-200'
              : 'bg-slate-950/88 border-white/10 text-slate-200'
          }`}
        >
          {notice.text}
        </div>
      )}
    </div>
  );
}
