import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { buildCarFromSpec, disposeCarRig } from '../game/models';
import { VehicleSpec } from '../types/game';

interface CarPreview3DProps {
  spec: VehicleSpec;
  taxiMode: boolean;
}

function createEmergencyBoxCar(colorHex: number): THREE.Group {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(1.8, 0.7, 3.8),
    new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.5 }),
  );
  body.position.y = 0.55;
  const roof = new THREE.Mesh(
    new THREE.BoxGeometry(1.5, 0.5, 2.0),
    new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.3 }),
  );
  roof.position.y = 1.15;
  group.add(body, roof);
  return group;
}

export function CarPreview3D({ spec, taxiMode }: CarPreview3DProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const carHolderRef = useRef<THREE.Group | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const [webglUnavailable, setWebglUnavailable] = useState(false);

  // Single shared preview scene: one renderer, one camera, one light
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: 'low-power',
      });
    } catch (err) {
      console.error('Failed to create 3D preview renderer:', err);
      setWebglUnavailable(true);
      return;
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;

    const width = Math.max(220, container.clientWidth || 320);
    const height = Math.max(150, container.clientHeight || 190);
    renderer.setSize(width, height);
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const scene = new THREE.Scene();

    const camera = new THREE.PerspectiveCamera(36, width / height, 0.2, 40);
    camera.position.set(4.0, 2.15, 4.35);
    camera.lookAt(0, 0.62, 0);
    cameraRef.current = camera;

    // One light for smooth, uniform 360-degree showroom shading
    const studioLight = new THREE.HemisphereLight(0xffffff, 0x334155, 2.45);
    scene.add(studioLight);

    // Showroom turntable platform
    const turntable = new THREE.Group();
    const disc = new THREE.Mesh(
      new THREE.CylinderGeometry(3.2, 3.35, 0.14, 32),
      new THREE.MeshStandardMaterial({
        color: 0x0f172a,
        roughness: 0.45,
        metalness: 0.35,
      }),
    );
    disc.position.y = -0.07;
    turntable.add(disc);

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(2.95, 3.08, 40),
      new THREE.MeshBasicMaterial({
        color: 0xf59e0b,
        transparent: true,
        opacity: 0.55,
        side: THREE.DoubleSide,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.005;
    turntable.add(ring);
    scene.add(turntable);

    const carHolder = new THREE.Group();
    scene.add(carHolder);
    carHolderRef.current = carHolder;

    const handleResize = () => {
      if (!container || !rendererRef.current || !cameraRef.current) return;
      const w = Math.max(200, container.clientWidth);
      const h = Math.max(140, container.clientHeight);
      cameraRef.current.aspect = w / h;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(w, h);
    };

    const observer = new ResizeObserver(handleResize);
    observer.observe(container);

    let rafId = 0;
    let lastTime = performance.now();
    const animate = (now: number) => {
      const dt = Math.min(0.05, (now - lastTime) / 1000);
      lastTime = now;
      carHolder.rotation.y += dt * 0.65;
      turntable.rotation.y += dt * 0.65;
      renderer.render(scene, camera);
      rafId = requestAnimationFrame(animate);
    };
    rafId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(rafId);
      observer.disconnect();
      disposeCarRig(scene);
      renderer.dispose();
      if (renderer.domElement.parentElement === container) {
        container.removeChild(renderer.domElement);
      }
      carHolderRef.current = null;
      cameraRef.current = null;
      rendererRef.current = null;
    };
  }, []);

  // Swap car mesh and dispose the old preview model on selection or mode change
  useEffect(() => {
    const holder = carHolderRef.current;
    const camera = cameraRef.current;
    const renderer = rendererRef.current;
    if (!holder || !camera) return;

    while (holder.children.length > 0) {
      const oldChild = holder.children[0];
      holder.remove(oldChild);
      disposeCarRig(oldChild);
    }

    const showAsTaxi = spec.taxiCapable && taxiMode;
    const maxAniso = renderer ? renderer.capabilities.getMaxAnisotropy() : 1;

    try {
      const rig = buildCarFromSpec(spec, {
        maxAnisotropy: maxAniso,
        taxiMode: showAsTaxi,
        includeNightHeadlightBeams: false,
        includeContactShadow: true,
      });
      rig.headlightMat.emissiveIntensity = 1.3;
      rig.brakeLightMat.emissiveIntensity = 1.1;
      holder.add(rig.group);
    } catch (err) {
      console.error(`Failed to build preview model for ${spec.name}:`, err);
      holder.add(createEmergencyBoxCar(showAsTaxi ? 0xf4b41a : spec.bodyColor));
    }

    const distScale = Math.max(0.95, spec.dimensions.length / 4.2);
    camera.position.set(3.85 * distScale, 2.05 * distScale, 4.15 * distScale);
    camera.lookAt(0, spec.dimensions.height * 0.42, 0);
  }, [spec, taxiMode]);

  return (
    <div className="relative w-full h-44 sm:h-52 rounded-lg overflow-hidden bg-gradient-to-b from-slate-800/80 via-slate-900 to-slate-950 border border-white/10">
      <div ref={mountRef} className="w-full h-full" />
      {webglUnavailable && (
        <div className="absolute inset-0 flex items-center justify-center text-xs text-slate-400">
          3D preview unavailable
        </div>
      )}
      <div className="pointer-events-none absolute top-2.5 left-3 flex items-center gap-2 text-[11px] font-semibold">
        <span className="text-slate-200">{spec.brand} · {spec.tierLabel}</span>
        <span className="text-slate-500" aria-hidden="true">·</span>
        {!spec.taxiCapable ? (
          <span className="text-sky-300">Private Car Only</span>
        ) : taxiMode ? (
          <span className="text-amber-300">Taxi Paint &amp; Sign</span>
        ) : (
          <span className="text-slate-300">Private Paint</span>
        )}
      </div>
    </div>
  );
}
