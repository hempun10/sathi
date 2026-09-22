import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { motion } from "framer-motion";
import { Globe } from "@/lib/ds-components/Globe";
import { cn } from "@/lib/utils";

/**
 * "Built for Secure Growth" — two cards (verbatim GrowthSection + growthSection
 * config from the reference bundles):
 *  1. "Advanced Task Security" — a FlickeringGrid canvas (gridGap 4, squareSize 2,
 *     maxOpacity 0.5) masked into a shield silhouette, layered under two shield
 *     SVGs (fill-background / fill-accent with drop-shadow filters) and a lock
 *     SVG (inner-shadow filters). NOT a globe — canvas-webgl-detection canvases[0]
 *     (509x360, hasWebGL:false) is this FlickeringGrid canvas.
 *  2. "Scalable for Teams" — the cobe Globe (ds-component, className "top-28")
 *     rising through a bottom-fade mask. The dot lattice + orange markers are
 *     what reads as a "bar chart" in small screenshots; canvases[2] hasWebGL.
 */

/* ------------------------------------------------------------------------ */
/* FlickeringGrid — verbatim port of the reference module (Magic UI),        */
/* color helpers inlined (lib files are off-limits).                         */
/* ------------------------------------------------------------------------ */

type Rgb = [number, number, number];

function hexToRgb(hex: string): Rgb {
  const expanded = hex.replace(
    /^#?([a-f\d])([a-f\d])([a-f\d])$/i,
    (_m, r: string, g: string, b: string) => r + r + g + g + b + b,
  );
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(expanded);
  return result
    ? [
        parseInt(result[1], 16),
        parseInt(result[2], 16),
        parseInt(result[3], 16),
      ]
    : [0, 0, 0];
}

function rgba(rgb: Rgb, alpha: number): string {
  return `rgba(${rgb.join(", ")}, ${alpha})`;
}

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
  ...props
}: FlickeringGridProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isInView, setIsInView] = useState(false);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });

  const memoizedColor = useMemo(() => hexToRgb(color), [color]);

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
          const squareWidth = squareSize * dpr;
          const squareHeight = squareSize * dpr;
          const hasText = maskCtx
            .getImageData(x, y, squareWidth, squareHeight)
            .data.some((value, index) => index % 4 === 0 && value > 0);
          const opacity = squares[i * rows + j];
          const finalOpacity = hasText ? Math.min(1, 3 * opacity + 0.4) : opacity;
          ctx.fillStyle = rgba(memoizedColor, finalOpacity);
          ctx.fillRect(x, y, squareWidth, squareHeight);
        }
      }
    },
    [memoizedColor, squareSize, gridGap, text, fontSize, fontWeight],
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

    let rafId = 0;
    let grid: GridParams;

    const resize = () => {
      const newWidth = width || container.clientWidth;
      const newHeight = height || container.clientHeight;
      setCanvasSize({ width: newWidth, height: newHeight });
      grid = setupCanvas(canvas, newWidth, newHeight);
    };
    resize();

    let lastTime = 0;
    const animate = (time: number) => {
      if (!isInView) return;
      const deltaTime = (time - lastTime) / 1000;
      lastTime = time;
      updateSquares(grid.squares, deltaTime);
      drawSquares(
        ctx,
        canvas.width,
        canvas.height,
        grid.cols,
        grid.rows,
        grid.squares,
        grid.dpr,
      );
      rafId = requestAnimationFrame(animate);
    };

    const resizeObserver = new ResizeObserver(() => {
      resize();
    });
    resizeObserver.observe(container);

    const intersectionObserver = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        setIsInView(entry.isIntersecting);
      },
      { threshold: 0 },
    );
    intersectionObserver.observe(canvas);

    if (isInView) {
      rafId = requestAnimationFrame(animate);
    }

    return () => {
      cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
    };
  }, [setupCanvas, updateSquares, drawSquares, width, height, isInView]);

  return (
    <div ref={containerRef} className={cn(`h-full w-full ${className}`)} {...props}>
      <canvas
        ref={canvasRef}
        className="pointer-events-none"
        style={{ width: canvasSize.width, height: canvasSize.height }}
      />
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* Shield + lock artwork (verbatim SVG/filter markup from the bundle).       */
/* ------------------------------------------------------------------------ */

const SHIELD_MASK = `url("data:image/svg+xml,%3Csvg width='265' height='268' viewBox='0 0 265 268' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath fillRule='evenodd' clipRule='evenodd' d='M121.384 4.5393C124.406 1.99342 128.319 0.585938 132.374 0.585938C136.429 0.585938 140.342 1.99342 143.365 4.5393C173.074 29.6304 210.174 45.6338 249.754 50.4314C253.64 50.9018 257.221 52.6601 259.855 55.3912C262.489 58.1223 264.005 61.6477 264.13 65.3354C265.616 106.338 254.748 146.9 232.782 182.329C210.816 217.759 178.649 246.61 140.002 265.547C137.645 266.701 135.028 267.301 132.371 267.298C129.715 267.294 127.1 266.686 124.747 265.526C86.0991 246.59 53.9325 217.739 31.9665 182.309C10.0005 146.879 -0.867679 106.317 0.618784 65.3147C0.748654 61.6306 2.26627 58.1102 4.9001 55.3833C7.53394 52.6565 11.1121 50.9012 14.9945 50.4314C54.572 45.6396 91.6716 29.6435 121.384 4.56V4.5393Z' fill='black'/%3E%3C/svg%3E")`;

const SHIELD_MASK_STYLE: CSSProperties = {
  WebkitMaskImage: SHIELD_MASK,
  maskImage: SHIELD_MASK,
  WebkitMaskSize: "contain",
  maskSize: "contain",
  WebkitMaskRepeat: "no-repeat",
  maskPosition: "center",
};

function BackShield() {
  return (
    <div className="absolute top-[55%] md:top-[58%] left-[55%] md:left-[57%] -translate-x-1/2 -translate-y-1/2 size-full z-10">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="227"
        height="244"
        viewBox="0 0 227 244"
        fill="none"
        className="size-[90%] md:size-[85%] object-contain fill-background"
      >
        <path
          fillRule="evenodd"
          clipRule="evenodd"
          d="M104.06 3.61671C106.656 1.28763 110.017 0 113.5 0C116.983 0 120.344 1.28763 122.94 3.61671C148.459 26.5711 180.325 41.2118 214.322 45.6008C217.66 46.0312 220.736 47.6398 222.999 50.1383C225.262 52.6369 226.563 55.862 226.67 59.2357C227.947 96.7468 218.612 133.854 199.744 166.267C180.877 198.68 153.248 225.074 120.052 242.398C118.028 243.454 115.779 244.003 113.498 244C111.216 243.997 108.969 243.441 106.948 242.379C73.7524 225.055 46.1231 198.661 27.2556 166.248C8.38807 133.835 -0.947042 96.7279 0.329744 59.2168C0.441295 55.8464 1.74484 52.6258 4.00715 50.1311C6.26946 47.6365 9.34293 46.0306 12.6777 45.6008C46.6725 41.2171 78.5389 26.5832 104.06 3.63565V3.61671Z"
        />
      </svg>
    </div>
  );
}

function FrontShield() {
  return (
    <div className="absolute top-[58%] md:top-[60%] left-1/2 -translate-x-1/2 -translate-y-1/2 size-full z-20">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="245"
        height="282"
        viewBox="0 0 245 282"
        className="size-full object-contain fill-accent"
      >
        <g filter="url(#filter0_dddd_2_33)">
          <path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M113.664 7.33065C116.025 5.21236 119.082 4.04126 122.25 4.04126C125.418 4.04126 128.475 5.21236 130.836 7.33065C154.045 28.2076 183.028 41.5233 213.948 45.5151C216.984 45.9065 219.781 47.3695 221.839 49.6419C223.897 51.9144 225.081 54.8476 225.178 57.916C226.339 92.0322 217.849 125.781 200.689 155.261C183.529 184.74 158.4 208.746 128.209 224.501C126.368 225.462 124.323 225.962 122.248 225.959C120.173 225.956 118.13 225.45 116.291 224.484C86.0997 208.728 60.971 184.723 43.811 155.244C26.6511 125.764 18.1608 92.015 19.322 57.8988C19.4235 54.8334 20.6091 51.9043 22.6666 49.6354C24.7242 47.3665 27.5195 45.906 30.5524 45.5151C61.4706 41.5281 90.4531 28.2186 113.664 7.34787V7.33065Z"
          />
        </g>
        <defs>
          <filter
            id="filter0_dddd_2_33"
            x="0.217041"
            y="0.0412598"
            width="244.066"
            height="292.917"
            filterUnits="userSpaceOnUse"
            colorInterpolationFilters="sRGB"
          >
            <feFlood floodOpacity="0" result="BackgroundImageFix" />
            <feColorMatrix
              in="SourceAlpha"
              type="matrix"
              values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"
              result="hardAlpha"
            />
            <feOffset dy="3" />
            <feGaussianBlur stdDeviation="3.5" />
            <feColorMatrix
              type="matrix"
              values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.04 0"
            />
            <feBlend
              mode="normal"
              in2="BackgroundImageFix"
              result="effect1_dropShadow_2_33"
            />
            <feColorMatrix
              in="SourceAlpha"
              type="matrix"
              values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"
              result="hardAlpha"
            />
            <feOffset dy="12" />
            <feGaussianBlur stdDeviation="6" />
            <feColorMatrix
              type="matrix"
              values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.04 0"
            />
            <feBlend
              mode="normal"
              in2="effect1_dropShadow_2_33"
              result="effect2_dropShadow_2_33"
            />
            <feColorMatrix
              in="SourceAlpha"
              type="matrix"
              values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"
              result="hardAlpha"
            />
            <feOffset dy="27" />
            <feGaussianBlur stdDeviation="8" />
            <feColorMatrix
              type="matrix"
              values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.02 0"
            />
            <feBlend
              mode="normal"
              in2="effect2_dropShadow_2_33"
              result="effect3_dropShadow_2_33"
            />
            <feColorMatrix
              in="SourceAlpha"
              type="matrix"
              values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"
              result="hardAlpha"
            />
            <feOffset dy="48" />
            <feGaussianBlur stdDeviation="9.5" />
            <feColorMatrix
              type="matrix"
              values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.01 0"
            />
            <feBlend
              mode="normal"
              in2="effect3_dropShadow_2_33"
              result="effect4_dropShadow_2_33"
            />
            <feBlend
              mode="normal"
              in="SourceGraphic"
              in2="effect4_dropShadow_2_33"
              result="shape"
            />
          </filter>
        </defs>
      </svg>
    </div>
  );
}

function LockIcon() {
  return (
    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-30">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="81"
        height="80"
        viewBox="0 0 81 80"
        className="fill-background"
      >
        <g filter="url(#filter0_iiii_2_34)">
          <path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M20.5 36V28C20.5 22.6957 22.6071 17.6086 26.3579 13.8579C30.1086 10.1071 35.1957 8 40.5 8C45.8043 8 50.8914 10.1071 54.6421 13.8579C58.3929 17.6086 60.5 22.6957 60.5 28V36C62.6217 36 64.6566 36.8429 66.1569 38.3431C67.6571 39.8434 68.5 41.8783 68.5 44V64C68.5 66.1217 67.6571 68.1566 66.1569 69.6569C64.6566 71.1571 62.6217 72 60.5 72H20.5C18.3783 72 16.3434 71.1571 14.8431 69.6569C13.3429 68.1566 12.5 66.1217 12.5 64V44C12.5 41.8783 13.3429 39.8434 14.8431 38.3431C16.3434 36.8429 18.3783 36 20.5 36ZM52.5 28V36H28.5V28C28.5 24.8174 29.7643 21.7652 32.0147 19.5147C34.2652 17.2643 37.3174 16 40.5 16C43.6826 16 46.7348 17.2643 48.9853 19.5147C51.2357 21.7652 52.5 24.8174 52.5 28Z"
          />
        </g>
        <defs>
          <filter
            id="filter0_iiii_2_34"
            x="12.5"
            y="8"
            width="56"
            height="70"
            filterUnits="userSpaceOnUse"
            colorInterpolationFilters="sRGB"
          >
            <feFlood floodOpacity="0" result="BackgroundImageFix" />
            <feBlend
              mode="normal"
              in="SourceGraphic"
              in2="BackgroundImageFix"
              result="shape"
            />
            <feColorMatrix
              in="SourceAlpha"
              type="matrix"
              values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"
              result="hardAlpha"
            />
            <feOffset dy="1" />
            <feGaussianBlur stdDeviation="1" />
            <feComposite in2="hardAlpha" operator="arithmetic" k2="-1" k3="1" />
            <feColorMatrix
              type="matrix"
              values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.1 0"
            />
            <feBlend
              mode="normal"
              in2="shape"
              result="effect1_innerShadow_2_34"
            />
            <feColorMatrix
              in="SourceAlpha"
              type="matrix"
              values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"
              result="hardAlpha"
            />
            <feOffset dy="3" />
            <feGaussianBlur stdDeviation="1.5" />
            <feComposite in2="hardAlpha" operator="arithmetic" k2="-1" k3="1" />
            <feColorMatrix
              type="matrix"
              values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.09 0"
            />
            <feBlend
              mode="normal"
              in2="effect1_innerShadow_2_34"
              result="effect2_innerShadow_2_34"
            />
            <feColorMatrix
              in="SourceAlpha"
              type="matrix"
              values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"
              result="hardAlpha"
            />
            <feOffset dy="8" />
            <feGaussianBlur stdDeviation="2.5" />
            <feComposite in2="hardAlpha" operator="arithmetic" k2="-1" k3="1" />
            <feColorMatrix
              type="matrix"
              values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.05 0"
            />
            <feBlend
              mode="normal"
              in2="effect2_innerShadow_2_34"
              result="effect3_innerShadow_2_34"
            />
            <feColorMatrix
              in="SourceAlpha"
              type="matrix"
              values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"
              result="hardAlpha"
            />
            <feOffset dy="14" />
            <feGaussianBlur stdDeviation="3" />
            <feComposite in2="hardAlpha" operator="arithmetic" k2="-1" k3="1" />
            <feColorMatrix
              type="matrix"
              values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.01 0"
            />
            <feBlend
              mode="normal"
              in2="effect3_innerShadow_2_34"
              result="effect4_innerShadow_2_34"
            />
          </filter>
        </defs>
      </svg>
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* Card contents (growthSection.items[].content from the reference config).  */
/* ------------------------------------------------------------------------ */

function SecurityCardVisual() {
  return (
    <div
      className="relative flex size-full items-center justify-center overflow-hidden transition-all duration-300 hover:[mask-image:none] hover:[webkit-mask-image:none]"
      style={SHIELD_MASK_STYLE}
    >
      <BackShield />
      <FrontShield />
      <LockIcon />
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
        className="size-full"
      >
        <FlickeringGrid
          className="size-full"
          gridGap={4}
          squareSize={2}
          maxOpacity={0.5}
        />
      </motion.div>
    </div>
  );
}

function TeamsCardVisual() {
  return (
    <div className="relative flex size-full max-w-lg items-center justify-center overflow-hidden [mask-image:linear-gradient(to_top,transparent,black_50%)] -translate-y-20">
      <Globe className="top-28" />
    </div>
  );
}

const GROWTH_ITEMS = [
  {
    id: 1,
    content: <SecurityCardVisual />,
    title: "Prava holds the payment key",
    description:
      "You grant Sathi Prava payment control once. That is the only gate. After that, checkout can happen while you sleep.",
  },
  {
    id: 2,
    content: <TeamsCardVisual />,
    title: "Private settings in Messages",
    description:
      "Text settings to get a one-time dashboard link. It works once and expires in 15 minutes. No password to remember.",
  },
];

export default function Growth() {
  return (
    <section
      id="growth"
      className="flex flex-col items-center justify-center w-full relative px-5 md:px-10"
    >
      <div className="border-x mx-5 md:mx-10 relative">
        <div className="absolute top-0 -left-4 md:-left-14 h-full w-4 md:w-14 text-gray-950/5 bg-[size:10px_10px] [background-image:repeating-linear-gradient(315deg,currentColor_0_1px,#0000_0_50%)]" />
        <div className="absolute top-0 -right-4 md:-right-14 h-full w-4 md:w-14 text-gray-950/5 bg-[size:10px_10px] [background-image:repeating-linear-gradient(315deg,currentColor_0_1px,#0000_0_50%)]" />
        <div className="border-b w-full h-full p-10 md:p-14">
          <div className="max-w-xl mx-auto flex flex-col items-center justify-center gap-2">
            <h2 className="text-3xl md:text-4xl font-medium tracking-tighter text-center text-balance">
              You stay in control
            </h2>
            <p className="text-muted-foreground text-center text-balance font-medium">
              Grant Prava once. Sathi watches, quotes, and buys. The receipt
              comes back in iMessage.
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-x md:divide-y-0">
          {GROWTH_ITEMS.map((item) => (
            <div
              key={item.id}
              className="flex flex-col items-start justify-end gap-2 p-6 min-h-[500px]"
            >
              {item.content}
              <h3 className="text-lg tracking-tighter font-semibold">
                {item.title}
              </h3>
              <p className="text-muted-foreground">{item.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
