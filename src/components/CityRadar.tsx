import { Maximize2, Minimize2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import {
  BEACH_START_X,
  COAST_ROAD_X,
  DIRT_ROAD_NORTH_Z,
  DIRT_ROAD_WEST_X,
  HIGHWAY_X,
  HIGHWAY_Z,
  ROAD_COORDS,
  SUBURB_ROAD_Z,
  WATER_START_X,
} from '../game/cityLayout';
import { MinimapSnapshot } from '../types/game';

interface CityRadarProps {
  snapshot: MinimapSnapshot | null;
  highlighted?: boolean;
  onInspect?: () => void;
}

export function CityRadar({ snapshot, highlighted = false, onInspect }: CityRadarProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !snapshot) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const size = canvas.width;
    const half = size / 2;
    const scale = (size - 8) / (snapshot.cityHalfExtent * 2);

    const toPx = (wx: number, wz: number): [number, number] => [
      half + wx * scale,
      half + wz * scale,
    ];

    ctx.clearRect(0, 0, size, size);

    // Countryside grass base
    ctx.fillStyle = '#14261c';
    ctx.fillRect(0, 0, size, size);

    // Beach sand strip
    const [beachX] = toPx(BEACH_START_X, 0);
    const [waterX] = toPx(WATER_START_X, 0);
    ctx.fillStyle = '#6f5c37';
    ctx.fillRect(beachX, 0, waterX - beachX, size);

    // Ocean water on east edge
    ctx.fillStyle = '#0c3c5c';
    ctx.fillRect(waterX, 0, size - waterX, size);

    // City block asphalt footprint
    const [cMinX, cMinZ] = toPx(-90, -90);
    const [cMaxX, cMaxZ] = toPx(90, 90);
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(cMinX, cMinZ, cMaxX - cMinX, cMaxZ - cMinZ);

    // Dirt trails
    ctx.strokeStyle = '#624c36';
    ctx.lineWidth = Math.max(1.5, 8 * scale);
    const [, dnZ] = toPx(0, DIRT_ROAD_NORTH_Z);
    const [dwX] = toPx(DIRT_ROAD_WEST_X, 0);
    const [dStartX] = toPx(-160, 0);
    const [coastX] = toPx(COAST_ROAD_X, 0);
    const [, dStartZ] = toPx(0, DIRT_ROAD_NORTH_Z);
    const [, dEndZ] = toPx(0, 160);
    ctx.beginPath();
    ctx.moveTo(dStartX, dnZ);
    ctx.lineTo(coastX, dnZ);
    ctx.moveTo(dwX, dStartZ);
    ctx.lineTo(dwX, dEndZ);
    ctx.stroke();

    // City 5x5 road grid + Suburban & Coastal roads
    ctx.strokeStyle = '#3b4a5e';
    ctx.lineWidth = Math.max(1.5, 11 * scale);
    for (const r of ROAD_COORDS) {
      const [rx, rz] = toPx(r, r);
      ctx.beginPath();
      ctx.moveTo(cMinX, rz);
      ctx.lineTo(cMaxX, rz);
      ctx.moveTo(rx, cMinZ);
      ctx.lineTo(rx, cMaxZ);
      ctx.stroke();
    }

    // Highway, Coastal Blvd, Suburban Ave
    const [hwyX, hwyZ] = toPx(HIGHWAY_X, HIGHWAY_Z);
    const [hwyMinX] = toPx(-168, 0);
    const [, hwyMaxZ] = toPx(0, 166);
    const [, coastMaxZ] = toPx(0, 140);
    const [, subZ] = toPx(0, SUBURB_ROAD_Z);
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = Math.max(2, 15 * scale);
    ctx.beginPath();
    ctx.moveTo(hwyMinX, hwyZ);
    ctx.lineTo(coastX, hwyZ);
    ctx.moveTo(hwyX, hwyZ);
    ctx.lineTo(hwyX, hwyMaxZ);
    ctx.stroke();

    ctx.lineWidth = Math.max(1.5, 11 * scale);
    ctx.beginPath();
    ctx.moveTo(coastX, hwyZ);
    ctx.lineTo(coastX, coastMaxZ);
    ctx.moveTo(hwyX, subZ);
    ctx.lineTo(coastX, subZ);
    ctx.stroke();

    // Gas stations (cyan pump squares)
    for (const fs of snapshot.fuelStations) {
      const [fx, fz] = toPx(fs.x, fs.z);
      ctx.fillStyle = '#38bdf8';
      ctx.fillRect(fx - 4, fz - 4, 8, 8);
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(fx - 1.5, fz - 1.5, 3, 3);
    }

    // Rental shop (muted orange square)
    const [sx, sz] = toPx(snapshot.rentalShop.x, snapshot.rentalShop.z);
    ctx.fillStyle = '#b45309';
    ctx.fillRect(sx - 3, sz - 3, 6, 6);

    // Traffic cars (tiny muted dots)
    ctx.fillStyle = '#64748b';
    for (const t of snapshot.traffic) {
      const [tx, tz] = toPx(t.x, t.z);
      ctx.fillRect(tx - 1.5, tz - 1.5, 3, 3);
    }

    // Waiting passengers
    for (const p of snapshot.passengers) {
      const [px, pz] = toPx(p.x, p.z);
      ctx.fillStyle = p.isVVIP ? '#c084fc' : '#fbbf24';
      ctx.beginPath();
      ctx.arc(px, pz, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    // Active destination / dropoff target
    if (snapshot.activeTrip) {
      const [dx, dz] = toPx(snapshot.activeTrip.dropoffX, snapshot.activeTrip.dropoffZ);
      ctx.strokeStyle = '#10b981';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.arc(dx, dz, 6, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#34d399';
      ctx.beginPath();
      ctx.arc(dx, dz, 2.8, 0, Math.PI * 2);
      ctx.fill();
    }

    // Player taxi chevron
    const [plX, plZ] = toPx(snapshot.playerX, snapshot.playerZ);
    ctx.save();
    ctx.translate(plX, plZ);
    ctx.rotate(-snapshot.playerHeading);
    ctx.fillStyle = '#fde047';
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, -6.5);
    ctx.lineTo(4.8, 4.8);
    ctx.lineTo(0, 2.2);
    ctx.lineTo(-4.8, 4.8);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }, [snapshot, expanded]);

  return (
    <div className="pointer-events-auto flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={() => {
          setExpanded((prev) => !prev);
          onInspect?.();
        }}
        aria-label={expanded ? 'Collapse minimap' : 'Expand minimap'}
        title={expanded ? 'Tap to shrink map' : 'Tap to expand map'}
        className={`relative rounded-lg overflow-hidden border bg-slate-950/90 p-1 cursor-pointer transition-all ${
          highlighted ? 'border-amber-400 animate-tutorial-highlight' : 'border-white/15'
        }`}
      >
        <canvas
          ref={canvasRef}
          width={expanded ? 184 : 116}
          height={expanded ? 184 : 116}
          className={
            expanded
              ? 'w-[148px] h-[148px] sm:w-[184px] sm:h-[184px] rounded'
              : 'w-[92px] h-[92px] sm:w-[116px] sm:h-[116px] rounded'
          }
        />
        <span className="absolute right-1.5 bottom-1.5 p-0.5 rounded bg-slate-950/80 text-slate-300">
          {expanded ? <Minimize2 className="w-3 h-3" /> : <Maximize2 className="w-3 h-3" />}
        </span>
      </button>
      <div className="pointer-events-none px-2 py-1 rounded bg-slate-950/88 border border-white/10 text-[10px] text-slate-300 flex items-center gap-2">
        <span className="inline-flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-amber-400" />
          <span>Pickup</span>
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-emerald-400" />
          <span>Dest</span>
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="w-2 h-2 bg-sky-400" />
          <span>Fuel</span>
        </span>
      </div>
    </div>
  );
}
