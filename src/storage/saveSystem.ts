import { MUSIC_TRACKS } from '../config/musicTracks';
import {
  CAREER_ACHIEVEMENTS,
  computeEarnedAchievements,
  DAY_DURATION_SECONDS,
  getStage3Progress,
  hasBoughtFirstCar,
} from '../config/stages';
import { SAVE_VERSION } from '../config/version';
import { DEFAULT_STARTER_VEHICLE_ID, VEHICLE_CATALOG } from '../config/vehicles';
import {
  AchievementId,
  GameSaveState,
  StageId,
  VehicleId,
  VehicleServiceMode,
} from '../types/game';

const DEFAULT_MUSIC_TRACK_ID = MUSIC_TRACKS[0]?.id ?? 'chill1';

const SAVE_KEY = 'metro_cab_tycoon_save_v1';
const CORRUPT_BACKUP_KEY = 'metro_cab_tycoon_save_corrupt_backup_v1';

const VALID_ACHIEVEMENT_IDS = new Set<string>(CAREER_ACHIEVEMENTS.map((a) => a.id));

const EXPECTED_SAVE_KEYS = [
  'version',
  'money',
  'fuel',
  'ownedVehicles',
  'activeVehicle',
  'vehicleModes',
  'currentDay',
  'currentStage',
  'completedTrips',
  'achievements',
  'tutorialDone',
];

function isValidVehicleId(id: unknown): id is VehicleId {
  return typeof id === 'string' && id in VEHICLE_CATALOG;
}

function isValidAchievementId(id: unknown): id is AchievementId {
  return typeof id === 'string' && VALID_ACHIEVEMENT_IDS.has(id);
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function createInitialSaveState(): GameSaveState {
  const starterVehicle = VEHICLE_CATALOG[DEFAULT_STARTER_VEHICLE_ID];
  return {
    version: SAVE_VERSION,
    money: 85,
    fuel: starterVehicle.fuelCapacity,
    fuelMax: starterVehicle.fuelCapacity,
    rating: 4.5,
    ratingCount: 0,
    currentStage: 1,
    activeVehicle: DEFAULT_STARTER_VEHICLE_ID,
    ownedVehicles: [DEFAULT_STARTER_VEHICLE_ID],
    vehicleModes: { [DEFAULT_STARTER_VEHICLE_ID]: 'taxi' },
    currentDay: 1,
    dayTimeRemaining: DAY_DURATION_SECONDS,
    completedTrips: 0,
    totalEarnings: 0,
    totalRentalPaid: 0,
    carsPurchased: 0,
    fiveStarTrips: 0,
    achievements: [],
    soundEnabled: true,
    carSoundVolume: 0.75,
    backgroundSoundVolume: 0.65,
    cameraMode: 'chase',
    gameMode: 'taxi',
    musicTrackId: DEFAULT_MUSIC_TRACK_ID,
    musicVolume: 0.55,
    musicMuted: false,
    musicAutoSwitch: true,
    tutorialDone: false,
    tutorialBonusClaimed: false,
  };
}

export function migrateSaveObject(parsed: Record<string, unknown>): GameSaveState {
  const defaults = createInitialSaveState();

  // Owned vehicles migration & deduplication
  const ownedSet = new Set<VehicleId>([DEFAULT_STARTER_VEHICLE_ID]);
  if (Array.isArray(parsed.ownedVehicles)) {
    for (const vid of parsed.ownedVehicles) {
      if (isValidVehicleId(vid)) {
        ownedSet.add(vid);
      }
    }
  }
  const ownedVehicles = Array.from(ownedSet);

  const activeVehicle: VehicleId =
    isValidVehicleId(parsed.activeVehicle) && ownedSet.has(parsed.activeVehicle)
      ? parsed.activeVehicle
      : DEFAULT_STARTER_VEHICLE_ID;

  const activeSpec = VEHICLE_CATALOG[activeVehicle];

  // Preserve proportional fuel level if migrating from an older save with a different tank size
  let loadedFuel = activeSpec.fuelCapacity;
  if (typeof parsed.fuel === 'number' && Number.isFinite(parsed.fuel)) {
    const oldMax =
      typeof parsed.fuelMax === 'number' && Number.isFinite(parsed.fuelMax) && parsed.fuelMax > 0
        ? parsed.fuelMax
        : activeSpec.fuelCapacity;
    const ratio = Math.max(0, Math.min(1, parsed.fuel / oldMax));
    loadedFuel = Number((ratio * activeSpec.fuelCapacity).toFixed(2));
  }

  const vehicleModes: Partial<Record<VehicleId, VehicleServiceMode>> = {
    [DEFAULT_STARTER_VEHICLE_ID]: 'taxi',
  };
  if (isPlainRecord(parsed.vehicleModes)) {
    for (const [k, v] of Object.entries(parsed.vehicleModes)) {
      if (isValidVehicleId(k) && (v === 'taxi' || v === 'private')) {
        vehicleModes[k] = VEHICLE_CATALOG[k].taxiCapable ? v : 'private';
      }
    }
  }

  const rawTrackId = typeof parsed.musicTrackId === 'string' ? parsed.musicTrackId : '';
  const musicTrackId = MUSIC_TRACKS.some((t) => t.id === rawTrackId)
    ? rawTrackId
    : DEFAULT_MUSIC_TRACK_ID;

  const completedTrips =
    typeof parsed.completedTrips === 'number' && Number.isFinite(parsed.completedTrips)
      ? Math.max(0, Math.floor(parsed.completedTrips))
      : defaults.completedTrips;

  const totalEarnings =
    typeof parsed.totalEarnings === 'number' && Number.isFinite(parsed.totalEarnings)
      ? Math.max(0, parsed.totalEarnings)
      : defaults.totalEarnings;

  const rating =
    typeof parsed.rating === 'number' && Number.isFinite(parsed.rating)
      ? Math.max(1, Math.min(5, parsed.rating))
      : defaults.rating;

  const carsPurchasedFromVehicles = Math.max(0, ownedVehicles.length - 1);
  const carsPurchased =
    typeof parsed.carsPurchased === 'number' && Number.isFinite(parsed.carsPurchased)
      ? Math.max(carsPurchasedFromVehicles, Math.floor(parsed.carsPurchased))
      : carsPurchasedFromVehicles;

  const fiveStarTrips =
    typeof parsed.fiveStarTrips === 'number' && Number.isFinite(parsed.fiveStarTrips)
      ? Math.max(0, Math.floor(parsed.fiveStarTrips))
      : completedTrips > 0 && rating >= 4.95
      ? 1
      : 0;

  const savedAchievements: AchievementId[] = Array.isArray(parsed.achievements)
    ? parsed.achievements.filter(isValidAchievementId)
    : [];

  const achievements = computeEarnedAchievements({
    completedTrips,
    carsPurchased,
    ownedVehicles,
    totalEarnings,
    fiveStarTrips,
    achievements: savedAchievements,
  });

  // Stage migration: preserve saved stage (1-3) and auto-advance if older save already meets Stage 2 or 3 criteria
  let currentStage: StageId =
    parsed.currentStage === 3 ? 3 : parsed.currentStage === 2 ? 2 : 1;
  if (currentStage === 1 && hasBoughtFirstCar({ carsPurchased, ownedVehicles })) {
    currentStage = 2;
  }
  if (
    currentStage === 2 &&
    getStage3Progress({ ownedVehicles, totalEarnings, rating }).allMet
  ) {
    currentStage = 3;
  }

  return {
    ...defaults,
    version: SAVE_VERSION,
    money:
      typeof parsed.money === 'number' && Number.isFinite(parsed.money)
        ? parsed.money
        : defaults.money,
    fuel: loadedFuel,
    fuelMax: activeSpec.fuelCapacity,
    rating,
    ratingCount:
      typeof parsed.ratingCount === 'number' && Number.isFinite(parsed.ratingCount)
        ? Math.max(0, Math.floor(parsed.ratingCount))
        : defaults.ratingCount,
    currentStage,
    activeVehicle,
    ownedVehicles,
    vehicleModes,
    currentDay:
      typeof parsed.currentDay === 'number' &&
      Number.isFinite(parsed.currentDay) &&
      parsed.currentDay >= 1
        ? Math.floor(parsed.currentDay)
        : defaults.currentDay,
    dayTimeRemaining:
      typeof parsed.dayTimeRemaining === 'number' &&
      Number.isFinite(parsed.dayTimeRemaining) &&
      parsed.dayTimeRemaining > 0 &&
      parsed.dayTimeRemaining <= DAY_DURATION_SECONDS
        ? parsed.dayTimeRemaining
        : defaults.dayTimeRemaining,
    completedTrips,
    totalEarnings,
    totalRentalPaid:
      typeof parsed.totalRentalPaid === 'number' && Number.isFinite(parsed.totalRentalPaid)
        ? Math.max(0, parsed.totalRentalPaid)
        : defaults.totalRentalPaid,
    carsPurchased,
    fiveStarTrips,
    achievements,
    soundEnabled:
      typeof parsed.soundEnabled === 'boolean' ? parsed.soundEnabled : defaults.soundEnabled,
    carSoundVolume:
      typeof parsed.carSoundVolume === 'number' && Number.isFinite(parsed.carSoundVolume)
        ? Math.max(0, Math.min(1, parsed.carSoundVolume))
        : defaults.carSoundVolume,
    backgroundSoundVolume:
      typeof parsed.backgroundSoundVolume === 'number' &&
      Number.isFinite(parsed.backgroundSoundVolume)
        ? Math.max(0, Math.min(1, parsed.backgroundSoundVolume))
        : defaults.backgroundSoundVolume,
    cameraMode: parsed.cameraMode === 'overhead' ? 'overhead' : 'chase',
    gameMode: parsed.gameMode === 'freeroam' ? 'freeroam' : 'taxi',
    musicTrackId,
    musicVolume:
      typeof parsed.musicVolume === 'number' && Number.isFinite(parsed.musicVolume)
        ? Math.max(0, Math.min(1, parsed.musicVolume))
        : defaults.musicVolume,
    musicMuted: typeof parsed.musicMuted === 'boolean' ? parsed.musicMuted : defaults.musicMuted,
    musicAutoSwitch:
      typeof parsed.musicAutoSwitch === 'boolean'
        ? parsed.musicAutoSwitch
        : defaults.musicAutoSwitch,
    tutorialDone:
      typeof parsed.tutorialDone === 'boolean' ? parsed.tutorialDone : defaults.tutorialDone,
    tutorialBonusClaimed:
      typeof parsed.tutorialBonusClaimed === 'boolean'
        ? parsed.tutorialBonusClaimed
        : defaults.tutorialBonusClaimed,
  };
}

function backupCorruptRawSave(raw: string): void {
  try {
    window.localStorage.setItem(CORRUPT_BACKUP_KEY, raw);
  } catch {
    // Ignore storage quota errors
  }
}

export interface SaveLoadReport {
  state: GameSaveState;
  wasCorrupted: boolean;
  wasMigrated: boolean;
}

export function loadSaveStateWithStatus(): SaveLoadReport {
  const defaults = createInitialSaveState();
  let raw: string | null = null;

  try {
    raw = window.localStorage.getItem(SAVE_KEY);
  } catch {
    return { state: defaults, wasCorrupted: false, wasMigrated: false };
  }

  if (!raw || raw.trim().length === 0) {
    return { state: defaults, wasCorrupted: false, wasMigrated: false };
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isPlainRecord(parsed)) {
      backupCorruptRawSave(raw);
      persistSaveState(defaults);
      return { state: defaults, wasCorrupted: true, wasMigrated: false };
    }

    const hadValidShape = EXPECTED_SAVE_KEYS.some((key) => key in parsed);
    if (!hadValidShape) {
      backupCorruptRawSave(raw);
      persistSaveState(defaults);
      return { state: defaults, wasCorrupted: true, wasMigrated: false };
    }

    const wasMigrated = parsed.version !== SAVE_VERSION;
    const migrated = migrateSaveObject(parsed);
    if (wasMigrated) {
      persistSaveState(migrated);
    }
    return { state: migrated, wasCorrupted: false, wasMigrated };
  } catch {
    backupCorruptRawSave(raw);
    persistSaveState(defaults);
    return { state: defaults, wasCorrupted: true, wasMigrated: false };
  }
}

export function loadSaveState(): GameSaveState {
  return loadSaveStateWithStatus().state;
}

export function persistSaveState(state: GameSaveState): void {
  try {
    const payload: GameSaveState = { ...state, version: SAVE_VERSION };
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(payload));
  } catch {
    // Ignore storage quota errors in restricted environments
  }
}

export function resetSaveState(): GameSaveState {
  const fresh = createInitialSaveState();
  persistSaveState(fresh);
  return fresh;
}

export function exportSaveText(currentState?: GameSaveState): string {
  const state = currentState ? { ...currentState, version: SAVE_VERSION } : loadSaveState();
  return JSON.stringify(state);
}

export function importSaveText(rawText: string): {
  ok: boolean;
  state?: GameSaveState;
  error?: string;
} {
  const trimmed = rawText.trim();
  if (!trimmed) {
    return { ok: false, error: 'Paste your exported save text first.' };
  }

  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (!isPlainRecord(parsed)) {
      return { ok: false, error: 'Invalid save format. Expected save JSON text.' };
    }
    const hasKnownField = EXPECTED_SAVE_KEYS.some((key) => key in parsed);
    if (!hasKnownField) {
      return { ok: false, error: 'Unrecognized save data. Missing Metro Cab Tycoon fields.' };
    }
    const migrated = migrateSaveObject(parsed);
    persistSaveState(migrated);
    return { ok: true, state: migrated };
  } catch {
    return { ok: false, error: 'Could not parse save text. Check that you copied the full text.' };
  }
}
