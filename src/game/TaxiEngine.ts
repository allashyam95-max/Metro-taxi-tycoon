import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { soundEngine } from '../audio/soundEngine';
import {
  CAREER_ACHIEVEMENTS,
  computeEarnedAchievements,
  DAY_DURATION_SECONDS,
  EMERGENCY_FUEL_COST,
  EMERGENCY_FUEL_UNITS,
  FUEL_PRICE_PER_UNIT,
  getStage3Progress,
  getStageSpec,
  hasBoughtFirstCar,
  STAGE_2_REWARD,
  STAGE_3_REWARD,
} from '../config/stages';
import { VEHICLE_CATALOG } from '../config/vehicles';
import { persistSaveState } from '../storage/saveSystem';
import {
  AchievementSpec,
  ActiveTrip,
  CameraMode,
  ControlInput,
  DaySummary,
  FareReceipt,
  GameMode,
  GameSaveState,
  MinimapSnapshot,
  PassengerMarker,
  StageUpEvent,
  SurfaceType,
  VehicleId,
  VehicleServiceMode,
} from '../types/game';
import {
  BEACH_START_X,
  BLOCK_CENTERS,
  BoxCollider,
  CITY_HALF_EXTENT,
  COAST_ROAD_X,
  CircleCollider,
  CityLayoutData,
  DIRT_HALF_WIDTH,
  DIRT_ROAD_NORTH_Z,
  DIRT_ROAD_WEST_X,
  HIGHWAY_HALF_WIDTH,
  HIGHWAY_WIDTH,
  HIGHWAY_X,
  HIGHWAY_Z,
  LANE_OFFSET,
  ROAD_COORDS,
  ROAD_WIDTH,
  SUBURB_ROAD_Z,
  WATER_START_X,
  WORLD_HALF_EXTENT,
  buildCityLayout,
  findNearestClearRoadPoint,
  getSurfaceType,
} from './cityLayout';
import {
  PassengerMeshRig,
  PlayerTaxiRig,
  SkyDomeRig,
  createBuildingTextures,
  createDirtTexture,
  createDropoffMarkerMesh,
  createFuelStationGroup,
  createHighwayTexture,
  createIntersectionTexture,
  createPassengerMarkerMesh,
  createPlayerTaxiMesh,
  createRentalShopDecor,
  createRoadTexture,
  createSignTexture,
  createSkyDome,
  createTrafficCarMesh,
  disposeCarRig,
} from './models';

const _vec3A = new THREE.Vector3();
const _camTarget = new THREE.Vector3();
const _camPosTarget = new THREE.Vector3();
const _dummyObj = new THREE.Object3D();
const _tmpColor = new THREE.Color();

const DAY_TOP_COLOR = new THREE.Color(0x4b8dd6);
const SUNSET_TOP_COLOR = new THREE.Color(0x454d8c);
const NIGHT_TOP_COLOR = new THREE.Color(0x0b1226);

const DAY_HORIZON_COLOR = new THREE.Color(0xc5e1f7);
const SUNSET_HORIZON_COLOR = new THREE.Color(0xf29f74);
const NIGHT_HORIZON_COLOR = new THREE.Color(0x18233f);

const DAY_SUN_COLOR = new THREE.Color(0xfff4dc);
const SUNSET_SUN_COLOR = new THREE.Color(0xffa463);
const NIGHT_MOON_COLOR = new THREE.Color(0x93c5fd);

const DAY_HEMI_SKY = new THREE.Color(0xdbeafe);
const NIGHT_HEMI_SKY = new THREE.Color(0x334155);
const DAY_HEMI_GND = new THREE.Color(0x64748b);
const NIGHT_HEMI_GND = new THREE.Color(0x0f172a);

const PASSENGER_NAMES = [
  'Maya Lin',
  'Carlos Vega',
  'Hannah Brooks',
  'Devon Patel',
  'Sofia Rossi',
  'Liam O’Connor',
  'Noah Kim',
  'Clara Vance',
  'Tariq Hassan',
  'Elena Novak',
];

const SHIRT_COLORS = [0x3b82f6, 0xec4899, 0x14b8a6, 0xf97316, 0x8b5cf6, 0xef4444];

interface TrafficAgent {
  group: THREE.Group;
  wheels: THREE.Mesh[];
  x: number;
  z: number;
  dirIndex: number; // 0: North (-Z), 1: East (+X), 2: South (+Z), 3: West (-X)
  speed: number;
  maxSpeed: number;
  lastIntersectionKey: string;
  hornCooldown: number;
  blockedTime: number;
}

interface ActivePassengerNode {
  data: PassengerMarker;
  rig: PassengerMeshRig;
}

export interface TaxiEngineCallbacks {
  onStateChange: (state: GameSaveState) => void;
  onMinimapUpdate: (snapshot: MinimapSnapshot) => void;
  onFareComplete: (receipt: FareReceipt) => void;
  onDayComplete: (summary: DaySummary) => void;
  onStageUp?: (event: StageUpEvent) => void;
  onAchievementUnlock?: (achievement: AchievementSpec) => void;
  onNotice: (message: string, tone: 'info' | 'warning' | 'success') => void;
  onWebglError: (message: string) => void;
}

const DIR_VECTORS: ReadonlyArray<{ dx: number; dz: number; yaw: number }> = [
  { dx: 0, dz: -1, yaw: 0 }, // North (-Z)
  { dx: 1, dz: 0, yaw: -Math.PI / 2 }, // East (+X)
  { dx: 0, dz: 1, yaw: Math.PI }, // South (+Z)
  { dx: -1, dz: 0, yaw: Math.PI / 2 }, // West (-X)
];

function detectSoftwareWebGL(): boolean {
  const probeCanvas = document.createElement('canvas');
  const gl = probeCanvas.getContext('webgl2');
  if (!gl) return true;
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
  const gpu = String(gl.getParameter(param));
  gl.getExtension('WEBGL_lose_context')?.loseContext();
  return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
}

export class TaxiEngine {
  private container: HTMLElement;
  private callbacks: TaxiEngineCallbacks;
  private saveState: GameSaveState;
  private city: CityLayoutData;

  private isSoftwareGl: boolean;
  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private dirLight!: THREE.DirectionalLight;
  private hemiLight!: THREE.HemisphereLight;
  private rimLight!: THREE.DirectionalLight;
  private skyDome!: SkyDomeRig;
  private buildingWindowMats: THREE.MeshStandardMaterial[] = [];
  private streetLampBulbMat!: THREE.MeshStandardMaterial;
  private trafficSignalMats: Array<{
    red: THREE.MeshStandardMaterial;
    amber: THREE.MeshStandardMaterial;
    green: THREE.MeshStandardMaterial;
  }> = [];
  private clock = new THREE.Clock();

  private frameId = 0;
  private isDisposed = false;
  private isPaused = false;
  private contextLost = false;

  // Player state
  private playerRig!: PlayerTaxiRig;
  private guideArrow!: THREE.Group;
  private guideArrowMat!: THREE.MeshStandardMaterial;
  private playerX = 2.85;
  private playerZ = 48;
  private playerHeading = 0; // radians, 0 = North (-Z)
  private playerSpeed = 0;
  private velX = 0;
  private velZ = 0;
  private steerAngle = 0;
  private smoothThrottle = 0;
  private smoothBrake = 0;
  private bumpCooldown = 0;
  private surfaceSpeedMult = 1;
  private surfaceGripMult = 1;
  private currentSurface: SurfaceType = 'road';
  private shorelineFoamMesh?: THREE.Mesh;

  // Camera smoothing & collision shake
  private camModeBlend = 0;
  private camLookCurrent = new THREE.Vector3();
  private camInitialized = false;
  private cameraShakeIntensity = 0;
  private cameraShakeTime = 0;

  // Input state
  private controlInput: ControlInput = { throttle: 0, steer: 0, brake: false };

  // World entities
  private traffic: TrafficAgent[] = [];
  private passengerPool: ActivePassengerNode[] = [];
  private activeTrip: ActiveTrip | null = null;
  private dropoffRig!: { group: THREE.Group; pillar: THREE.Mesh; ring: THREE.Mesh };

  // Day tracking
  private tripsToday = 0;
  private earningsToday = 0;
  private receiptCounter = 0;
  private dayEventCounter = 0;
  private stageEventCounter = 0;

  // Timers for throttling React HUD sync
  private hudSyncTimer = 0;
  private saveSyncTimer = 0;
  private refuelCooldown = 0;
  private disposables: Array<{ dispose: () => void }> = [];

  constructor(
    container: HTMLElement,
    initialState: GameSaveState,
    callbacks: TaxiEngineCallbacks,
  ) {
    this.container = container;
    this.saveState = { ...initialState };
    this.camModeBlend = initialState.cameraMode === 'overhead' ? 1 : 0;
    this.callbacks = callbacks;
    this.city = buildCityLayout();
    this.isSoftwareGl = detectSoftwareWebGL();

    this.initThree();
    this.buildEnvironment();
    this.buildPlayer();
    this.spawnTraffic();
    this.ensurePassengerMarkers();

    window.addEventListener('resize', this.handleResize);
    this.clock.start();
    this.tick();
  }

  private getTargetPixelRatio(): number {
    if (this.isSoftwareGl) return 1;
    const isSmallMobile = window.innerWidth < 768;
    return Math.min(window.devicePixelRatio, isSmallMobile ? 1.5 : 2);
  }

  private initThree(): void {
    const width = Math.max(1, this.container.clientWidth || window.innerWidth);
    const height = Math.max(1, this.container.clientHeight || window.innerHeight);

    this.scene = new THREE.Scene();
    const skyColor = 0xc5e1f7;
    this.scene.background = new THREE.Color(skyColor);
    this.scene.fog = new THREE.Fog(skyColor, 115, 300);

    this.camera = new THREE.PerspectiveCamera(58, width / height, 0.3, 440);
    this.camera.position.set(this.playerX, 9, this.playerZ + 14);

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(this.getTargetPixelRatio());
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const canvas = this.renderer.domElement;
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.addEventListener('webglcontextlost', this.handleContextLost);
    canvas.addEventListener('webglcontextrestored', this.handleContextRestored);

    this.container.innerHTML = '';
    this.container.appendChild(canvas);

    // Sky gradient dome
    this.skyDome = createSkyDome();
    this.scene.add(this.skyDome.mesh);

    // Studio PMREM Environment for crisp metallic/glass reflections
    const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    const envTex = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environment = envTex;
    this.disposables.push(envTex);
    pmremGenerator.dispose();

    // Balanced 3-point outdoor lighting rig
    this.hemiLight = new THREE.HemisphereLight(0xdbeafe, 0x64748b, 0.85);
    this.scene.add(this.hemiLight);

    this.dirLight = new THREE.DirectionalLight(0xfff4dc, 1.55);
    this.dirLight.position.set(55, 85, 45);
    this.dirLight.castShadow = !this.isSoftwareGl;
    this.dirLight.shadow.mapSize.width = 1024;
    this.dirLight.shadow.mapSize.height = 1024;
    this.dirLight.shadow.camera.near = 10;
    this.dirLight.shadow.camera.far = 210;
    const d = 55;
    this.dirLight.shadow.camera.left = -d;
    this.dirLight.shadow.camera.right = d;
    this.dirLight.shadow.camera.top = d;
    this.dirLight.shadow.camera.bottom = -d;
    this.dirLight.shadow.bias = -0.0005;
    this.dirLight.shadow.normalBias = 0.02;
    this.scene.add(this.dirLight);
    this.scene.add(this.dirLight.target);

    this.rimLight = new THREE.DirectionalLight(0xbae6fd, 0.42);
    this.rimLight.position.set(-60, 40, -60);
    this.scene.add(this.rimLight);
  }

  private buildEnvironment(): void {
    const maxAniso = this.renderer.capabilities.getMaxAnisotropy();

    // Extended surrounding grass terrain (one flat ground plane, y = 0)
    const terrainGeo = new THREE.PlaneGeometry(760, 760);
    const terrainMat = new THREE.MeshStandardMaterial({
      color: 0x72a863,
      roughness: 0.95,
      metalness: 0.0,
    });
    const terrain = new THREE.Mesh(terrainGeo, terrainMat);
    terrain.rotation.x = -Math.PI / 2;
    terrain.position.y = 0.0;
    terrain.receiveShadow = true;
    this.scene.add(terrain);
    this.disposables.push(terrainGeo, terrainMat);

    // East Coast Golden Sand Beach (drivable flat sand)
    const beachWidth = WATER_START_X - BEACH_START_X + 6;
    const beachGeo = new THREE.PlaneGeometry(beachWidth, WORLD_HALF_EXTENT * 2 + 120);
    const beachMat = new THREE.MeshStandardMaterial({
      color: 0xeed49a,
      roughness: 0.94,
      metalness: 0.0,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    const beach = new THREE.Mesh(beachGeo, beachMat);
    beach.rotation.x = -Math.PI / 2;
    beach.position.set(BEACH_START_X + beachWidth / 2 - 2, 0.006, 0);
    beach.receiveShadow = true;
    this.scene.add(beach);
    this.disposables.push(beachGeo, beachMat);

    // Beach wooden boardwalk (flush & drivable)
    const boardwalkGeo = new THREE.BoxGeometry(4.2, 0.04, 152);
    const boardwalkMat = new THREE.MeshStandardMaterial({ color: 0xa1764b, roughness: 0.88 });
    const boardwalk = new THREE.Mesh(boardwalkGeo, boardwalkMat);
    boardwalk.position.set(113, 0.02, 0);
    boardwalk.receiveShadow = true;
    this.scene.add(boardwalk);
    this.disposables.push(boardwalkGeo, boardwalkMat);

    // Ocean Water (shallow turquoise surf + deep coastal blue)
    const surfGeo = new THREE.PlaneGeometry(16, WORLD_HALF_EXTENT * 2 + 220);
    const surfMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      roughness: 0.18,
      metalness: 0.15,
    });
    const surf = new THREE.Mesh(surfGeo, surfMat);
    surf.rotation.x = -Math.PI / 2;
    surf.position.set(WATER_START_X + 8, 0.01, 0);
    this.scene.add(surf);

    const deepOceanGeo = new THREE.PlaneGeometry(220, WORLD_HALF_EXTENT * 2 + 260);
    const deepOceanMat = new THREE.MeshStandardMaterial({
      color: 0x0284c7,
      roughness: 0.22,
      metalness: 0.2,
    });
    const deepOcean = new THREE.Mesh(deepOceanGeo, deepOceanMat);
    deepOcean.rotation.x = -Math.PI / 2;
    deepOcean.position.set(WATER_START_X + 126, 0.01, 0);
    this.scene.add(deepOcean);

    const foamGeo = new THREE.PlaneGeometry(2.2, WORLD_HALF_EXTENT * 2 + 160);
    const foamMat = new THREE.MeshBasicMaterial({
      color: 0xe0f2fe,
      transparent: true,
      opacity: 0.65,
      depthWrite: false,
    });
    this.shorelineFoamMesh = new THREE.Mesh(foamGeo, foamMat);
    this.shorelineFoamMesh.rotation.x = -Math.PI / 2;
    this.shorelineFoamMesh.position.set(WATER_START_X + 0.6, 0.02, 0);
    this.scene.add(this.shorelineFoamMesh);
    this.disposables.push(surfGeo, surfMat, deepOceanGeo, deepOceanMat, foamGeo, foamMat);

    // City asphalt base pad
    const cityBaseGeo = new THREE.PlaneGeometry(CITY_HALF_EXTENT * 2 - 4, CITY_HALF_EXTENT * 2 - 4);
    const cityBaseMat = new THREE.MeshStandardMaterial({
      color: 0x333b48,
      roughness: 0.9,
      metalness: 0.05,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    const cityBase = new THREE.Mesh(cityBaseGeo, cityBaseMat);
    cityBase.rotation.x = -Math.PI / 2;
    cityBase.position.y = 0.005;
    cityBase.receiveShadow = true;
    this.scene.add(cityBase);
    this.disposables.push(cityBaseGeo, cityBaseMat);

    // Road strips with procedural lane markings (offset Y = 0.015 to avoid z-fighting)
    const roadTexNS = createRoadTexture(maxAniso);
    roadTexNS.repeat.set(1, 14);
    const roadMatNS = new THREE.MeshStandardMaterial({
      map: roadTexNS,
      roughness: 0.85,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });

    const roadTexEW = createRoadTexture(maxAniso);
    roadTexEW.repeat.set(1, 14);
    roadTexEW.center.set(0.5, 0.5);
    roadTexEW.rotation = Math.PI / 2;
    const roadMatEW = new THREE.MeshStandardMaterial({
      map: roadTexEW,
      roughness: 0.85,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });

    const roadLen = CITY_HALF_EXTENT * 2 - 4;
    const roadStripGeoNS = new THREE.PlaneGeometry(ROAD_WIDTH, roadLen);
    const roadStripGeoEW = new THREE.PlaneGeometry(ROAD_WIDTH, roadLen);

    for (const r of ROAD_COORDS) {
      const roadNS = new THREE.Mesh(roadStripGeoNS, roadMatNS);
      roadNS.rotation.x = -Math.PI / 2;
      roadNS.position.set(r, 0.015, 0);
      roadNS.receiveShadow = true;
      this.scene.add(roadNS);

      const roadEW = new THREE.Mesh(roadStripGeoEW, roadMatEW);
      roadEW.rotation.x = -Math.PI / 2;
      roadEW.rotation.z = Math.PI / 2;
      roadEW.position.set(0, 0.018, r);
      roadEW.receiveShadow = true;
      this.scene.add(roadEW);
    }

    // Highway 4-lane Expressway (North & West loops)
    const hwyTexNS = createHighwayTexture(maxAniso);
    hwyTexNS.repeat.set(1, 18);
    const hwyMatNS = new THREE.MeshStandardMaterial({
      map: hwyTexNS,
      roughness: 0.82,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });

    const hwyTexEW = createHighwayTexture(maxAniso);
    hwyTexEW.repeat.set(1, 18);
    hwyTexEW.center.set(0.5, 0.5);
    hwyTexEW.rotation = Math.PI / 2;
    const hwyMatEW = new THREE.MeshStandardMaterial({
      map: hwyTexEW,
      roughness: 0.82,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });

    const northHwyLen = COAST_ROAD_X + 6 - -168;
    const northHwy = new THREE.Mesh(new THREE.PlaneGeometry(HIGHWAY_WIDTH, northHwyLen), hwyMatEW);
    northHwy.rotation.x = -Math.PI / 2;
    northHwy.rotation.z = Math.PI / 2;
    northHwy.position.set((-168 + COAST_ROAD_X + 6) / 2, 0.014, HIGHWAY_Z);
    northHwy.receiveShadow = true;
    this.scene.add(northHwy);

    const westHwyLen = 166 - (HIGHWAY_Z - HIGHWAY_HALF_WIDTH);
    const westHwy = new THREE.Mesh(new THREE.PlaneGeometry(HIGHWAY_WIDTH, westHwyLen), hwyMatNS);
    westHwy.rotation.x = -Math.PI / 2;
    westHwy.position.set(HIGHWAY_X, 0.016, (166 + HIGHWAY_Z - HIGHWAY_HALF_WIDTH) / 2);
    westHwy.receiveShadow = true;
    this.scene.add(westHwy);

    // Coastal Boulevard (East coast x = 104)
    const coastLen = 140 - (HIGHWAY_Z - HIGHWAY_HALF_WIDTH);
    const coastRoad = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_WIDTH, coastLen), roadMatNS);
    coastRoad.rotation.x = -Math.PI / 2;
    coastRoad.position.set(COAST_ROAD_X, 0.015, (140 + HIGHWAY_Z - HIGHWAY_HALF_WIDTH) / 2);
    coastRoad.receiveShadow = true;
    this.scene.add(coastRoad);

    // Suburban Avenue (South neighborhood z = 132)
    const subLen = COAST_ROAD_X + 6 - (HIGHWAY_X - HIGHWAY_HALF_WIDTH);
    const subRoad = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_WIDTH, subLen), roadMatEW);
    subRoad.rotation.x = -Math.PI / 2;
    subRoad.rotation.z = Math.PI / 2;
    subRoad.position.set((COAST_ROAD_X + 6 + HIGHWAY_X - HIGHWAY_HALF_WIDTH) / 2, 0.015, SUBURB_ROAD_Z);
    subRoad.receiveShadow = true;
    this.scene.add(subRoad);

    // City <-> Highway / Coast / Suburb paved connectors
    const connNSGeo = new THREE.PlaneGeometry(ROAD_WIDTH, 48);
    const connEWGeo = new THREE.PlaneGeometry(ROAD_WIDTH, 28);
    for (const r of [-84, 0, 84]) {
      const wConn = new THREE.Mesh(connEWGeo, roadMatEW);
      wConn.rotation.x = -Math.PI / 2;
      wConn.rotation.z = Math.PI / 2;
      wConn.position.set((HIGHWAY_X - 84) / 2, 0.014, r);
      wConn.receiveShadow = true;
      this.scene.add(wConn);

      const eConn = new THREE.Mesh(connEWGeo, roadMatEW);
      eConn.rotation.x = -Math.PI / 2;
      eConn.rotation.z = Math.PI / 2;
      eConn.position.set((84 + COAST_ROAD_X) / 2, 0.014, r);
      eConn.receiveShadow = true;
      this.scene.add(eConn);
    }
    for (const r of [-42, 0, 42]) {
      const nConn = new THREE.Mesh(connNSGeo, roadMatNS);
      nConn.rotation.x = -Math.PI / 2;
      nConn.position.set(r, 0.014, (HIGHWAY_Z - 84) / 2);
      nConn.receiveShadow = true;
      this.scene.add(nConn);

      const sConn = new THREE.Mesh(connNSGeo, roadMatNS);
      sConn.rotation.x = -Math.PI / 2;
      sConn.position.set(r, 0.014, (84 + SUBURB_ROAD_Z) / 2);
      sConn.receiveShadow = true;
      this.scene.add(sConn);
    }

    // Overhead Highway Gantry Sign (visual landmark clear above traffic)
    const gantryGroup = new THREE.Group();
    gantryGroup.position.set(-40, 0, HIGHWAY_Z);
    const gantryPostMat = new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.5, roughness: 0.4 });
    for (const gz of [-10.5, 10.5]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.3, 6.2, 8), gantryPostMat);
      post.position.set(0, 3.1, gz);
      gantryGroup.add(post);
    }
    const crossBeam = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.45, 22), gantryPostMat);
    crossBeam.position.set(0, 6.0, 0);
    gantryGroup.add(crossBeam);
    const hwySignTex = createSignTexture('HWY 101 · DOWNTOWN / BEACH', '#065f46', '#f8fafc');
    const hwySignBoard = new THREE.Mesh(
      new THREE.BoxGeometry(0.25, 2.1, 11),
      new THREE.MeshStandardMaterial({ map: hwySignTex, roughness: 0.35 }),
    );
    hwySignBoard.position.set(0, 5.9, 0);
    gantryGroup.add(hwySignBoard);
    this.scene.add(gantryGroup);

    // Countryside Dirt Roads & Trails (drivable loose gravel/dirt)
    const dirtTexNS = createDirtTexture(maxAniso);
    dirtTexNS.repeat.set(1, 22);
    const dirtMatNS = new THREE.MeshStandardMaterial({
      map: dirtTexNS,
      roughness: 0.96,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    const dirtTexEW = createDirtTexture(maxAniso);
    dirtTexEW.repeat.set(1, 22);
    dirtTexEW.center.set(0.5, 0.5);
    dirtTexEW.rotation = Math.PI / 2;
    const dirtMatEW = new THREE.MeshStandardMaterial({
      map: dirtTexEW,
      roughness: 0.96,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });

    const dirtNorthLen = COAST_ROAD_X - -160;
    const dirtNorth = new THREE.Mesh(new THREE.PlaneGeometry(DIRT_HALF_WIDTH * 2, dirtNorthLen), dirtMatEW);
    dirtNorth.rotation.x = -Math.PI / 2;
    dirtNorth.rotation.z = Math.PI / 2;
    dirtNorth.position.set((-160 + COAST_ROAD_X) / 2, 0.011, DIRT_ROAD_NORTH_Z);
    dirtNorth.receiveShadow = true;
    this.scene.add(dirtNorth);

    const dirtWestLen = 160 - (DIRT_ROAD_NORTH_Z - DIRT_HALF_WIDTH);
    const dirtWest = new THREE.Mesh(new THREE.PlaneGeometry(DIRT_HALF_WIDTH * 2, dirtWestLen), dirtMatNS);
    dirtWest.rotation.x = -Math.PI / 2;
    dirtWest.position.set(DIRT_ROAD_WEST_X, 0.012, (160 + DIRT_ROAD_NORTH_Z - DIRT_HALF_WIDTH) / 2);
    dirtWest.receiveShadow = true;
    this.scene.add(dirtWest);

    const dirtSpurEWGeo = new THREE.PlaneGeometry(DIRT_HALF_WIDTH * 2, HIGHWAY_X - DIRT_ROAD_WEST_X);
    for (const sz of [-42, 42, SUBURB_ROAD_Z]) {
      const spur = new THREE.Mesh(dirtSpurEWGeo, dirtMatEW);
      spur.rotation.x = -Math.PI / 2;
      spur.rotation.z = Math.PI / 2;
      spur.position.set((DIRT_ROAD_WEST_X + HIGHWAY_X) / 2, 0.011, sz);
      spur.receiveShadow = true;
      this.scene.add(spur);
    }
    const dirtSpurNSGeo = new THREE.PlaneGeometry(DIRT_HALF_WIDTH * 2, HIGHWAY_Z - DIRT_ROAD_NORTH_Z);
    for (const sx of [-42, 42]) {
      const spur = new THREE.Mesh(dirtSpurNSGeo, dirtMatNS);
      spur.rotation.x = -Math.PI / 2;
      spur.position.set(sx, 0.011, (DIRT_ROAD_NORTH_Z + HIGHWAY_Z) / 2);
      spur.receiveShadow = true;
      this.scene.add(spur);
    }

    // Intersection patches with crisp crosswalks & stop bars
    const interTex = createIntersectionTexture(maxAniso);
    const interGeo = new THREE.PlaneGeometry(ROAD_WIDTH, ROAD_WIDTH);
    const interMat = new THREE.MeshStandardMaterial({
      map: interTex,
      roughness: 0.86,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    for (const rx of ROAD_COORDS) {
      for (const rz of ROAD_COORDS) {
        const patch = new THREE.Mesh(interGeo, interMat);
        patch.rotation.x = -Math.PI / 2;
        patch.position.set(rx, 0.025, rz);
        patch.receiveShadow = true;
        this.scene.add(patch);
      }
    }

    // Low visual sidewalk slabs for each of the 16 city blocks (never block driving)
    const blockGeo = new THREE.BoxGeometry(30, 0.08, 30);
    const sidewalkMat = new THREE.MeshStandardMaterial({ color: 0xd8d3c8, roughness: 0.88 });
    const parkMat = new THREE.MeshStandardMaterial({ color: 0x65a35e, roughness: 0.92 });

    for (const bx of BLOCK_CENTERS) {
      for (const bz of BLOCK_CENTERS) {
        const isPark = bx === this.city.parkCenter.x && bz === this.city.parkCenter.z;
        const slab = new THREE.Mesh(blockGeo, isPark ? parkMat : sidewalkMat);
        slab.position.set(bx, 0.04, bz);
        slab.receiveShadow = true;
        this.scene.add(slab);
      }
    }

    // Central Park fountain centerpiece
    const fountainGroup = new THREE.Group();
    fountainGroup.position.set(this.city.parkCenter.x, 0.08, this.city.parkCenter.z);
    const basin = new THREE.Mesh(
      new THREE.CylinderGeometry(2.5, 2.7, 0.65, 16),
      new THREE.MeshStandardMaterial({ color: 0xcbd5e1, roughness: 0.5 }),
    );
    basin.position.y = 0.32;
    basin.castShadow = true;
    fountainGroup.add(basin);

    const water = new THREE.Mesh(
      new THREE.CylinderGeometry(2.15, 2.15, 0.55, 16),
      new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.15, metalness: 0.2 }),
    );
    water.position.y = 0.42;
    fountainGroup.add(water);

    const spire = new THREE.Mesh(
      new THREE.CylinderGeometry(0.32, 0.55, 1.8, 12),
      new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.4 }),
    );
    spire.position.y = 1.1;
    spire.castShadow = true;
    fountainGroup.add(spire);
    this.scene.add(fountainGroup);

    // Varied low-poly buildings across Downtown, Suburbs, Countryside, Highway & Beach
    const texCache = new Map<number, { map: THREE.CanvasTexture; emissiveMap: THREE.CanvasTexture }>();
    const acMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.55, metalness: 0.3 });

    for (const b of this.city.buildings) {
      let texPair = texCache.get(b.color);
      if (!texPair) {
        texPair = createBuildingTextures(b.color, maxAniso);
        texCache.set(b.color, texPair);
      }

      const repX = Math.max(1, Math.round(b.w / 7));
      const repY = Math.max(1, Math.round(b.h / 10));
      const wallMap = texPair.map.clone();
      wallMap.needsUpdate = true;
      wallMap.repeat.set(repX, repY);

      const wallEmissive = texPair.emissiveMap.clone();
      wallEmissive.needsUpdate = true;
      wallEmissive.repeat.set(repX, repY);

      const wallMat = new THREE.MeshStandardMaterial({
        map: wallMap,
        emissive: 0xffffff,
        emissiveMap: wallEmissive,
        emissiveIntensity: 0,
        roughness: 0.68,
      });
      this.buildingWindowMats.push(wallMat);

      const roofMat = new THREE.MeshStandardMaterial({ color: b.roofColor, roughness: 0.72 });
      const baseOffset = Math.abs(b.x) < 90 && Math.abs(b.z) < 90 ? 0.08 : 0;

      const bMesh = new THREE.Mesh(new THREE.BoxGeometry(b.w, b.h, b.d), [
        wallMat,
        wallMat,
        roofMat,
        roofMat,
        wallMat,
        wallMat,
      ]);
      bMesh.position.set(b.x, baseOffset + b.h / 2, b.z);
      bMesh.castShadow = true;
      bMesh.receiveShadow = true;
      this.scene.add(bMesh);

      if (b.style === 'stepped') {
        const capH = 1.3;
        const cap = new THREE.Mesh(new THREE.BoxGeometry(b.w * 0.58, capH, b.d * 0.58), roofMat);
        cap.position.set(b.x, baseOffset + b.h + capH / 2, b.z);
        cap.castShadow = true;
        this.scene.add(cap);

        const ac = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.75, 1.2), acMat);
        ac.position.set(b.x + b.w * 0.14, baseOffset + b.h + capH + 0.37, b.z);
        this.scene.add(ac);
      } else if (b.style === 'twin') {
        const upperH = 4.2;
        const upper = new THREE.Mesh(new THREE.BoxGeometry(b.w * 0.66, upperH, b.d * 0.66), [
          wallMat,
          wallMat,
          roofMat,
          roofMat,
          wallMat,
          wallMat,
        ]);
        upper.position.set(b.x, baseOffset + b.h + upperH / 2, b.z);
        upper.castShadow = true;
        this.scene.add(upper);

        const spireRod = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.14, 2.4, 6), acMat);
        spireRod.position.set(b.x, baseOffset + b.h + upperH + 1.2, b.z);
        this.scene.add(spireRod);
      } else if (b.style === 'gable' || b.style === 'barn') {
        const roofH = b.style === 'barn' ? 3.2 : 2.3;
        const roofCone = new THREE.Mesh(
          new THREE.ConeGeometry(Math.max(b.w, b.d) * 0.74, roofH, 4),
          roofMat,
        );
        roofCone.rotation.y = Math.PI / 4;
        roofCone.position.set(b.x, baseOffset + b.h + roofH / 2, b.z);
        roofCone.castShadow = true;
        this.scene.add(roofCone);
      }
    }

    // Perimeter & Meadow Stone Walls
    for (const w of this.city.walls) {
      const wallMat = new THREE.MeshStandardMaterial({ color: w.color, roughness: 0.85 });
      const wallMesh = new THREE.Mesh(new THREE.BoxGeometry(w.w, w.h, w.d), wallMat);
      wallMesh.position.set(w.x, w.h / 2, w.z);
      wallMesh.castShadow = true;
      wallMesh.receiveShadow = true;
      this.scene.add(wallMesh);
    }

    // Instanced Trees (pine & beach palm trees, solid trunk colliders)
    const pineTrees = this.city.trees.filter((t) => t.kind === 'pine');
    if (pineTrees.length > 0) {
      const trunkGeo = new THREE.CylinderGeometry(0.22, 0.34, 1.6, 6);
      trunkGeo.translate(0, 0.8, 0);
      const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6d4c3d, roughness: 0.9 });
      const trunkInst = new THREE.InstancedMesh(trunkGeo, trunkMat, pineTrees.length);
      trunkInst.castShadow = true;

      const crown1Geo = new THREE.ConeGeometry(1.35, 2.2, 7);
      crown1Geo.translate(0, 2.4, 0);
      const crown1Mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.78 });
      const crown1Inst = new THREE.InstancedMesh(crown1Geo, crown1Mat, pineTrees.length);
      crown1Inst.castShadow = true;

      const crown2Geo = new THREE.ConeGeometry(0.95, 1.8, 7);
      crown2Geo.translate(0, 3.55, 0);
      const crown2Mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.74 });
      const crown2Inst = new THREE.InstancedMesh(crown2Geo, crown2Mat, pineTrees.length);
      crown2Inst.castShadow = true;

      pineTrees.forEach((t, i) => {
        const baseY = Math.abs(t.x) < 90 && Math.abs(t.z) < 90 ? 0.08 : 0;
        _dummyObj.position.set(t.x, baseY, t.z);
        _dummyObj.rotation.set(0, (i * 1.17) % (Math.PI * 2), 0);
        _dummyObj.scale.setScalar(t.scale);
        _dummyObj.updateMatrix();

        trunkInst.setMatrixAt(i, _dummyObj.matrix);
        crown1Inst.setMatrixAt(i, _dummyObj.matrix);
        crown2Inst.setMatrixAt(i, _dummyObj.matrix);

        _tmpColor.setHex(t.tint);
        crown1Inst.setColorAt(i, _tmpColor);
        _tmpColor.offsetHSL(0, 0, 0.05);
        crown2Inst.setColorAt(i, _tmpColor);
      });

      trunkInst.instanceMatrix.needsUpdate = true;
      crown1Inst.instanceMatrix.needsUpdate = true;
      crown2Inst.instanceMatrix.needsUpdate = true;
      if (crown1Inst.instanceColor) crown1Inst.instanceColor.needsUpdate = true;
      if (crown2Inst.instanceColor) crown2Inst.instanceColor.needsUpdate = true;
      trunkInst.computeBoundingSphere();
      crown1Inst.computeBoundingSphere();
      crown2Inst.computeBoundingSphere();
      this.scene.add(trunkInst, crown1Inst, crown2Inst);
    }

    const palmTrees = this.city.trees.filter((t) => t.kind === 'palm');
    if (palmTrees.length > 0) {
      const pTrunkGeo = new THREE.CylinderGeometry(0.16, 0.3, 4.4, 6);
      pTrunkGeo.translate(0, 2.2, 0);
      const pTrunkMat = new THREE.MeshStandardMaterial({ color: 0x8b6245, roughness: 0.9 });
      const pTrunkInst = new THREE.InstancedMesh(pTrunkGeo, pTrunkMat, palmTrees.length);
      pTrunkInst.castShadow = true;

      const frondGeo = new THREE.ConeGeometry(1.9, 0.85, 6);
      frondGeo.translate(0, 4.45, 0);
      const frondMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.72 });
      const frondInst = new THREE.InstancedMesh(frondGeo, frondMat, palmTrees.length);
      frondInst.castShadow = true;

      palmTrees.forEach((t, i) => {
        _dummyObj.position.set(t.x, 0, t.z);
        _dummyObj.rotation.set(0, (i * 1.9) % (Math.PI * 2), 0);
        _dummyObj.scale.setScalar(t.scale);
        _dummyObj.updateMatrix();
        pTrunkInst.setMatrixAt(i, _dummyObj.matrix);
        frondInst.setMatrixAt(i, _dummyObj.matrix);
        _tmpColor.setHex(t.tint);
        frondInst.setColorAt(i, _tmpColor);
      });

      pTrunkInst.instanceMatrix.needsUpdate = true;
      frondInst.instanceMatrix.needsUpdate = true;
      if (frondInst.instanceColor) frondInst.instanceColor.needsUpdate = true;
      pTrunkInst.computeBoundingSphere();
      frondInst.computeBoundingSphere();
      this.scene.add(pTrunkInst, frondInst);
    }

    // Beach Umbrellas & Towels (non-blocking visual decor on sand)
    for (const bp of this.city.beachProps) {
      const ug = new THREE.Group();
      ug.position.set(bp.x, 0, bp.z);
      ug.rotation.y = bp.rotY;

      const towel = new THREE.Mesh(
        new THREE.BoxGeometry(1.4, 0.03, 2.2),
        new THREE.MeshStandardMaterial({ color: bp.color, roughness: 0.9 }),
      );
      towel.position.set(0.8, 0.02, 0);
      ug.add(towel);

      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.05, 0.05, 2.2, 6),
        new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.5 }),
      );
      pole.position.set(0, 1.1, 0);
      ug.add(pole);

      const canopy = new THREE.Mesh(
        new THREE.ConeGeometry(1.35, 0.55, 6),
        new THREE.MeshStandardMaterial({ color: bp.color, roughness: 0.7 }),
      );
      canopy.position.set(0, 2.15, 0);
      canopy.castShadow = true;
      ug.add(canopy);
      this.scene.add(ug);
    }

    // Instanced Street Lamps
    const lampCount = this.city.lamps.length;
    if (lampCount > 0) {
      const poleMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.5, metalness: 0.6 });
      this.streetLampBulbMat = new THREE.MeshStandardMaterial({
        color: 0xfef3c7,
        emissive: 0xfde047,
        emissiveIntensity: 0.35,
      });

      const poleGeo = new THREE.CylinderGeometry(0.1, 0.14, 4.4, 6);
      poleGeo.translate(0, 2.2, 0);
      const armGeo = new THREE.BoxGeometry(1.1, 0.12, 0.12);
      armGeo.translate(0.45, 4.35, 0);
      const bulbGeo = new THREE.BoxGeometry(0.36, 0.16, 0.26);
      bulbGeo.translate(0.85, 4.24, 0);

      const poleInst = new THREE.InstancedMesh(poleGeo, poleMat, lampCount);
      const armInst = new THREE.InstancedMesh(armGeo, poleMat, lampCount);
      const bulbInst = new THREE.InstancedMesh(bulbGeo, this.streetLampBulbMat, lampCount);

      this.city.lamps.forEach((l, i) => {
        const baseY = Math.abs(l.x) < 90 && Math.abs(l.z) < 90 ? 0.08 : 0;
        _dummyObj.position.set(l.x, baseY, l.z);
        _dummyObj.rotation.set(0, l.rotY, 0);
        _dummyObj.scale.setScalar(1);
        _dummyObj.updateMatrix();
        poleInst.setMatrixAt(i, _dummyObj.matrix);
        armInst.setMatrixAt(i, _dummyObj.matrix);
        bulbInst.setMatrixAt(i, _dummyObj.matrix);
      });

      poleInst.instanceMatrix.needsUpdate = true;
      armInst.instanceMatrix.needsUpdate = true;
      bulbInst.instanceMatrix.needsUpdate = true;
      poleInst.computeBoundingSphere();
      armInst.computeBoundingSphere();
      bulbInst.computeBoundingSphere();
      this.scene.add(poleInst, armInst, bulbInst);
    }

    // Traffic Lights at central intersections (2 shared phase signal material sets)
    for (let p = 0; p < 2; p++) {
      this.trafficSignalMats.push({
        red: new THREE.MeshStandardMaterial({ color: 0x450a0a, emissive: 0xef4444, emissiveIntensity: 0.1 }),
        amber: new THREE.MeshStandardMaterial({ color: 0x451a03, emissive: 0xf59e0b, emissiveIntensity: 0.1 }),
        green: new THREE.MeshStandardMaterial({ color: 0x052e16, emissive: 0x22c55e, emissiveIntensity: 0.1 }),
      });
    }

    const sigPoleGeo = new THREE.CylinderGeometry(0.09, 0.12, 4.2, 6);
    const sigBoxGeo = new THREE.BoxGeometry(0.36, 0.96, 0.32);
    const lensGeo = new THREE.BoxGeometry(0.2, 0.2, 0.08);
    const sigMetalMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.45, metalness: 0.55 });

    for (const tl of this.city.trafficLights) {
      const sigGroup = new THREE.Group();
      sigGroup.position.set(tl.x, 0.08, tl.z);
      sigGroup.rotation.y = tl.rotY;

      const pole = new THREE.Mesh(sigPoleGeo, sigMetalMat);
      pole.position.y = 2.1;
      sigGroup.add(pole);

      const housing = new THREE.Mesh(sigBoxGeo, sigMetalMat);
      housing.position.set(0, 3.9, 0);
      sigGroup.add(housing);

      const mats = this.trafficSignalMats[tl.phaseGroup];
      const redLens = new THREE.Mesh(lensGeo, mats.red);
      redLens.position.set(0, 4.18, 0.15);
      const amberLens = new THREE.Mesh(lensGeo, mats.amber);
      amberLens.position.set(0, 3.9, 0.15);
      const greenLens = new THREE.Mesh(lensGeo, mats.green);
      greenLens.position.set(0, 3.62, 0.15);
      sigGroup.add(redLens, amberLens, greenLens);

      this.scene.add(sigGroup);
    }

    // Fuel Stations & Rental Shop 3D landmarks
    for (const fs of this.city.fuelStations) {
      this.scene.add(createFuelStationGroup(fs.x, fs.z, fs.rotY));
    }
    this.scene.add(createRentalShopDecor(this.city.rentalShop.x, this.city.rentalShop.z));

    // Countryside rolling low-poly hills around outer ridges
    for (const h of this.city.hills) {
      const hillMat = new THREE.MeshStandardMaterial({ color: h.color, roughness: 0.92 });
      const hill = new THREE.Mesh(new THREE.ConeGeometry(h.radius, h.height, 7), hillMat);
      hill.position.set(h.x, h.height * 0.42, h.z);
      this.scene.add(hill);
    }

    // Drop-off marker (hidden until passenger onboard)
    this.dropoffRig = createDropoffMarkerMesh();
    this.dropoffRig.group.visible = false;
    this.scene.add(this.dropoffRig.group);

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }
  }

  private isCurrentVehicleTaxiModeActive(): boolean {
    const spec = VEHICLE_CATALOG[this.saveState.activeVehicle];
    if (!spec || !spec.taxiCapable) return false;
    return (this.saveState.vehicleModes[spec.id] ?? 'taxi') === 'taxi';
  }

  private isTaxiJobsActive(): boolean {
    return this.saveState.gameMode === 'taxi' && this.isCurrentVehicleTaxiModeActive();
  }

  private buildPlayer(): void {
    const spec = VEHICLE_CATALOG[this.saveState.activeVehicle];
    const maxAniso = this.renderer.capabilities.getMaxAnisotropy();
    this.playerRig = createPlayerTaxiMesh(spec, maxAniso, this.isCurrentVehicleTaxiModeActive());
    this.playerRig.group.position.set(this.playerX, 0, this.playerZ);
    this.playerRig.group.rotation.y = this.playerHeading;
    this.scene.add(this.playerRig.group);

    // Floating 3D Navigation Chevron above taxi pointing to dropoff or nearest passenger
    this.guideArrow = new THREE.Group();
    this.guideArrowMat = new THREE.MeshStandardMaterial({
      color: 0xfbbf24,
      emissive: 0xd97706,
      emissiveIntensity: 0.9,
      roughness: 0.25,
    });
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.72, 4), this.guideArrowMat);
    cone.rotation.x = -Math.PI / 2;
    cone.position.z = -0.35;
    this.guideArrow.add(cone);

    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.14, 0.45), this.guideArrowMat);
    tail.position.z = 0.18;
    this.guideArrow.add(tail);

    this.guideArrow.position.set(0, Math.max(2.35, spec.dimensions.height + 0.95), 0);
    this.playerRig.group.add(this.guideArrow);
  }

  private rebuildPlayerRig(): void {
    const spec = VEHICLE_CATALOG[this.saveState.activeVehicle];
    const maxAniso = this.renderer.capabilities.getMaxAnisotropy();

    if (this.guideArrow && this.playerRig) {
      this.playerRig.group.remove(this.guideArrow);
    }
    if (this.playerRig) {
      this.scene.remove(this.playerRig.group);
      disposeCarRig(this.playerRig.group);
    }

    this.playerRig = createPlayerTaxiMesh(spec, maxAniso, this.isCurrentVehicleTaxiModeActive());
    this.playerRig.group.position.set(this.playerX, 0, this.playerZ);
    this.playerRig.group.rotation.y = this.playerHeading;
    this.scene.add(this.playerRig.group);

    if (this.guideArrow) {
      this.guideArrow.position.set(0, Math.max(2.35, spec.dimensions.height + 0.95), 0);
      this.playerRig.group.add(this.guideArrow);
    }
  }

  private spawnTraffic(): void {
    const trafficColors = [0x60a5fa, 0xf87171, 0x34d399, 0xa78bfa, 0xe2e8f0, 0xfb923c];
    const spawnCoords = [
      { x: -42 + LANE_OFFSET, z: -20, dir: 0 },
      { x: 0 + LANE_OFFSET, z: -60, dir: 0 },
      { x: 42 - LANE_OFFSET, z: -15, dir: 2 },
      { x: -84 - LANE_OFFSET, z: 18, dir: 2 },
      { x: -20, z: -42 + LANE_OFFSET, dir: 1 },
      { x: 25, z: 0 - LANE_OFFSET, dir: 3 },
      { x: -18, z: 42 + LANE_OFFSET, dir: 1 },
      { x: 60, z: -84 + LANE_OFFSET, dir: 1 },
      { x: -55, z: 84 - LANE_OFFSET, dir: 3 },
      { x: 84 - LANE_OFFSET, z: 22, dir: 2 },
    ];

    spawnCoords.forEach((sc, idx) => {
      const { group, wheels } = createTrafficCarMesh(trafficColors[idx % trafficColors.length]);
      group.position.set(sc.x, 0, sc.z);
      group.rotation.y = DIR_VECTORS[sc.dir].yaw;
      this.scene.add(group);
      this.traffic.push({
        group,
        wheels,
        x: sc.x,
        z: sc.z,
        dirIndex: sc.dir,
        speed: 8 + (idx % 3) * 1.4,
        maxSpeed: 8.5 + (idx % 3) * 1.5,
        lastIntersectionKey: '',
        hornCooldown: 1.5 + idx * 0.4,
        blockedTime: 0,
      });
    });
  }

  private ensurePassengerMarkers(): void {
    if (!this.isTaxiJobsActive() || this.activeTrip) {
      // Hide pickup markers in Free Roam, Private mode, or while carrying a fare
      for (const p of this.passengerPool) {
        p.rig.group.visible = false;
      }
      return;
    }

    for (const p of this.passengerPool) {
      p.rig.group.visible = true;
    }

    const spec = VEHICLE_CATALOG[this.saveState.activeVehicle];

    while (this.passengerPool.length < 3) {
      const usedPickupIds = new Set(this.passengerPool.map((p) => p.data.pickupLabel));
      const candidates = this.city.stops.filter(
        (s) =>
          !usedPickupIds.has(s.label) &&
          Math.hypot(s.x - this.playerX, s.z - this.playerZ) > 16,
      );
      const pickupStop =
        candidates[Math.floor(Math.random() * candidates.length)] ??
        this.city.stops[Math.floor(Math.random() * this.city.stops.length)];

      const dropCandidates = this.city.stops.filter(
        (s) => Math.hypot(s.x - pickupStop.x, s.z - pickupStop.z) >= 72,
      );
      const dropoffStop =
        dropCandidates[Math.floor(Math.random() * dropCandidates.length)] ?? this.city.stops[0];

      const distance = Math.hypot(dropoffStop.x - pickupStop.x, dropoffStop.z - pickupStop.z);
      const avgWorldSpeed = spec.maxSpeed * 0.36; // Effective city route speed across turns/traffic
      const parTime = Math.round((distance / avgWorldSpeed) * 1.5);
      const isVVIP = spec.unlocksVVIP && Math.random() < 0.32;
      const distanceMeters = Math.round(distance * 5);
      const estimatedFare = Number(
        ((3 + (distanceMeters / 100) * 1.5) * spec.fareMultiplier * (isVVIP ? 1.85 : 1)).toFixed(2),
      );

      const data: PassengerMarker = {
        id: `${pickupStop.id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: PASSENGER_NAMES[Math.floor(Math.random() * PASSENGER_NAMES.length)],
        pickupLabel: pickupStop.label,
        x: pickupStop.x,
        z: pickupStop.z,
        dropoffLabel: dropoffStop.label,
        dropoffX: dropoffStop.x,
        dropoffZ: dropoffStop.z,
        distance,
        parTime,
        estimatedFare,
        isVVIP,
      };

      const shirtColor = SHIRT_COLORS[Math.floor(Math.random() * SHIRT_COLORS.length)];
      const rig = createPassengerMarkerMesh(shirtColor, isVVIP);
      rig.group.position.set(data.x, 0, data.z);
      this.scene.add(rig.group);
      this.passengerPool.push({ data, rig });
    }
  }

  // Public Controls API
  public setControlInput(input: ControlInput): void {
    this.controlInput.throttle = input.throttle;
    this.controlInput.steer = input.steer;
    this.controlInput.brake = input.brake;
  }

  public setPaused(paused: boolean): void {
    this.isPaused = paused;
    soundEngine.setPaused(paused);
    if (paused) {
      soundEngine.updateEngine(0, false);
    }
  }

  public setSoundEnabled(enabled: boolean): void {
    this.saveState.soundEnabled = enabled;
    soundEngine.setEnabled(enabled);
    persistSaveState(this.saveState);
    this.callbacks.onStateChange({ ...this.saveState });
  }

  public setAudioVolumes(carSoundVolume: number, backgroundSoundVolume: number): void {
    const carVol = Math.max(0, Math.min(1, carSoundVolume));
    const bgVol = Math.max(0, Math.min(1, backgroundSoundVolume));
    this.saveState.carSoundVolume = carVol;
    this.saveState.backgroundSoundVolume = bgVol;
    soundEngine.setCarSoundVolume(carVol);
    soundEngine.setBackgroundSoundVolume(bgVol);
    persistSaveState(this.saveState);
    this.callbacks.onStateChange({ ...this.saveState });
  }

  public setMusicPreferences(
    trackId: string,
    volume: number,
    muted: boolean,
    autoSwitch: boolean,
  ): void {
    this.saveState.musicTrackId = trackId;
    this.saveState.musicVolume = Math.max(0, Math.min(1, volume));
    this.saveState.musicMuted = muted;
    this.saveState.musicAutoSwitch = autoSwitch;
    persistSaveState(this.saveState);
    this.callbacks.onStateChange({ ...this.saveState });
  }

  public markTutorialDone(grantBonus: boolean): number {
    let awarded = 0;
    this.saveState.tutorialDone = true;
    if (grantBonus && !this.saveState.tutorialBonusClaimed) {
      awarded = 35;
      this.saveState.tutorialBonusClaimed = true;
      this.saveState.money = Number((this.saveState.money + awarded).toFixed(2));
      soundEngine.playDropoff();
    }
    persistSaveState(this.saveState);
    this.callbacks.onStateChange({ ...this.saveState });
    return awarded;
  }

  public setCameraMode(mode: CameraMode): void {
    this.saveState.cameraMode = mode;
    persistSaveState(this.saveState);
    this.callbacks.onStateChange({ ...this.saveState });
  }

  public setGameMode(mode: GameMode): void {
    if (this.saveState.gameMode === mode) return;
    this.saveState.gameMode = mode;

    if (mode === 'freeroam') {
      if (this.activeTrip) {
        this.activeTrip = null;
        this.dropoffRig.group.visible = false;
      }
      this.guideArrow.visible = false;
      for (const p of this.passengerPool) {
        p.rig.group.visible = false;
      }
      this.callbacks.onNotice('Free roam mode — drive anywhere freely!', 'info');
    } else if (!this.isCurrentVehicleTaxiModeActive()) {
      const spec = VEHICLE_CATALOG[this.saveState.activeVehicle];
      this.callbacks.onNotice(
        spec.taxiCapable
          ? `${spec.name} is in Private mode — toggle Taxi mode in Garage for fares.`
          : `${spec.name} is a Private car — switch to a taxi-capable car in Garage for fares.`,
        'info',
      );
    } else {
      this.ensurePassengerMarkers();
      this.callbacks.onNotice('Taxi job mode — pick up any passenger to earn fares.', 'info');
    }

    persistSaveState(this.saveState);
    this.callbacks.onStateChange({ ...this.saveState });
    this.emitMinimapSnapshot();
  }

  public buyVehicle(id: VehicleId): { ok: boolean; reason?: string } {
    const spec = VEHICLE_CATALOG[id];
    if (!spec) return { ok: false, reason: 'Unknown car model.' };

    if (this.saveState.ownedVehicles.includes(id)) {
      this.selectVehicle(id);
      return { ok: true };
    }

    if (this.saveState.money < spec.purchasePrice) {
      this.callbacks.onNotice('Not enough money', 'warning');
      return { ok: false, reason: 'Not enough money' };
    }

    this.saveState.money = Number((this.saveState.money - spec.purchasePrice).toFixed(2));
    this.saveState.ownedVehicles = [...this.saveState.ownedVehicles, id];
    this.saveState.carsPurchased += 1;
    this.saveState.vehicleModes = {
      ...this.saveState.vehicleModes,
      [id]: spec.taxiCapable ? 'taxi' : 'private',
    };
    this.applyVehicleSelection(id);
    soundEngine.playDropoff();
    this.callbacks.onNotice(
      `Purchased ${spec.name} for $${spec.purchasePrice.toLocaleString()}!`,
      'success',
    );
    this.evaluateAchievementsAndStages();
    persistSaveState(this.saveState);
    this.callbacks.onStateChange({ ...this.saveState });
    this.emitMinimapSnapshot();
    return { ok: true };
  }

  private evaluateAchievementsAndStages(): void {
    const prevAch = new Set(this.saveState.achievements);
    const nextAch = computeEarnedAchievements(this.saveState);
    this.saveState.achievements = nextAch;

    for (const achId of nextAch) {
      if (!prevAch.has(achId)) {
        const spec = CAREER_ACHIEVEMENTS.find((a) => a.id === achId);
        if (spec) {
          this.callbacks.onAchievementUnlock?.(spec);
        }
      }
    }

    if (this.saveState.currentStage === 1 && hasBoughtFirstCar(this.saveState)) {
      this.saveState.currentStage = 2;
      this.saveState.money = Number((this.saveState.money + STAGE_2_REWARD).toFixed(2));
      this.stageEventCounter += 1;
      const stage2 = getStageSpec(2);
      this.callbacks.onStageUp?.({
        id: this.stageEventCounter,
        fromStage: 1,
        toStage: 2,
        title: stage2.title,
        summary: 'Rental car no longer needed — daily rental fee is now $0!',
        reward: STAGE_2_REWARD,
      });
    }

    if (
      this.saveState.currentStage === 2 &&
      getStage3Progress(this.saveState).allMet
    ) {
      this.saveState.currentStage = 3;
      this.saveState.money = Number((this.saveState.money + STAGE_3_REWARD).toFixed(2));
      this.stageEventCounter += 1;
      const stage3 = getStageSpec(3);
      this.callbacks.onStageUp?.({
        id: this.stageEventCounter,
        fromStage: 2,
        toStage: 3,
        title: stage3.title,
        summary: 'Sedan class, $1,500 total earnings, and 4.6★ rating reached!',
        reward: STAGE_3_REWARD,
      });
    }
  }

  public selectVehicle(id: VehicleId): boolean {
    if (!this.saveState.ownedVehicles.includes(id)) return false;
    const spec = VEHICLE_CATALOG[id];
    if (!spec) return false;

    this.applyVehicleSelection(id);
    soundEngine.playPickup();
    persistSaveState(this.saveState);
    this.callbacks.onStateChange({ ...this.saveState });
    this.emitMinimapSnapshot();
    this.callbacks.onNotice(`Now driving ${spec.name}.`, 'info');
    return true;
  }

  public setVehicleServiceMode(id: VehicleId, mode: VehicleServiceMode): void {
    const spec = VEHICLE_CATALOG[id];
    if (!spec || !spec.taxiCapable) return;
    if (!this.saveState.ownedVehicles.includes(id)) return;

    this.saveState.vehicleModes = {
      ...this.saveState.vehicleModes,
      [id]: mode,
    };

    if (this.saveState.activeVehicle === id) {
      if (mode === 'private' && this.activeTrip) {
        this.activeTrip = null;
        this.dropoffRig.group.visible = false;
      }
      this.rebuildPlayerRig();
      this.ensurePassengerMarkers();
      if (!this.isTaxiJobsActive()) {
        this.guideArrow.visible = false;
      }
      this.callbacks.onNotice(
        mode === 'taxi'
          ? `${spec.name} switched to Taxi mode — fares active.`
          : `${spec.name} switched to Private mode — free driving.`,
        'info',
      );
      this.emitMinimapSnapshot();
    }

    persistSaveState(this.saveState);
    this.callbacks.onStateChange({ ...this.saveState });
  }

  private applyVehicleSelection(id: VehicleId): void {
    const spec = VEHICLE_CATALOG[id];
    const wasTaxiActive = this.isTaxiJobsActive();
    this.saveState.activeVehicle = id;

    if (!spec.taxiCapable || (this.saveState.vehicleModes[id] ?? 'taxi') === 'private') {
      if (this.activeTrip) {
        this.activeTrip = null;
        this.dropoffRig.group.visible = false;
      }
    }

    this.rebuildPlayerRig();
    this.ensurePassengerMarkers();

    if (!this.isTaxiJobsActive()) {
      this.guideArrow.visible = false;
    } else if (!wasTaxiActive && !this.activeTrip) {
      // Refresh passenger markers so VVIP eligibility matches the newly selected vehicle
      for (const p of this.passengerPool) {
        this.scene.remove(p.rig.group);
      }
      this.passengerPool = [];
      this.ensurePassengerMarkers();
    }
  }

  public resetCarPosition(): void {
    const safe = findNearestClearRoadPoint(this.playerX, this.playerZ);
    this.playerX = safe.x;
    this.playerZ = safe.z;
    this.playerHeading = safe.heading;
    this.playerSpeed = 0;
    this.velX = 0;
    this.velZ = 0;
    this.steerAngle = 0;
    this.smoothThrottle = 0;
    this.smoothBrake = 0;
    this.surfaceSpeedMult = 1;
    this.surfaceGripMult = 1;
    this.currentSurface = 'road';

    this.playerRig.group.position.set(this.playerX, 0, this.playerZ);
    this.playerRig.group.rotation.y = this.playerHeading;
    this.playerRig.bodyGroup.rotation.set(0, 0, 0);

    const forwardX = -Math.sin(this.playerHeading);
    const forwardZ = -Math.cos(this.playerHeading);
    this.camModeBlend = this.saveState.cameraMode === 'overhead' ? 1 : 0;
    this.cameraShakeIntensity = 0;
    if (this.saveState.cameraMode === 'chase') {
      this.camera.position.set(this.playerX - forwardX * 11, 5.8, this.playerZ - forwardZ * 11);
      this.camLookCurrent.set(this.playerX + forwardX * 4.8, 1.35, this.playerZ + forwardZ * 4.8);
    } else {
      this.camera.position.set(this.playerX, 34, this.playerZ + 18);
      this.camLookCurrent.set(this.playerX, 0, this.playerZ);
    }
    this.camera.lookAt(this.camLookCurrent);
    this.camInitialized = true;

    this.emitMinimapSnapshot();
    this.callbacks.onNotice('Car reset onto nearest clear road.', 'info');
  }

  public refuelAtStation(fullTank = true): boolean {
    const needed = Math.max(0, this.saveState.fuelMax - this.saveState.fuel);
    if (needed < 0.5) {
      this.callbacks.onNotice('Tank is already full.', 'info');
      return false;
    }

    const unitsToBuy = fullTank ? needed : Math.min(needed, EMERGENCY_FUEL_UNITS);
    const cost = Number(Math.max(0.25, unitsToBuy * FUEL_PRICE_PER_UNIT).toFixed(2));

    if (this.saveState.money < cost) {
      if (this.saveState.money >= 0.5) {
        const affordableUnits = this.saveState.money / FUEL_PRICE_PER_UNIT;
        this.saveState.fuel = Math.min(this.saveState.fuelMax, this.saveState.fuel + affordableUnits);
        this.saveState.money = 0;
        soundEngine.playRefuel();
        persistSaveState(this.saveState);
        this.callbacks.onStateChange({ ...this.saveState });
        this.callbacks.onNotice(`Topped up +${affordableUnits.toFixed(0)} units with remaining cash.`, 'info');
        return true;
      }
      this.callbacks.onNotice('Not enough cash for fuel! Complete a fare or use emergency fuel.', 'warning');
      return false;
    }

    this.saveState.money = Number((this.saveState.money - cost).toFixed(2));
    this.saveState.fuel = Math.min(this.saveState.fuelMax, this.saveState.fuel + unitsToBuy);
    soundEngine.playRefuel();
    persistSaveState(this.saveState);
    this.callbacks.onStateChange({ ...this.saveState });
    this.callbacks.onNotice(`Refueled +${unitsToBuy.toFixed(0)} units for $${cost.toFixed(2)}.`, 'success');
    return true;
  }

  public callEmergencyFuel(): boolean {
    if (this.saveState.fuel >= this.saveState.fuelMax - 1) {
      this.callbacks.onNotice('Tank is already full.', 'info');
      return false;
    }
    if (this.saveState.money < EMERGENCY_FUEL_COST) {
      // Never soft-lock: roadside dispatch grants emergency fuel on tab if low on cash
      this.saveState.fuel = Math.min(this.saveState.fuelMax, this.saveState.fuel + EMERGENCY_FUEL_UNITS);
      this.saveState.money = Number((this.saveState.money - EMERGENCY_FUEL_COST).toFixed(2));
      soundEngine.playRefuel();
      persistSaveState(this.saveState);
      this.callbacks.onStateChange({ ...this.saveState });
      this.callbacks.onNotice(`Emergency fuel +${EMERGENCY_FUEL_UNITS} units (-$${EMERGENCY_FUEL_COST} tab).`, 'warning');
      return true;
    }
    this.saveState.money = Number((this.saveState.money - EMERGENCY_FUEL_COST).toFixed(2));
    this.saveState.fuel = Math.min(this.saveState.fuelMax, this.saveState.fuel + EMERGENCY_FUEL_UNITS);
    soundEngine.playRefuel();
    persistSaveState(this.saveState);
    this.callbacks.onStateChange({ ...this.saveState });
    this.callbacks.onNotice(`Emergency fuel +${EMERGENCY_FUEL_UNITS} units ($${EMERGENCY_FUEL_COST}).`, 'success');
    return true;
  }

  public applyResetState(fresh: GameSaveState): void {
    this.applySavedCareerState(fresh, 'Started a fresh career at Metro Car Shop & Garage.');
  }

  public applyImportedState(imported: GameSaveState): void {
    this.applySavedCareerState(imported, 'Save restored successfully.');
  }

  private applySavedCareerState(nextState: GameSaveState, noticeText: string): void {
    this.saveState = { ...nextState };
    this.playerX = 2.85;
    this.playerZ = 48;
    this.playerHeading = 0;
    this.playerSpeed = 0;
    this.velX = 0;
    this.velZ = 0;
    this.steerAngle = 0;
    this.smoothThrottle = 0;
    this.smoothBrake = 0;
    this.activeTrip = null;
    this.dropoffRig.group.visible = false;
    this.tripsToday = 0;
    this.earningsToday = 0;
    this.cameraShakeIntensity = 0;
    this.camModeBlend = nextState.cameraMode === 'overhead' ? 1 : 0;
    this.camInitialized = false;

    this.rebuildPlayerRig();

    for (const p of this.passengerPool) {
      this.scene.remove(p.rig.group);
    }
    this.passengerPool = [];
    this.ensurePassengerMarkers();
    this.callbacks.onStateChange({ ...this.saveState });
    this.emitMinimapSnapshot();
    this.callbacks.onNotice(noticeText, 'info');
  }

  private tick = (): void => {
    if (this.isDisposed) return;

    const dt = Math.min(0.05, this.clock.getDelta());
    const elapsed = this.clock.elapsedTime;

    if (!this.isPaused && !this.contextLost) {
      this.updatePlayer(dt);
      this.updateTraffic(dt);
      this.updateMarkers(dt, elapsed);
      this.updateDayCycle(dt);
      this.updateTimeOfDayAndSignals(elapsed);
      this.updateCamera(dt);
      this.syncHudAndSaves(dt);
    }

    this.renderer.render(this.scene, this.camera);

    if (this.isSoftwareGl) {
      this.afterDraw(this.tick);
    } else {
      this.frameId = requestAnimationFrame(this.tick);
    }
  };

  private afterDraw(cb: () => void): void {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const poll = () => {
      if (this.isDisposed) {
        if (sync) gl.deleteSync(sync);
        return;
      }
      const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
      if (state === gl.UNSIGNALED) {
        this.frameId = window.setTimeout(poll, 5);
      } else {
        if (sync) gl.deleteSync(sync);
        this.frameId = window.setTimeout(cb, 80);
      }
    };
    this.frameId = window.setTimeout(poll, 5);
  }

  private updatePlayer(dt: number): void {
    const spec = VEHICLE_CATALOG[this.saveState.activeVehicle];
    const hasFuel = this.saveState.fuel > 0.05;

    // Single flat ground surface modifiers: road = full speed & grip; grass/dirt/sand drivable with loose grip
    // Off-road vehicles (Dune Raider / Titan Ranger) gain improved off-road grip & traction
    const surface = getSurfaceType(this.playerX, this.playerZ);
    this.currentSurface = surface;
    const baseSpeedMult =
      surface === 'road' ? 1.0 : surface === 'dirt' ? 0.88 : surface === 'grass' ? 0.84 : 0.78;
    const baseGripMult =
      surface === 'road' ? 1.0 : surface === 'dirt' ? 0.66 : surface === 'grass' ? 0.56 : 0.52;
    const targetSpeedMult =
      surface === 'road'
        ? 1.0
        : Math.min(0.98, baseSpeedMult * (1 + (spec.offroadGripBonus - 1) * 0.22));
    const targetGripMult =
      surface === 'road' ? 1.0 : Math.min(1.0, baseGripMult * spec.offroadGripBonus);

    this.surfaceSpeedMult = THREE.MathUtils.damp(this.surfaceSpeedMult, targetSpeedMult, 8, dt);
    this.surfaceGripMult = THREE.MathUtils.damp(this.surfaceGripMult, targetGripMult, 8, dt);

    const effectiveMaxSpeed = (hasFuel ? spec.maxSpeed : 7.5) * this.surfaceSpeedMult;
    const effectiveAccel = hasFuel ? spec.acceleration : 7.5;

    if (this.bumpCooldown > 0) this.bumpCooldown -= dt;
    if (this.refuelCooldown > 0) this.refuelCooldown -= dt;

    const { throttle, steer, brake } = this.controlInput;

    // Smooth pedal ramp so acceleration and braking build progressively
    this.smoothThrottle = THREE.MathUtils.damp(this.smoothThrottle, throttle, 8.5, dt);
    this.smoothBrake = THREE.MathUtils.damp(this.smoothBrake, brake ? 1 : 0, 12, dt);

    // Current forward & right basis vectors (heading 0 = North = -Z)
    let forwardX = -Math.sin(this.playerHeading);
    let forwardZ = -Math.cos(this.playerHeading);
    let rightX = Math.cos(this.playerHeading);
    let rightZ = -Math.sin(this.playerHeading);

    // Decompose world velocity into forward and lateral (slip/drift) components
    let forwardSpeed = this.velX * forwardX + this.velZ * forwardZ;
    let lateralSpeed = this.velX * rightX + this.velZ * rightZ;

    // Progressive acceleration, braking, reverse, and coasting drag
    const brakingInput = this.smoothBrake > 0.05;
    if (brakingInput) {
      const brakeDecel = effectiveAccel * 1.95 * this.smoothBrake * dt;
      if (Math.abs(forwardSpeed) <= brakeDecel) {
        forwardSpeed = 0;
      } else {
        forwardSpeed -= Math.sign(forwardSpeed) * brakeDecel;
      }
    } else if (this.smoothThrottle > 0.04) {
      if (forwardSpeed < -0.3) {
        // Smoothly brake reverse momentum before accelerating forward
        forwardSpeed += effectiveAccel * 1.95 * dt;
      } else {
        const speedNormFwd = THREE.MathUtils.clamp(forwardSpeed / effectiveMaxSpeed, 0, 1);
        const torqueCurve = 1.12 - 0.42 * speedNormFwd;
        forwardSpeed += effectiveAccel * this.smoothThrottle * torqueCurve * dt;
      }
    } else if (this.smoothThrottle < -0.04) {
      if (forwardSpeed > 0.6) {
        // Pressing down/S while moving forward acts as progressive brakes first
        forwardSpeed -= effectiveAccel * 1.95 * Math.abs(this.smoothThrottle) * dt;
      } else {
        forwardSpeed += effectiveAccel * 0.62 * this.smoothThrottle * dt;
      }
    } else {
      // Natural engine braking & rolling resistance
      forwardSpeed = THREE.MathUtils.damp(forwardSpeed, 0, 1.85, dt);
      if (Math.abs(forwardSpeed) < 0.08) forwardSpeed = 0;
    }

    forwardSpeed = THREE.MathUtils.clamp(
      forwardSpeed,
      -effectiveMaxSpeed * 0.42,
      effectiveMaxSpeed,
    );

    // Gradual steering that smoothly returns to center, with reduced angle at high speed
    const speedNorm = THREE.MathUtils.clamp(Math.abs(forwardSpeed) / Math.max(1, effectiveMaxSpeed), 0, 1);
    const highSpeedSteerLimit = THREE.MathUtils.lerp(1.0, 0.46, speedNorm * speedNorm);
    const targetSteer = -steer * 0.56 * highSpeedSteerLimit;
    const steerLambda = Math.abs(steer) > 0.05 ? 8.5 : 11.5;
    this.steerAngle = THREE.MathUtils.damp(this.steerAngle, targetSteer, steerLambda, dt);

    // Heading rotation proportional to speed (zero pivot in place, smooth arc when rolling)
    const speedTurnFactor = THREE.MathUtils.clamp(Math.abs(forwardSpeed) / 6.5, 0, 1);
    const reverseSign = forwardSpeed >= -0.05 ? 1 : -1;
    const yawRate = this.steerAngle * spec.handling * speedTurnFactor * reverseSign;
    this.playerHeading += yawRate * dt;

    // Recompute basis after heading turn and apply tire lateral grip vs. slight drift
    forwardX = -Math.sin(this.playerHeading);
    forwardZ = -Math.cos(this.playerHeading);
    rightX = Math.cos(this.playerHeading);
    rightZ = -Math.sin(this.playerHeading);

    // Induce slight centrifugal drift during hard turns; grass/dirt/sand reduce lateral grip
    const hardCornering = Math.abs(this.steerAngle) > 0.22 && speedNorm > 0.45;
    const lateralGripLambda = (hardCornering ? 4.4 : 9.6) * this.surfaceGripMult;
    if (hardCornering) {
      // Slight tail-out lateral impulse so the car carves with weight instead of feeling on rails
      lateralSpeed += -yawRate * forwardSpeed * 0.085 * dt;
    }
    lateralSpeed = THREE.MathUtils.damp(lateralSpeed, 0, lateralGripLambda, dt);
    lateralSpeed = THREE.MathUtils.clamp(lateralSpeed, -effectiveMaxSpeed * 0.42, effectiveMaxSpeed * 0.42);

    // Reconstruct world-space velocity
    this.velX = forwardX * forwardSpeed + rightX * lateralSpeed;
    this.velZ = forwardZ * forwardSpeed + rightZ * lateralSpeed;

    this.playerX += this.velX * dt;
    this.playerZ += this.velZ * dt;

    // World outer safety clamp (backup to perimeter walls & ocean water collider)
    const bound = WORLD_HALF_EXTENT - 2.2;
    if (this.playerX < -bound) {
      this.playerX = -bound;
      if (this.velX < 0) this.velX = -this.velX * 0.3;
      this.velZ *= 0.72;
    } else if (this.playerX > bound) {
      this.playerX = bound;
      if (this.velX > 0) this.velX = -this.velX * 0.3;
      this.velZ *= 0.72;
    }
    if (this.playerZ < -bound) {
      this.playerZ = -bound;
      if (this.velZ < 0) this.velZ = -this.velZ * 0.3;
      this.velX *= 0.72;
    } else if (this.playerZ > bound) {
      this.playerZ = bound;
      if (this.velZ > 0) this.velZ = -this.velZ * 0.3;
      this.velX *= 0.72;
    }

    // Two-pass collision resolution against buildings, walls, water, and tree trunks ONLY
    const carRadius = 1.45;
    let maxImpactSpeed = 0;
    for (let pass = 0; pass < 2; pass++) {
      for (const box of this.city.colliders) {
        const impact = this.resolveCircleBox(box, carRadius);
        if (impact > maxImpactSpeed) maxImpactSpeed = impact;
      }
      for (const tree of this.city.treeColliders) {
        const impact = this.resolveCircleTree(tree, carRadius);
        if (impact > maxImpactSpeed) maxImpactSpeed = impact;
      }
    }

    if (maxImpactSpeed > 5.8 && this.bumpCooldown <= 0) {
      this.registerCollisionImpact(11, maxImpactSpeed);
    } else if (maxImpactSpeed > 2.6) {
      this.triggerCameraShake(maxImpactSpeed * 0.55);
    }

    this.playerSpeed =
      Math.hypot(this.velX, this.velZ) * (forwardSpeed >= -0.15 ? 1 : -1);

    // Fuel consumption: slower at idle, ~15 min continuous driving for 100 units, faster at top speed
    if (hasFuel) {
      const speedNormFuel = THREE.MathUtils.clamp(Math.abs(this.playerSpeed) / spec.maxSpeed, 0, 1);
      const burnPerSec = (0.015 + 0.16 * Math.pow(speedNormFuel, 1.35)) * spec.fuelUse;
      const burned = Math.min(this.saveState.fuel, burnPerSec * dt);
      const prevFuel = this.saveState.fuel;
      this.saveState.fuel = Math.max(0, prevFuel - burned);
      if (this.activeTrip) {
        this.activeTrip.fuelUsed += burned;
      }
      if (prevFuel > 20 && this.saveState.fuel <= 20) {
        this.callbacks.onNotice('Low fuel (<20%)! Visit a Metro Fuel station.', 'warning');
      } else if (prevFuel > 0 && this.saveState.fuel === 0) {
        this.callbacks.onNotice('Out of fuel! Emergency refuel available.', 'warning');
      }
    }

    // Check if parked on any Fuel Station pad for quick auto-refuel
    let minFuelDist = Infinity;
    let fuelPadRadius = 5.5;
    for (const fs of this.city.fuelStations) {
      const d = Math.hypot(this.playerX - fs.x, this.playerZ - fs.z);
      if (d < minFuelDist) {
        minFuelDist = d;
        fuelPadRadius = fs.padRadius;
      }
    }
    if (
      minFuelDist <= fuelPadRadius &&
      Math.abs(this.playerSpeed) < 3.2 &&
      this.saveState.fuel < this.saveState.fuelMax - 1 &&
      this.refuelCooldown <= 0
    ) {
      this.refuelCooldown = 2.5;
      this.refuelAtStation(true);
    }

    // Ground lock y = 0 so car never lifts or falls through the road
    this.playerRig.group.position.set(this.playerX, 0, this.playerZ);
    this.playerRig.group.rotation.y = this.playerHeading;

    const wheelSpin = (forwardSpeed * dt) / 0.33;
    for (const w of this.playerRig.wheels) {
      w.rotation.x -= wheelSpin;
    }
    for (const pivot of this.playerRig.frontWheelPivots) {
      pivot.rotation.y = this.steerAngle * 0.9;
    }

    // Suspension roll from lateral velocity + steering, pitch from throttle/braking
    const targetRoll = THREE.MathUtils.clamp(
      lateralSpeed * 0.015 + this.steerAngle * speedTurnFactor * 0.09,
      -0.085,
      0.085,
    );
    const targetPitch = brakingInput
      ? 0.04
      : this.smoothThrottle > 0.1
      ? -0.028 * this.smoothThrottle
      : this.smoothThrottle < -0.1
      ? 0.025
      : 0;
    this.playerRig.bodyGroup.rotation.z = THREE.MathUtils.damp(
      this.playerRig.bodyGroup.rotation.z,
      targetRoll,
      10,
      dt,
    );
    this.playerRig.bodyGroup.rotation.x = THREE.MathUtils.damp(
      this.playerRig.bodyGroup.rotation.x,
      targetPitch,
      10,
      dt,
    );

    // Brake light glow
    const braking = brakingInput || (forwardSpeed > 1 && this.smoothThrottle < -0.1);
    this.playerRig.brakeLightMat.emissiveIntensity = braking ? 2.4 : 0.7;

    // Taxi roof sign glows amber when available, dims when carrying fare
    if (this.playerRig.roofSignMat) {
      this.playerRig.roofSignMat.emissiveIntensity = this.activeTrip ? 0.25 : 1.4;
    }

    // Engine, road surface & tire drift audio modulation
    soundEngine.updateEngine(
      Math.abs(this.playerSpeed) / spec.maxSpeed,
      this.smoothThrottle > 0.1,
      {
        braking: brakingInput,
        lateralSlip: Math.abs(lateralSpeed),
        surface: this.currentSurface,
        category: spec.category,
      },
    );

    // Move shadow light target with player for crisp local shadows
    this.dirLight.position.set(this.playerX + 45, 75, this.playerZ + 38);
    this.dirLight.target.position.set(this.playerX, 0, this.playerZ);
  }

  private resolveCircleBox(box: BoxCollider, radius: number): number {
    const closestX = THREE.MathUtils.clamp(this.playerX, box.minX, box.maxX);
    const closestZ = THREE.MathUtils.clamp(this.playerZ, box.minZ, box.maxZ);
    const dx = this.playerX - closestX;
    const dz = this.playerZ - closestZ;
    const distSq = dx * dx + dz * dz;

    if (distSq >= radius * radius) return 0;

    let nx = 0;
    let nz = -1;
    if (distSq > 0.00001) {
      const dist = Math.sqrt(distSq);
      nx = dx / dist;
      nz = dz / dist;
      const overlap = radius - dist;
      this.playerX += nx * overlap;
      this.playerZ += nz * overlap;
    } else {
      // Center penetrated inside box: eject along shallowest axis
      const leftPen = Math.abs(this.playerX - box.minX);
      const rightPen = Math.abs(box.maxX - this.playerX);
      const topPen = Math.abs(this.playerZ - box.minZ);
      const bottomPen = Math.abs(box.maxZ - this.playerZ);
      const minPen = Math.min(leftPen, rightPen, topPen, bottomPen);
      if (minPen === leftPen) {
        nx = -1;
        nz = 0;
        this.playerX = box.minX - radius;
      } else if (minPen === rightPen) {
        nx = 1;
        nz = 0;
        this.playerX = box.maxX + radius;
      } else if (minPen === topPen) {
        nx = 0;
        nz = -1;
        this.playerZ = box.minZ - radius;
      } else {
        nx = 0;
        nz = 1;
        this.playerZ = box.maxZ + radius;
      }
    }

    // Bounce / slide velocity along collision normal
    const vDotN = this.velX * nx + this.velZ * nz;
    if (vDotN < 0) {
      const impactSpeed = -vDotN;
      const restitution = 0.28;
      // Remove inward component + add gentle bounce
      this.velX -= (1 + restitution) * vDotN * nx;
      this.velZ -= (1 + restitution) * vDotN * nz;
      // Apply tangential scraping friction
      this.velX *= 0.76;
      this.velZ *= 0.76;
      return impactSpeed;
    }
    return 0;
  }

  private resolveCircleTree(tree: CircleCollider, carRadius: number): number {
    const dx = this.playerX - tree.x;
    const dz = this.playerZ - tree.z;
    const minDist = carRadius + tree.r;
    const distSq = dx * dx + dz * dz;
    if (distSq >= minDist * minDist) return 0;

    const dist = Math.sqrt(distSq);
    const nx = dist > 0.0001 ? dx / dist : 1;
    const nz = dist > 0.0001 ? dz / dist : 0;
    const overlap = minDist - dist;
    this.playerX += nx * overlap;
    this.playerZ += nz * overlap;

    const vDotN = this.velX * nx + this.velZ * nz;
    if (vDotN < 0) {
      const impactSpeed = -vDotN;
      this.velX -= 1.28 * vDotN * nx;
      this.velZ -= 1.28 * vDotN * nz;
      this.velX *= 0.76;
      this.velZ *= 0.76;
      return impactSpeed;
    }
    return 0;
  }

  private triggerCameraShake(impactSpeed: number): void {
    const strength = THREE.MathUtils.clamp(impactSpeed / 28, 0.12, 0.48);
    this.cameraShakeIntensity = Math.min(0.48, Math.max(this.cameraShakeIntensity, strength));
  }

  private registerCollisionImpact(penalty: number, impactSpeed = 9.5): void {
    this.bumpCooldown = 0.65;
    soundEngine.playBump();
    this.triggerCameraShake(impactSpeed);
    if (this.activeTrip) {
      this.activeTrip.collisions += 1;
      this.activeTrip.smoothness = Math.max(20, this.activeTrip.smoothness - penalty);
    }
  }

  private updateTraffic(dt: number): void {
    const playerRightX = Math.cos(this.playerHeading);
    const playerRightZ = -Math.sin(this.playerHeading);

    let nearestTrafficDist = Infinity;
    let nearestTrafficSpeed = 0;
    let nearestTrafficPan = 0;
    let nearbyMovingCount = 0;

    for (let i = 0; i < this.traffic.length; i++) {
      const car = this.traffic[i];
      const dir = DIR_VECTORS[car.dirIndex];
      if (car.hornCooldown > 0) car.hornCooldown -= dt;

      // Check obstacle distance ahead (player or another traffic car)
      let blocked = false;
      let blockedByPlayer = false;
      const dxFromCar = this.playerX - car.x;
      const dzFromCar = this.playerZ - car.z;
      const distPlayer = Math.hypot(dxFromCar, dzFromCar);

      // Track closest moving NPC vehicle for spatialized traffic drive hum
      if (distPlayer < 55 && car.speed > 1.0) {
        nearbyMovingCount++;
      }
      if (distPlayer < nearestTrafficDist) {
        nearestTrafficDist = distPlayer;
        nearestTrafficSpeed = car.speed;
        const relRight = ((-dxFromCar) * playerRightX + (-dzFromCar) * playerRightZ) / Math.max(1, distPlayer);
        nearestTrafficPan = THREE.MathUtils.clamp(relRight, -1, 1);
      }

      if (distPlayer < 11.5) {
        const dot = (dxFromCar * dir.dx + dzFromCar * dir.dz) / Math.max(0.01, distPlayer);
        if (dot > 0.72) {
          blocked = distPlayer < 9.5;
          blockedByPlayer = true;
        }
      }

      // Trigger realistic traffic horn when player blocks or cuts closely in front of an NPC vehicle
      if (blockedByPlayer) {
        car.blockedTime += dt;
        const pan = THREE.MathUtils.clamp(
          ((-dxFromCar) * playerRightX + (-dzFromCar) * playerRightZ) / Math.max(2, distPlayer),
          -1,
          1,
        );
        const atten = THREE.MathUtils.clamp(1 - distPlayer / 26, 0.25, 1);
        if (car.hornCooldown <= 0 && (car.blockedTime > 0.45 || distPlayer < 6.5)) {
          car.hornCooldown = 5.5 + Math.random() * 4.5;
          soundEngine.playTrafficHorn(pan, atten, i % 3, Math.random() < 0.55);
        }
      } else {
        car.blockedTime = Math.max(0, car.blockedTime - dt * 2);
      }

      // Car-to-player collision with smooth separation and bounce impulse
      const minCarDist = 2.95;
      if (distPlayer < minCarDist) {
        const nx = distPlayer > 0.001 ? dxFromCar / distPlayer : 1;
        const nz = distPlayer > 0.001 ? dzFromCar / distPlayer : 0;
        const push = minCarDist - distPlayer;
        this.playerX += nx * push * 0.85;
        this.playerZ += nz * push * 0.85;

        const relVx = this.velX - dir.dx * car.speed;
        const relVz = this.velZ - dir.dz * car.speed;
        const relDotN = relVx * nx + relVz * nz;
        if (relDotN < 0) {
          this.velX -= 1.32 * relDotN * nx;
          this.velZ -= 1.32 * relDotN * nz;
          this.velX *= 0.72;
          this.velZ *= 0.72;
          if (-relDotN > 4.8 && this.bumpCooldown <= 0) {
            this.registerCollisionImpact(14, -relDotN);
            if (car.hornCooldown <= 0) {
              car.hornCooldown = 4.5;
              const pan = THREE.MathUtils.clamp(
                ((-dxFromCar) * playerRightX + (-dzFromCar) * playerRightZ) / Math.max(2, distPlayer),
                -1,
                1,
              );
              soundEngine.playTrafficHorn(pan, 0.95, i % 3, true);
            }
          } else if (-relDotN > 2.5) {
            this.triggerCameraShake(-relDotN * 0.6);
          }
        }
        car.speed *= 0.35;
      }

      if (!blocked) {
        for (let j = 0; j < this.traffic.length; j++) {
          if (i === j) continue;
          const other = this.traffic[j];
          const d = Math.hypot(other.x - car.x, other.z - car.z);
          if (d < 8.5) {
            const dot =
              ((other.x - car.x) * dir.dx + (other.z - car.z) * dir.dz) / Math.max(0.01, d);
            if (dot > 0.78) {
              blocked = true;
              break;
            }
          }
        }
      }

      const targetSpeed = blocked ? 0 : car.maxSpeed;
      car.speed = THREE.MathUtils.damp(car.speed, targetSpeed, blocked ? 8 : 3.5, dt);

      car.x += dir.dx * car.speed * dt;
      car.z += dir.dz * car.speed * dt;

      // Intersection turning logic
      for (const rx of ROAD_COORDS) {
        for (const rz of ROAD_COORDS) {
          const distToInter = Math.hypot(car.x - rx, car.z - rz);
          const interKey = `${rx},${rz}`;
          if (distToInter < 4.5 && car.lastIntersectionKey !== interKey) {
            car.lastIntersectionKey = interKey;
            const validDirs: number[] = [];
            for (let dIdx = 0; dIdx < 4; dIdx++) {
              // Avoid immediate 180 U-turn unless trapped
              if ((dIdx + 2) % 4 === car.dirIndex) continue;
              const cand = DIR_VECTORS[dIdx];
              const nextX = rx + cand.dx * 25;
              const nextZ = rz + cand.dz * 25;
              if (Math.abs(nextX) <= 88 && Math.abs(nextZ) <= 88) {
                validDirs.push(dIdx);
              }
            }
            if (validDirs.length > 0) {
              const chosen = validDirs[Math.floor(Math.random() * validDirs.length)];
              car.dirIndex = chosen;
              // Snap neatly onto target right-hand lane
              if (chosen === 0) car.x = rx + LANE_OFFSET;
              if (chosen === 2) car.x = rx - LANE_OFFSET;
              if (chosen === 1) car.z = rz + LANE_OFFSET;
              if (chosen === 3) car.z = rz - LANE_OFFSET;
            }
          }
        }
      }

      // Safety wrap if ever outside outer road bounds
      if (Math.abs(car.x) > 92 || Math.abs(car.z) > 92) {
        car.dirIndex = (car.dirIndex + 2) % 4;
        car.x = THREE.MathUtils.clamp(car.x, -86, 86);
        car.z = THREE.MathUtils.clamp(car.z, -86, 86);
      }

      car.group.position.set(car.x, 0, car.z);
      car.group.rotation.y = DIR_VECTORS[car.dirIndex].yaw;
      const spin = (car.speed * dt) / 0.32;
      for (const w of car.wheels) {
        w.rotation.x -= spin;
      }
    }

    // Update spatialized background audio (nearby traffic hum, city ambience, wind, coastal waves)
    const spec = VEHICLE_CATALOG[this.saveState.activeVehicle];
    const dayProgress = 1 - this.saveState.dayTimeRemaining / DAY_DURATION_SECONDS;
    const isDaytime = dayProgress < 0.58 || dayProgress > 0.9;
    soundEngine.updateBackground({
      nearestTrafficDist,
      nearestTrafficSpeed,
      nearestTrafficPan,
      trafficDensity: THREE.MathUtils.clamp(nearbyMovingCount / 4, 0, 1),
      inCity: Math.abs(this.playerX) < 102 && Math.abs(this.playerZ) < 102,
      nearBeach: this.playerX > BEACH_START_X - 28 || this.currentSurface === 'sand',
      isDaytime,
      playerSpeedRatio: THREE.MathUtils.clamp(Math.abs(this.playerSpeed) / spec.maxSpeed, 0, 1.2),
      dt,
    });
  }

  private updateMarkers(dt: number, elapsed: number): void {
    // Gentle shoreline surf shimmer
    if (this.shorelineFoamMesh) {
      this.shorelineFoamMesh.position.x = WATER_START_X + 0.6 + Math.sin(elapsed * 1.8) * 0.45;
    }

    // Free Roam or Private mode: hide taxi job markers & guide chevron so user can cruise anywhere freely
    if (!this.isTaxiJobsActive()) {
      this.guideArrow.visible = false;
      this.dropoffRig.group.visible = false;
      for (const p of this.passengerPool) {
        p.rig.group.visible = false;
      }
      return;
    }

    // Animate passenger beacons & check pickup
    if (!this.activeTrip) {
      this.guideArrowMat.color.setHex(0xfbbf24);
      this.guideArrowMat.emissive.setHex(0xd97706);

      for (let i = 0; i < this.passengerPool.length; i++) {
        const node = this.passengerPool[i];
        node.rig.beacon.rotation.y = elapsed * 2.2;
        node.rig.beacon.position.y = 2.55 + Math.sin(elapsed * 3.4 + i) * 0.22;
        node.rig.waveArm.rotation.z = -2.35 + Math.sin(elapsed * 7 + i) * 0.38;
        node.rig.ring.scale.setScalar(1 + Math.sin(elapsed * 4 + i) * 0.06);
        node.rig.beam.rotation.y = elapsed * 1.4;

        const dist = Math.hypot(this.playerX - node.data.x, this.playerZ - node.data.z);
        if (dist < 4.2 && Math.abs(this.playerSpeed) < 17) {
          this.startTrip(i);
          return;
        }
      }

      // Point guide arrow toward closest passenger
      let nearest = this.passengerPool[0];
      let bestDist = Infinity;
      for (const p of this.passengerPool) {
        const d = Math.hypot(p.data.x - this.playerX, p.data.z - this.playerZ);
        if (d < bestDist) {
          bestDist = d;
          nearest = p;
        }
      }
      if (nearest) {
        const worldAngle = Math.atan2(-(nearest.data.x - this.playerX), -(nearest.data.z - this.playerZ));
        this.guideArrow.rotation.y = worldAngle - this.playerHeading;
        this.guideArrow.position.y = 2.55 + Math.sin(elapsed * 4) * 0.1;
        this.guideArrow.visible = true;
      }
    } else {
      // Active trip timer & drop-off zone check
      this.activeTrip.elapsedTime += dt;
      this.dropoffRig.pillar.rotation.y = elapsed * 1.4;
      this.dropoffRig.ring.scale.setScalar(1 + Math.sin(elapsed * 5) * 0.06);

      this.guideArrowMat.color.setHex(0x10b981);
      this.guideArrowMat.emissive.setHex(0x059669);
      const worldAngle = Math.atan2(
        -(this.activeTrip.dropoffX - this.playerX),
        -(this.activeTrip.dropoffZ - this.playerZ),
      );
      this.guideArrow.rotation.y = worldAngle - this.playerHeading;
      this.guideArrow.position.y = 2.55 + Math.sin(elapsed * 4) * 0.1;
      this.guideArrow.visible = true;

      const distToDrop = Math.hypot(
        this.playerX - this.activeTrip.dropoffX,
        this.playerZ - this.activeTrip.dropoffZ,
      );
      if (distToDrop < 4.4 && Math.abs(this.playerSpeed) < 15) {
        this.completeTrip();
      }
    }
  }

  private startTrip(poolIndex: number): void {
    const chosen = this.passengerPool[poolIndex];
    if (!chosen) return;

    const spec = VEHICLE_CATALOG[this.saveState.activeVehicle];
    const distanceMeters = Math.round(chosen.data.distance * 5);
    const baseFare = Number(
      ((3 + (distanceMeters / 100) * 1.5) * spec.fareMultiplier * (chosen.data.isVVIP ? 1.85 : 1)).toFixed(2),
    );

    this.activeTrip = {
      passengerName: chosen.data.name,
      pickupLabel: chosen.data.pickupLabel,
      dropoffLabel: chosen.data.dropoffLabel,
      dropoffX: chosen.data.dropoffX,
      dropoffZ: chosen.data.dropoffZ,
      distance: chosen.data.distance,
      parTime: chosen.data.parTime,
      elapsedTime: 0,
      smoothness: 100,
      collisions: 0,
      baseFare,
      fuelUsed: 0,
      isVVIP: chosen.data.isVVIP,
    };

    // Remove picked-up passenger from scene & pool
    this.scene.remove(chosen.rig.group);
    this.passengerPool.splice(poolIndex, 1);

    // Hide remaining waiting passengers during active ride
    for (const p of this.passengerPool) {
      p.rig.group.visible = false;
    }

    // Place dropoff beacon
    this.dropoffRig.group.position.set(this.activeTrip.dropoffX, 0, this.activeTrip.dropoffZ);
    this.dropoffRig.group.visible = true;

    soundEngine.playPickup();
    this.callbacks.onNotice(
      `Picked up ${this.activeTrip.passengerName} → ${this.activeTrip.dropoffLabel}`,
      'info',
    );
    this.emitMinimapSnapshot();
  }

  private completeTrip(): void {
    if (!this.activeTrip) return;

    const trip = this.activeTrip;
    const par = trip.parTime;
    const actual = Math.max(0.5, trip.elapsedTime);
    const distanceMeters = Math.round(trip.distance * 5);

    // Tip up to 30% for arriving early; gradual late penalty (never drops fare to zero)
    let tipBonus = 0;
    let latePenalty = 0;
    if (actual < par) {
      const earlyRatio = (par - actual) / par;
      const tipRate = THREE.MathUtils.clamp(earlyRatio / 0.5, 0, 1) * 0.30;
      tipBonus = Number((trip.baseFare * tipRate).toFixed(2));
    } else if (actual > par) {
      const overtimeRatio = (actual - par) / par;
      const penaltyRate = Math.min(0.60, overtimeRatio * 0.48);
      latePenalty = Number((trip.baseFare * penaltyRate).toFixed(2));
    }

    const fuelCost = Number((trip.fuelUsed * FUEL_PRICE_PER_UNIT).toFixed(2));
    const totalEarned = Number(Math.max(1.5, trip.baseFare + tipBonus - latePenalty).toFixed(2));

    // Rating calculation (3.0 to 5.0 stars)
    const smoothFactor = trip.smoothness / 100;
    const speedScore = actual <= par ? 1 : THREE.MathUtils.clamp(par / actual, 0.4, 1);
    const tripRating = Number(
      THREE.MathUtils.clamp(2.8 + speedScore * 1.1 + smoothFactor * 1.1, 3.0, 5.0).toFixed(1),
    );

    const prevCount = this.saveState.ratingCount;
    const weight = Math.min(prevCount, 12);
    const nextRating = Number(
      ((this.saveState.rating * weight + tripRating) / (weight + 1)).toFixed(2),
    );

    this.saveState.money = Number((this.saveState.money + totalEarned).toFixed(2));
    this.saveState.rating = nextRating;
    this.saveState.ratingCount = prevCount + 1;
    this.saveState.completedTrips += 1;
    this.saveState.totalEarnings = Number((this.saveState.totalEarnings + totalEarned).toFixed(2));
    if (tripRating >= 4.95) {
      this.saveState.fiveStarTrips += 1;
    }

    this.tripsToday += 1;
    this.earningsToday += totalEarned;

    this.receiptCounter += 1;
    const receipt: FareReceipt = {
      id: this.receiptCounter,
      passengerName: trip.passengerName,
      dropoffLabel: trip.dropoffLabel,
      distanceMeters,
      elapsedTime: actual,
      parTime: par,
      baseFare: trip.baseFare,
      tipBonus,
      latePenalty,
      fuelCost,
      totalEarned,
      ratingEarned: tripRating,
      newRating: nextRating,
    };

    this.activeTrip = null;
    this.dropoffRig.group.visible = false;
    this.ensurePassengerMarkers();

    this.evaluateAchievementsAndStages();

    soundEngine.playDropoff();
    persistSaveState(this.saveState);
    this.callbacks.onStateChange({ ...this.saveState });
    this.callbacks.onFareComplete(receipt);
    this.emitMinimapSnapshot();
  }

  private updateDayCycle(dt: number): void {
    if (!this.isTaxiJobsActive()) return;
    this.saveState.dayTimeRemaining -= dt;
    if (this.saveState.dayTimeRemaining <= 0) {
      const stage = getStageSpec(this.saveState.currentStage);
      const rentalFee = stage.dailyRentalFee;

      if (rentalFee > 0) {
        this.saveState.money = Number((this.saveState.money - rentalFee).toFixed(2));
        this.saveState.totalRentalPaid += rentalFee;
      }
      this.saveState.currentDay += 1;
      this.saveState.dayTimeRemaining = DAY_DURATION_SECONDS;

      this.dayEventCounter += 1;
      const summary: DaySummary = {
        id: this.dayEventCounter,
        day: this.saveState.currentDay - 1,
        rentalFee,
        balanceAfter: this.saveState.money,
        tripsCompleted: this.tripsToday,
        grossEarnings: this.earningsToday,
      };

      this.tripsToday = 0;
      this.earningsToday = 0;

      if (rentalFee > 0) {
        soundEngine.playDayFee();
      }
      persistSaveState(this.saveState);
      this.callbacks.onStateChange({ ...this.saveState });
      this.callbacks.onDayComplete(summary);
    }
  }

  private updateTimeOfDayAndSignals(elapsed: number): void {
    // Visual day-night progression synced to the 75s in-game day cycle
    const dayProgress = THREE.MathUtils.clamp(
      1 - this.saveState.dayTimeRemaining / DAY_DURATION_SECONDS,
      0,
      1,
    );

    let nightMix = 0;
    let sunsetMix = 0;

    if (dayProgress < 0.5) {
      nightMix = 0;
      sunsetMix = 0;
    } else if (dayProgress < 0.66) {
      const p = (dayProgress - 0.5) / 0.16;
      nightMix = THREE.MathUtils.smoothstep(p, 0.15, 1.0);
      sunsetMix = Math.sin(p * Math.PI);
    } else if (dayProgress < 0.88) {
      nightMix = 1;
      sunsetMix = 0;
    } else {
      const p = (dayProgress - 0.88) / 0.12;
      nightMix = 1 - THREE.MathUtils.smoothstep(p, 0.0, 0.85);
      sunsetMix = Math.sin(p * Math.PI) * 0.8;
    }

    // Update Sky Gradient Dome & matching distance Fog
    const topCol = this.skyDome.material.uniforms.uTopColor.value as THREE.Color;
    topCol.copy(DAY_TOP_COLOR).lerp(NIGHT_TOP_COLOR, nightMix).lerp(SUNSET_TOP_COLOR, sunsetMix * 0.65);

    const horCol = this.skyDome.material.uniforms.uHorizonColor.value as THREE.Color;
    horCol
      .copy(DAY_HORIZON_COLOR)
      .lerp(NIGHT_HORIZON_COLOR, nightMix)
      .lerp(SUNSET_HORIZON_COLOR, sunsetMix * 0.85);

    if (this.scene.fog instanceof THREE.Fog) {
      this.scene.fog.color.copy(horCol);
      this.scene.fog.near = THREE.MathUtils.lerp(115, 85, nightMix);
      this.scene.fog.far = THREE.MathUtils.lerp(300, 240, nightMix);
    }

    this.skyDome.material.uniforms.uNightMix.value = nightMix;
    this.skyDome.mesh.position.set(this.playerX, 0, this.playerZ);

    // Sun/Moon directional & hemisphere lighting
    const sunAngle = dayProgress * Math.PI * 2;
    const sunDir = this.skyDome.material.uniforms.uSunDir.value as THREE.Vector3;
    sunDir.set(Math.cos(sunAngle) * 0.6, Math.max(0.18, Math.sin(sunAngle) * 0.85 + 0.35), 0.35).normalize();

    this.dirLight.color
      .copy(DAY_SUN_COLOR)
      .lerp(NIGHT_MOON_COLOR, nightMix)
      .lerp(SUNSET_SUN_COLOR, sunsetMix * 0.8);
    this.dirLight.intensity = THREE.MathUtils.lerp(1.55, 0.42, nightMix);

    this.hemiLight.color.copy(DAY_HEMI_SKY).lerp(NIGHT_HEMI_SKY, nightMix);
    this.hemiLight.groundColor.copy(DAY_HEMI_GND).lerp(NIGHT_HEMI_GND, nightMix);
    this.hemiLight.intensity = THREE.MathUtils.lerp(0.85, 0.44, nightMix);
    this.rimLight.intensity = THREE.MathUtils.lerp(0.42, 0.25, nightMix);

    // Building lit windows, streetlamps & taxi headlights
    const windowGlow = THREE.MathUtils.smoothstep(nightMix + sunsetMix * 0.35, 0.15, 0.9);
    for (let i = 0; i < this.buildingWindowMats.length; i++) {
      this.buildingWindowMats[i].emissiveIntensity = windowGlow * 1.15;
    }
    if (this.streetLampBulbMat) {
      this.streetLampBulbMat.emissiveIntensity = 0.2 + windowGlow * 1.8;
    }

    this.playerRig.headlightMat.emissiveIntensity = 0.75 + windowGlow * 2.1;
    this.playerRig.headlightBeamMat.opacity = windowGlow * 0.16;
    this.playerRig.headlightSpot.intensity = windowGlow * 28;

    // Traffic light cycle (purely visual)
    const phaseTime = elapsed % 9.0;
    const g0 = this.trafficSignalMats[0];
    const g1 = this.trafficSignalMats[1];
    if (g0 && g1) {
      if (phaseTime < 3.6) {
        g0.green.emissiveIntensity = 1.8;
        g0.amber.emissiveIntensity = 0.08;
        g0.red.emissiveIntensity = 0.08;
        g1.green.emissiveIntensity = 0.08;
        g1.amber.emissiveIntensity = 0.08;
        g1.red.emissiveIntensity = 1.8;
      } else if (phaseTime < 4.5) {
        g0.green.emissiveIntensity = 0.08;
        g0.amber.emissiveIntensity = 1.8;
        g0.red.emissiveIntensity = 0.08;
        g1.green.emissiveIntensity = 0.08;
        g1.amber.emissiveIntensity = 0.08;
        g1.red.emissiveIntensity = 1.8;
      } else if (phaseTime < 8.1) {
        g0.green.emissiveIntensity = 0.08;
        g0.amber.emissiveIntensity = 0.08;
        g0.red.emissiveIntensity = 1.8;
        g1.green.emissiveIntensity = 1.8;
        g1.amber.emissiveIntensity = 0.08;
        g1.red.emissiveIntensity = 0.08;
      } else {
        g0.green.emissiveIntensity = 0.08;
        g0.amber.emissiveIntensity = 0.08;
        g0.red.emissiveIntensity = 1.8;
        g1.green.emissiveIntensity = 0.08;
        g1.amber.emissiveIntensity = 1.8;
        g1.red.emissiveIntensity = 0.08;
      }
    }
  }

  private updateCamera(dt: number): void {
    const spec = VEHICLE_CATALOG[this.saveState.activeVehicle];
    const speedRatio = THREE.MathUtils.clamp(Math.abs(this.playerSpeed) / spec.maxSpeed, 0, 1);

    const forwardX = -Math.sin(this.playerHeading);
    const forwardZ = -Math.cos(this.playerHeading);

    // Blend heading slightly with travel velocity direction so drifts look fluid
    let followX = forwardX;
    let followZ = forwardZ;
    const speedMag = Math.hypot(this.velX, this.velZ);
    if (speedMag > 3 && this.playerSpeed > 0) {
      const vxNorm = this.velX / speedMag;
      const vzNorm = this.velZ / speedMag;
      followX = THREE.MathUtils.lerp(forwardX, vxNorm, 0.32);
      followZ = THREE.MathUtils.lerp(forwardZ, vzNorm, 0.32);
      const len = Math.hypot(followX, followZ) || 1;
      followX /= len;
      followZ /= len;
    }

    // Smoothly interpolate mode blend (0 = chase, 1 = overhead)
    const targetModeBlend = this.saveState.cameraMode === 'overhead' ? 1 : 0;
    this.camModeBlend = THREE.MathUtils.damp(this.camModeBlend, targetModeBlend, 4.6, dt);
    const t = this.camModeBlend * this.camModeBlend * (3 - 2 * this.camModeBlend);

    // Chase pose
    const distBack = 10.6 + speedRatio * 4.2;
    const chaseHeight = 5.6 + speedRatio * 1.35;
    const chasePosX = this.playerX - followX * distBack;
    const chasePosY = chaseHeight;
    const chasePosZ = this.playerZ - followZ * distBack;
    const chaseLookX = this.playerX + followX * 4.8;
    const chaseLookY = 1.35;
    const chaseLookZ = this.playerZ + followZ * 4.8;
    const chaseFov = 55 + speedRatio * 9;

    // Overhead pose
    const overPosX = this.playerX;
    const overPosY = 34;
    const overPosZ = this.playerZ + 18;
    const overLookX = this.playerX;
    const overLookY = 0;
    const overLookZ = this.playerZ;
    const overFov = 50;

    // Interpolated camera position, lookAt target, and FOV
    _camPosTarget.set(
      THREE.MathUtils.lerp(chasePosX, overPosX, t),
      THREE.MathUtils.lerp(chasePosY, overPosY, t),
      THREE.MathUtils.lerp(chasePosZ, overPosZ, t),
    );
    _camTarget.set(
      THREE.MathUtils.lerp(chaseLookX, overLookX, t),
      THREE.MathUtils.lerp(chaseLookY, overLookY, t),
      THREE.MathUtils.lerp(chaseLookZ, overLookZ, t),
    );
    const targetFov = THREE.MathUtils.lerp(chaseFov, overFov, t);

    if (!this.camInitialized) {
      this.camera.position.copy(_camPosTarget);
      this.camLookCurrent.copy(_camTarget);
      this.camera.fov = targetFov;
      this.camera.updateProjectionMatrix();
      this.camInitialized = true;
    } else {
      const posLambda = THREE.MathUtils.lerp(6.4, 5.2, t);
      this.camera.position.x = THREE.MathUtils.damp(this.camera.position.x, _camPosTarget.x, posLambda, dt);
      this.camera.position.y = Math.max(
        1.6,
        THREE.MathUtils.damp(this.camera.position.y, _camPosTarget.y, posLambda, dt),
      );
      this.camera.position.z = THREE.MathUtils.damp(this.camera.position.z, _camPosTarget.z, posLambda, dt);

      const lookLambda = 8.5;
      this.camLookCurrent.x = THREE.MathUtils.damp(this.camLookCurrent.x, _camTarget.x, lookLambda, dt);
      this.camLookCurrent.y = THREE.MathUtils.damp(this.camLookCurrent.y, _camTarget.y, lookLambda, dt);
      this.camLookCurrent.z = THREE.MathUtils.damp(this.camLookCurrent.z, _camTarget.z, lookLambda, dt);

      if (Math.abs(this.camera.fov - targetFov) > 0.04) {
        this.camera.fov = THREE.MathUtils.damp(this.camera.fov, targetFov, 5.5, dt);
        this.camera.updateProjectionMatrix();
      }
    }

    // Subtle damped collision shake
    this.cameraShakeIntensity = THREE.MathUtils.damp(this.cameraShakeIntensity, 0, 9.5, dt);
    _vec3A.copy(this.camLookCurrent);

    if (this.cameraShakeIntensity > 0.002) {
      this.cameraShakeTime += dt * 44;
      const shakeX =
        (Math.sin(this.cameraShakeTime * 1.15) * 0.65 +
          Math.cos(this.cameraShakeTime * 2.4) * 0.35) *
        this.cameraShakeIntensity;
      const shakeY =
        (Math.cos(this.cameraShakeTime * 1.45) * 0.6 +
          Math.sin(this.cameraShakeTime * 2.9) * 0.4) *
        this.cameraShakeIntensity *
        0.75;
      const shakeZ =
        (Math.sin(this.cameraShakeTime * 1.8) * 0.55 +
          Math.cos(this.cameraShakeTime * 2.1) * 0.45) *
        this.cameraShakeIntensity *
        0.5;

      this.camera.position.x += shakeX;
      this.camera.position.y = Math.max(1.6, this.camera.position.y + shakeY);
      this.camera.position.z += shakeZ;

      _vec3A.x += shakeX * 0.4;
      _vec3A.y += shakeY * 0.35;
    }

    this.camera.lookAt(_vec3A);
  }

  private syncHudAndSaves(dt: number): void {
    this.hudSyncTimer += dt;
    this.saveSyncTimer += dt;

    if (this.hudSyncTimer >= 0.08) {
      this.hudSyncTimer = 0;
      this.emitMinimapSnapshot();
      this.callbacks.onStateChange({ ...this.saveState });
    }

    if (this.saveSyncTimer >= 2.5) {
      this.saveSyncTimer = 0;
      persistSaveState(this.saveState);
    }
  }

  private emitMinimapSnapshot(): void {
    let minFuelDist = Infinity;
    let nearestFuelPad = 5.5;
    for (const fs of this.city.fuelStations) {
      const d = Math.hypot(this.playerX - fs.x, this.playerZ - fs.z);
      if (d < minFuelDist) {
        minFuelDist = d;
        nearestFuelPad = fs.padRadius;
      }
    }
    const distRental = Math.hypot(
      this.playerX - this.city.rentalShop.x,
      this.playerZ - this.city.rentalShop.z,
    );

    let distanceToTarget = 0;
    let targetBearingAngle = 0;

    const activeSpec = VEHICLE_CATALOG[this.saveState.activeVehicle];
    const taxiServiceActive = this.isTaxiJobsActive();
    const showPassengers = taxiServiceActive && !this.activeTrip;

    if (this.activeTrip) {
      distanceToTarget = Math.hypot(
        this.activeTrip.dropoffX - this.playerX,
        this.activeTrip.dropoffZ - this.playerZ,
      );
      const worldAngle = Math.atan2(
        -(this.activeTrip.dropoffX - this.playerX),
        -(this.activeTrip.dropoffZ - this.playerZ),
      );
      targetBearingAngle = worldAngle - this.playerHeading;
    } else if (showPassengers && this.passengerPool.length > 0) {
      let best = this.passengerPool[0];
      let bestD = Infinity;
      for (const p of this.passengerPool) {
        const d = Math.hypot(p.data.x - this.playerX, p.data.z - this.playerZ);
        if (d < bestD) {
          bestD = d;
          best = p;
        }
      }
      distanceToTarget = bestD;
      const worldAngle = Math.atan2(-(best.data.x - this.playerX), -(best.data.z - this.playerZ));
      targetBearingAngle = worldAngle - this.playerHeading;
    }

    this.callbacks.onMinimapUpdate({
      playerX: this.playerX,
      playerZ: this.playerZ,
      playerHeading: this.playerHeading,
      speedKmh: Math.round(Math.abs(this.playerSpeed) * 3.6),
      fuel: this.saveState.fuel,
      fuelMax: this.saveState.fuelMax,
      nearFuelStation: minFuelDist <= nearestFuelPad + 2.5,
      nearestFuelDistance: Number.isFinite(minFuelDist) ? Math.round(minFuelDist * 5) : 0,
      nearRentalShop: distRental <= this.city.rentalShop.padRadius + 2.5,
      passengers: showPassengers
        ? this.passengerPool.map((p) => ({
            id: p.data.id,
            x: p.data.x,
            z: p.data.z,
            isVVIP: p.data.isVVIP,
            label: p.data.pickupLabel,
          }))
        : [],
      activeTrip: this.activeTrip ? { ...this.activeTrip } : null,
      distanceToTarget: Math.round(distanceToTarget * 5),
      targetBearingAngle,
      fuelStations: this.city.fuelStations.map((fs) => ({ x: fs.x, z: fs.z })),
      rentalShop: { x: this.city.rentalShop.x, z: this.city.rentalShop.z },
      traffic: this.traffic.map((t) => ({ x: t.x, z: t.z })),
      cityHalfExtent: WORLD_HALF_EXTENT,
      gameMode: this.saveState.gameMode,
      surfaceType: this.currentSurface,
      taxiServiceActive,
      activeVehicleTaxiCapable: activeSpec.taxiCapable,
    });
  }

  private handleResize = (): void => {
    if (this.isDisposed) return;
    const width = Math.max(1, this.container.clientWidth || window.innerWidth);
    const height = Math.max(1, this.container.clientHeight || window.innerHeight);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(this.getTargetPixelRatio());
  };

  private handleContextLost = (e: Event): void => {
    e.preventDefault();
    this.contextLost = true;
    this.callbacks.onWebglError('3D graphics context paused. Restoring view...');
  };

  private handleContextRestored = (): void => {
    this.contextLost = false;
    this.callbacks.onNotice('3D graphics context restored.', 'info');
  };

  public dispose(): void {
    this.isDisposed = true;
    cancelAnimationFrame(this.frameId);
    window.clearTimeout(this.frameId);
    window.removeEventListener('resize', this.handleResize);
    soundEngine.updateEngine(0, false);

    if (this.renderer) {
      const canvas = this.renderer.domElement;
      canvas.removeEventListener('webglcontextlost', this.handleContextLost);
      canvas.removeEventListener('webglcontextrestored', this.handleContextRestored);
    }

    this.scene.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const mesh = obj as THREE.Mesh;
        mesh.geometry?.dispose();
        if (Array.isArray(mesh.material)) {
          mesh.material.forEach((m) => m.dispose());
        } else {
          mesh.material?.dispose();
        }
      }
    });

    for (const d of this.disposables) {
      d.dispose();
    }
    this.renderer?.dispose();
    persistSaveState(this.saveState);
  }
}
