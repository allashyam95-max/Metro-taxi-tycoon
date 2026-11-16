import {
  AchievementId,
  AchievementSpec,
  BusinessStageSpec,
  GameSaveState,
  StageId,
  VehicleId,
} from '../types/game';
import { VEHICLE_CATALOG } from './vehicles';

export const DAY_DURATION_SECONDS = 90;
export const FUEL_PRICE_PER_UNIT = 0.25; // $1 per 4 fuel units
export const EMERGENCY_FUEL_COST = 12;
export const EMERGENCY_FUEL_UNITS = 20;

export const STAGE_1_TARGET_CASH = 520; // Cheapest purchasable car (Veltra Nova)
export const STAGE_2_REWARD = 50;

export const STAGE_3_TARGET_EARNINGS = 1500;
export const STAGE_3_TARGET_RATING = 4.6;
export const STAGE_3_REWARD = 150;

export const BUSINESS_STAGES: BusinessStageSpec[] = [
  {
    id: 1,
    title: 'Rent an Old Car',
    shortTitle: 'Stage 1 · Daily Rental',
    summary:
      'Drive the leased Veltra Piko and pay an $18 daily rental fee until you buy your first car.',
    unlockCost: 0,
    dailyRentalFee: 18,
    defaultVehicle: 'veltra-piko',
    implemented: true,
  },
  {
    id: 2,
    title: 'Buy Your Own Car',
    shortTitle: 'Stage 2 · Owner-Operator',
    summary:
      'Own your first car to eliminate daily rental fees ($0/day) and keep 100% of your fares.',
    unlockCost: STAGE_1_TARGET_CASH,
    dailyRentalFee: 0,
    defaultVehicle: 'veltra-nova',
    implemented: true,
  },
  {
    id: 3,
    title: 'Upgrade to a Better Sedan',
    shortTitle: 'Stage 3 · Comfort Sedan',
    summary:
      'Own a Sedan-class car, reach $1,500 in total earnings, and maintain a 4.6★ driver rating.',
    unlockCost: STAGE_3_TARGET_EARNINGS,
    dailyRentalFee: 0,
    defaultVehicle: 'veltra-arden',
    implemented: true,
  },
  {
    id: 4,
    title: 'Hire Your First Driver',
    shortTitle: 'Stage 4 · Two-Car Crew',
    summary:
      'Recruit a hired driver to run your spare hatchback on autonomous city shifts for passive income.',
    unlockCost: 2600,
    dailyRentalFee: 0,
    defaultVehicle: 'norden-crest',
    implemented: false,
  },
  {
    id: 5,
    title: 'Own a Small Fleet',
    shortTitle: 'Stage 5 · City Fleet',
    summary: 'Expand with SUVs and vans covering every district simultaneously.',
    unlockCost: 6500,
    dailyRentalFee: 0,
    defaultVehicle: 'kaizo-ridgeback',
    implemented: false,
  },
  {
    id: 6,
    title: 'Open Regional Branches',
    shortTitle: 'Stage 6 · Multi-City',
    summary: 'Establish satellite taxi depots in neighboring districts with luxury executive sedans.',
    unlockCost: 14000,
    dailyRentalFee: 0,
    defaultVehicle: 'auralis-sovereign',
    implemented: false,
  },
  {
    id: 7,
    title: 'Multinational VVIP Chauffeur',
    shortTitle: 'Stage 7 · Global Luxury',
    summary: 'Operate flagship VVIP limousines and executive sedans across international hubs.',
    unlockCost: 35000,
    dailyRentalFee: 0,
    defaultVehicle: 'solenne-imperial-limo',
    implemented: false,
  },
];

export const CAREER_ACHIEVEMENTS: AchievementSpec[] = [
  {
    id: 'first-ride',
    title: 'First Ride',
    description: 'Complete your first taxi ride.',
  },
  {
    id: 'ten-rides',
    title: '10 Rides',
    description: 'Complete 10 taxi rides.',
  },
  {
    id: 'five-star-trip',
    title: '5-Star Trip',
    description: 'Earn a 5.0★ rating on a passenger trip.',
  },
  {
    id: 'first-car',
    title: 'First Car Bought',
    description: 'Buy your first car from the Metro Car Shop.',
  },
  {
    id: 'first-1000',
    title: 'First $1,000 Earned',
    description: 'Reach $1,000 in total taxi earnings.',
  },
];

export function getStageSpec(stageId: StageId): BusinessStageSpec {
  return BUSINESS_STAGES.find((s) => s.id === stageId) ?? BUSINESS_STAGES[0];
}

export function hasBoughtFirstCar(
  state: Pick<GameSaveState, 'carsPurchased' | 'ownedVehicles'>,
): boolean {
  return state.carsPurchased >= 1 || state.ownedVehicles.length >= 2;
}

export function ownsSedanClassCar(ownedVehicles: VehicleId[]): boolean {
  return ownedVehicles.some((id) => VEHICLE_CATALOG[id]?.category === 'sedan');
}

export interface Stage3Progress {
  ownsSedan: boolean;
  earnings: number;
  targetEarnings: number;
  earningsMet: boolean;
  rating: number;
  targetRating: number;
  ratingMet: boolean;
  allMet: boolean;
}

export function getStage3Progress(
  state: Pick<GameSaveState, 'ownedVehicles' | 'totalEarnings' | 'rating'>,
): Stage3Progress {
  const ownsSedan = ownsSedanClassCar(state.ownedVehicles);
  const earningsMet = state.totalEarnings >= STAGE_3_TARGET_EARNINGS;
  const ratingMet = state.rating >= STAGE_3_TARGET_RATING;
  return {
    ownsSedan,
    earnings: state.totalEarnings,
    targetEarnings: STAGE_3_TARGET_EARNINGS,
    earningsMet,
    rating: state.rating,
    targetRating: STAGE_3_TARGET_RATING,
    ratingMet,
    allMet: ownsSedan && earningsMet && ratingMet,
  };
}

export function computeEarnedAchievements(
  state: Pick<
    GameSaveState,
    'completedTrips' | 'carsPurchased' | 'ownedVehicles' | 'totalEarnings' | 'fiveStarTrips' | 'achievements'
  >,
): AchievementId[] {
  const earned = new Set<AchievementId>(state.achievements);

  if (state.completedTrips >= 1) earned.add('first-ride');
  if (state.completedTrips >= 10) earned.add('ten-rides');
  if (state.fiveStarTrips >= 1) earned.add('five-star-trip');
  if (hasBoughtFirstCar(state)) earned.add('first-car');
  if (state.totalEarnings >= 1000) earned.add('first-1000');

  return CAREER_ACHIEVEMENTS.map((a) => a.id).filter((id) => earned.has(id));
}

export function getAchievementProgress(
  id: AchievementId,
  state: Pick<
    GameSaveState,
    'completedTrips' | 'carsPurchased' | 'ownedVehicles' | 'totalEarnings' | 'fiveStarTrips' | 'achievements'
  >,
): { unlocked: boolean; progressLabel: string; ratio: number } {
  const unlocked = state.achievements.includes(id);

  switch (id) {
    case 'first-ride': {
      const c = Math.min(1, state.completedTrips);
      return {
        unlocked,
        progressLabel: unlocked ? 'Completed' : `${c} / 1 ride`,
        ratio: unlocked ? 1 : c,
      };
    }
    case 'ten-rides': {
      const c = Math.min(10, state.completedTrips);
      return {
        unlocked,
        progressLabel: unlocked ? 'Completed' : `${c} / 10 rides`,
        ratio: unlocked ? 1 : c / 10,
      };
    }
    case 'five-star-trip': {
      const c = unlocked || state.fiveStarTrips >= 1 ? 1 : 0;
      return {
        unlocked,
        progressLabel: unlocked ? 'Completed' : `${c} / 1 trip`,
        ratio: unlocked ? 1 : c,
      };
    }
    case 'first-car': {
      const bought = hasBoughtFirstCar(state) ? 1 : 0;
      return {
        unlocked,
        progressLabel: unlocked ? 'Completed' : `${bought} / 1 car`,
        ratio: unlocked ? 1 : bought,
      };
    }
    case 'first-1000': {
      const e = Math.min(1000, Math.floor(state.totalEarnings));
      return {
        unlocked,
        progressLabel: unlocked ? 'Completed' : `$${e.toLocaleString()} / $1,000`,
        ratio: unlocked ? 1 : Math.min(1, state.totalEarnings / 1000),
      };
    }
  }
}
