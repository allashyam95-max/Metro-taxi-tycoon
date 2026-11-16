import { Award, CheckCircle2, ChevronDown, ChevronUp, Circle, Target } from 'lucide-react';
import { useState } from 'react';
import {
  CAREER_ACHIEVEMENTS,
  getAchievementProgress,
  getStage3Progress,
  STAGE_1_TARGET_CASH,
  STAGE_2_REWARD,
  STAGE_3_REWARD,
} from '../config/stages';
import { GameSaveState } from '../types/game';

interface CareerGoalPanelProps {
  state: GameSaveState;
  onOpenStagesTab: () => void;
}

export function CareerGoalPanel({ state, onOpenStagesTab }: CareerGoalPanelProps) {
  const [collapsed, setCollapsed] = useState(false);

  const stage3 = getStage3Progress(state);
  const unlockedCount = state.achievements.length;
  const totalAch = CAREER_ACHIEVEMENTS.length;

  const cashForFirstCar = Math.max(0, state.money);
  const stage1Ratio = Math.min(1, cashForFirstCar / STAGE_1_TARGET_CASH);
  const canBuyFirstCar = cashForFirstCar >= STAGE_1_TARGET_CASH;

  const nextLockedAchievement = CAREER_ACHIEVEMENTS.find(
    (a) => !state.achievements.includes(a.id),
  );
  const nextAchProgress = nextLockedAchievement
    ? getAchievementProgress(nextLockedAchievement.id, state)
    : null;

  return (
    <div className="pointer-events-auto w-[184px] sm:w-[224px] rounded-lg bg-slate-950/90 border border-white/15 text-slate-100 shadow-lg overflow-hidden">
      {/* Compact Header */}
      <div className="flex items-center justify-between gap-1.5 px-2.5 py-1.5 border-b border-white/10">
        <button
          type="button"
          onClick={onOpenStagesTab}
          className="flex items-center gap-1.5 min-w-0 text-left hover:text-amber-300 transition-colors cursor-pointer"
          title="Open Career Goals & Achievements"
        >
          <Target className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <span className="text-[11px] font-bold text-amber-300 truncate">
            {state.currentStage === 1
              ? 'Stage 1 Goal'
              : state.currentStage === 2
              ? 'Stage 2 → 3'
              : 'Stage 3 Complete'}
          </span>
        </button>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={onOpenStagesTab}
            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-900 border border-white/10 text-[10px] font-mono-num text-amber-300 hover:bg-slate-800 cursor-pointer"
            title="View 5 career achievements"
          >
            <Award className="w-2.5 h-2.5" />
            <span>
              {unlockedCount}/{totalAch}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setCollapsed((prev) => !prev)}
            aria-label={collapsed ? 'Expand goal panel' : 'Collapse goal panel'}
            className="p-0.5 rounded text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
          >
            {collapsed ? (
              <ChevronDown className="w-3.5 h-3.5" />
            ) : (
              <ChevronUp className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
      </div>

      {/* Goal Body */}
      {!collapsed && (
        <div className="px-2.5 py-2 space-y-1.5 text-[11px]">
          {state.currentStage === 1 && (
            <>
              <div className="font-medium text-slate-100 leading-snug">
                {canBuyFirstCar
                  ? 'Buy your first car in the Shop'
                  : `Earn $${STAGE_1_TARGET_CASH} to buy your first car`}
              </div>
              <div className="h-1.5 w-full rounded-full bg-slate-800 overflow-hidden">
                <div
                  className="h-full rounded-full bg-amber-400 transition-all duration-300"
                  style={{ width: `${Math.round(stage1Ratio * 100)}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-[10px] font-mono-num text-slate-400">
                <span>
                  ${Math.floor(cashForFirstCar)} / ${STAGE_1_TARGET_CASH}
                </span>
                <span className="text-emerald-400">+${STAGE_2_REWARD} · $0 rent</span>
              </div>
            </>
          )}

          {state.currentStage === 2 && (
            <>
              <div className="space-y-1">
                <div className="flex items-center justify-between gap-1.5">
                  <span className="inline-flex items-center gap-1 text-slate-300 truncate">
                    {stage3.ownsSedan ? (
                      <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
                    ) : (
                      <Circle className="w-3 h-3 text-slate-500 shrink-0" />
                    )}
                    <span className="truncate">Own a Sedan</span>
                  </span>
                  <span
                    className={`font-mono-num text-[10px] ${
                      stage3.ownsSedan ? 'text-emerald-400 font-semibold' : 'text-slate-400'
                    }`}
                  >
                    {stage3.ownsSedan ? 'Done' : '0/1'}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-1.5">
                  <span className="inline-flex items-center gap-1 text-slate-300 truncate">
                    {stage3.earningsMet ? (
                      <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
                    ) : (
                      <Circle className="w-3 h-3 text-slate-500 shrink-0" />
                    )}
                    <span className="truncate">Earnings</span>
                  </span>
                  <span
                    className={`font-mono-num text-[10px] ${
                      stage3.earningsMet ? 'text-emerald-400 font-semibold' : 'text-slate-300'
                    }`}
                  >
                    ${Math.min(stage3.targetEarnings, Math.floor(stage3.earnings)).toLocaleString()} / $
                    {stage3.targetEarnings.toLocaleString()}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-1.5">
                  <span className="inline-flex items-center gap-1 text-slate-300 truncate">
                    {stage3.ratingMet ? (
                      <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
                    ) : (
                      <Circle className="w-3 h-3 text-slate-500 shrink-0" />
                    )}
                    <span className="truncate">Rating</span>
                  </span>
                  <span
                    className={`font-mono-num text-[10px] ${
                      stage3.ratingMet ? 'text-emerald-400 font-semibold' : 'text-slate-300'
                    }`}
                  >
                    {stage3.rating.toFixed(1)} / {stage3.targetRating.toFixed(1)}★
                  </span>
                </div>
              </div>
              <div className="pt-0.5 flex items-center justify-between text-[10px] text-slate-400">
                <span>Stage 3 reward</span>
                <span className="font-mono-num text-emerald-400 font-semibold">
                  +${STAGE_3_REWARD}
                </span>
              </div>
            </>
          )}

          {state.currentStage >= 3 && (
            <>
              <div className="font-medium text-emerald-300 leading-snug">
                {nextLockedAchievement
                  ? `Next: ${nextLockedAchievement.title}`
                  : 'All 5 career achievements unlocked!'}
              </div>
              {nextAchProgress && (
                <>
                  <div className="h-1.5 w-full rounded-full bg-slate-800 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-emerald-400 transition-all duration-300"
                      style={{ width: `${Math.round(nextAchProgress.ratio * 100)}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-[10px] font-mono-num text-slate-400">
                    <span>{nextAchProgress.progressLabel}</span>
                    <button
                      type="button"
                      onClick={onOpenStagesTab}
                      className="text-amber-300 hover:text-amber-200 underline cursor-pointer"
                    >
                      Details
                    </button>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
