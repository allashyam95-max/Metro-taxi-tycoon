import {
  AlertCircle,
  Award,
  Car,
  Check,
  CheckCircle2,
  Circle,
  Fuel,
  Gauge,
  RotateCcw,
  Shield,
  Sparkles,
  Target,
  TrendingUp,
  Warehouse,
  X,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  BUSINESS_STAGES,
  CAREER_ACHIEVEMENTS,
  EMERGENCY_FUEL_COST,
  EMERGENCY_FUEL_UNITS,
  FUEL_PRICE_PER_UNIT,
  getAchievementProgress,
  getStage3Progress,
  STAGE_1_TARGET_CASH,
  STAGE_2_REWARD,
  STAGE_3_REWARD,
} from '../config/stages';
import { VEHICLE_CATALOG, VEHICLE_ORDER } from '../config/vehicles';
import { GameSaveState, VehicleCategory, VehicleId, VehicleServiceMode } from '../types/game';
import { CarPreview3D } from './CarPreview3D';

export type ShopTab = 'shop' | 'garage' | 'service';

interface ShopModalProps {
  state: GameSaveState;
  initialTab?: ShopTab;
  onClose: () => void;
  onBuyVehicle: (id: VehicleId) => { ok: boolean; reason?: string };
  onSelectVehicle: (id: VehicleId) => void;
  onSetVehicleMode: (id: VehicleId, mode: VehicleServiceMode) => void;
  onRefuelFull: () => void;
  onEmergencyFuel: () => void;
  onResetSave: () => void;
}

type CategoryFilter = 'all' | VehicleCategory;

const CATEGORY_TABS: Array<{ id: CategoryFilter; label: string }> = [
  { id: 'all', label: 'All (25)' },
  { id: 'economy', label: 'Economy' },
  { id: 'sedan', label: 'Sedan' },
  { id: 'suv', label: 'SUV & Van' },
  { id: 'luxury', label: 'Luxury' },
  { id: 'vvip', label: 'VVIP' },
  { id: 'private', label: 'Private (5)' },
];

export function ShopModal({
  state,
  initialTab = 'shop',
  onClose,
  onBuyVehicle,
  onSelectVehicle,
  onSetVehicleMode,
  onRefuelFull,
  onEmergencyFuel,
  onResetSave,
}: ShopModalProps) {
  const [tab, setTab] = useState<ShopTab>(initialTab);
  const [category, setCategory] = useState<CategoryFilter>('all');
  const [selectedId, setSelectedId] = useState<VehicleId>(state.activeVehicle);
  const [previewAsTaxi, setPreviewAsTaxi] = useState<boolean>(true);
  const [shopError, setShopError] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  const stage3 = getStage3Progress(state);

  const selectedSpec = VEHICLE_CATALOG[selectedId] ?? VEHICLE_CATALOG[state.activeVehicle];
  const isOwned = state.ownedVehicles.includes(selectedSpec.id);
  const isActive = state.activeVehicle === selectedSpec.id;
  const savedModeForSelected: VehicleServiceMode = selectedSpec.taxiCapable
    ? (state.vehicleModes[selectedSpec.id] ?? 'taxi')
    : 'private';

  const effectivePreviewTaxi = selectedSpec.taxiCapable
    ? isOwned
      ? savedModeForSelected === 'taxi'
      : previewAsTaxi
    : false;

  const filteredVehicles = useMemo(() => {
    if (category === 'all') return VEHICLE_ORDER;
    return VEHICLE_ORDER.filter((id) => VEHICLE_CATALOG[id].category === category);
  }, [category]);

  const fuelNeeded = Math.max(0, state.fuelMax - state.fuel);
  const fullRefuelCost =
    fuelNeeded < 0.5 ? 0 : Number(Math.max(0.25, fuelNeeded * FUEL_PRICE_PER_UNIT).toFixed(2));

  const handleSelectPreviewCar = (id: VehicleId) => {
    setSelectedId(id);
    setShopError(null);
  };

  const handleSwitchTab = (nextTab: ShopTab) => {
    setTab(nextTab);
    setShopError(null);
    if (nextTab === 'garage' && !state.ownedVehicles.includes(selectedId)) {
      setSelectedId(state.activeVehicle);
    }
  };

  const handleBuyClick = () => {
    const res = onBuyVehicle(selectedSpec.id);
    if (!res.ok) {
      setShopError(res.reason ?? 'Not enough money');
    } else {
      setShopError(null);
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-2.5 sm:p-5 bg-slate-950/80">
      <div className="w-full max-w-5xl max-h-[92vh] flex flex-col rounded-xl bg-slate-900 border border-white/15 text-slate-100 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 px-4 sm:px-5 py-3.5 border-b border-white/10 shrink-0">
          <div className="min-w-0">
            <h2 className="font-display text-base sm:text-xl font-bold text-white truncate">
              Metro Car Shop &amp; Garage
            </h2>
            <p className="text-xs text-slate-400">
              Balance:{' '}
              <span className="font-mono-num font-bold text-emerald-400">
                ${state.money.toFixed(2)}
              </span>{' '}
              · Owned:{' '}
              <span className="font-mono-num font-semibold text-slate-200">
                {state.ownedVehicles.length} / {VEHICLE_ORDER.length} cars
              </span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer shrink-0"
            aria-label="Close car shop"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Top Navigation Tabs */}
        <div className="flex items-center gap-1 p-1.5 mx-4 sm:mx-5 mt-3 rounded-lg bg-slate-950 border border-white/10 shrink-0">
          <button
            type="button"
            onClick={() => handleSwitchTab('shop')}
            className={`flex-1 py-2 px-3 rounded-md text-xs sm:text-sm font-medium transition-colors whitespace-nowrap cursor-pointer flex items-center justify-center gap-1.5 ${
              tab === 'shop'
                ? 'bg-amber-500 text-slate-950 font-semibold'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            <Car className="w-4 h-4" />
            <span>Car Shop</span>
          </button>
          <button
            type="button"
            onClick={() => handleSwitchTab('garage')}
            className={`flex-1 py-2 px-3 rounded-md text-xs sm:text-sm font-medium transition-colors whitespace-nowrap cursor-pointer flex items-center justify-center gap-1.5 ${
              tab === 'garage'
                ? 'bg-amber-500 text-slate-950 font-semibold'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            <Warehouse className="w-4 h-4" />
            <span>My Garage ({state.ownedVehicles.length})</span>
          </button>
          <button
            type="button"
            onClick={() => handleSwitchTab('service')}
            className={`flex-1 py-2 px-3 rounded-md text-xs sm:text-sm font-medium transition-colors whitespace-nowrap cursor-pointer flex items-center justify-center gap-1.5 ${
              tab === 'service'
                ? 'bg-amber-500 text-slate-950 font-semibold'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            <Fuel className="w-4 h-4" />
            <span>Fuel &amp; Stages</span>
          </button>
        </div>

        {/* Main Body: Shared Rotating 3D Preview across Shop & Garage */}
        {(tab === 'shop' || tab === 'garage') && (
          <div className="flex-1 min-h-0 flex flex-col lg:grid lg:grid-cols-12 gap-4 p-4 sm:p-5 overflow-hidden">
            {/* Pinned Shared 3D Showroom Column */}
            <div className="lg:col-span-5 flex flex-col justify-between gap-3 rounded-xl bg-slate-950/90 border border-white/10 p-3.5 shrink-0 lg:overflow-y-auto">
              <div className="space-y-2.5">
                <CarPreview3D spec={selectedSpec} taxiMode={effectivePreviewTaxi} />

                {selectedSpec.taxiCapable && (
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="text-slate-400">
                      {isOwned ? 'Service Mode:' : 'Preview Paint:'}
                    </span>
                    <div className="inline-flex rounded-md bg-slate-900 border border-white/10 p-0.5">
                      <button
                        type="button"
                        onClick={() => {
                          if (isOwned) {
                            onSetVehicleMode(selectedSpec.id, 'taxi');
                          } else {
                            setPreviewAsTaxi(true);
                          }
                        }}
                        className={`px-2.5 py-1 rounded text-xs font-medium cursor-pointer transition-colors ${
                          effectivePreviewTaxi
                            ? 'bg-amber-500 text-slate-950 font-semibold'
                            : 'text-slate-300 hover:text-white'
                        }`}
                      >
                        Taxi Mode
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (isOwned) {
                            onSetVehicleMode(selectedSpec.id, 'private');
                          } else {
                            setPreviewAsTaxi(false);
                          }
                        }}
                        className={`px-2.5 py-1 rounded text-xs font-medium cursor-pointer transition-colors ${
                          !effectivePreviewTaxi
                            ? 'bg-slate-700 text-white font-semibold'
                            : 'text-slate-300 hover:text-white'
                        }`}
                      >
                        Private Mode
                      </button>
                    </div>
                  </div>
                )}

                <div className="flex items-start justify-between gap-2 pt-1">
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-amber-400">
                      {selectedSpec.brand} · {selectedSpec.tierLabel}
                    </div>
                    <h3 className="font-display text-lg font-bold text-white truncate">
                      {selectedSpec.name}
                    </h3>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-[11px] text-slate-400">Price</div>
                    <div className="font-mono-num text-base font-bold text-emerald-400">
                      ${selectedSpec.purchasePrice.toLocaleString()}
                    </div>
                  </div>
                </div>

                <p className="text-xs text-slate-400 leading-relaxed hidden sm:block">
                  {selectedSpec.description}
                </p>

                {/* Compact Stats Grid */}
                <div className="grid grid-cols-3 gap-1.5 text-xs">
                  <div className="rounded-lg bg-slate-900 border border-white/10 px-2 py-1.5">
                    <div className="text-slate-400 text-[10px]">Top Speed</div>
                    <div className="font-mono-num font-bold text-slate-100">
                      {Math.round(selectedSpec.maxSpeed * 3.6)} km/h
                    </div>
                  </div>
                  <div className="rounded-lg bg-slate-900 border border-white/10 px-2 py-1.5">
                    <div className="text-slate-400 text-[10px]">Accel</div>
                    <div className="font-mono-num font-bold text-slate-100">
                      {selectedSpec.acceleration.toFixed(1)} m/s²
                    </div>
                  </div>
                  <div className="rounded-lg bg-slate-900 border border-white/10 px-2 py-1.5">
                    <div className="text-slate-400 text-[10px]">Comfort</div>
                    <div className="font-mono-num font-bold text-slate-100">
                      {selectedSpec.comfort} / 100
                    </div>
                  </div>
                  <div className="rounded-lg bg-slate-900 border border-white/10 px-2 py-1.5">
                    <div className="text-slate-400 text-[10px]">Fuel Use</div>
                    <div className="font-mono-num font-bold text-slate-100">
                      {selectedSpec.fuelUse.toFixed(2)}x
                    </div>
                  </div>
                  <div className="rounded-lg bg-slate-900 border border-white/10 px-2 py-1.5">
                    <div className="text-slate-400 text-[10px]">Fare Mult</div>
                    <div
                      className={`font-mono-num font-bold ${
                        selectedSpec.taxiCapable ? 'text-emerald-400' : 'text-sky-300'
                      }`}
                    >
                      {selectedSpec.taxiCapable
                        ? `${selectedSpec.fareMultiplier.toFixed(2)}x`
                        : 'Private Only'}
                    </div>
                  </div>
                  <div className="rounded-lg bg-slate-900 border border-white/10 px-2 py-1.5">
                    <div className="text-slate-400 text-[10px]">Off-Road</div>
                    <div className="font-mono-num font-bold text-slate-100">
                      {selectedSpec.offroadGripBonus > 1
                        ? `+${Math.round((selectedSpec.offroadGripBonus - 1) * 100)}%`
                        : 'Standard'}
                    </div>
                  </div>
                </div>

                {selectedSpec.unlocksVVIP && (
                  <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-purple-300">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Unlocks high-paying VVIP passengers in Taxi mode</span>
                  </div>
                )}
              </div>

              {/* Buy / Drive Action */}
              <div className="space-y-2 pt-2 border-t border-white/10">
                {shopError && (
                  <div className="flex items-center gap-2 rounded-lg bg-rose-950/90 border border-rose-500/50 px-3 py-2 text-xs font-semibold text-rose-200">
                    <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                    <span>{shopError}</span>
                  </div>
                )}

                {isActive ? (
                  <div className="w-full py-2.5 px-4 rounded-lg bg-emerald-500/15 border border-emerald-400/40 text-emerald-300 text-sm font-semibold flex items-center justify-center gap-2">
                    <Check className="w-4 h-4" />
                    <span>Currently Driving</span>
                  </div>
                ) : isOwned ? (
                  <button
                    type="button"
                    onClick={() => onSelectVehicle(selectedSpec.id)}
                    className="w-full py-2.5 px-4 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-sm font-bold transition-colors cursor-pointer"
                  >
                    Drive {selectedSpec.name}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleBuyClick}
                    className={`w-full py-2.5 px-4 rounded-lg text-sm font-bold transition-colors cursor-pointer ${
                      state.money >= selectedSpec.purchasePrice
                        ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950'
                        : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-white/15'
                    }`}
                  >
                    Buy {selectedSpec.name} · ${selectedSpec.purchasePrice.toLocaleString()}
                  </button>
                )}
              </div>
            </div>

            {/* Right / Bottom Independent Scrollable Catalog or Garage List */}
            <div className="lg:col-span-7 flex-1 min-h-0 flex flex-col gap-3 overflow-hidden">
              {tab === 'shop' ? (
                <>
                  <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                    {CATEGORY_TABS.map((cat) => (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => setCategory(cat.id)}
                        className={`px-2.5 py-1.5 rounded-md text-xs font-medium border transition-colors cursor-pointer ${
                          category === cat.id
                            ? 'bg-amber-500 text-slate-950 border-amber-400 font-semibold'
                            : 'bg-slate-950 border-white/10 text-slate-300 hover:text-white hover:bg-slate-800'
                        }`}
                      >
                        {cat.label}
                      </button>
                    ))}
                  </div>

                  <div className="flex-1 min-h-0 overflow-y-auto pr-1 grid grid-cols-1 sm:grid-cols-2 gap-2.5 content-start">
                    {filteredVehicles.map((id) => {
                      const v = VEHICLE_CATALOG[id];
                      const owned = state.ownedVehicles.includes(id);
                      const active = state.activeVehicle === id;
                      const selected = selectedSpec.id === id;
                      const canAfford = state.money >= v.purchasePrice;

                      return (
                        <button
                          key={id}
                          type="button"
                          onClick={() => handleSelectPreviewCar(id)}
                          className={`text-left rounded-lg p-3 border transition-colors cursor-pointer ${
                            selected
                              ? 'bg-slate-950 border-amber-400 ring-1 ring-amber-400/50'
                              : active
                              ? 'bg-slate-950 border-emerald-400/50'
                              : 'bg-slate-950/60 border-white/10 hover:bg-slate-800/70'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="text-[11px] text-slate-400 truncate">
                                {v.tierLabel}
                              </div>
                              <div className="text-sm font-bold text-white truncate">{v.name}</div>
                            </div>
                            <span
                              className="w-3.5 h-3.5 rounded-sm border border-white/30 shrink-0 mt-0.5"
                              style={{
                                backgroundColor: `#${v.bodyColor.toString(16).padStart(6, '0')}`,
                              }}
                              title="Factory paint color"
                            />
                          </div>

                          <div className="mt-2 flex items-center justify-between text-xs font-mono-num">
                            <span className="text-slate-300 inline-flex items-center gap-1">
                              <Gauge className="w-3 h-3 text-slate-400" />
                              {Math.round(v.maxSpeed * 3.6)} km/h
                            </span>
                            {v.taxiCapable ? (
                              <span className="text-emerald-400 font-semibold">
                                {v.fareMultiplier.toFixed(2)}x fare
                              </span>
                            ) : (
                              <span className="text-sky-300 font-semibold">Private</span>
                            )}
                          </div>

                          <div className="mt-2 pt-2 border-t border-white/10 flex items-center justify-between text-xs">
                            {state.currentStage === 1 && id === 'veltra-piko' ? (
                              <span className="font-semibold text-amber-300">
                                Starter Lease ($18/day)
                              </span>
                            ) : active ? (
                              <span className="font-semibold text-emerald-400">Active Car</span>
                            ) : owned ? (
                              <span className="font-semibold text-amber-300">Owned (Garage)</span>
                            ) : (
                              <span
                                className={`font-mono-num font-bold ${
                                  canAfford ? 'text-slate-100' : 'text-rose-300'
                                }`}
                              >
                                ${v.purchasePrice.toLocaleString()}
                              </span>
                            )}
                            {v.unlocksVVIP && (
                              <span className="text-[11px] font-semibold text-purple-300">
                                VVIP
                              </span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </>
              ) : (
                <>
                  <div className="rounded-lg bg-slate-950 border border-white/10 p-3 text-xs text-slate-300 shrink-0">
                    Click any owned car to inspect its 3D model, switch your active ride, or toggle{' '}
                    <span className="font-semibold text-amber-300">Taxi Mode</span> vs{' '}
                    <span className="font-semibold text-slate-100">Private Mode</span>.
                  </div>

                  <div className="flex-1 min-h-0 overflow-y-auto pr-1 space-y-2.5">
                    {state.ownedVehicles.map((id) => {
                      const v = VEHICLE_CATALOG[id];
                      if (!v) return null;
                      const active = state.activeVehicle === id;
                      const selected = selectedSpec.id === id;
                      const mode: VehicleServiceMode = v.taxiCapable
                        ? (state.vehicleModes[id] ?? 'taxi')
                        : 'private';

                      return (
                        <div
                          key={id}
                          onClick={() => handleSelectPreviewCar(id)}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              handleSelectPreviewCar(id);
                            }
                          }}
                          className={`rounded-lg p-3.5 border flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer transition-colors ${
                            selected
                              ? 'bg-slate-950 border-amber-400 ring-1 ring-amber-400/40'
                              : active
                              ? 'bg-slate-950 border-emerald-400/50'
                              : 'bg-slate-950/70 border-white/10 hover:bg-slate-800/70'
                          }`}
                        >
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span
                                className="w-3.5 h-3.5 rounded-sm border border-white/30 shrink-0"
                                style={{
                                  backgroundColor: `#${v.bodyColor.toString(16).padStart(6, '0')}`,
                                }}
                              />
                              <span className="text-sm font-bold text-white">{v.name}</span>
                              <span className="text-xs text-slate-400">· {v.tierLabel}</span>
                              {active && (
                                <span className="text-[11px] font-semibold text-emerald-400">
                                  · Driving Now
                                </span>
                              )}
                            </div>
                            <div className="mt-1 flex flex-wrap items-center gap-3 text-xs font-mono-num text-slate-400">
                              <span>{Math.round(v.maxSpeed * 3.6)} km/h</span>
                              <span>Comfort {v.comfort}</span>
                              <span>
                                {v.taxiCapable
                                  ? `${v.fareMultiplier.toFixed(2)}x fare`
                                  : 'Private Only'}
                              </span>
                            </div>
                          </div>

                          <div
                            className="flex flex-wrap items-center gap-2 shrink-0"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {v.taxiCapable && (
                              <div className="inline-flex rounded-md bg-slate-900 border border-white/10 p-0.5">
                                <button
                                  type="button"
                                  onClick={() => {
                                    handleSelectPreviewCar(id);
                                    onSetVehicleMode(id, 'taxi');
                                  }}
                                  className={`px-2.5 py-1.5 rounded text-xs font-medium cursor-pointer transition-colors ${
                                    mode === 'taxi'
                                      ? 'bg-amber-500 text-slate-950 font-semibold'
                                      : 'text-slate-300 hover:text-white'
                                  }`}
                                >
                                  Taxi
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    handleSelectPreviewCar(id);
                                    onSetVehicleMode(id, 'private');
                                  }}
                                  className={`px-2.5 py-1.5 rounded text-xs font-medium cursor-pointer transition-colors ${
                                    mode === 'private'
                                      ? 'bg-slate-700 text-white font-semibold'
                                      : 'text-slate-300 hover:text-white'
                                  }`}
                                >
                                  Private
                                </button>
                              </div>
                            )}

                            {!active && (
                              <button
                                type="button"
                                onClick={() => {
                                  handleSelectPreviewCar(id);
                                  onSelectVehicle(id);
                                }}
                                className="px-3.5 py-1.5 rounded-md text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-slate-950 transition-colors cursor-pointer"
                              >
                                Drive
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* Fuel & 7-Stage Progression Tab */}
        {tab === 'service' && (
          <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
            <div className="rounded-lg bg-slate-950 border border-white/10 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <Fuel className="w-5 h-5 text-sky-400 mt-0.5 shrink-0" />
                <div>
                  <div className="text-sm font-semibold text-white">
                    Fuel Tank: {state.fuel.toFixed(1)} / {state.fuelMax} units
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Stop on any Metro Fuel pad for $1 per 4 units, or order emergency dispatch.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  disabled={fullRefuelCost === 0}
                  onClick={onRefuelFull}
                  className="px-3.5 py-2 rounded-md text-xs font-semibold bg-sky-500 text-slate-950 hover:bg-sky-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap cursor-pointer"
                >
                  {fullRefuelCost === 0 ? 'Tank Full' : `Fill Tank ($${fullRefuelCost.toFixed(2)})`}
                </button>
                <button
                  type="button"
                  disabled={fullRefuelCost === 0}
                  onClick={onEmergencyFuel}
                  className="px-3 py-2 rounded-md text-xs font-medium bg-slate-800 text-slate-200 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap cursor-pointer"
                >
                  +{EMERGENCY_FUEL_UNITS}u Emergency (${EMERGENCY_FUEL_COST})
                </button>
              </div>
            </div>

            <div className="rounded-lg bg-slate-950 border border-white/10 p-4">
              <div className="text-xs font-semibold text-slate-300 mb-3">Shift &amp; Career Ledger</div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div>
                  <div className="text-slate-400">Current Day</div>
                  <div className="font-mono-num text-sm font-bold text-white mt-0.5">
                    Day {state.currentDay}
                  </div>
                </div>
                <div>
                  <div className="text-slate-400">Completed Trips</div>
                  <div className="font-mono-num text-sm font-bold text-white mt-0.5">
                    {state.completedTrips}
                  </div>
                </div>
                <div>
                  <div className="text-slate-400">Gross Fares</div>
                  <div className="font-mono-num text-sm font-bold text-emerald-400 mt-0.5">
                    ${state.totalEarnings.toFixed(0)}
                  </div>
                </div>
                <div>
                  <div className="text-slate-400">Rental Fees Paid</div>
                  <div className="font-mono-num text-sm font-bold text-rose-300 mt-0.5">
                    ${state.totalRentalPaid.toFixed(0)}
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-white/10 flex items-center justify-between gap-3">
                <span className="text-xs text-slate-400">
                  Need a fresh start? Reset local save data.
                </span>
                {!confirmReset ? (
                  <button
                    type="button"
                    onClick={() => setConfirmReset(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-slate-800 text-rose-300 hover:bg-slate-700 transition-colors cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Reset Save</span>
                  </button>
                ) : (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        onResetSave();
                        setConfirmReset(false);
                      }}
                      className="px-3 py-1.5 rounded-md text-xs font-semibold bg-rose-600 text-white hover:bg-rose-500 cursor-pointer"
                    >
                      Confirm Reset
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmReset(false)}
                      className="px-2.5 py-1.5 rounded-md text-xs text-slate-300 hover:text-white cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Current Stage Goal & Requirements */}
            <div className="rounded-lg bg-slate-950 border border-amber-400/35 p-4 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Target className="w-4 h-4 text-amber-400 shrink-0" />
                  <span className="text-sm font-bold text-white">
                    {state.currentStage === 1
                      ? 'Current Goal · Unlock Stage 2'
                      : state.currentStage === 2
                      ? 'Current Goal · Unlock Stage 3'
                      : 'Stage 3 Achieved · Comfort Sedan'}
                  </span>
                </div>
                <span className="text-xs font-mono-num font-semibold text-emerald-400">
                  {state.currentStage === 1
                    ? `Reward: +$${STAGE_2_REWARD} & $0 rent`
                    : state.currentStage === 2
                    ? `Reward: +$${STAGE_3_REWARD}`
                    : 'Rental Fee: $0/day'}
                </span>
              </div>

              {state.currentStage === 1 && (
                <div className="space-y-2 text-xs">
                  <p className="text-slate-300">
                    Earn <span className="font-mono-num font-semibold text-white">${STAGE_1_TARGET_CASH}</span> and buy your first car in the Shop tab to stop paying the $18 daily rental fee.
                  </p>
                  <div className="h-2 w-full rounded-full bg-slate-800 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-amber-400 transition-all"
                      style={{
                        width: `${Math.min(100, Math.round((Math.max(0, state.money) / STAGE_1_TARGET_CASH) * 100))}%`,
                      }}
                    />
                  </div>
                  <div className="flex justify-between font-mono-num text-[11px] text-slate-400">
                    <span>Cash: ${Math.max(0, state.money).toFixed(0)} / ${STAGE_1_TARGET_CASH}</span>
                    <span>First Car: {state.carsPurchased > 0 ? 'Bought' : '0 / 1'}</span>
                  </div>
                </div>
              )}

              {state.currentStage === 2 && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                  <div className="rounded-md bg-slate-900 border border-white/10 p-2.5 flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 text-slate-200">
                      {stage3.ownsSedan ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      ) : (
                        <Circle className="w-4 h-4 text-slate-500 shrink-0" />
                      )}
                      <span>Own a Sedan</span>
                    </span>
                    <span
                      className={`font-mono-num font-semibold ${
                        stage3.ownsSedan ? 'text-emerald-400' : 'text-amber-300'
                      }`}
                    >
                      {stage3.ownsSedan ? 'Done' : '0 / 1'}
                    </span>
                  </div>

                  <div className="rounded-md bg-slate-900 border border-white/10 p-2.5 flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 text-slate-200">
                      {stage3.earningsMet ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      ) : (
                        <Circle className="w-4 h-4 text-slate-500 shrink-0" />
                      )}
                      <span>Total Earnings</span>
                    </span>
                    <span
                      className={`font-mono-num font-semibold ${
                        stage3.earningsMet ? 'text-emerald-400' : 'text-slate-200'
                      }`}
                    >
                      ${Math.floor(stage3.earnings).toLocaleString()} / $
                      {stage3.targetEarnings.toLocaleString()}
                    </span>
                  </div>

                  <div className="rounded-md bg-slate-900 border border-white/10 p-2.5 flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 text-slate-200">
                      {stage3.ratingMet ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      ) : (
                        <Circle className="w-4 h-4 text-slate-500 shrink-0" />
                      )}
                      <span>Rating</span>
                    </span>
                    <span
                      className={`font-mono-num font-semibold ${
                        stage3.ratingMet ? 'text-emerald-400' : 'text-slate-200'
                      }`}
                    >
                      {stage3.rating.toFixed(1)} / {stage3.targetRating.toFixed(1)}★
                    </span>
                  </div>
                </div>
              )}

              {state.currentStage >= 3 && (
                <p className="text-xs text-emerald-300">
                  You own a Sedan-class taxi, achieved $1,500+ total earnings, and maintain a top driver rating with $0 daily rental fees.
                </p>
              )}
            </div>

            {/* 5 Career Achievements */}
            <div className="rounded-lg bg-slate-950 border border-white/10 p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Award className="w-4 h-4 text-amber-400 shrink-0" />
                  <span className="text-xs font-semibold text-slate-200">
                    Career Achievements
                  </span>
                </div>
                <span className="text-xs font-mono-num font-semibold text-amber-300">
                  {state.achievements.length} / {CAREER_ACHIEVEMENTS.length} Unlocked
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {CAREER_ACHIEVEMENTS.map((ach) => {
                  const prog = getAchievementProgress(ach.id, state);
                  return (
                    <div
                      key={ach.id}
                      className={`rounded-lg p-3 border ${
                        prog.unlocked
                          ? 'bg-emerald-950/35 border-emerald-400/40'
                          : 'bg-slate-900/70 border-white/10'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            {prog.unlocked ? (
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                            ) : (
                              <Circle className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                            )}
                            <span className="text-xs font-bold text-white truncate">
                              {ach.title}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-400 mt-0.5">{ach.description}</p>
                        </div>
                        <span
                          className={`text-[10px] font-mono-num font-semibold shrink-0 ${
                            prog.unlocked ? 'text-emerald-400' : 'text-slate-300'
                          }`}
                        >
                          {prog.progressLabel}
                        </span>
                      </div>
                      <div className="mt-2 h-1 w-full rounded-full bg-slate-800 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            prog.unlocked ? 'bg-emerald-400' : 'bg-amber-400'
                          }`}
                          style={{ width: `${Math.round(prog.ratio * 100)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2.5">
              <div className="text-xs font-semibold text-slate-300">Career Stage Roadmap</div>
              {BUSINESS_STAGES.map((stage) => {
                const isStageCompleted = state.currentStage > stage.id;
                const isStageActive = state.currentStage === stage.id;
                return (
                  <div
                    key={stage.id}
                    className={`rounded-lg p-3.5 border ${
                      isStageActive
                        ? 'bg-slate-950 border-amber-400/50'
                        : isStageCompleted
                        ? 'bg-emerald-950/25 border-emerald-400/35'
                        : 'bg-slate-950/60 border-white/10'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <div
                          className={`w-6 h-6 rounded-md flex items-center justify-center text-xs font-bold shrink-0 ${
                            isStageActive
                              ? 'bg-amber-500 text-slate-950'
                              : isStageCompleted
                              ? 'bg-emerald-500 text-slate-950'
                              : 'bg-slate-800 text-slate-400'
                          }`}
                        >
                          {isStageCompleted ? <Check className="w-3.5 h-3.5" /> : stage.id}
                        </div>
                        <div>
                          <div className="text-sm font-bold text-white">{stage.title}</div>
                          <p className="text-xs text-slate-400 mt-0.5">{stage.summary}</p>
                        </div>
                      </div>
                      <div className="shrink-0 text-right text-xs">
                        {isStageActive ? (
                          <span className="inline-flex items-center gap-1 font-semibold text-amber-400">
                            <TrendingUp className="w-3.5 h-3.5" /> Active
                          </span>
                        ) : isStageCompleted ? (
                          <span className="inline-flex items-center gap-1 font-semibold text-emerald-400">
                            <Check className="w-3.5 h-3.5" /> Completed
                          </span>
                        ) : stage.implemented ? (
                          <span className="inline-flex items-center gap-1 text-slate-300 font-mono-num">
                            <Shield className="w-3.5 h-3.5 text-amber-300" /> Goal
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-slate-500 font-mono-num">
                            <Shield className="w-3.5 h-3.5" /> Upcoming
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
