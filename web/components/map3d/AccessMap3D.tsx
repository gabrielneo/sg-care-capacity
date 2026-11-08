"use client";

/**
 * The 3D access map (three.js through @react-three/fiber). Loaded with next/dynamic (ssr: false),
 * so it never blocks the first paint, and only when the 3D view is shown.
 *
 * - Geometry: the API's SVY21 layer, in metres around Singapore's centre. Nothing is projected here.
 * - One extruded mesh per area (55): height = residents aged 65+ on a linear scale, colour = CDMP
 *   clinics per 1,000 seniors in five groups, darker = fewer. Areas with too few seniors to rank are
 *   flat and grey. Tops use an unlit material, so they match the legend exactly; sides are shaded.
 * - Renders on demand (frameloop "demand"): a frame only when something changes, never a loop.
 *   Device pixel ratio capped at 2.
 * - Orbit with limits (never under the map); hover shows a tooltip; click opens the area panel.
 * - One intro camera move (1.6 s) the first time in a session, skipped with reduced motion.
 */
import { Edges, Html, OrbitControls } from "@react-three/drei";
import { Canvas, type ThreeEvent, useFrame, useThree } from "@react-three/fiber";
import { type RefObject, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Color, ExtrudeGeometry, Path, Shape, Vector2 } from "three";

import type { Svy21Collection } from "@/lib/api/types";
import { formatValue } from "@/lib/areaMetrics";
import {
  type AreaStyle,
  cameraEnd,
  cameraStart,
  fitDistance,
  FOV,
  INTRO_MS,
  introPosition,
  polygons,
  shortfallText,
  styleAreas,
} from "@/lib/map3d";
import { colors } from "@/lib/palette";

export interface AccessMap3DProps {
  layer: Svy21Collection;
  /** Area names to label, in priority order (the access-gap findings). */
  labels: string[];
  selected: string | null;
  onSelect: (code: string | null) => void;
  /** Play the intro camera move (false with reduced motion, or after the first time). */
  intro: boolean;
  onIntroDone?: () => void;
}

const LABEL_LIFT = 350;            // metres above an area's top

function geometryFor(area: AreaStyle, layer: Svy21Collection["features"][number]): ExtrudeGeometry {
  const shapes = polygons(layer.geometry).map((r) => {
    const s = new Shape(r.outer.map(([x, y]) => new Vector2(x, y)));
    s.holes = r.holes.map((h) => new Path(h.map(([x, y]) => new Vector2(x, y))));
    return s;
  });
  return new ExtrudeGeometry(shapes, { depth: area.height, bevelEnabled: false, curveSegments: 1, steps: 1 });
}

function lighten(hex: string, k: number): string {
  return `#${new Color(hex).lerp(new Color("#FFFFFF"), k).getHexString()}`;
}

function Rig({ intro, onIntroDone }: { intro: boolean; onIntroDone?: () => void }) {
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const invalidate = useThree((s) => s.invalidate);
  const distance = fitDistance(size.width / Math.max(size.height, 1));
  const start = useRef<number | null>(null);
  const [moving, setMoving] = useState(intro);

  // Without the intro (reduced motion, or seen already), start where it would have ended.
  useLayoutEffect(() => {
    camera.position.set(...(intro ? cameraStart(distance) : cameraEnd(distance)));
    camera.lookAt(0, 0, 0);
    invalidate();
    // Only on mount: later the reader moves the camera.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useFrame(() => {
    if (!moving) return;
    start.current ??= performance.now();
    const t = performance.now() - start.current;
    camera.position.set(...introPosition(t, distance));
    camera.lookAt(0, 0, 0);
    if (t >= INTRO_MS) {
      setMoving(false);
      onIntroDone?.();
    } else {
      invalidate();                                   // keep drawing only while the camera moves
    }
  });

  // Orbit limits: never below the horizon (no flipping under the map), and not too near or far.
  return (
    <OrbitControls makeDefault enabled={!moving} enableDamping={false} minPolarAngle={0.05} maxPolarAngle={1.2}
                   minDistance={distance * 0.25} maxDistance={distance * 1.8} screenSpacePanning={false} />
  );
}

/** The priority areas' labels: names, or just numbers on a narrow canvas (the key under the map names them). */
function Labels({ labelled, overlay }: { labelled: { rank: number; area: AreaStyle | undefined }[]; overlay: RefObject<HTMLDivElement | null> }) {
  const narrow = useThree((s) => s.size.width) < 560;
  return labelled.map(({ rank, area }) => (
    <Html key={area!.code} position={[area!.props.label_x, area!.height + LABEL_LIFT, -area!.props.label_y]} center
          zIndexRange={[20, 0]} style={{ pointerEvents: "none" }} portal={overlay as RefObject<HTMLElement>}>
      <span className="map3d-label" data-testid="map3d-label" title={area!.name}>{narrow ? rank : `${rank}. ${area!.name}`}</span>
    </Html>
  ));
}

interface Hover {
  area: AreaStyle;
  x: number;
  y: number;
}

export default function AccessMap3D({ layer, labels, selected, onSelect, intro, onIntroDone }: AccessMap3DProps) {
  const { areas } = useMemo(() => styleAreas(layer.features), [layer]);
  const geometries = useMemo(() => areas.map((a, i) => geometryFor(a, layer.features[i]!)), [areas, layer]);
  useEffect(() => () => geometries.forEach((g) => g.dispose()), [geometries]);
  const [hover, setHover] = useState<Hover | null>(null);
  const overlay = useRef<HTMLDivElement>(null);
  const byName = useMemo(() => new Map(areas.map((a) => [a.name, a])), [areas]);
  const labelled = labels.map((name, i) => ({ rank: i + 1, area: byName.get(name) })).filter((l) => l.area);

  const point = (e: ThreeEvent<PointerEvent>, area: AreaStyle) => {
    e.stopPropagation();
    setHover({ area, x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY });
  };

  return (
    <div className="relative h-[420px] w-full overflow-hidden rounded-md border border-line sm:h-[520px]" data-testid="map3d">
      <div role="img" className="h-full w-full"
           aria-label={`3D map of the ${areas.length} areas: height shows residents aged 65+, colour shows chronic-care clinics per senior. `
             + "The 2D map and the table show the same figures and work with a keyboard."}>
        <Canvas frameloop="demand" dpr={[1, 2]} gl={{ antialias: true }}
                camera={{ position: cameraEnd(fitDistance(1.4)), fov: FOV, near: 500, far: 600_000 }}
                onPointerMissed={() => setHover(null)}>
          <color attach="background" args={[colors.surface]} />
          <hemisphereLight args={["#FFFFFF", "#94A3B8", 1.2]} />
          <directionalLight position={[-25_000, 40_000, 30_000]} intensity={1.6} />
          {/* SVY21 x east, y north -> world x east, z south, y up. */}
          <group rotation-x={-Math.PI / 2}>
            {areas.map((a, i) => {
              const hot = hover?.area.code === a.code;
              const chosen = selected === a.code;
              return (
                <mesh key={a.code} geometry={geometries[i]} name={a.code}
                      onPointerOver={(e) => point(e, a)} onPointerMove={(e) => point(e, a)}
                      onPointerOut={() => setHover((h) => (h?.area.code === a.code ? null : h))}
                      onClick={(e) => {
                        if (e.delta > 4) return;                        // a drag to rotate, not a click
                        e.stopPropagation();
                        onSelect(a.code);
                      }}>
                  <meshBasicMaterial attach="material-0" color={hot ? lighten(a.color, 0.35) : a.color} />
                  <meshLambertMaterial attach="material-1" color={a.color} />
                  {hot || chosen ? <Edges color={colors.ink} threshold={20} /> : null}
                </mesh>
              );
            })}
          </group>
          <Labels labelled={labelled} overlay={overlay} />
          <Rig intro={intro} onIntroDone={onIntroDone} />
        </Canvas>
      </div>
      {/* The labels' own layer: a stable target (drei's default one changes once events connect). */}
      <div ref={overlay} className="pointer-events-none absolute inset-0" aria-hidden="true" />
      {hover ? (
        <div data-testid="map3d-tooltip"
             className="pointer-events-none absolute z-10 w-60 rounded-md bg-ink px-3 py-2 text-xs text-surface shadow-lg"
             style={{ left: Math.min(hover.x + 14, 9999), top: hover.y + 14, transform: hover.x > 300 ? "translateX(-110%)" : undefined }}>
          <p className="font-semibold">{hover.area.name}</p>
          <p>Residents aged 65+: {formatValue(hover.area.props.residents_65plus, 0)}</p>
          <p>Chronic-care clinics per 1,000 aged 65+: {formatValue(hover.area.props.cdmp_clinics_per_1k_seniors, 2)}</p>
          <p>{shortfallText(hover.area.props)}</p>
        </div>
      ) : null}
    </div>
  );
}
