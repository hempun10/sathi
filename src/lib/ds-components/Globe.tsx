import { useEffect, useMemo, useRef } from "react";
import createGlobe, { type Marker } from "cobe";
import { useTheme } from "next-themes";
import { useMotionValue, useSpring } from "framer-motion";
import { cn } from "@/lib/utils";

/**
 * WebGL globe (cobe) — verbatim port of the reference Globe module
 * (bundles/1874: Globe component; canvas-webgl-detection canvases[1] 510x510 hasWebGL).
 * Slow auto-rotation via onRender (phi += 0.005 when not dragging), spring-smoothed
 * pointer drag (delta / 1400 through a stiffness 100 / damping 30 spring), theme-aware
 * colors, and a 500ms opacity fade-in once mounted.
 * Used by the "Seamless Integrations" and "Advanced Task Security" / "Scalable for Teams" cards.
 */

const MARKERS: Marker[] = [
  { location: [14.5995, 120.9842], size: 0.03 },
  { location: [19.076, 72.8777], size: 0.1 },
  { location: [23.8103, 90.4125], size: 0.05 },
  { location: [30.0444, 31.2357], size: 0.07 },
  { location: [39.9042, 116.4074], size: 0.08 },
  { location: [-23.5505, -46.6333], size: 0.1 },
  { location: [19.4326, -99.1332], size: 0.1 },
  { location: [40.7128, -74.006], size: 0.1 },
  { location: [34.6937, 135.5022], size: 0.05 },
  { location: [41.0082, 28.9784], size: 0.06 },
];

export const GLOBE_CONFIG = {
  width: 800,
  height: 800,
  onRender: () => {},
  devicePixelRatio: 2,
  phi: 0,
  theta: 0.3,
  dark: 0,
  diffuse: 0.4,
  mapSamples: 16000,
  mapBrightness: 1.2,
  baseColor: [1, 1, 1] as [number, number, number],
  markerColor: [253 / 255, 54 / 255, 110 / 255] as [number, number, number],
  glowColor: [1, 1, 1] as [number, number, number],
  markers: MARKERS,
};

type Rgb = [number, number, number];

const THEME_COLORS: Record<"light" | "dark", { base: Rgb; glow: Rgb; marker: Rgb }> = {
  light: { base: [1, 1, 1], glow: [1, 1, 1], marker: [253 / 255, 54 / 255, 110 / 255] },
  dark: { base: [0.4, 0.4, 0.4], glow: [0.24, 0.24, 0.27], marker: [253 / 255, 54 / 255, 110 / 255] },
};

export interface GlobeProps {
  className?: string;
  config?: typeof GLOBE_CONFIG;
}

export function Globe({ className, config = GLOBE_CONFIG }: GlobeProps) {
  const { theme } = useTheme();
  const isDark = theme === "dark";

  const phiRef = useRef(0);
  const widthRef = useRef(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pointerInteracting = useRef<number | null>(null);
  const dragDelta = useRef(0);

  const rotation = useMotionValue(0);
  const smoothRotation = useSpring(rotation, { mass: 1, damping: 30, stiffness: 100 });

  const themedConfig = useMemo(
    () => ({
      ...config,
      baseColor: isDark ? THEME_COLORS.dark.base : THEME_COLORS.light.base,
      glowColor: isDark ? THEME_COLORS.dark.glow : THEME_COLORS.light.glow,
      markerColor: THEME_COLORS.light.marker,
      dark: isDark ? 1 : 0,
      diffuse: isDark ? 0.5 : 0.4,
      mapBrightness: isDark ? 1.4 : 1.2,
    }),
    [config, isDark],
  );

  const updatePointerInteraction = (value: number | null) => {
    pointerInteracting.current = value;
    if (canvasRef.current) {
      canvasRef.current.style.cursor = value !== null ? "grabbing" : "grab";
    }
  };

  const updateMovement = (clientX: number) => {
    if (pointerInteracting.current !== null) {
      const delta = clientX - pointerInteracting.current;
      dragDelta.current = delta;
      rotation.set(rotation.get() + delta / 1400);
    }
  };

  useEffect(() => {
    const onResize = () => {
      if (canvasRef.current) {
        widthRef.current = canvasRef.current.offsetWidth;
      }
    };
    window.addEventListener("resize", onResize);
    onResize();

    const globe = createGlobe(canvasRef.current as HTMLCanvasElement, {
      ...themedConfig,
      width: widthRef.current * 2,
      height: widthRef.current * 2,
      onRender: (state: { phi: number; width: number; height: number }) => {
        if (!pointerInteracting.current) phiRef.current += 0.005;
        state.phi = phiRef.current + smoothRotation.get();
        state.width = widthRef.current * 2;
        state.height = widthRef.current * 2;
      },
    } as Parameters<typeof createGlobe>[1]);

    setTimeout(() => {
      if (canvasRef.current) canvasRef.current.style.opacity = "1";
    }, 0);

    return () => {
      globe.destroy();
      window.removeEventListener("resize", onResize);
    };
  }, [smoothRotation, themedConfig]);

  return (
    <div
      className={cn(
        "absolute inset-0 mx-auto aspect-[1/1] w-full max-w-[600px]",
        className,
      )}
    >
      <canvas
        className="size-full opacity-0 transition-opacity duration-500 [contain:layout_paint_size]"
        ref={canvasRef}
        onPointerDown={(e) => {
          pointerInteracting.current = e.clientX;
          updatePointerInteraction(e.clientX);
        }}
        onPointerUp={() => updatePointerInteraction(null)}
        onPointerOut={() => updatePointerInteraction(null)}
        onMouseMove={(e) => updateMovement(e.clientX)}
        onTouchMove={(e) => e.touches[0] && updateMovement(e.touches[0].clientX)}
      />
    </div>
  );
}

export default Globe;
