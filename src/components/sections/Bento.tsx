import {
  lazy,
  Suspense,
  useEffect,
  useId,
  useRef,
  type CSSProperties,
} from "react";
import { motion, useInView } from "framer-motion";
import "number-flow";

import { BentoCard } from "@/lib/ds-components/BentoCard";
import { CardOverlay } from "@/lib/ds-components/CardOverlay";
import { cn } from "@/lib/utils";

/* The cobe WebGL globe is heavy — split it out and mount it only when its
 * card scrolls into view (Seamless Integrations card). */
const Globe = lazy(() => import("@/lib/ds-components/Globe"));

/* number-flow ships as a vanilla web component (<number-flow>); register it
 * (side-effect import above) and teach TSX about the tag. Value is pushed via
 * the element's update() method through a ref. */
declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "number-flow": import("react").DetailedHTMLProps<
        import("react").HTMLAttributes<HTMLElement>,
        HTMLElement
      > & { value?: number };
    }
  }
}

/** Verbatim SkyAgent bolt mark (structure.json svg, viewBox 0 0 42 24). */
function SkyAgentLogo({ className }: { className?: string }) {
  const clipId = useId();
  return (
    <svg
      width="42"
      height="24"
      viewBox="0 0 42 24"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      className={className}
    >
      <g clipPath={`url(#${clipId})`}>
        <path d="M22.3546 0.96832C22.9097 0.390834 23.6636 0.0664062 24.4487 0.0664062C27.9806 0.0664062 31.3091 0.066408 34.587 0.0664146C41.1797 0.0664284 44.481 8.35854 39.8193 13.2082L29.6649 23.7718C29.1987 24.2568 28.4016 23.9133 28.4016 23.2274V13.9234L29.5751 12.7025C30.5075 11.7326 29.8472 10.0742 28.5286 10.0742H13.6016L22.3546 0.96832Z" />
        <path d="M19.6469 23.0305C19.0919 23.608 18.338 23.9324 17.5529 23.9324C14.021 23.9324 10.6925 23.9324 7.41462 23.9324C0.821896 23.9324 -2.47942 15.6403 2.18232 10.7906L12.3367 0.227022C12.8029 -0.257945 13.6 0.0855283 13.6 0.771372L13.6 10.0754L12.4265 11.2963C11.4941 12.2662 12.1544 13.9246 13.473 13.9246L28.4001 13.9246L19.6469 23.0305Z" />
      </g>
      <defs>
        <clipPath id={clipId}>
          <rect width="42" height="24" fill="white" />
        </clipPath>
      </defs>
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Card 1 — Real-time AI Collaboration (chat UI)                      */
/* ------------------------------------------------------------------ */

function CollaborationVisual() {
  return (
    <div className="w-full h-full p-4 flex flex-col items-center justify-center gap-5">
      <div className="pointer-events-none absolute bottom-0 left-0 h-20 w-full bg-gradient-to-t from-background to-transparent z-20" />
      <div className="max-w-md mx-auto w-full flex flex-col gap-2">
        <div className="flex items-end justify-end gap-3">
          <div className="max-w-[280px] bg-secondary text-white p-4 rounded-2xl ml-auto shadow-[0_0_10px_rgba(0,0,0,0.05)]">
            <p className="text-sm">
              Watch this product. Buy it while I sleep. You have Prava.
            </p>
          </div>
          <div className="flex items-center bg-background rounded-full w-fit border border-border flex-shrink-0">
            <img
              className="size-8 rounded-full flex-shrink-0"
              src="/api/portraits/women/79.jpg"
              alt="User Avatar"
            />
          </div>
        </div>
        <div className="flex items-start gap-2">
          <div className="flex items-center bg-background rounded-full size-10 flex-shrink-0 justify-center shadow-[0_0_10px_rgba(0,0,0,0.05)] border border-border">
            <SkyAgentLogo className="fill-[var(--secondary)] size-4" />
          </div>
        </div>
      </div>
      <CardOverlay />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Card 2 — Seamless Integrations (cobe WebGL globe, lazy)            */
/* ------------------------------------------------------------------ */

function IntegrationsVisual() {
  const ref = useRef<HTMLDivElement>(null);
  // Mount the WebGL canvas only once the card approaches the viewport.
  const inView = useInView(ref, { once: true, margin: "200px" });

  return (
    <div
      ref={ref}
      className="relative flex h-full w-full items-center justify-center overflow-hidden"
    >
      <div className="pointer-events-none absolute bottom-0 left-0 h-20 w-full bg-gradient-to-t from-background to-transparent z-20" />
      <div className="pointer-events-none absolute top-0 left-0 h-20 w-full bg-gradient-to-b from-background to-transparent z-20" />
      <div className="absolute top-1/2 -translate-y-1/2 left-1/2 -translate-x-1/2 flex items-center justify-center gap-2 size-16 bg-secondary p-2 rounded-full z-30 md:bottom-0 md:top-auto">
        <SkyAgentLogo className="fill-white size-10" />
      </div>
      <div className="relative flex h-full w-full items-center justify-center overflow-hidden">
        <div className="relative flex h-full w-full items-center justify-center translate-y-0 md:translate-y-32">
          {inView && (
            <Suspense fallback={null}>
              <Globe />
            </Suspense>
          )}
        </div>
      </div>
      <CardOverlay />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Card 3 — Instant Insight Reporting (area chart + 1,234 stat)       */
/* ------------------------------------------------------------------ */

const AREA_PATH =
  "M 0 157.33333333333331 C 20,153.06666666666666 60,138.13333333333333 100,136 C 120,138.13333333333333 160,153.0666666666667 200,146.66666666666669 C 220,138.13333333333335 260,110.4 300,104 C 320,106.13333333333333 360,118.93333333333332 400,114.66666666666666 C 420,108.26666666666667 460,97.60000000000001 500,82.66666666666667 L 600 40 L 600,200 L 0,200 Z";
const LINE_PATH =
  "M 0 157.33333333333331 C 20,153.06666666666666 60,138.13333333333333 100,136 C 120,138.13333333333333 160,153.0666666666667 200,146.66666666666669 C 220,138.13333333333335 260,110.4 300,104 C 320,106.13333333333333 360,118.93333333333332 400,114.66666666666666 C 420,108.26666666666667 460,97.60000000000001 500,82.66666666666667 L 600 40";

function InsightVisual() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-50px" });
  const numberRef = useRef<HTMLElement | null>(null);

  // Tick the stat up to 1,234 when the card enters (number-flow animates).
  useEffect(() => {
    if (!inView) return;
    const el = numberRef.current as unknown as {
      update?: (value: number) => void;
    } | null;
    el?.update?.(0);
    const id = requestAnimationFrame(() => el?.update?.(1234));
    return () => cancelAnimationFrame(id);
  }, [inView]);

  return (
    <div
      ref={ref}
      className="relative flex size-full items-center justify-center h-[300px] pt-10 overflow-hidden"
      style={
        {
          "--color": "rgb(253 54 110)",
          "--color-transparent": "rgb(253 54 110 / 0)",
        } as CSSProperties
      }
    >
      <motion.div
        className="absolute top-[60%] left-1/2 -translate-x-1/2 w-[2px] h-32 bg-gradient-to-b from-[var(--color)] to-[var(--color-transparent)]"
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.3, ease: "easeInOut", delay: 0.3 }}
      />
      {/* Stat pill — fades in on entry; value rolls to 1,234 via number-flow */}
      <div
        className={cn(
          "opacity-0 transition-opacity duration-300 ease-in-out absolute top-32 left-[42%] -translate-x-1/2 text-sm bg-[#1A1B25] border border-white/[0.07] text-white px-4 py-1 rounded-full h-8 flex items-center justify-center font-mono shadow-[0px_1.1px_0px_0px_rgba(255,255,255,0.20)_inset,0px_4.4px_6.6px_0px_rgba(255,255,255,0.01)_inset,0px_2.2px_6.6px_0px_rgba(253,54,110,0.04),0px_1.1px_2.2px_0px_rgba(253,54,110,0.08),0px_0px_0px_1.1px_rgba(253,54,110,0.08)]",
          inView && "opacity-100",
        )}
      >
        <number-flow ref={numberRef} className="font-mono" />
      </div>
      <svg
        width="600"
        height="200"
        viewBox="0 0 600 200"
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
      >
        <defs>
          <linearGradient id="lineGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgb(253 54 110 / 0.30196078431372547)" />
            <stop offset="100%" stopColor="rgb(253 54 110 / 0)" />
          </linearGradient>
        </defs>
        {/* svg-icon-pulse-path: scale 0.95 -> 1.05, 2s easeInOut, mirror loop */}
        <motion.path
          fill="url(#lineGradient)"
          d={AREA_PATH}
          initial={{ opacity: 0, scale: 0.95 }}
          whileInView={{ opacity: 1, scale: [0.95, 1.05] }}
          viewport={{ once: true }}
          transition={{
            opacity: { duration: 0.5, ease: "easeOut" },
            scale: {
              duration: 2,
              ease: "easeInOut",
              repeat: Infinity,
              repeatType: "mirror",
            },
          }}
          style={{ transformOrigin: "300px 120px" }}
        />
        <motion.path
          fill="none"
          stroke="rgb(253 54 110 / 1)"
          strokeWidth="2"
          strokeLinecap="round"
          pathLength={1}
          d={LINE_PATH}
          initial={{ pathLength: 0 }}
          whileInView={{ pathLength: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 1.4, ease: "easeOut" }}
        />
        {/* svg-icon-pulse-circle: scale 0 -> 1.05, 2s easeInOut, mirror loop */}
        <motion.circle
          fill="rgb(253 54 110 / 1)"
          cx="300"
          cy="104"
          r="4"
          initial={{ opacity: 0, scale: 0 }}
          whileInView={{ opacity: 1, scale: [0, 1.05] }}
          viewport={{ once: true }}
          transition={{
            opacity: { duration: 0.3, ease: "easeOut" },
            scale: {
              duration: 2,
              ease: "easeInOut",
              repeat: Infinity,
              repeatType: "mirror",
            },
          }}
          style={{ transformOrigin: "300px 104px" }}
        />
      </svg>
      <CardOverlay />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Card 4 — Smart Automation (calendar rows)                          */
/* ------------------------------------------------------------------ */

const AUTOMATION_ROWS: { label: string; className: string; fromX: number }[] = [
  // bento-list-slide-14/15/16: translateX(±50px) + opacity, 0.5s easeOut
  {
    label: "Watch live",
    className: "bg-secondary text-white",
    fromX: -50,
  },
  {
    label: "Exact quote",
    className: "bg-secondary/40 text-white",
    fromX: 50,
  },
  {
    label: "Bought",
    className:
      "bg-secondary/20 border border-secondary border-dashed text-secondary",
    fromX: -50,
  },
];

const WEEKDAYS = ["Tue", "Wed", "Thu", "Fri", "Sat"];

function AutomationVisual() {
  return (
    <div className="w-full h-full flex flex-col relative">
      <div className="absolute inset-0 flex -z-10 [mask:linear-gradient(180deg,transparent,black_40%,black_40%,transparent)]">
        {Array.from({ length: 8 }, (_, i) => (
          <div
            key={i}
            className={cn(
              "w-1/2 h-full flex items-start justify-between",
              i % 2 === 1 && "border-x border-border/70 border-dashed",
            )}
          />
        ))}
      </div>
      <div className="absolute top-4 left-0 right-0 flex justify-between max-w-md mx-auto px-8 text-sm text-gray-500">
        {WEEKDAYS.map((day) => (
          <span key={day}>{day}</span>
        ))}
      </div>
      <div className="absolute top-10 w-[2px] h-[calc(100%-80px)] bg-gradient-to-b from-black dark:from-accent to-transparent z-10" />
      <div className="absolute top-14 bg-black dark:bg-accent h-6 z-20 flex items-center justify-center text-xs p-2 rounded-md shadow-[0px_2.2px_6.6px_0px_rgba(18,43,105,0.04),0px_1.1px_2.2px_0px_rgba(18,43,105,0.08),0px_0px_0px_1.1px_rgba(18,43,105,0.08),0px_1.1px_0px_0px_rgba(255,255,255,0.20)_inset,0px_4.4px_6.6px_0px_rgba(255,255,255,0.01)_inset]">
        <span className="text-white">12:00 AM</span>
      </div>
      <div className="w-full absolute grid gap-10 top-1/2 -translate-y-1/2 left-1/2 -translate-x-1/3">
        {AUTOMATION_ROWS.map((row) => (
          <motion.div
            key={row.label}
            initial={{ x: row.fromX, opacity: 0 }}
            whileInView={{ x: 0, opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className={cn(
              "flex items-center h-8 justify-center gap-2 rounded-lg w-[250px] p-2 shadow-[0px_9px_5px_0px_#00000005,0px_4px_4px_0px_#00000009,0px_1px_2px_0px_#00000010]",
              row.className,
            )}
          >
            <p className="font-medium text-sm">{row.label}</p>
          </motion.div>
        ))}
      </div>
      <CardOverlay />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Section                                                            */
/* ------------------------------------------------------------------ */

export default function Bento() {
  return (
    <section
      id="bento"
      className="flex flex-col items-center justify-center w-full relative px-5 md:px-10"
    >
      <div className="border-x mx-5 md:mx-10 relative">
        <div className="absolute top-0 -left-4 md:-left-14 h-full w-4 md:w-14 text-primary/5 bg-[size:10px_10px] [background-image:repeating-linear-gradient(315deg,currentColor_0_1px,#0000_0_50%)]" />
        <div className="absolute top-0 -right-4 md:-right-14 h-full w-4 md:w-14 text-primary/5 bg-[size:10px_10px] [background-image:repeating-linear-gradient(315deg,currentColor_0_1px,#0000_0_50%)]" />
        <div className="border-b w-full h-full p-10 md:p-14">
          <div className="max-w-xl mx-auto flex flex-col items-center justify-center gap-2">
            <h2 className="text-3xl md:text-4xl font-medium tracking-tighter text-center text-balance pb-1">
              One loop from link to receipt
            </h2>
            <p className="text-muted-foreground text-center text-balance font-medium">
              Send a product URL in iMessage. Grant Prava once. Sathi watches
              the price and buys on its own.
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 overflow-hidden">
          <BentoCard
            title="Text the product link"
            description="Drop a URL in iMessage. That is the request. Sathi takes it from there."
          >
            <CollaborationVisual />
          </BentoCard>
          <BentoCard
            title="We watch the page"
            description="Firecrawl keeps eyes on price and availability. You can sleep through the wait."
          >
            <IntegrationsVisual />
          </BentoCard>
          <BentoCard
            title="One exact quote"
            description="When the number hits, Sathi has a shipping-and-tax-inclusive total ready to buy."
          >
            <InsightVisual />
          </BentoCard>
          <BentoCard
            title="Sathi buys while you sleep"
            description="Grant Prava payment control once. No per-order approval. The receipt comes back in Messages."
          >
            <AutomationVisual />
          </BentoCard>
        </div>
      </div>
    </section>
  );
}
