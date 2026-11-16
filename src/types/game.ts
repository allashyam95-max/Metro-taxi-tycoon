export type VehicleCategory = 'economy' | 'sedan' | 'suv' | 'luxury' | 'vvip' | 'private';

export type VehicleId =
  // Economy (5)
  | 'veltra-piko'
  | 'veltra-nova'
  | 'brevo-spark'
  | 'brevo-lite'
  | 'kaizo-mini'
  // Sedan (5)
  | 'veltra-arden'
  | 'kaizo-sora'
  | 'norden-vale'
  | 'norden-crest'
  | 'brevo-strata'
  // SUV / Van (4)
  | 'kaizo-ridgeback'
  | 'norden-trek'
  | 'brevo-summit'
  | 'veltra-family-van'
  // Luxury (4)
  | 'auralis-sovereign'
  | 'auralis-regent'
  | 'solenne-prime'
  | 'solenne-elite'
  // VVIP (2)
  | 'auralis-majestic-limo'
  | 'solenne-imperial-limo'
  // Private (5)
  | 'zenith-gt'
  | 'vortex-r'
  | 'aero-roadster'
  | 'dune-raider'
  | 'titan-ranger';

export type VehicleTierId = VehicleId;

export type CarBodyShape =
  | 'hatchback'
  | 'small-sedan'
  | 'sedan'
  | 'suv'
  | 'van'
  | 'luxury'
  | 'limo'
  | 'coupe'
  | 'supercar'
  | 'roadster'
  | 'offroad4x4'
  | 'pickup';

export type HeadlightStyle = 'round' | 'bar' | 'quad' | 'angled';
export type TaillightStyle = 'classic' | 'bar' | 'twin' | 'vertical';

export type StageId = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export type CameraMode = 'chase' | 'overhead';

export type GameMode = 'taxi' | 'freeroam';

export type VehicleServiceMode = 'taxi' | 'private';

export type SurfaceType = 'road' | 'grass' | 'dirt' | 'sand';

export interface VehicleSpec {
  id: VehicleId;
  brand: string;
  model: string;
  name: string;
  category: VehicleCategory;
  tierLabel: string;
  description: string;
  taxiCapable: boolean;
  maxSpeed: number; // world units/sec
  acceleration: number;
  handling: number;
  offroadGripBonus: number; // 1.0 = normal, >1.0 = improved off-road speed & grip
  comfort: number; // 1 - 100
  fuelUse: number; // relative consumption multiplier
  fuelCapacity: number; // tank capacity in units (100)
  fareMultiplier: number;
  unlocksVVIP: boolean;
  dailyRentalFee: number;
  purchasePrice: number;
  bodyColor: number;
  accentColor: number;
  dimensions: {
    length: number;
    width: number;
    height: number;
  };
  bodyShape: CarBodyShape;
  wheelSize: {
    radius: number;
    width: number;
  };
  lights: {
    headStyle: HeadlightStyle;
    tailStyle: TaillightStyle;
  };
}

export interface BusinessStageSpec {
  id: StageId;
  title: string;
  shortTitle: string;
  summary: string;
  unlockCost: number;
  dailyRentalFee: number;
  defaultVehicle: VehicleId;
  implemented: boolean;
}

export interface CityStop {
  id: string;
  label: string;
  district: string;
  x: number;
  z: number;
}

export interface PassengerMarker {
  id: string;
  name: string;
  pickupLabel: string;
  x: number;
  z: number;
  dropoffLabel: string;
  dropoffX: number;
  dropoffZ: number;
  distance: number;
  parTime: number;
  estimatedFare: number;
  isVVIP: boolean;
}

export interface ActiveTrip {
  passengerName: string;
  pickupLabel: string;
  dropoffLabel: string;
  dropoffX: number;
  dropoffZ: number;
  distance: number;
  parTime: number;
  elapsedTime: number;
  smoothness: number; // 0..100
  collisions: number;
  baseFare: number;
  fuelUsed: number;
  isVVIP: boolean;
}

export interface FareReceipt {
  id: number;
  passengerName: string;
  dropoffLabel: string;
  distanceMeters: number;
  elapsedTime: number;
  parTime: number;
  baseFare: number;
  tipBonus: number;
  latePenalty: number;
  fuelCost: number;
  totalEarned: number;
  ratingEarned: number;
  newRating: number;
}

export interface DaySummary {
  id: number;
  day: number;
  rentalFee: number;
  balanceAfter: number;
  tripsCompleted: number;
  grossEarnings: number;
}

export interface ControlInput {
  throttle: number; // -1..1
  steer: number; // -1..1 (negative = left, positive = right)
  brake: boolean;
}

export interface MinimapSnapshot {
  playerX: number;
  playerZ: number;
  playerHeading: number;
  speedKmh: number;
  fuel: number;
  fuelMax: number;
  nearFuelStation: boolean;
  nearestFuelDistance: number;
  nearRentalShop: boolean;
  passengers: Array<{ id: string; x: number; z: number; isVVIP: boolean; label: string }>;
  activeTrip: ActiveTrip | null;
  distanceToTarget: number;
  targetBearingAngle: number; // relative to player heading
  fuelStations: Array<{ x: number; z: number }>;
  rentalShop: { x: number; z: number };
  traffic: Array<{ x: number; z: number }>;
  cityHalfExtent: number;
  gameMode: GameMode;
  surfaceType: SurfaceType;
  taxiServiceActive: boolean;
  activeVehicleTaxiCapable: boolean;
}

export type AchievementId =
  | 'first-ride'
  | 'ten-rides'
  | 'five-star-trip'
  | 'first-car'
  | 'first-1000';

export interface AchievementSpec {
  id: AchievementId;
  title: string;
  description: string;
}

export interface StageUpEvent {
  id: number;
  fromStage: StageId;
  toStage: StageId;
  title: string;
  summary: string;
  reward: number;
}

export interface GameSaveState {
  version: number;
  money: number;
  fuel: number;
  fuelMax: number;
  rating: number;
  ratingCount: number;
  currentStage: StageId;
  activeVehicle: VehicleId;
  ownedVehicles: VehicleId[];
  vehicleModes: Partial<Record<VehicleId, VehicleServiceMode>>;
  currentDay: number;
  dayTimeRemaining: number;
  completedTrips: number;
  totalEarnings: number;
  totalRentalPaid: number;
  carsPurchased: number;
  fiveStarTrips: number;
  achievements: AchievementId[];
  soundEnabled: boolean;
  carSoundVolume: number;
  backgroundSoundVolume: number;
  cameraMode: CameraMode;
  gameMode: GameMode;
  musicTrackId: string;
  musicVolume: number;
  musicMuted: boolean;
  musicAutoSwitch: boolean;
  tutorialDone: boolean;
  tutorialBonusClaimed: boolean;
}
