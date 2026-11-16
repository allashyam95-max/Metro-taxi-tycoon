import { CityStop, SurfaceType } from '../types/game';

export const ROAD_COORDS = [-84, -42, 0, 42, 84] as const;
export const BLOCK_CENTERS = [-63, -21, 21, 63] as const;
export const ROAD_WIDTH = 12;
export const ROAD_HALF_WIDTH = ROAD_WIDTH / 2;
export const LANE_OFFSET = 2.85;

// Expanded open-world sandbox bounds (360 x 360)
export const CITY_HALF_EXTENT = 96;
export const WORLD_HALF_EXTENT = 180;

// Key open-world corridor coordinates
export const HIGHWAY_Z = -112;
export const HIGHWAY_X = -112;
export const HIGHWAY_WIDTH = 18;
export const HIGHWAY_HALF_WIDTH = HIGHWAY_WIDTH / 2;

export const COAST_ROAD_X = 104;
export const SUBURB_ROAD_Z = 132;

export const DIRT_ROAD_NORTH_Z = -148;
export const DIRT_ROAD_WEST_X = -148;
export const DIRT_HALF_WIDTH = 4.6;

export const BEACH_START_X = 110;
export const WATER_START_X = 152;

export interface BoxCollider {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface CircleCollider {
  x: number;
  z: number;
  r: number;
}

export type BuildingStyle = 'flat' | 'stepped' | 'gable' | 'twin' | 'barn';

export interface BuildingSpec {
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
  color: number;
  roofColor: number;
  style: BuildingStyle;
}

export interface WallSpec {
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
  color: number;
}

export interface HillSpec {
  x: number;
  z: number;
  radius: number;
  height: number;
  color: number;
}

export interface TreeSpec {
  x: number;
  z: number;
  scale: number;
  tint: number;
  kind: 'pine' | 'palm';
}

export interface BeachPropSpec {
  x: number;
  z: number;
  color: number;
  rotY: number;
}

export interface StreetLampSpec {
  x: number;
  z: number;
  rotY: number;
}

export interface TrafficLightSpec {
  x: number;
  z: number;
  rotY: number;
  phaseGroup: 0 | 1;
}

export interface CityLayoutData {
  colliders: BoxCollider[];
  treeColliders: CircleCollider[];
  buildings: BuildingSpec[];
  walls: WallSpec[];
  hills: HillSpec[];
  trees: TreeSpec[];
  beachProps: BeachPropSpec[];
  lamps: StreetLampSpec[];
  trafficLights: TrafficLightSpec[];
  stops: CityStop[];
  fuelStations: Array<{ x: number; z: number; padRadius: number; rotY: number }>;
  rentalShop: { x: number; z: number; padRadius: number };
  parkCenter: { x: number; z: number };
}

const BUILDING_PALETTE = [
  0xe2d9c8, // warm limestone
  0xd9b89c, // sandstone
  0x94a3b8, // slate blue-gray
  0xdbe4ee, // cool plaster
  0xd68c6e, // terracotta brick
  0x9fb8a0, // sage stucco
  0xe7c888, // ochre facade
  0x7c90a8, // steel pewter
  0xcbb5c8, // muted mauve plaster
  0x84a9b8, // coastal teal
];

const SUBURB_PALETTE = [0xfef3c7, 0xfde68a, 0xe2e8f0, 0xfecdd3, 0xd1fae5, 0xfed7aa];
const SUBURB_ROOFS = [0x9a3412, 0x475569, 0x7c2d12, 0x334155];
const ROOF_PALETTE = [0x475569, 0x334155, 0x64748b, 0x78716c, 0x52525b];
const TREE_TINTS = [0x3f8f4e, 0x4ca358, 0x367d47, 0x5bb360];
const PALM_TINTS = [0x4d9f45, 0x65b349, 0x3d8b40];
const UMBRELLA_COLORS = [0xef4444, 0x38bdf8, 0xfbbf24, 0xf97316, 0xec4899, 0x10b981];

function seededRandom(seed: number): () => number {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/**
 * Returns the surface type under any world coordinate (x, z) on the single flat ground collider.
 */
export function getSurfaceType(x: number, z: number): SurfaceType {
  // 1. East Coast Beach (drivable golden sand)
  if (x >= BEACH_START_X && x < WATER_START_X) {
    return 'sand';
  }

  // 2. Paved Highways, Coastal Boulevard, Suburban Avenue & Connectors
  // North Highway
  if (z >= HIGHWAY_Z - HIGHWAY_HALF_WIDTH && z <= HIGHWAY_Z + HIGHWAY_HALF_WIDTH && x >= -168 && x <= COAST_ROAD_X + 6) {
    return 'road';
  }
  // West Highway
  if (x >= HIGHWAY_X - HIGHWAY_HALF_WIDTH && x <= HIGHWAY_X + HIGHWAY_HALF_WIDTH && z >= HIGHWAY_Z - HIGHWAY_HALF_WIDTH && z <= 166) {
    return 'road';
  }
  // Coastal Boulevard
  if (x >= COAST_ROAD_X - ROAD_HALF_WIDTH && x <= COAST_ROAD_X + ROAD_HALF_WIDTH && z >= HIGHWAY_Z - HIGHWAY_HALF_WIDTH && z <= 140) {
    return 'road';
  }
  // Suburban Avenue
  if (z >= SUBURB_ROAD_Z - ROAD_HALF_WIDTH && z <= SUBURB_ROAD_Z + ROAD_HALF_WIDTH && x >= HIGHWAY_X - HIGHWAY_HALF_WIDTH && x <= COAST_ROAD_X + ROAD_HALF_WIDTH) {
    return 'road';
  }
  // City <-> Highway / Coast / Suburb Connectors
  for (const r of [-84, 0, 84]) {
    if (Math.abs(z - r) <= ROAD_HALF_WIDTH && x >= HIGHWAY_X && x <= -84) return 'road';
    if (Math.abs(z - r) <= ROAD_HALF_WIDTH && x >= 84 && x <= COAST_ROAD_X) return 'road';
  }
  for (const r of [-42, 0, 42]) {
    if (Math.abs(x - r) <= ROAD_HALF_WIDTH && z >= HIGHWAY_Z && z <= -84) return 'road';
    if (Math.abs(x - r) <= ROAD_HALF_WIDTH && z >= 84 && z <= SUBURB_ROAD_Z) return 'road';
  }

  // 3. Central 5x5 City Grid (roads + concrete sidewalks; Central Park is drivable grass!)
  if (Math.abs(x) <= 90 && Math.abs(z) <= 90) {
    // Central Park (-21, 21) block interior is grass
    if (x >= -36 && x <= -6 && z >= 6 && z <= 36) {
      return 'grass';
    }
    return 'road';
  }

  // 4. Countryside Dirt Roads / Trails
  // North countryside dirt road (connects far west countryside across north ridge to coast road)
  if (Math.abs(z - DIRT_ROAD_NORTH_Z) <= DIRT_HALF_WIDTH && x >= -160 && x <= COAST_ROAD_X) {
    return 'dirt';
  }
  // West countryside dirt trail
  if (Math.abs(x - DIRT_ROAD_WEST_X) <= DIRT_HALF_WIDTH && z >= DIRT_ROAD_NORTH_Z - DIRT_HALF_WIDTH && z <= 160) {
    return 'dirt';
  }
  // Dirt spurs connecting Highway <-> Dirt Trails
  for (const sz of [-42, 42, SUBURB_ROAD_Z]) {
    if (Math.abs(z - sz) <= DIRT_HALF_WIDTH && x >= DIRT_ROAD_WEST_X && x <= HIGHWAY_X) {
      return 'dirt';
    }
  }
  for (const sx of [-42, 42]) {
    if (Math.abs(x - sx) <= DIRT_HALF_WIDTH && z >= DIRT_ROAD_NORTH_Z && z <= HIGHWAY_Z) {
      return 'dirt';
    }
  }

  // 5. Everything else on land (countryside plains, suburban lawns, outer verges) is grass
  return 'grass';
}

function isOnAnyPath(x: number, z: number, margin = 2.5): boolean {
  const surf = getSurfaceType(x, z);
  if (surf === 'road' || surf === 'dirt') return true;
  if (
    getSurfaceType(x + margin, z) !== 'grass' ||
    getSurfaceType(x - margin, z) !== 'grass' ||
    getSurfaceType(x, z + margin) !== 'grass' ||
    getSurfaceType(x, z - margin) !== 'grass'
  ) {
    return true;
  }
  return false;
}

export function findNearestClearRoadPoint(x: number, z: number): { x: number; z: number; heading: number } {
  const candidates: Array<{ x: number; z: number; heading: number }> = [
    { x: 2.85, z: 48, heading: 0 },
    { x: 2.85, z: 0, heading: 0 },
    { x: -39.15, z: 0, heading: 0 },
    { x: 44.85, z: 0, heading: 0 },
    { x: 2.85, z: -42, heading: 0 },
    { x: 2.85, z: 84, heading: 0 },
    { x: -112 + 4.2, z: 0, heading: 0 }, // West Highway
    { x: 0, z: -112 + 4.2, heading: -Math.PI / 2 }, // North Highway
    { x: COAST_ROAD_X - 2.85, z: 0, heading: Math.PI }, // Coastal Blvd
    { x: 0, z: SUBURB_ROAD_Z - 2.85, heading: -Math.PI / 2 }, // Suburbs Ave
    { x: -148, z: 0, heading: 0 }, // Countryside West Trail
    { x: 0, z: -148, heading: -Math.PI / 2 }, // Countryside North Trail
  ];

  let best = candidates[0];
  let bestDist = Infinity;
  for (const c of candidates) {
    const d = Math.hypot(c.x - x, c.z - z);
    if (d < bestDist) {
      bestDist = d;
      best = c;
    }
  }
  return best;
}

export function buildCityLayout(): CityLayoutData {
  const rand = seededRandom(42077);
  const colliders: BoxCollider[] = [];
  const treeColliders: CircleCollider[] = [];
  const buildings: BuildingSpec[] = [];
  const walls: WallSpec[] = [];
  const hills: HillSpec[] = [];
  const trees: TreeSpec[] = [];
  const beachProps: BeachPropSpec[] = [];
  const lamps: StreetLampSpec[] = [];
  const trafficLights: TrafficLightSpec[] = [];

  const addTree = (x: number, z: number, scale: number, tint: number, kind: 'pine' | 'palm' = 'pine') => {
    trees.push({ x, z, scale, tint, kind });
    treeColliders.push({ x, z, r: 0.46 * scale });
  };

  const addBuilding = (spec: BuildingSpec) => {
    buildings.push(spec);
    colliders.push({
      minX: spec.x - spec.w / 2,
      maxX: spec.x + spec.w / 2,
      minZ: spec.z - spec.d / 2,
      maxZ: spec.z + spec.d / 2,
    });
  };

  const addWall = (spec: WallSpec) => {
    walls.push(spec);
    colliders.push({
      minX: spec.x - spec.w / 2,
      maxX: spec.x + spec.w / 2,
      minZ: spec.z - spec.d / 2,
      maxZ: spec.z + spec.d / 2,
    });
  };

  const parkBlock = { bx: -21, bz: 21 };
  const fuelBlockWest = { bx: -63, bz: -21 };
  const fuelBlockEast = { bx: 63, bz: 21 };
  const rentalBlock = { bx: 21, bz: 63 };

  const fuelStations = [
    { x: -51.5, z: -21, padRadius: 5.5, rotY: 0 },
    { x: 51.5, z: 21, padRadius: 5.5, rotY: Math.PI },
  ];
  const rentalShop = { x: 21, z: 51.5, padRadius: 5.5 };

  // Place traffic lights on corners of central 3x3 intersections (purely visual, never blocking roads)
  const signalCoords = [-42, 0, 42];
  for (const rx of signalCoords) {
    for (const rz of signalCoords) {
      trafficLights.push(
        { x: rx - 7.1, z: rz - 7.1, rotY: 0, phaseGroup: 0 },
        { x: rx + 7.1, z: rz + 7.1, rotY: Math.PI, phaseGroup: 1 },
      );
    }
  }

  // 1. Central City Blocks (Downtown core + Midtown ring)
  for (const bx of BLOCK_CENTERS) {
    for (const bz of BLOCK_CENTERS) {
      const lampInset = 13.4;
      lamps.push(
        { x: bx - lampInset, z: bz - lampInset, rotY: Math.PI * 0.25 },
        { x: bx + lampInset, z: bz + lampInset, rotY: -Math.PI * 0.75 },
      );

      if (bx === parkBlock.bx && bz === parkBlock.bz) {
        const offsets = [
          [-10, -10],
          [10, -10],
          [-10, 10],
          [10, 10],
          [0, -11],
          [0, 11],
          [-11, 0],
          [11, 0],
        ];
        for (const [ox, oz] of offsets) {
          addTree(
            bx + ox + (rand() - 0.5) * 1.4,
            bz + oz + (rand() - 0.5) * 1.4,
            0.9 + rand() * 0.35,
            TREE_TINTS[Math.floor(rand() * TREE_TINTS.length)],
          );
        }
        // Fountain water/basin centerpiece collider
        colliders.push({
          minX: bx - 2.6,
          maxX: bx + 2.6,
          minZ: bz - 2.6,
          maxZ: bz + 2.6,
        });
        continue;
      }

      if (bx === fuelBlockWest.bx && bz === fuelBlockWest.bz) {
        addBuilding({
          x: bx - 8,
          z: bz,
          w: 8,
          d: 12,
          h: 5.2,
          color: 0xe2e8f0,
          roofColor: 0x0284c7,
          style: 'flat',
        });
        // Pump island at -51.5 - 4.2 = -55.7
        colliders.push({
          minX: -56.9,
          maxX: -54.5,
          minZ: bz - 3.6,
          maxZ: bz + 3.6,
        });
        addTree(bx - 10, bz - 11, 1.0, TREE_TINTS[0]);
        addTree(bx - 10, bz + 11, 1.1, TREE_TINTS[1]);
        continue;
      }

      if (bx === fuelBlockEast.bx && bz === fuelBlockEast.bz) {
        addBuilding({
          x: bx + 8,
          z: bz,
          w: 8,
          d: 12,
          h: 5.2,
          color: 0xe2e8f0,
          roofColor: 0x0284c7,
          style: 'flat',
        });
        // Pump island at 51.5 + 4.2 = 55.7
        colliders.push({
          minX: 54.5,
          maxX: 56.9,
          minZ: bz - 3.6,
          maxZ: bz + 3.6,
        });
        addTree(bx + 10, bz - 11, 1.0, TREE_TINTS[2]);
        addTree(bx + 10, bz + 11, 1.1, TREE_TINTS[0]);
        continue;
      }

      if (bx === rentalBlock.bx && bz === rentalBlock.bz) {
        addBuilding({
          x: bx,
          z: bz + 6,
          w: 18,
          d: 10,
          h: 6.5,
          color: 0xfef3c7,
          roofColor: 0xd97706,
          style: 'stepped',
        });
        addTree(bx - 11, bz - 10, 0.95, TREE_TINTS[2]);
        addTree(bx + 11, bz - 10, 1.05, TREE_TINTS[1]);
        continue;
      }

      const subLayout = rand();
      const quadrantOffsets =
        subLayout < 0.65
          ? [
              { ox: -6.4, oz: -6.4, maxW: 10.8, maxD: 10.8 },
              { ox: 6.4, oz: -6.4, maxW: 10.8, maxD: 10.8 },
              { ox: -6.4, oz: 6.4, maxW: 10.8, maxD: 10.8 },
              { ox: 6.4, oz: 6.4, maxW: 10.8, maxD: 10.8 },
            ]
          : [
              { ox: -6.5, oz: 0, maxW: 10.8, maxD: 21 },
              { ox: 6.5, oz: -6.2, maxW: 10.8, maxD: 10.5 },
              { ox: 6.5, oz: 6.2, maxW: 10.8, maxD: 10.5 },
            ];

      const isDowntown = Math.abs(bx) <= 25 && Math.abs(bz) <= 25;

      for (const slot of quadrantOffsets) {
        if (rand() < 0.14) {
          addTree(
            bx + slot.ox,
            bz + slot.oz,
            0.95 + rand() * 0.3,
            TREE_TINTS[Math.floor(rand() * TREE_TINTS.length)],
          );
          continue;
        }

        const w = slot.maxW * (0.76 + rand() * 0.18);
        const d = slot.maxD * (0.76 + rand() * 0.18);
        const minH = isDowntown ? 18 : 6.5;
        const maxH = isDowntown ? 40 : 18;
        const h = minH + rand() * (maxH - minH);
        const color = BUILDING_PALETTE[Math.floor(rand() * BUILDING_PALETTE.length)];
        const roofColor = ROOF_PALETTE[Math.floor(rand() * ROOF_PALETTE.length)];

        const styleRoll = rand();
        let style: BuildingStyle = 'flat';
        if (h > 24) {
          style = styleRoll < 0.55 ? 'stepped' : 'twin';
        } else if (h < 12 && styleRoll > 0.5) {
          style = 'gable';
        } else if (styleRoll > 0.45) {
          style = 'stepped';
        }

        addBuilding({
          x: bx + slot.ox,
          z: bz + slot.oz,
          w,
          d,
          h,
          color,
          roofColor,
          style,
        });
      }
    }
  }

  // 2. Suburbs (South neighborhoods along Suburban Ave z = 132, open lawns & gable homes)
  const suburbClusters = [-72, -56, -24, -14, 14, 24, 56, 72];
  for (const hx of suburbClusters) {
    for (const hz of [109, 155]) {
      const w = 8.4 + rand() * 2.2;
      const d = 7.4 + rand() * 1.8;
      const h = 4.6 + rand() * 2.2;
      addBuilding({
        x: hx,
        z: hz,
        w,
        d,
        h,
        color: SUBURB_PALETTE[Math.floor(rand() * SUBURB_PALETTE.length)],
        roofColor: SUBURB_ROOFS[Math.floor(rand() * SUBURB_ROOFS.length)],
        style: 'gable',
      });

      // Yard trees beside suburban houses
      if (rand() < 0.75) {
        const tx = hx + (rand() < 0.5 ? -6.5 : 6.5);
        const tz = hz + (hz < 132 ? -6.5 : 6.5);
        if (!isOnAnyPath(tx, tz, 3)) {
          addTree(tx, tz, 0.9 + rand() * 0.3, TREE_TINTS[Math.floor(rand() * TREE_TINTS.length)]);
        }
      }
    }
  }

  // Suburban streetlamps
  for (let sx = -84; sx <= 84; sx += 28) {
    lamps.push({ x: sx, z: SUBURB_ROAD_Z - 7.5, rotY: Math.PI * 0.5 });
  }

  // 3. Highway Rest Stop / Diner & Highway Lights
  addBuilding({
    x: -72,
    z: -97,
    w: 12,
    d: 6.5,
    h: 5.0,
    color: 0xfef3c7,
    roofColor: 0xb91c1c,
    style: 'flat',
  });
  for (let hx = -150; hx <= 90; hx += 36) {
    lamps.push({ x: hx, z: HIGHWAY_Z - HIGHWAY_HALF_WIDTH - 1.2, rotY: Math.PI * 0.5 });
  }
  for (let hz = -90; hz <= 150; hz += 36) {
    lamps.push({ x: HIGHWAY_X - HIGHWAY_HALF_WIDTH - 1.2, z: hz, rotY: 0 });
  }

  // 4. Countryside Farms, Barns, Stone Walls & Rolling Low-Poly Hills
  const farmBuildings: Array<{ x: number; z: number; w: number; d: number; h: number; color: number; roofColor: number; style: BuildingStyle }> = [
    { x: -162, z: -70, w: 10, d: 13, h: 6.5, color: 0xb91c1c, roofColor: 0x475569, style: 'barn' },
    { x: -132, z: 16, w: 8.5, d: 8.5, h: 5.0, color: 0xfef3c7, roofColor: 0x7c2d12, style: 'gable' },
    { x: -162, z: 92, w: 10, d: 12, h: 6.0, color: 0xc2410c, roofColor: 0x334155, style: 'barn' },
    { x: -74, z: -162, w: 9, d: 8, h: 5.0, color: 0xfde68a, roofColor: 0x78716c, style: 'gable' },
    { x: 18, z: -162, w: 11, d: 8.5, h: 6.2, color: 0xb91c1c, roofColor: 0x334155, style: 'barn' },
    { x: 76, z: -162, w: 8.5, d: 8, h: 5.0, color: 0xe2e8f0, roofColor: 0x475569, style: 'gable' },
  ];
  for (const fb of farmBuildings) {
    addBuilding(fb);
  }

  // Countryside rustic stone walls framing meadows / hills
  const meadowWalls: WallSpec[] = [
    { x: -132, z: -70, w: 0.9, d: 20, h: 1.1, color: 0x94a3b8 },
    { x: -164, z: -12, w: 14, d: 0.9, h: 1.1, color: 0x94a3b8 },
    { x: -132, z: 88, w: 0.9, d: 22, h: 1.1, color: 0x94a3b8 },
    { x: -16, z: -162, w: 24, d: 0.9, h: 1.1, color: 0x94a3b8 },
  ];
  for (const mw of meadowWalls) {
    addWall(mw);
  }

  // Countryside rolling hills placed outside/along perimeter ridges & fenced hillside pockets
  const hillConfigs: HillSpec[] = [
    // West countryside rolling ridge (behind boundary wall)
    { x: -206, z: -135, radius: 34, height: 24, color: 0x5c9454 },
    { x: -214, z: -65, radius: 40, height: 30, color: 0x67a15e },
    { x: -204, z: 15, radius: 36, height: 26, color: 0x568d4f },
    { x: -212, z: 95, radius: 42, height: 32, color: 0x65995d },
    { x: -202, z: 165, radius: 34, height: 22, color: 0x5c9454 },
    // North countryside rolling ridge
    { x: -145, z: -206, radius: 36, height: 26, color: 0x65995d },
    { x: -75, z: -214, radius: 42, height: 32, color: 0x568d4f },
    { x: 5, z: -208, radius: 38, height: 28, color: 0x67a15e },
    { x: 80, z: -212, radius: 36, height: 25, color: 0x5c9454 },
    // South horizon hills
    { x: -135, z: 208, radius: 36, height: 24, color: 0x5c9454 },
    { x: -45, z: 214, radius: 40, height: 28, color: 0x67a15e },
    { x: 50, z: 208, radius: 34, height: 22, color: 0x568d4f },
  ];
  hills.push(...hillConfigs);

  // Countryside scattered trees (always clear of roads, dirt paths, buildings & walls)
  for (let i = 0; i < 95; i++) {
    const inNorth = i % 2 === 0;
    const tx = inNorth ? -168 + rand() * 265 : -170 + rand() * 44;
    const tz = inNorth ? -170 + rand() * 42 : -132 + rand() * 295;
    if (isOnAnyPath(tx, tz, 4.0)) continue;
    const hitsBuilding = colliders.some(
      (c) => tx >= c.minX - 3.5 && tx <= c.maxX + 3.5 && tz >= c.minZ - 3.5 && tz <= c.maxZ + 3.5,
    );
    if (hitsBuilding) continue;
    addTree(tx, tz, 1.0 + rand() * 0.45, TREE_TINTS[Math.floor(rand() * TREE_TINTS.length)], 'pine');
  }

  // 5. Beach & Ocean Coastline (East side x >= 110)
  // Beach lifeguard / snack shack
  addBuilding({
    x: 120,
    z: 14,
    w: 6.5,
    d: 7.5,
    h: 4.4,
    color: 0xfef9c3,
    roofColor: 0x0284c7,
    style: 'gable',
  });

  // Palm trees along beach boardwalk & dunes
  for (let pz = -156; pz <= 156; pz += 22) {
    const px = 117 + (rand() - 0.5) * 6;
    if (Math.abs(pz - 14) > 9) {
      addTree(px, pz, 1.05 + rand() * 0.3, PALM_TINTS[Math.floor(rand() * PALM_TINTS.length)], 'palm');
    }
    if (rand() < 0.55) {
      const px2 = 132 + (rand() - 0.5) * 6;
      if (Math.abs(pz - 14) > 9) {
        addTree(px2, pz + 7, 0.95 + rand() * 0.3, PALM_TINTS[Math.floor(rand() * PALM_TINTS.length)], 'palm');
      }
    }
  }

  // Colorful beach umbrellas & towels on the sand (visual beach props, non-blocking)
  for (let pz = -110; pz <= 110; pz += 18) {
    beachProps.push({
      x: 138 + (rand() - 0.5) * 8,
      z: pz + (rand() - 0.5) * 5,
      color: UMBRELLA_COLORS[Math.floor(rand() * UMBRELLA_COLORS.length)],
      rotY: rand() * Math.PI * 2,
    });
  }

  // 6. Perimeter Boundary Walls (West, North, South) & Ocean Water Blocker (East x >= 152)
  // West wall x = -176
  addWall({ x: -176, z: 0, w: 2.2, d: 354, h: 2.2, color: 0x64748b });
  // North wall z = -176 (up to beach edge x = 152)
  addWall({ x: -12, z: -176, w: 328, d: 2.2, h: 2.2, color: 0x64748b });
  // South wall z = 176 (up to beach edge x = 152)
  addWall({ x: -12, z: 176, w: 328, d: 2.2, h: 2.2, color: 0x64748b });

  // Ocean water collider (blocks driving into deep ocean beyond shoreline x = 152)
  colliders.push({
    minX: WATER_START_X,
    maxX: 320,
    minZ: -320,
    maxZ: 320,
  });

  // 7. City + Open-World Stops (existing 16 city stops + 4 scenic regional stops)
  const stops: CityStop[] = [
    { id: 'central-station', label: 'Central Station', district: 'Downtown', x: -5.3, z: -21 },
    { id: 'oakwood-park', label: 'Oakwood Park', district: 'Downtown', x: -36.7, z: 21 },
    { id: 'civic-library', label: 'Civic Library', district: 'Midtown', x: 5.3, z: -63 },
    { id: 'harbor-pier', label: 'Harbor Pier', district: 'North Quay', x: -63, z: -78.7 },
    { id: 'neon-cinema', label: 'Grand Cinema', district: 'Arts Quarter', x: 47.3, z: -21 },
    { id: 'tech-plaza', label: 'Tech Hub Plaza', district: 'Downtown', x: 47.3, z: 21 },
    { id: 'old-bakery', label: 'Old Town Bakery', district: 'Old Town', x: -63, z: 36.7 },
    { id: 'sunset-mall', label: 'Sunset Arcade', district: 'West End', x: -78.7, z: -63 },
    { id: 'metro-hospital', label: 'Metro General', district: 'Eastside', x: 78.7, z: -21 },
    { id: 'university-gate', label: 'University Gate', district: 'Campus', x: 63, z: -78.7 },
    { id: 'riverside-market', label: 'Riverside Market', district: 'Southbank', x: -21, z: 78.7 },
    { id: 'grand-hotel', label: 'Grand Avenue Hotel', district: 'Downtown', x: 21, z: -5.3 },
    { id: 'eastside-diner', label: 'Eastside Diner', district: 'Eastside', x: 63, z: 47.3 },
    { id: 'art-museum', label: 'Modern Art Hall', district: 'Downtown', x: 5.3, z: 21 },
    { id: 'clocktower-sq', label: 'Clocktower Square', district: 'Downtown', x: -21, z: -36.7 },
    { id: 'city-hall', label: 'City Hall Steps', district: 'Civic Center', x: -36.7, z: -63 },
    // Regional Open-World Stops
    { id: 'palm-beach', label: 'Palm Beach Boardwalk', district: 'Beach', x: 109.5, z: 14 },
    { id: 'sunny-suburbs', label: 'Maple Lane Suburbs', district: 'Suburbs', x: -18, z: 126.5 },
    { id: 'highway-diner', label: 'Route 101 Diner', district: 'Highway', x: -72, z: -102.5 },
    { id: 'valley-farm', label: 'Meadowview Barn', district: 'Countryside', x: -148, z: -65 },
  ];

  return {
    colliders,
    treeColliders,
    buildings,
    walls,
    hills,
    trees,
    beachProps,
    lamps,
    trafficLights,
    stops,
    fuelStations,
    rentalShop,
    parkCenter: { x: parkBlock.bx, z: parkBlock.bz },
  };
}
