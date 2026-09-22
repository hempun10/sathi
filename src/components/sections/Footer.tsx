import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Footer — verbatim from structure.json footer#footer (`w-full pb-0`).
 * Brand column (logo + hero.description + theme-aware soc2/hipaa/gdpr badges),
 * three link columns from the reference `footerLinks` config, and the signature
 * FlickeringGrid canvas band (bundle 1874 module 86190; page bundle FooterSection
 * props: text/fontSize/gridGap swap at max-width 1024px via useMediaQuery).
 * No copyright bar exists in the reference footer.
 */

/** Reference logo (structure.json): svg fill-[var(--secondary)] size-8, viewBox 0 0 42 24. */
function FooterLogo({ className }: { className?: string }) {
  return (
    <svg
      width="42"
      height="24"
      viewBox="0 0 42 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("fill-[var(--secondary)]", className)}
    >
      <g clipPath="url(#clip0_322_9172)">
        <path d="M22.3546 0.96832C22.9097 0.390834 23.6636 0.0664062 24.4487 0.0664062C27.9806 0.0664062 31.3091 0.066408 34.587 0.0664146C41.1797 0.0664284 44.481 8.35854 39.8193 13.2082L29.6649 23.7718C29.1987 24.2568 28.4016 23.9133 28.4016 23.2274V13.9234L29.5751 12.7025C30.5075 11.7326 29.8472 10.0742 28.5286 10.0742H13.6016L22.3546 0.96832Z" />
        <path d="M19.6469 23.0305C19.0919 23.608 18.338 23.9324 17.5529 23.9324C14.021 23.9324 10.6925 23.9324 7.41462 23.9324C0.821896 23.9324 -2.47942 15.6403 2.18232 10.7906L12.3367 0.227022C12.8029 -0.257945 13.6 0.0855283 13.6 0.771372L13.6 10.0754L12.4265 11.2963C11.4941 12.2662 12.1544 13.9246 13.473 13.9246L28.4001 13.9246L19.6469 23.0305Z" />
      </g>
      <defs>
        <clipPath id="clip0_322_9172">
          <rect width="42" height="24" fill="white" />
        </clipPath>
      </defs>
    </svg>
  );
}

/** Radix ChevronRightIcon (bundle module 986 `vKP`) used inside each footer link. */
function ChevronRightIcon({ className }: { className?: string }) {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 15 15"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <path
        d="M6.1584 3.13508C6.35985 2.94621 6.67627 2.95642 6.86514 3.15788L10.6151 7.15788C10.7954 7.3502 10.7954 7.64949 10.6151 7.84182L6.86514 11.8418C6.67627 12.0433 6.35985 12.0535 6.1584 11.8646C5.95694 11.6757 5.94673 11.3593 6.1356 11.1579L9.565 7.49985L6.1356 3.84182C5.94673 3.64036 5.95694 3.32394 6.1584 3.13508Z"
        fill="currentColor"
        fillRule="evenodd"
        clipRule="evenodd"
      />
    </svg>
  );
}

/* Compliance badges — path data verbatim from structure.json footer
   (light set: `flex items-center gap-2 dark:hidden`, dark set: `dark:flex ... hidden`). */


function BadgeStub({ label, className }: { label: string; className?: string }) {
  return (
    <svg viewBox="0 0 46 45" width="46" height="45" className={className} aria-label={label}>
      <circle cx="23" cy="22.5" r="20" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <text x="23" y="26" textAnchor="middle" fontSize="7" fontWeight="700" fill="currentColor">{label}</text>
    </svg>
  );
}
function Soc2Icon({ className }: { className?: string }) { return <BadgeStub label="SOC2" className={className} />; }
function HipaaIcon({ className }: { className?: string }) { return <BadgeStub label="HIPAA" className={className} />; }
function GdprIcon({ className }: { className?: string }) { return <BadgeStub label="GDPR" className={className} />; }
function Soc2DarkIcon({ className }: { className?: string }) { return <Soc2Icon className={className} />; }
function HipaaDarkIcon({ className }: { className?: string }) { return <HipaaIcon className={className} />; }
function GdprDarkIcon({ className }: { className?: string }) { return <GdprIcon className={className} />; }


/** useMediaQuery — verbatim port from page bundle FooterSection (`(max-width: 1024px)`). */
function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    function check() {
      setMatches(window.matchMedia(query).matches);
    }
    check();
    window.addEventListener("resize", check);
    const mql = window.matchMedia(query);
    mql.addEventListener("change", check);
    return () => {
      window.removeEventListener("resize", check);
      mql.removeEventListener("change", check);
    };
  }, [query]);
  return matches;
}

/* FlickeringGrid — faithful port of bundle 1874 module 86190 (2D canvas; the footer
   band renders text into an offscreen canvas and brightens squares over the glyphs). */

interface FlickeringGridProps {
  squareSize?: number;
  gridGap?: number;
  flickerChance?: number;
  color?: string;
  width?: number;
  height?: number;
  className?: string;
  maxOpacity?: number;
  text?: string;
  fontSize?: number;
  fontWeight?: number;
}

interface GridParams {
  cols: number;
  rows: number;
  squares: Float32Array;
  dpr: number;
}

/** bundle 79246 `Hz` (toRGBA), simplified to the hex input the footer passes. */
function colorToRgba(color: string): string {
  if (color.startsWith("#")) {
    const hex = color.slice(1);
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b})`;
  }
  return color;
}

/** bundle 79246 `$3` (withAlpha). */
function withAlpha(color: string, opacity: number): string {
  if (!color.startsWith("rgb")) return color;
  const parts = color.match(/[\\d.]+/g);
  if (!parts || parts.length < 3) return color;
  return `rgba(${parts[0]}, ${parts[1]}, ${parts[2]}, ${opacity})`;
}

function FlickeringGrid({
  squareSize = 3,
  gridGap = 3,
  flickerChance = 0.2,
  color = "#B4B4B4",
  width,
  height,
  className,
  maxOpacity = 0.15,
  text = "",
  fontSize = 140,
  fontWeight = 600,
}: FlickeringGridProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isInView, setIsInView] = useState(false);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });

  const rgbaColor = useMemo(() => colorToRgba(color), [color]);

  const drawSquares = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      canvasWidth: number,
      canvasHeight: number,
      cols: number,
      rows: number,
      squares: Float32Array,
      dpr: number,
    ) => {
      ctx.clearRect(0, 0, canvasWidth, canvasHeight);
      const maskCanvas = document.createElement("canvas");
      maskCanvas.width = canvasWidth;
      maskCanvas.height = canvasHeight;
      const maskCtx = maskCanvas.getContext("2d", { willReadFrequently: true });
      if (!maskCtx) return;
      if (text) {
        maskCtx.save();
        maskCtx.scale(dpr, dpr);
        maskCtx.fillStyle = "white";
        maskCtx.font = `${fontWeight} ${fontSize}px "Geist", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
        maskCtx.textAlign = "center";
        maskCtx.textBaseline = "middle";
        maskCtx.fillText(text, canvasWidth / (2 * dpr), canvasHeight / (2 * dpr));
        maskCtx.restore();
      }
      for (let i = 0; i < cols; i++) {
        for (let j = 0; j < rows; j++) {
          const x = i * (squareSize + gridGap) * dpr;
          const y = j * (squareSize + gridGap) * dpr;
          const size = squareSize * dpr;
          const hasText = maskCtx
            .getImageData(x, y, size, size)
            .data.some((value, index) => index % 4 === 0 && value > 0);
          const base = squares[i * rows + j];
          const opacity = hasText ? Math.min(1, 3 * base + 0.4) : base;
          ctx.fillStyle = withAlpha(rgbaColor, opacity);
          ctx.fillRect(x, y, size, size);
        }
      }
    },
    [rgbaColor, squareSize, gridGap, text, fontSize, fontWeight],
  );

  const setupCanvas = useCallback(
    (canvas: HTMLCanvasElement, canvasWidth: number, canvasHeight: number): GridParams => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = canvasWidth * dpr;
      canvas.height = canvasHeight * dpr;
      canvas.style.width = `${canvasWidth}px`;
      canvas.style.height = `${canvasHeight}px`;
      const cols = Math.ceil(canvasWidth / (squareSize + gridGap));
      const rows = Math.ceil(canvasHeight / (squareSize + gridGap));
      const squares = new Float32Array(cols * rows);
      for (let i = 0; i < squares.length; i++) {
        squares[i] = Math.random() * maxOpacity;
      }
      return { cols, rows, squares, dpr };
    },
    [squareSize, gridGap, maxOpacity],
  );

  const updateSquares = useCallback(
    (squares: Float32Array, deltaTime: number) => {
      for (let i = 0; i < squares.length; i++) {
        if (Math.random() < flickerChance * deltaTime) {
          squares[i] = Math.random() * maxOpacity;
        }
      }
    },
    [flickerChance, maxOpacity],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let grid: GridParams;

    const resize = () => {
      const w = width || container.clientWidth;
      const h = height || container.clientHeight;
      setCanvasSize({ width: w, height: h });
      grid = setupCanvas(canvas, w, h);
    };
    resize();

    let lastTime = 0;
    const loop = (time: number) => {
      if (!isInView) return;
      const deltaTime = (time - lastTime) / 1000;
      lastTime = time;
      updateSquares(grid.squares, deltaTime);
      drawSquares(ctx, canvas.width, canvas.height, grid.cols, grid.rows, grid.squares, grid.dpr);
      raf = requestAnimationFrame(loop);
    };

    const resizeObserver = new ResizeObserver(() => resize());
    resizeObserver.observe(container);
    const intersectionObserver = new IntersectionObserver(
      ([entry]) => setIsInView(entry.isIntersecting),
      { threshold: 0 },
    );
    intersectionObserver.observe(canvas);
    if (isInView) raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
    };
  }, [setupCanvas, drawSquares, updateSquares, width, height, isInView]);

  return (
    <div ref={containerRef} className={cn("h-full w-full", className)}>
      <canvas
        ref={canvasRef}
        className="pointer-events-none"
        style={{ width: canvasSize.width, height: canvasSize.height }}
      />
    </div>
  );
}

/** Reference `footerLinks` config (bundle 1874) — all urls are "#" verbatim. */
const FOOTER_LINKS: { title: string; links: { id: number; title: string; url: string }[] }[] = [
  {
    title: "Product",
    links: [
      { id: 1, title: "How it works", url: "#bento" },
      { id: 2, title: "FAQ", url: "#faq" },
      { id: 3, title: "Dashboard", url: "/dashboard" },
    ],
  },
  {
    title: "Account",
    links: [
      { id: 4, title: "Settings", url: "/dashboard" },
      { id: 5, title: "Claim a link", url: "/claim" },
    ],
  },
  {
    title: "Legal",
    links: [
      { id: 6, title: "Privacy", url: "/privacy" },
      { id: 7, title: "Terms", url: "/terms" },
    ],
  },
];

export default function Footer() {
  const isMobile = useMediaQuery("(max-width: 1024px)");
  return (
    <footer id="footer" className="w-full pb-0">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between p-10">
        <div className="flex flex-col items-start justify-start gap-y-5 max-w-xs mx-0">
          <a href="/" className="flex items-center gap-2">
            <FooterLogo className="size-8" />
            <p className="text-xl font-semibold text-primary">Sathi</p>
          </a>
          <p className="tracking-tight text-muted-foreground font-medium">
            Text a product link. Grant Prava once. Sathi buys while you sleep.
          </p>
        </div>
        <div className="pt-5 md:w-1/2">
          <div className="flex flex-col items-start justify-start md:flex-row md:items-center md:justify-between gap-y-5 lg:pl-10">
            {FOOTER_LINKS.map((column) => (
              <ul key={column.title} className="flex flex-col gap-y-2">
                <li className="mb-2 text-sm font-semibold text-primary">{column.title}</li>
                {column.links.map((link) => (
                  <li
                    key={link.id}
                    className="group inline-flex cursor-pointer items-center justify-start gap-1 text-[15px]/snug text-muted-foreground"
                  >
                    <a href={link.url}>{link.title}</a>
                    <div className="flex size-4 items-center justify-center border border-border rounded translate-x-0 transform opacity-0 transition-all duration-300 ease-out group-hover:translate-x-1 group-hover:opacity-100">
                      <ChevronRightIcon className="h-4 w-4" />
                    </div>
                  </li>
                ))}
              </ul>
            ))}
          </div>
        </div>
      </div>
      <div className="w-full h-48 md:h-64 relative mt-24 z-0">
        <div className="absolute inset-0 bg-gradient-to-t from-transparent to-background z-10 from-40%" />
        <div className="absolute inset-0 mx-6">
          <FlickeringGrid
            text={isMobile ? "Sathi" : "Buys while you sleep"}
            fontSize={isMobile ? 70 : 90}
            className="h-full w-full"
            squareSize={2}
            gridGap={isMobile ? 2 : 3}
            color="#6B7280"
            maxOpacity={0.3}
            flickerChance={0.1}
          />
        </div>
      </div>
    </footer>
  );
}
