import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  CheckCircle2,
  ChevronRight,
  Sparkles,
  X,
} from 'lucide-react';

export type TutorialStep = 1 | 2 | 3 | 4 | 5 | 6 | 7;

interface TutorialOverlayProps {
  step: TutorialStep | null;
  completionBonus: number | null;
  showTouchControls: boolean;
  step1DistanceMeters: number;
  hasActiveTrip: boolean;
  onNext: () => void;
  onSkip: () => void;
  onFinish: () => void;
  onDismissCompletion: () => void;
}

interface StepCopy {
  title: string;
  body: string;
  actionLabel: string | null;
}

function getStepCopy(
  step: TutorialStep,
  showTouchControls: boolean,
  step1DistanceMeters: number,
  hasActiveTrip: boolean,
): StepCopy {
  switch (step) {
    case 1:
      return {
        title: '1. Drive Your Car',
        body: showTouchControls
          ? `Tap steering and gas below to drive forward (${Math.min(8, Math.round(step1DistanceMeters))}/8 m).`
          : `Use WASD or Arrow keys to steer and accelerate forward (${Math.min(8, Math.round(step1DistanceMeters))}/8 m).`,
        actionLabel: 'Next',
      };
    case 2:
      return {
        title: '2. Open the Minimap',
        body: 'Tap the minimap in the top-left to expand it. Yellow dots are waiting passengers.',
        actionLabel: 'Next',
      };
    case 3:
      return {
        title: '3. Pick Up a Passenger',
        body: 'Follow the arrow above your car to a glowing yellow beam and stop near it to start a ride.',
        actionLabel: hasActiveTrip ? 'Continue' : 'Next',
      };
    case 4:
      return {
        title: '4. Drive to Drop-off',
        body: 'Follow the 3D arrow to the glowing green beam before the timer runs out.',
        actionLabel: 'Next',
      };
    case 5:
      return {
        title: '5. Timer, Tip & Fare',
        body: 'Finish before the green/yellow timer turns red for up to a 30% tip. Your receipt shows base fare, tip, and fuel.',
        actionLabel: 'Next',
      };
    case 6:
      return {
        title: '6. Fuel & Gas Stations',
        body: 'Watch the fuel circle in the top-right and tap it for distance. Blue squares on the map are gas stations.',
        actionLabel: 'Next',
      };
    case 7:
      return {
        title: '7. Shop & Garage',
        body: 'Tap Shop & Stages anytime to buy faster taxis, switch rides in your garage, or toggle private mode.',
        actionLabel: 'Finish',
      };
  }
}

export function TutorialOverlay({
  step,
  completionBonus,
  showTouchControls,
  step1DistanceMeters,
  hasActiveTrip,
  onNext,
  onSkip,
  onFinish,
  onDismissCompletion,
}: TutorialOverlayProps) {
  if (completionBonus !== null) {
    return (
      <div className="pointer-events-none fixed inset-x-0 bottom-28 sm:bottom-24 z-30 flex justify-center px-3">
        <div className="pointer-events-auto w-full max-w-md rounded-2xl bg-slate-950/95 border-2 border-emerald-400/70 px-5 py-4 text-slate-100 shadow-2xl">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <CheckCircle2 className="w-6 h-6 text-emerald-400 shrink-0" />
              <div>
                <h3 className="font-display text-lg sm:text-xl font-bold text-white leading-tight">
                  Tutorial complete!
                </h3>
                <p className="text-sm sm:text-base text-emerald-300 font-semibold mt-0.5 flex items-center gap-1.5">
                  {completionBonus > 0 ? (
                    <>
                      <Sparkles className="w-4 h-4 shrink-0" />
                      <span>+${completionBonus} starting bonus added!</span>
                    </>
                  ) : (
                    <span>Enjoy driving around Metro City!</span>
                  )}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onDismissCompletion}
              aria-label="Close tutorial message"
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!step) return null;

  const copy = getStepCopy(step, showTouchControls, step1DistanceMeters, hasActiveTrip);

  // Position card away from the highlighted control so controls remain unobstructed
  const positionClass =
    step === 1
      ? 'top-28 sm:top-24'
      : 'bottom-32 sm:bottom-20';

  return (
    <div className="pointer-events-none fixed inset-0 z-30">
      {/* Contextual directional arrows pointing at the relevant control */}
      {step === 1 && (
        <>
          <div className="fixed left-12 sm:left-16 bottom-48 sm:bottom-44 text-amber-400 animate-bounce flex flex-col items-center">
            <span className="text-[11px] font-bold uppercase tracking-wide bg-slate-950/90 px-2 py-0.5 rounded border border-amber-400/50 mb-1">
              Steer
            </span>
            <ArrowDown className="w-6 h-6" />
          </div>
          <div className="fixed right-10 sm:right-16 bottom-48 sm:bottom-44 text-emerald-400 animate-bounce flex flex-col items-center">
            <span className="text-[11px] font-bold uppercase tracking-wide bg-slate-950/90 px-2 py-0.5 rounded border border-emerald-400/50 mb-1">
              Gas / Brake
            </span>
            <ArrowDown className="w-6 h-6" />
          </div>
        </>
      )}

      {step === 2 && (
        <div className="fixed left-28 sm:left-36 top-20 sm:top-24 text-amber-400 animate-bounce flex items-center gap-1.5">
          <ArrowLeft className="w-6 h-6" />
          <span className="text-xs font-bold bg-slate-950/90 px-2 py-1 rounded border border-amber-400/50">
            Tap Map
          </span>
        </div>
      )}

      {step === 6 && (
        <div className="fixed right-20 sm:right-22 top-22 sm:top-18 text-amber-400 animate-bounce flex items-center gap-1.5">
          <span className="text-xs font-bold bg-slate-950/90 px-2 py-1 rounded border border-amber-400/50">
            Fuel Circle
          </span>
          <ArrowRight className="w-6 h-6" />
        </div>
      )}

      {step === 7 && (
        <div className="fixed right-4 sm:right-8 top-14 text-amber-400 animate-bounce flex flex-col items-end">
          <ArrowUp className="w-6 h-6 mr-6" />
          <span className="text-xs font-bold bg-slate-950/90 px-2 py-1 rounded border border-amber-400/50">
            Shop &amp; Garage
          </span>
        </div>
      )}

      {/* Main Tutorial Prompt Card */}
      <div className={`fixed inset-x-0 ${positionClass} flex justify-center px-3`}>
        <div
          role="region"
          aria-label={`Tutorial step ${step} of 7`}
          className="pointer-events-auto w-full max-w-md rounded-2xl bg-slate-950/95 border-2 border-amber-400/70 px-4 py-3.5 sm:px-5 sm:py-4 text-slate-100 shadow-2xl"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-amber-400">
              Step {step} / 7
            </span>
            <button
              type="button"
              onClick={onSkip}
              className="px-2.5 py-1 rounded-md text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-white/15 cursor-pointer"
            >
              Skip tutorial
            </button>
          </div>

          <h3 className="font-display text-lg sm:text-xl font-bold text-white mt-1.5 leading-tight">
            {copy.title}
          </h3>
          <p className="text-base sm:text-[17px] text-slate-200 leading-snug mt-1">
            {copy.body}
          </p>

          <div className="mt-3 flex items-center justify-end gap-2">
            {step === 7 ? (
              <button
                type="button"
                onClick={onFinish}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold bg-emerald-500 hover:bg-emerald-400 text-slate-950 transition-colors cursor-pointer"
              >
                <span>{copy.actionLabel}</span>
                <CheckCircle2 className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={onNext}
                className="inline-flex items-center gap-1 px-4 py-2 rounded-xl text-sm font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 transition-colors cursor-pointer"
              >
                <span>{copy.actionLabel}</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
