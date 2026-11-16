import * as THREE from 'three';
import { CarBodyShape, HeadlightStyle, TaillightStyle, VehicleSpec } from '../types/game';

export interface PlayerTaxiRig {
  group: THREE.Group;
  wheels: THREE.Mesh[];
  frontWheelPivots: THREE.Group[];
  bodyGroup: THREE.Group;
  roofSignMat?: THREE.MeshStandardMaterial;
  brakeLightMat: THREE.MeshStandardMaterial;
  headlightMat: THREE.MeshStandardMaterial;
  headlightBeamMat: THREE.MeshBasicMaterial;
  headlightSpot: THREE.SpotLight;
}

export interface SkyDomeRig {
  mesh: THREE.Mesh;
  material: THREE.ShaderMaterial;
}

function createRadialShadowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(64, 64, 8, 64, 64, 60);
  grad.addColorStop(0, 'rgba(15, 23, 42, 0.58)');
  grad.addColorStop(0.55, 'rgba(15, 23, 42, 0.28)');
  grad.addColorStop(1, 'rgba(15, 23, 42, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

let cachedShadowTex: THREE.CanvasTexture | null = null;
function getContactShadowTexture(): THREE.CanvasTexture {
  if (!cachedShadowTex) {
    cachedShadowTex = createRadialShadowTexture();
  }
  return cachedShadowTex;
}

export function createSkyDome(): SkyDomeRig {
  const geo = new THREE.SphereGeometry(390, 24, 16);
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uTopColor: { value: new THREE.Color(0x5b9bd5) },
      uHorizonColor: { value: new THREE.Color(0xc5e1f7) },
      uSunDir: { value: new THREE.Vector3(0.4, 0.7, 0.3).normalize() },
      uSunColor: { value: new THREE.Color(0xfff1c9) },
      uNightMix: { value: 0.0 },
    },
    vertexShader: `
      varying vec3 vWorldDir;
      void main() {
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vWorldDir = normalize(position);
        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `,
    fragmentShader: `
      uniform vec3 uTopColor;
      uniform vec3 uHorizonColor;
      uniform vec3 uSunDir;
      uniform vec3 uSunColor;
      uniform float uNightMix;
      varying vec3 vWorldDir;

      float hash(vec3 p) {
        p = fract(p * 0.3183099 + 0.1);
        p *= 17.0;
        return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
      }

      void main() {
        vec3 dir = normalize(vWorldDir);
        float h = clamp(dir.y, 0.0, 1.0);
        float curve = pow(h, 0.55);
        vec3 col = mix(uHorizonColor, uTopColor, curve);

        // Soft sun / moon halo
        float sunAmt = max(dot(dir, normalize(uSunDir)), 0.0);
        col += uSunColor * pow(sunAmt, 16.0) * (0.45 - 0.25 * uNightMix);
        col += uSunColor * smoothstep(0.996, 0.9992, sunAmt) * 0.85;

        // Subtle crisp stars at night
        if (uNightMix > 0.05 && dir.y > 0.08) {
          float star = step(0.9965, hash(floor(dir * 170.0)));
          col += vec3(0.85, 0.92, 1.0) * star * uNightMix * smoothstep(0.08, 0.35, dir.y);
        }

        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });

  const mesh = new THREE.Mesh(geo, material);
  mesh.frustumCulled = false;
  return { mesh, material };
}

export function createTaxiCheckersTexture(bgHex = '#f4b41a', checkHex = '#0f172a'): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = bgHex;
  ctx.fillRect(0, 0, 512, 64);

  const cellW = 32;
  const cellH = 32;
  ctx.fillStyle = checkHex;
  for (let x = 0; x < 512; x += cellW) {
    for (let row = 0; row < 2; row++) {
      if ((x / cellW + row) % 2 === 0) {
        ctx.fillRect(x, row * cellH, cellW, cellH);
      }
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  return tex;
}

export function createTaxiRoofSignTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 96;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#fde047';
  ctx.fillRect(0, 0, 256, 96);

  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 8;
  ctx.strokeRect(4, 4, 248, 88);

  ctx.fillStyle = '#0f172a';
  ctx.font = '900 54px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('TAXI', 128, 50);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createBuildingTextures(
  baseColorHex: number,
  maxAnisotropy: number,
): { map: THREE.CanvasTexture; emissiveMap: THREE.CanvasTexture } {
  const colorCanvas = document.createElement('canvas');
  colorCanvas.width = 256;
  colorCanvas.height = 512;
  const ctx = colorCanvas.getContext('2d')!;

  const emissiveCanvas = document.createElement('canvas');
  emissiveCanvas.width = 256;
  emissiveCanvas.height = 512;
  const ectx = emissiveCanvas.getContext('2d')!;

  const baseColor = new THREE.Color(baseColorHex);
  ctx.fillStyle = `#${baseColor.getHexString()}`;
  ctx.fillRect(0, 0, 256, 512);

  ectx.fillStyle = '#000000';
  ectx.fillRect(0, 0, 256, 512);

  // Subtle horizontal cornice bands
  ctx.fillStyle = 'rgba(15, 23, 42, 0.1)';
  for (let y = 0; y < 512; y += 64) {
    ctx.fillRect(0, y, 256, 5);
  }

  const cols = 4;
  const rows = 8;
  const padX = 18;
  const padY = 14;
  const winW = (256 - padX * (cols + 1)) / cols;
  const winH = (512 - padY * (rows + 1)) / rows;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const wx = padX + c * (winW + padX);
      const wy = padY + r * (winH + padY);
      const hash = (r * 11 + c * 17 + baseColorHex) % 7;
      const isLitAtNight = hash === 0 || hash === 2 || hash === 5;

      // Daytime window glass
      ctx.fillStyle = '#263344';
      ctx.fillRect(wx, wy, winW, winH);
      ctx.fillStyle = 'rgba(255,255,255,0.22)';
      ctx.fillRect(wx, wy, winW, 3);

      // Nighttime emissive glow (warm gold or cool interior blue)
      if (isLitAtNight) {
        ectx.fillStyle = hash === 5 ? '#bae6fd' : '#fde047';
        ectx.fillRect(wx + 2, wy + 2, winW - 4, winH - 4);
      }
    }
  }

  const map = new THREE.CanvasTexture(colorCanvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.anisotropy = maxAnisotropy;

  const emissiveMap = new THREE.CanvasTexture(emissiveCanvas);
  emissiveMap.colorSpace = THREE.SRGBColorSpace;
  emissiveMap.wrapS = THREE.RepeatWrapping;
  emissiveMap.wrapT = THREE.RepeatWrapping;
  emissiveMap.anisotropy = maxAnisotropy;

  return { map, emissiveMap };
}

export function createRoadTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#333b48';
  ctx.fillRect(0, 0, 512, 512);

  for (let i = 0; i < 2000; i++) {
    const x = (i * 73) % 512;
    const y = (i * 137) % 512;
    ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.06)';
    ctx.fillRect(x, y, 2, 2);
  }

  // Double dashed yellow centerline
  ctx.fillStyle = '#eab308';
  for (let y = 16; y < 512; y += 64) {
    ctx.fillRect(251, y, 10, 36);
  }

  // Crisp white edge lines
  ctx.fillStyle = '#e2e8f0';
  ctx.fillRect(14, 0, 6, 512);
  ctx.fillRect(492, 0, 6, 512);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

export function createIntersectionTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#333b48';
  ctx.fillRect(0, 0, 512, 512);

  // Zebra crosswalk bars on all 4 approaches
  ctx.fillStyle = '#e2e8f0';
  const stripeW = 24;
  const stripeLen = 58;
  const gap = 28;
  for (let offset = 36; offset < 460; offset += stripeW + gap) {
    // North & South crosswalks
    ctx.fillRect(offset, 10, stripeW, stripeLen);
    ctx.fillRect(offset, 512 - 10 - stripeLen, stripeW, stripeLen);
    // West & East crosswalks
    ctx.fillRect(10, offset, stripeLen, stripeW);
    ctx.fillRect(512 - 10 - stripeLen, offset, stripeLen, stripeW);
  }

  // Right-hand lane stop bars just before crosswalks
  ctx.fillStyle = 'rgba(248, 250, 252, 0.88)';
  ctx.fillRect(264, 496, 224, 8);
  ctx.fillRect(24, 8, 224, 8);
  ctx.fillRect(8, 264, 8, 224);
  ctx.fillRect(496, 24, 8, 224);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

export function createHighwayTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#2e3643';
  ctx.fillRect(0, 0, 512, 512);

  for (let i = 0; i < 1800; i++) {
    const x = (i * 89) % 512;
    const y = (i * 149) % 512;
    ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.06)';
    ctx.fillRect(x, y, 2, 2);
  }

  // Solid double yellow median stripe
  ctx.fillStyle = '#eab308';
  ctx.fillRect(247, 0, 6, 512);
  ctx.fillRect(259, 0, 6, 512);

  // Dashed white lane dividers (4-lane highway)
  ctx.fillStyle = '#e2e8f0';
  for (let y = 16; y < 512; y += 64) {
    ctx.fillRect(130, y, 6, 36);
    ctx.fillRect(376, y, 6, 36);
  }

  // Crisp outer shoulder lines
  ctx.fillRect(12, 0, 7, 512);
  ctx.fillRect(493, 0, 7, 512);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

export function createDirtTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#a8845c';
  ctx.fillRect(0, 0, 256, 256);

  for (let i = 0; i < 1600; i++) {
    const x = (i * 67) % 256;
    const y = (i * 113) % 256;
    ctx.fillStyle = i % 3 === 0 ? 'rgba(120, 82, 45, 0.22)' : 'rgba(222, 194, 152, 0.18)';
    ctx.fillRect(x, y, 3, 3);
  }

  // Subtle tire track ruts
  ctx.fillStyle = 'rgba(104, 70, 38, 0.25)';
  ctx.fillRect(68, 0, 18, 256);
  ctx.fillRect(170, 0, 18, 256);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

export function createSignTexture(title: string, bgHex: string, fgHex: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = bgHex;
  ctx.fillRect(0, 0, 512, 128);
  ctx.strokeStyle = fgHex;
  ctx.lineWidth = 6;
  ctx.strokeRect(8, 8, 496, 112);

  ctx.fillStyle = fgHex;
  ctx.font = 'bold 42px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(title, 256, 66);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export interface CarBuildParams {
  length: number;
  width: number;
  height: number;
  bodyShape: CarBodyShape;
  color: number;
  accentColor?: number;
  wheelSize: {
    radius: number;
    width: number;
  };
  lights: {
    headStyle: HeadlightStyle;
    tailStyle: TaillightStyle;
    hasRoofSign?: boolean;
    hasCheckerStripe?: boolean;
  };
  maxAnisotropy?: number;
  includeNightHeadlightBeams?: boolean;
  includeContactShadow?: boolean;
}

export interface BuiltCarRig {
  group: THREE.Group;
  bodyGroup: THREE.Group;
  wheels: THREE.Mesh[];
  frontWheelPivots: THREE.Group[];
  roofSignMat?: THREE.MeshStandardMaterial;
  brakeLightMat: THREE.MeshStandardMaterial;
  headlightMat: THREE.MeshStandardMaterial;
  headlightBeamMat?: THREE.MeshBasicMaterial;
  headlightSpot?: THREE.SpotLight;
}

export function disposeCarRig(root: THREE.Object3D): void {
  root.traverse((obj) => {
    if ((obj as THREE.Mesh).isMesh) {
      const mesh = obj as THREE.Mesh;
      mesh.geometry?.dispose();
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of mats) {
        if (!m) continue;
        const std = m as THREE.MeshStandardMaterial;
        if (std.map && std.map !== cachedShadowTex) {
          std.map.dispose();
        }
        if (std.emissiveMap && std.emissiveMap !== cachedShadowTex) {
          std.emissiveMap.dispose();
        }
        m.dispose();
      }
    }
  });
}

function createFallbackBoxCar(params: CarBuildParams): BuiltCarRig {
  const L = Math.max(2.4, params.length || 4.0);
  const W = Math.max(1.2, params.width || 1.8);
  const H = Math.max(1.0, params.height || 1.45);
  const wr = Math.max(0.2, params.wheelSize?.radius || 0.3);
  const ww = Math.max(0.14, params.wheelSize?.width || 0.22);

  const group = new THREE.Group();
  const bodyGroup = new THREE.Group();
  const paintMat = new THREE.MeshStandardMaterial({ color: params.color ?? 0xf4b41a, roughness: 0.4 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.2 });
  const tireMat = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.9 });
  const headlightMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0xfef9c3,
    emissiveIntensity: 1.0,
  });
  const brakeLightMat = new THREE.MeshStandardMaterial({
    color: 0xdc2626,
    emissive: 0xef4444,
    emissiveIntensity: 0.7,
  });

  const lowerBox = new THREE.Mesh(new THREE.BoxGeometry(W, H * 0.48, L), paintMat);
  lowerBox.position.y = wr * 0.5 + H * 0.24;
  bodyGroup.add(lowerBox);

  const cabinBox = new THREE.Mesh(new THREE.BoxGeometry(W * 0.84, H * 0.38, L * 0.52), glassMat);
  cabinBox.position.y = wr * 0.5 + H * 0.48 + H * 0.19;
  bodyGroup.add(cabinBox);

  const wheels: THREE.Mesh[] = [];
  const frontWheelPivots: THREE.Group[] = [];
  const wheelGeo = new THREE.CylinderGeometry(wr, wr, ww, 12);
  wheelGeo.rotateZ(Math.PI / 2);

  for (const [xSign, zSign, isFront] of [
    [-1, -1, true],
    [1, -1, true],
    [-1, 1, false],
    [1, 1, false],
  ] as const) {
    const wheel = new THREE.Mesh(wheelGeo, tireMat);
    if (isFront) {
      const pivot = new THREE.Group();
      pivot.position.set(xSign * (W * 0.46), wr, zSign * (L * 0.31));
      pivot.add(wheel);
      group.add(pivot);
      frontWheelPivots.push(pivot);
    } else {
      wheel.position.set(xSign * (W * 0.46), wr, zSign * (L * 0.31));
      group.add(wheel);
    }
    wheels.push(wheel);
  }

  let headlightBeamMat: THREE.MeshBasicMaterial | undefined;
  let headlightSpot: THREE.SpotLight | undefined;
  if (params.includeNightHeadlightBeams) {
    headlightBeamMat = new THREE.MeshBasicMaterial({
      color: 0xfef3c7,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    headlightSpot = new THREE.SpotLight(0xfff3c4, 0, 34, Math.PI / 4.8, 0.55, 1.4);
    bodyGroup.add(headlightSpot);
    bodyGroup.add(headlightSpot.target);
  }

  group.add(bodyGroup);
  return {
    group,
    bodyGroup,
    wheels,
    frontWheelPivots,
    brakeLightMat,
    headlightMat,
    headlightBeamMat,
    headlightSpot,
  };
}

/**
 * ONE reusable low-poly parameterized car builder used by all 25 player cars,
 * ambient traffic cars, and the 3D showroom preview.
 * Forward direction is -Z.
 */
export function buildCarModel(params: CarBuildParams): BuiltCarRig {
  try {
    return buildCarModelInternal(params);
  } catch (err) {
    console.error('Failed to build 3D car model, using box fallback:', err);
    return createFallbackBoxCar(params);
  }
}

function buildCarModelInternal(params: CarBuildParams): BuiltCarRig {
  const L = params.length;
  const W = params.width;
  const H = params.height;
  const wr = params.wheelSize.radius;
  const ww = params.wheelSize.width;
  const shape = params.bodyShape;
  const maxAniso = params.maxAnisotropy ?? 1;

  const group = new THREE.Group();
  const bodyGroup = new THREE.Group();
  const wheelHolderGroup = new THREE.Group();

  if (params.includeContactShadow !== false) {
    const shadowMat = new THREE.MeshBasicMaterial({
      map: getContactShadowTexture(),
      transparent: true,
      depthWrite: false,
      opacity: 0.54,
    });
    const shadowPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(W * 1.42, L * 1.18),
      shadowMat,
    );
    shadowPlane.rotation.x = -Math.PI / 2;
    shadowPlane.position.y = 0.02;
    group.add(shadowPlane);
  }

  const paintMat = new THREE.MeshStandardMaterial({
    color: params.color,
    roughness: 0.28,
    metalness: 0.28,
  });
  const trimMat = new THREE.MeshStandardMaterial({
    color: 0x334155,
    roughness: 0.78,
    metalness: 0.14,
  });
  const accentMat = new THREE.MeshStandardMaterial({
    color: params.accentColor ?? 0x1e293b,
    roughness: 0.38,
    metalness: 0.45,
  });
  const interiorMat = new THREE.MeshStandardMaterial({
    color: 0x111827,
    roughness: 0.9,
    metalness: 0.05,
  });
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x0f172a,
    roughness: 0.12,
    metalness: 0.45,
    transparent: true,
    opacity: 0.68,
  });
  const tireMat = new THREE.MeshStandardMaterial({
    color: 0x111827,
    roughness: 0.9,
    metalness: 0.04,
  });
  const rimMat = new THREE.MeshStandardMaterial({
    color: 0x94a3b8,
    roughness: 0.35,
    metalness: 0.75,
  });
  const hubMat = new THREE.MeshStandardMaterial({
    color: 0x475569,
    roughness: 0.5,
    metalness: 0.5,
  });
  const headlightMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0xfef9c3,
    emissiveIntensity: 1.05,
    roughness: 0.18,
  });
  const brakeLightMat = new THREE.MeshStandardMaterial({
    color: 0xdc2626,
    emissive: 0xef4444,
    emissiveIntensity: 0.7,
    roughness: 0.22,
  });

  // 1. Stance & structural proportions derived from parameters
  const isLifted = shape === 'offroad4x4' || shape === 'pickup';
  const isTall = shape === 'suv' || shape === 'van' || isLifted;
  const isSporty = shape === 'coupe' || shape === 'supercar' || shape === 'roadster';
  const isOpenTop = shape === 'roadster';
  const isPickup = shape === 'pickup';

  const clearance =
    shape === 'offroad4x4'
      ? wr * 0.72
      : shape === 'pickup'
      ? wr * 0.58
      : shape === 'suv'
      ? wr * 0.48
      : isSporty
      ? 0.16
      : 0.22;

  const beltRatio =
    shape === 'supercar'
      ? 0.58
      : shape === 'coupe' || shape === 'roadster'
      ? 0.60
      : shape === 'van'
      ? 0.52
      : isTall
      ? 0.55
      : 0.60;

  const beltY = Math.max(clearance + 0.42, H * beltRatio);
  const roofY = H;
  const lowerH = beltY - clearance;
  const lowerMidY = clearance + lowerH / 2;

  // Hood, cabin & rear proportions per bodyShape
  let hoodFrac = 0.27;
  let rearFrac = 0.22;
  let cabinZOffset = 0.04 * L;

  switch (shape) {
    case 'hatchback':
      hoodFrac = 0.22;
      rearFrac = 0.14;
      cabinZOffset = 0.06 * L;
      break;
    case 'small-sedan':
      hoodFrac = 0.25;
      rearFrac = 0.22;
      cabinZOffset = 0.02 * L;
      break;
    case 'sedan':
      hoodFrac = 0.28;
      rearFrac = 0.25;
      cabinZOffset = 0.01 * L;
      break;
    case 'suv':
      hoodFrac = 0.26;
      rearFrac = 0.15;
      cabinZOffset = 0.06 * L;
      break;
    case 'van':
      hoodFrac = 0.16;
      rearFrac = 0.10;
      cabinZOffset = 0.04 * L;
      break;
    case 'luxury':
      hoodFrac = 0.31;
      rearFrac = 0.24;
      cabinZOffset = 0.03 * L;
      break;
    case 'limo':
      hoodFrac = 0.23;
      rearFrac = 0.19;
      cabinZOffset = 0.02 * L;
      break;
    case 'coupe':
      hoodFrac = 0.33;
      rearFrac = 0.22;
      cabinZOffset = 0.06 * L;
      break;
    case 'supercar':
      hoodFrac = 0.32;
      rearFrac = 0.26;
      cabinZOffset = 0.02 * L;
      break;
    case 'roadster':
      hoodFrac = 0.35;
      rearFrac = 0.24;
      cabinZOffset = 0.06 * L;
      break;
    case 'offroad4x4':
      hoodFrac = 0.27;
      rearFrac = 0.15;
      cabinZOffset = 0.06 * L;
      break;
    case 'pickup':
      hoodFrac = 0.26;
      rearFrac = 0.37;
      cabinZOffset = -0.06 * L;
      break;
  }

  const hoodLen = L * hoodFrac;
  const rearLen = L * rearFrac;
  const midLen = Math.max(0.8, L - hoodLen - rearLen);
  const frontZ = -L / 2;
  const rearZ = L / 2;

  // Underbody spine recessed between wheels
  const underSpine = new THREE.Mesh(
    new THREE.BoxGeometry(W * 0.64, lowerH * 0.65, L * 0.90),
    interiorMat,
  );
  underSpine.position.set(0, clearance + lowerH * 0.35, 0);
  bodyGroup.add(underSpine);

  // Center main lower tub
  const centerTubZ = frontZ + hoodLen + midLen / 2;
  const centerTub = new THREE.Mesh(
    new THREE.BoxGeometry(W * 0.97, lowerH, midLen),
    paintMat,
  );
  centerTub.position.set(0, lowerMidY, centerTubZ);
  centerTub.castShadow = true;
  centerTub.receiveShadow = true;
  bodyGroup.add(centerTub);

  // Front hood section (sloped/lowered for sports & sedans)
  const hoodDrop = shape === 'supercar' ? 0.16 : shape === 'coupe' || shape === 'roadster' ? 0.12 : shape === 'van' ? 0.05 : 0.09;
  const hoodH = Math.max(0.24, lowerH - hoodDrop);
  const hoodMesh = new THREE.Mesh(
    new THREE.BoxGeometry(W * 0.95, hoodH, hoodLen),
    paintMat,
  );
  hoodMesh.position.set(0, clearance + hoodH / 2, frontZ + hoodLen / 2);
  hoodMesh.castShadow = true;
  hoodMesh.receiveShadow = true;
  bodyGroup.add(hoodMesh);

  if (shape === 'supercar' || shape === 'coupe') {
    // Sleek sloped wedge nose cap
    const wedgeH = hoodDrop * 0.8;
    const wedge = new THREE.Mesh(
      new THREE.BoxGeometry(W * 0.88, wedgeH, hoodLen * 0.65),
      paintMat,
    );
    wedge.position.set(0, clearance + hoodH + wedgeH * 0.25, frontZ + hoodLen * 0.68);
    wedge.rotation.x = 0.14;
    bodyGroup.add(wedge);
  }

  // Rear section (pickup bed vs trunk vs rear cargo)
  if (isPickup) {
    // Open pickup truck cargo bed with side walls & tailgate
    const bedCenterZ = rearZ - rearLen / 2;
    const bedFloor = new THREE.Mesh(
      new THREE.BoxGeometry(W * 0.92, lowerH * 0.45, rearLen),
      interiorMat,
    );
    bedFloor.position.set(0, clearance + lowerH * 0.22, bedCenterZ);
    bedFloor.receiveShadow = true;
    bodyGroup.add(bedFloor);

    for (const side of [-1, 1]) {
      const bedWall = new THREE.Mesh(
        new THREE.BoxGeometry(0.11, lowerH * 0.96, rearLen),
        paintMat,
      );
      bedWall.position.set(side * (W * 0.44), lowerMidY, bedCenterZ);
      bedWall.castShadow = true;
      bodyGroup.add(bedWall);
    }

    const tailgate = new THREE.Mesh(
      new THREE.BoxGeometry(W * 0.95, lowerH * 0.96, 0.12),
      paintMat,
    );
    tailgate.position.set(0, lowerMidY, rearZ - 0.06);
    tailgate.castShadow = true;
    bodyGroup.add(tailgate);
  } else {
    const trunkDrop =
      shape === 'sedan' || shape === 'small-sedan' || shape === 'luxury' || shape === 'limo'
        ? 0.08
        : shape === 'hatchback' || shape === 'suv' || shape === 'van' || shape === 'offroad4x4'
        ? 0.02
        : 0.06;
    const rearH = Math.max(0.28, lowerH - trunkDrop);
    const rearMesh = new THREE.Mesh(
      new THREE.BoxGeometry(W * 0.95, rearH, rearLen),
      paintMat,
    );
    rearMesh.position.set(0, clearance + rearH / 2, rearZ - rearLen / 2);
    rearMesh.castShadow = true;
    rearMesh.receiveShadow = true;
    bodyGroup.add(rearMesh);
  }

  // Bumpers, grille & rocker trims
  const bumperH = isLifted ? 0.20 : 0.15;
  const frontBumper = new THREE.Mesh(
    new THREE.BoxGeometry(W * 0.98, bumperH, 0.16),
    trimMat,
  );
  frontBumper.position.set(0, clearance + bumperH / 2, frontZ - 0.04);
  frontBumper.castShadow = true;
  bodyGroup.add(frontBumper);

  const rearBumper = new THREE.Mesh(
    new THREE.BoxGeometry(W * 0.98, bumperH, 0.16),
    trimMat,
  );
  rearBumper.position.set(0, clearance + bumperH / 2, rearZ + 0.04);
  rearBumper.castShadow = true;
  bodyGroup.add(rearBumper);

  const grilleW = shape === 'supercar' ? W * 0.56 : W * 0.44;
  const frontGrille = new THREE.Mesh(
    new THREE.BoxGeometry(grilleW, lowerH * 0.34, 0.06),
    trimMat,
  );
  frontGrille.position.set(0, clearance + lowerH * 0.42, frontZ - 0.03);
  bodyGroup.add(frontGrille);

  for (const side of [-1, 1]) {
    const rocker = new THREE.Mesh(
      new THREE.BoxGeometry(0.06, 0.09, midLen * 0.94),
      shape === 'luxury' || shape === 'limo' ? rimMat : trimMat,
    );
    rocker.position.set(side * (W * 0.485), clearance + 0.04, centerTubZ);
    bodyGroup.add(rocker);
  }

  // 2. Cabin & Glass Windows
  const cabinW = W * (shape === 'van' || shape === 'suv' || shape === 'offroad4x4' ? 0.88 : 0.83);
  const cabinLen =
    shape === 'van'
      ? L * 0.66
      : shape === 'limo'
      ? L * 0.52
      : shape === 'suv' || shape === 'offroad4x4' || shape === 'hatchback'
      ? L * 0.50
      : shape === 'pickup'
      ? L * 0.33
      : L * 0.42;

  const cabinZ = isPickup ? centerTubZ : cabinZOffset;
  const pillarH = Math.max(0.28, roofY - beltY);
  const pillarMidY = beltY + pillarH / 2 - 0.02;

  // Interior dash & seats visible through windows (or open top)
  const dash = new THREE.Mesh(new THREE.BoxGeometry(cabinW * 0.84, 0.18, 0.28), interiorMat);
  dash.position.set(0, beltY + 0.06, cabinZ - cabinLen * 0.34);
  bodyGroup.add(dash);

  const frontSeats = new THREE.Mesh(new THREE.BoxGeometry(cabinW * 0.78, pillarH * 0.55, 0.24), interiorMat);
  frontSeats.position.set(0, beltY + pillarH * 0.25, cabinZ - cabinLen * 0.06);
  bodyGroup.add(frontSeats);

  if (!isOpenTop && !isPickup && shape !== 'coupe' && shape !== 'supercar') {
    const rearBench = new THREE.Mesh(new THREE.BoxGeometry(cabinW * 0.80, pillarH * 0.55, 0.26), interiorMat);
    rearBench.position.set(0, beltY + pillarH * 0.25, cabinZ + cabinLen * 0.28);
    bodyGroup.add(rearBench);
  }

  // Windshield (all cars have a windshield; sports/roadsters are more raked)
  const windRake = isSporty ? 0.55 : shape === 'van' ? 0.24 : 0.36;
  const windshield = new THREE.Mesh(
    new THREE.BoxGeometry(cabinW * 0.88, pillarH + 0.08, 0.04),
    glassMat,
  );
  windshield.position.set(0, pillarMidY, cabinZ - cabinLen * 0.5 - 0.08);
  windshield.rotation.x = windRake;
  bodyGroup.add(windshield);

  // Side mirrors
  for (const side of [-1, 1]) {
    const mirror = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.09, 0.11), trimMat);
    mirror.position.set(side * (W * 0.52), beltY + 0.06, cabinZ - cabinLen * 0.42);
    bodyGroup.add(mirror);
  }

  if (isOpenTop) {
    // Open-top Roadster: windshield frame + dual twin roll hoops behind seats
    for (const side of [-1, 1]) {
      const aPillar = new THREE.Mesh(new THREE.BoxGeometry(0.08, pillarH + 0.06, 0.08), paintMat);
      aPillar.position.set(side * (cabinW * 0.46), pillarMidY, cabinZ - cabinLen * 0.5 - 0.07);
      aPillar.rotation.x = windRake;
      bodyGroup.add(aPillar);

      const rollHoop = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.04, 6, 10, Math.PI), rimMat);
      rollHoop.position.set(side * (cabinW * 0.25), beltY + 0.16, cabinZ + 0.05);
      bodyGroup.add(rollHoop);
    }
    const windHeader = new THREE.Mesh(new THREE.BoxGeometry(cabinW * 0.94, 0.06, 0.08), trimMat);
    windHeader.position.set(0, roofY - 0.02, cabinZ - cabinLen * 0.5 + 0.05);
    bodyGroup.add(windHeader);
  } else {
    // Closed cabin roof, pillars, rear window & side windows
    const roofCap = new THREE.Mesh(new THREE.BoxGeometry(cabinW, 0.08, cabinLen), paintMat);
    roofCap.position.set(0, roofY, cabinZ);
    roofCap.castShadow = true;
    roofCap.receiveShadow = true;
    bodyGroup.add(roofCap);

    const rearRake = shape === 'hatchback' || shape === 'van' || shape === 'suv' || shape === 'offroad4x4' || shape === 'pickup' ? -0.14 : -0.36;
    const rearWindow = new THREE.Mesh(
      new THREE.BoxGeometry(cabinW * 0.86, pillarH + 0.06, 0.04),
      glassMat,
    );
    rearWindow.position.set(0, pillarMidY, cabinZ + cabinLen * 0.5 + 0.06);
    rearWindow.rotation.x = rearRake;
    bodyGroup.add(rearWindow);

    for (const side of [-1, 1]) {
      const px = side * (cabinW * 0.47);
      const aPillar = new THREE.Mesh(new THREE.BoxGeometry(0.09, pillarH + 0.08, 0.09), paintMat);
      aPillar.position.set(px, pillarMidY, cabinZ - cabinLen * 0.5 - 0.07);
      aPillar.rotation.x = windRake;
      bodyGroup.add(aPillar);

      const cPillar = new THREE.Mesh(new THREE.BoxGeometry(0.09, pillarH + 0.08, 0.11), paintMat);
      cPillar.position.set(px, pillarMidY, cabinZ + cabinLen * 0.5 + 0.06);
      cPillar.rotation.x = rearRake;
      bodyGroup.add(cPillar);

      if (shape === 'limo') {
        // Limousine: twin intermediate opera pillars & 3 side window bays
        for (const frac of [-0.16, 0.16]) {
          const midPillar = new THREE.Mesh(new THREE.BoxGeometry(0.09, pillarH, 0.13), paintMat);
          midPillar.position.set(px, pillarMidY, cabinZ + cabinLen * frac);
          bodyGroup.add(midPillar);
        }
        for (const wFrac of [-0.33, 0, 0.33]) {
          const bayWin = new THREE.Mesh(new THREE.BoxGeometry(0.04, pillarH - 0.05, cabinLen * 0.27), glassMat);
          bayWin.position.set(px, pillarMidY, cabinZ + cabinLen * wFrac);
          bodyGroup.add(bayWin);
        }
      } else {
        const bPillar = new THREE.Mesh(new THREE.BoxGeometry(0.09, pillarH, 0.11), paintMat);
        bPillar.position.set(px, pillarMidY, cabinZ + 0.02);
        bodyGroup.add(bPillar);

        const frontSideWin = new THREE.Mesh(
          new THREE.BoxGeometry(0.04, pillarH - 0.05, cabinLen * 0.43),
          glassMat,
        );
        frontSideWin.position.set(px, pillarMidY, cabinZ - cabinLen * 0.25);
        bodyGroup.add(frontSideWin);

        const rearSideWin = new THREE.Mesh(
          new THREE.BoxGeometry(0.04, pillarH - 0.05, cabinLen * 0.41),
          glassMat,
        );
        rearSideWin.position.set(px, pillarMidY, cabinZ + cabinLen * 0.27);
        bodyGroup.add(rearSideWin);
      }
    }
  }

  // 3. Body-shape signature details (wings, racks, spare wheel, bullbar, flares)
  if (shape === 'supercar') {
    // High rear aero wing + side air intakes
    const wingBlade = new THREE.Mesh(new THREE.BoxGeometry(W * 0.94, 0.06, 0.30), accentMat);
    wingBlade.position.set(0, beltY + 0.24, rearZ - 0.18);
    wingBlade.castShadow = true;
    bodyGroup.add(wingBlade);

    for (const side of [-1, 1]) {
      const strut = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.24, 0.14), trimMat);
      strut.position.set(side * (W * 0.28), beltY + 0.11, rearZ - 0.18);
      bodyGroup.add(strut);

      const intake = new THREE.Mesh(new THREE.BoxGeometry(0.12, lowerH * 0.45, 0.42), interiorMat);
      intake.position.set(side * (W * 0.47), lowerMidY, cabinZ + 0.25);
      bodyGroup.add(intake);
    }
  } else if (shape === 'coupe') {
    const lipSpoiler = new THREE.Mesh(new THREE.BoxGeometry(W * 0.82, 0.06, 0.16), accentMat);
    lipSpoiler.position.set(0, beltY + 0.02, rearZ - 0.10);
    bodyGroup.add(lipSpoiler);
  } else if (shape === 'suv') {
    for (const side of [-1, 1]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, cabinLen * 0.84), trimMat);
      rail.position.set(side * (cabinW * 0.40), roofY + 0.06, cabinZ);
      bodyGroup.add(rail);
    }
  } else if (shape === 'offroad4x4') {
    // Front bullbar, roof cargo rack, and rear tailgate spare tire
    const bullBar = new THREE.Mesh(new THREE.BoxGeometry(W * 0.62, 0.28, 0.08), trimMat);
    bullBar.position.set(0, clearance + 0.34, frontZ - 0.10);
    bodyGroup.add(bullBar);

    const roofRack = new THREE.Mesh(new THREE.BoxGeometry(cabinW * 0.82, 0.08, cabinLen * 0.72), trimMat);
    roofRack.position.set(0, roofY + 0.07, cabinZ);
    bodyGroup.add(roofRack);

    const spareTire = new THREE.Mesh(new THREE.CylinderGeometry(wr * 0.82, wr * 0.82, ww * 0.9, 12), tireMat);
    spareTire.rotation.x = Math.PI / 2;
    spareTire.position.set(0, beltY - 0.12, rearZ + ww * 0.42);
    bodyGroup.add(spareTire);

    const spareRim = new THREE.Mesh(new THREE.CylinderGeometry(wr * 0.48, wr * 0.48, ww * 0.95, 10), rimMat);
    spareRim.rotation.x = Math.PI / 2;
    spareRim.position.copy(spareTire.position);
    bodyGroup.add(spareRim);
  }

  // 4. Headlights (-Z) and Tail/Brake lights (+Z) according to light styles
  const lightY = clearance + lowerH * 0.48;
  const headX = W * 0.33;
  const tailX = W * 0.34;

  if (params.lights.headStyle === 'bar') {
    const hlBar = new THREE.Mesh(new THREE.BoxGeometry(W * 0.84, 0.10, 0.06), headlightMat);
    hlBar.position.set(0, lightY, frontZ - 0.02);
    bodyGroup.add(hlBar);
  } else if (params.lights.headStyle === 'round') {
    const roundGeo = new THREE.CylinderGeometry(0.11, 0.11, 0.06, 12);
    roundGeo.rotateX(Math.PI / 2);
    for (const side of [-1, 1]) {
      const hl = new THREE.Mesh(roundGeo, headlightMat);
      hl.position.set(side * headX, lightY, frontZ - 0.02);
      bodyGroup.add(hl);
    }
  } else if (params.lights.headStyle === 'quad') {
    for (const side of [-1, 1]) {
      for (const q of [-0.08, 0.08]) {
        const hl = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.10, 0.06), headlightMat);
        hl.position.set(side * headX + q * side, lightY, frontZ - 0.02);
        bodyGroup.add(hl);
      }
    }
  } else {
    for (const side of [-1, 1]) {
      const hl = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.13, 0.06), headlightMat);
      hl.position.set(side * headX, lightY, frontZ - 0.02);
      bodyGroup.add(hl);
    }
  }

  if (params.lights.tailStyle === 'bar') {
    const tlBar = new THREE.Mesh(new THREE.BoxGeometry(W * 0.86, 0.10, 0.06), brakeLightMat);
    tlBar.position.set(0, lightY + 0.03, rearZ + 0.01);
    bodyGroup.add(tlBar);
  } else if (params.lights.tailStyle === 'vertical') {
    for (const side of [-1, 1]) {
      const tl = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.34, 0.06), brakeLightMat);
      tl.position.set(side * (W * 0.40), lightY + 0.08, rearZ + 0.01);
      bodyGroup.add(tl);
    }
  } else if (params.lights.tailStyle === 'twin') {
    const podGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.06, 10);
    podGeo.rotateX(Math.PI / 2);
    for (const side of [-1, 1]) {
      for (const offset of [-0.09, 0.09]) {
        const tl = new THREE.Mesh(podGeo, brakeLightMat);
        tl.position.set(side * tailX + offset, lightY + 0.03, rearZ + 0.01);
        bodyGroup.add(tl);
      }
    }
  } else {
    for (const side of [-1, 1]) {
      const tl = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.14, 0.06), brakeLightMat);
      tl.position.set(side * tailX, lightY + 0.03, rearZ + 0.01);
      bodyGroup.add(tl);
    }
  }

  // 5. Taxi Mode details (checker stripe & lit TAXI roof sign)
  let roofSignMat: THREE.MeshStandardMaterial | undefined;
  if (params.lights.hasCheckerStripe) {
    const bgHex = `#${new THREE.Color(params.color).getHexString()}`;
    const checkHex = `#${new THREE.Color(params.accentColor ?? 0x0f172a).getHexString()}`;
    const checkerTex = createTaxiCheckersTexture(bgHex, checkHex);
    checkerTex.anisotropy = maxAniso;

    const checkerMat = new THREE.MeshStandardMaterial({
      map: checkerTex,
      roughness: 0.35,
      metalness: 0.18,
    });
    for (const side of [-1, 1]) {
      const stripe = new THREE.Mesh(new THREE.PlaneGeometry(midLen * 0.94, 0.16), checkerMat);
      stripe.position.set(side * (W * 0.49), clearance + lowerH * 0.56, centerTubZ);
      stripe.rotation.y = side > 0 ? Math.PI / 2 : -Math.PI / 2;
      bodyGroup.add(stripe);
    }
  }

  if (params.lights.hasRoofSign && !isOpenTop) {
    const signTex = createTaxiRoofSignTexture();
    signTex.anisotropy = maxAniso;
    roofSignMat = new THREE.MeshStandardMaterial({
      map: signTex,
      emissiveMap: signTex,
      color: 0xffffff,
      emissive: 0xfef08a,
      emissiveIntensity: 1.35,
      roughness: 0.25,
    });

    const signZ = cabinZ - cabinLen * 0.05;
    const roofBase = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.06, 0.30), trimMat);
    roofBase.position.set(0, roofY + 0.06, signZ);
    bodyGroup.add(roofBase);

    const roofSign = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.20, 0.22), roofSignMat);
    roofSign.position.set(0, roofY + 0.18, signZ);
    roofSign.castShadow = true;
    bodyGroup.add(roofSign);
  }

  // Night headlight beams & SpotLight (only on active player vehicle)
  let headlightBeamMat: THREE.MeshBasicMaterial | undefined;
  let headlightSpot: THREE.SpotLight | undefined;
  if (params.includeNightHeadlightBeams) {
    headlightBeamMat = new THREE.MeshBasicMaterial({
      color: 0xfef3c7,
      transparent: true,
      opacity: 0.0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    const beamGeo = new THREE.ConeGeometry(2.0, 10.0, 14, 1, true);
    beamGeo.translate(0, -5.0, 0);
    beamGeo.rotateX(Math.PI / 2);

    for (const side of [-1, 1]) {
      const beam = new THREE.Mesh(beamGeo, headlightBeamMat);
      beam.position.set(side * headX, lightY - 0.02, frontZ - 0.04);
      beam.rotation.x = -0.08;
      bodyGroup.add(beam);
    }

    headlightSpot = new THREE.SpotLight(0xfff3c4, 0, 34, Math.PI / 4.8, 0.55, 1.4);
    headlightSpot.position.set(0, lightY + 0.2, frontZ + 0.1);
    headlightSpot.target.position.set(0, 0, frontZ - 16);
    headlightSpot.castShadow = false;
    bodyGroup.add(headlightSpot);
    bodyGroup.add(headlightSpot.target);
  }

  // 6. Four black cylinder wheels with grey rims & spokes placed at the corners
  const tireGeo = new THREE.CylinderGeometry(wr, wr, ww, 16);
  tireGeo.rotateZ(Math.PI / 2);

  const rimGeo = new THREE.CylinderGeometry(wr * 0.60, wr * 0.60, ww + 0.02, 12);
  rimGeo.rotateZ(Math.PI / 2);

  const hubGeo = new THREE.CylinderGeometry(wr * 0.22, wr * 0.22, ww + 0.04, 8);
  hubGeo.rotateZ(Math.PI / 2);

  const spokeGeo = new THREE.BoxGeometry(ww + 0.03, wr * 0.96, 0.055);

  const wheels: THREE.Mesh[] = [];
  const frontWheelPivots: THREE.Group[] = [];

  const trackX = W * 0.455;
  const axleRatio = shape === 'limo' ? 0.34 : 0.31;
  const axleZFront = -L * axleRatio;
  const axleZRear = L * axleRatio;

  const wheelConfigs = [
    { x: -trackX, z: axleZFront, isFront: true },
    { x: trackX, z: axleZFront, isFront: true },
    { x: -trackX, z: axleZRear, isFront: false },
    { x: trackX, z: axleZRear, isFront: false },
  ];

  for (const wc of wheelConfigs) {
    const wheelMesh = new THREE.Mesh(tireGeo, tireMat);
    wheelMesh.castShadow = true;

    const rimMesh = new THREE.Mesh(rimGeo, rimMat);
    const hubMesh = new THREE.Mesh(hubGeo, hubMat);
    const spokeA = new THREE.Mesh(spokeGeo, hubMat);
    const spokeB = new THREE.Mesh(spokeGeo, hubMat);
    spokeB.rotation.x = Math.PI / 2;
    wheelMesh.add(rimMesh, hubMesh, spokeA, spokeB);

    if (wc.isFront) {
      const pivot = new THREE.Group();
      pivot.position.set(wc.x, wr, wc.z);
      pivot.add(wheelMesh);
      wheelHolderGroup.add(pivot);
      frontWheelPivots.push(pivot);
    } else {
      wheelMesh.position.set(wc.x, wr, wc.z);
      wheelHolderGroup.add(wheelMesh);
    }
    wheels.push(wheelMesh);
  }

  group.add(bodyGroup);
  group.add(wheelHolderGroup);

  return {
    group,
    bodyGroup,
    wheels,
    frontWheelPivots,
    roofSignMat,
    brakeLightMat,
    headlightMat,
    headlightBeamMat,
    headlightSpot,
  };
}

export function buildCarFromSpec(
  spec: VehicleSpec,
  options: {
    maxAnisotropy?: number;
    taxiMode?: boolean;
    includeNightHeadlightBeams?: boolean;
    includeContactShadow?: boolean;
  } = {},
): BuiltCarRig {
  const isTaxiActive = spec.taxiCapable && (options.taxiMode ?? true);
  return buildCarModel({
    length: spec.dimensions.length,
    width: spec.dimensions.width,
    height: spec.dimensions.height,
    bodyShape: spec.bodyShape,
    color: isTaxiActive ? 0xf4b41a : spec.bodyColor,
    accentColor: isTaxiActive ? 0x0f172a : spec.accentColor,
    wheelSize: spec.wheelSize,
    lights: {
      headStyle: spec.lights.headStyle,
      tailStyle: spec.lights.tailStyle,
      hasRoofSign: isTaxiActive,
      hasCheckerStripe: isTaxiActive,
    },
    maxAnisotropy: options.maxAnisotropy ?? 1,
    includeNightHeadlightBeams: options.includeNightHeadlightBeams ?? false,
    includeContactShadow: options.includeContactShadow ?? true,
  });
}

export function createPlayerTaxiMesh(
  spec: VehicleSpec,
  maxAnisotropy: number,
  taxiMode = true,
): PlayerTaxiRig {
  const built = buildCarFromSpec(spec, {
    maxAnisotropy,
    taxiMode,
    includeNightHeadlightBeams: true,
    includeContactShadow: true,
  });

  return {
    group: built.group,
    wheels: built.wheels,
    frontWheelPivots: built.frontWheelPivots,
    bodyGroup: built.bodyGroup,
    roofSignMat: built.roofSignMat,
    brakeLightMat: built.brakeLightMat,
    headlightMat: built.headlightMat,
    headlightBeamMat: built.headlightBeamMat!,
    headlightSpot: built.headlightSpot!,
  };
}

export function createTrafficCarMesh(colorHex: number): { group: THREE.Group; wheels: THREE.Mesh[] } {
  const built = buildCarModel({
    length: 4.0,
    width: 1.8,
    height: 1.46,
    bodyShape: 'sedan',
    color: colorHex,
    wheelSize: { radius: 0.30, width: 0.22 },
    lights: {
      headStyle: 'angled',
      tailStyle: 'classic',
      hasRoofSign: false,
      hasCheckerStripe: false,
    },
    maxAnisotropy: 1,
    includeNightHeadlightBeams: false,
    includeContactShadow: true,
  });

  return { group: built.group, wheels: built.wheels };
}

export interface PassengerMeshRig {
  group: THREE.Group;
  waveArm: THREE.Mesh;
  beacon: THREE.Mesh;
  ring: THREE.Mesh;
  beam: THREE.Mesh;
}

export function createPassengerMarkerMesh(shirtColor: number, isVVIP: boolean): PassengerMeshRig {
  const group = new THREE.Group();

  const skinMat = new THREE.MeshStandardMaterial({ color: 0xf1c27d, roughness: 0.7 });
  const shirtMat = new THREE.MeshStandardMaterial({
    color: isVVIP ? 0x1e293b : shirtColor,
    roughness: 0.65,
  });
  const pantsMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.8 });

  const ringColor = isVVIP ? 0xa855f7 : 0xfbbf24;
  const ringMat = new THREE.MeshBasicMaterial({
    color: ringColor,
    transparent: true,
    opacity: 0.72,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const ring = new THREE.Mesh(new THREE.RingGeometry(2.3, 2.85, 28), ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.04;
  group.add(ring);

  const pad = new THREE.Mesh(
    new THREE.CircleGeometry(2.3, 28),
    new THREE.MeshBasicMaterial({
      color: ringColor,
      transparent: true,
      opacity: 0.16,
      depthWrite: false,
    }),
  );
  pad.rotation.x = -Math.PI / 2;
  pad.position.y = 0.03;
  group.add(pad);

  const person = new THREE.Group();
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.72, 0.24), pantsMat);
  legs.position.y = 0.36;
  legs.castShadow = true;
  person.add(legs);

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.62, 0.28), shirtMat);
  torso.position.y = 1.03;
  torso.castShadow = true;
  person.add(torso);

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.32, 0.32), skinMat);
  head.position.y = 1.54;
  head.castShadow = true;
  person.add(head);

  const leftArm = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.54, 0.14), shirtMat);
  leftArm.position.set(-0.33, 1.02, 0);
  person.add(leftArm);

  const waveArm = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.54, 0.14), shirtMat);
  waveArm.position.set(0.35, 1.32, 0);
  waveArm.rotation.z = -2.4;
  person.add(waveArm);

  group.add(person);

  const beaconMat = new THREE.MeshStandardMaterial({
    color: ringColor,
    emissive: ringColor,
    emissiveIntensity: 0.9,
    roughness: 0.25,
  });
  const beacon = new THREE.Mesh(new THREE.OctahedronGeometry(0.42, 0), beaconMat);
  beacon.position.y = 2.6;
  group.add(beacon);

  // Glowing skyward beam marker at pickup location
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.32, 0.85, 13, 16, 1, true),
    new THREE.MeshBasicMaterial({
      color: ringColor,
      transparent: true,
      opacity: 0.2,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  beam.position.y = 6.5;
  group.add(beam);

  return { group, waveArm, beacon, ring, beam };
}

export function createDropoffMarkerMesh(): { group: THREE.Group; pillar: THREE.Mesh; ring: THREE.Mesh } {
  const group = new THREE.Group();

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(2.9, 3.6, 32),
    new THREE.MeshBasicMaterial({
      color: 0x10b981,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.05;
  group.add(ring);

  const pad = new THREE.Mesh(
    new THREE.CircleGeometry(2.9, 32),
    new THREE.MeshBasicMaterial({
      color: 0x10b981,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
    }),
  );
  pad.rotation.x = -Math.PI / 2;
  pad.position.y = 0.04;
  group.add(pad);

  const pillar = new THREE.Mesh(
    new THREE.CylinderGeometry(0.45, 1.1, 14, 16, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0x34d399,
      transparent: true,
      opacity: 0.22,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  pillar.position.y = 7;
  group.add(pillar);

  const chevron = new THREE.Mesh(
    new THREE.ConeGeometry(0.75, 1.3, 4),
    new THREE.MeshStandardMaterial({
      color: 0x10b981,
      emissive: 0x059669,
      emissiveIntensity: 0.9,
      roughness: 0.3,
    }),
  );
  chevron.rotation.x = Math.PI;
  chevron.position.y = 3.2;
  group.add(chevron);

  return { group, pillar, ring };
}

export function createFuelStationGroup(x: number, z: number, rotY = 0): THREE.Group {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  group.rotation.y = rotY;

  const roofMat = new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.35, metalness: 0.25 });
  const pillarMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.4, metalness: 0.4 });
  const pumpMat = new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.3 });

  const canopy = new THREE.Mesh(new THREE.BoxGeometry(10, 0.65, 12), roofMat);
  canopy.position.set(-1.5, 4.4, 0);
  canopy.castShadow = true;
  group.add(canopy);

  const fascia = new THREE.Mesh(
    new THREE.BoxGeometry(10.2, 0.4, 12.2),
    new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.4 }),
  );
  fascia.position.set(-1.5, 4.9, 0);
  group.add(fascia);

  const signTex = createSignTexture('METRO FUEL', '#0c4a6e', '#38bdf8');
  const signPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(7.5, 1.6),
    new THREE.MeshStandardMaterial({ map: signTex, roughness: 0.3 }),
  );
  signPlane.position.set(3.62, 4.5, 0);
  signPlane.rotation.y = Math.PI / 2;
  group.add(signPlane);

  for (const pz of [-4.2, 4.2]) {
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 4.4, 8), pillarMat);
    pillar.position.set(-4.2, 2.2, pz);
    pillar.castShadow = true;
    group.add(pillar);
  }

  const island = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.25, 6.8), pillarMat);
  island.position.set(-4.2, 0.125, 0);
  group.add(island);

  for (const pz of [-1.8, 1.8]) {
    const pump = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.5, 0.7), pumpMat);
    pump.position.set(-4.2, 1.0, pz);
    pump.castShadow = true;
    group.add(pump);
  }

  const pad = new THREE.Mesh(
    new THREE.RingGeometry(2.8, 3.4, 28),
    new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.82,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  pad.rotation.x = -Math.PI / 2;
  pad.position.set(0, 0.04, 0);
  group.add(pad);

  const padFill = new THREE.Mesh(
    new THREE.CircleGeometry(2.8, 28),
    new THREE.MeshBasicMaterial({
      color: 0x0284c7,
      transparent: true,
      opacity: 0.2,
      depthWrite: false,
    }),
  );
  padFill.rotation.x = -Math.PI / 2;
  padFill.position.set(0, 0.03, 0);
  group.add(padFill);

  return group;
}

export function createRentalShopDecor(x: number, z: number): THREE.Group {
  const group = new THREE.Group();
  group.position.set(x, 0, z);

  const signTex = createSignTexture('METRO CAR SHOP & GARAGE', '#1e293b', '#fbbf24');
  const signBoard = new THREE.Mesh(
    new THREE.BoxGeometry(11, 2.2, 0.35),
    new THREE.MeshStandardMaterial({ map: signTex, roughness: 0.3 }),
  );
  signBoard.position.set(0, 5.2, 6.3);
  group.add(signBoard);

  const awning = new THREE.Mesh(
    new THREE.BoxGeometry(14, 0.4, 2.6),
    new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.45 }),
  );
  awning.position.set(0, 3.3, 5.1);
  awning.rotation.x = 0.2;
  group.add(awning);

  const pad = new THREE.Mesh(
    new THREE.RingGeometry(2.5, 3.0, 28),
    new THREE.MeshBasicMaterial({
      color: 0xf59e0b,
      transparent: true,
      opacity: 0.65,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  pad.rotation.x = -Math.PI / 2;
  pad.position.set(0, 0.04, 0);
  group.add(pad);

  return group;
}
