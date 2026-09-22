import { useEffect, useId, useRef, useState } from "react";
import { motion, useInView, useReducedMotion } from "framer-motion";
import { BellRing, Eye, Search } from "lucide-react";

import { OrbitingCircles } from "@/components/ui/orbiting-circles";
import { BentoCard } from "@/lib/ds-components/BentoCard";
import { CardOverlay } from "@/lib/ds-components/CardOverlay";

/** Sathi bolt mark. */
function SathiLogo({ className }: { className?: string }) {
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
/* Card 1 — Animated example of the tested iMessage flow              */
/* ------------------------------------------------------------------ */

const USER_MESSAGE = "Find black Adidas Sambas in size 10 under $100.";
const CHAT_STEPS = [
  { kind: "user", text: USER_MESSAGE, pause: 700 },
  { kind: "thinking", text: "", pause: 900 },
  {
    kind: "assistant",
    text: "I found 2 options. Open the picker to choose one.",
    pause: 1_600,
  },
  { kind: "thinking", text: "", pause: 700 },
  {
    kind: "assistant",
    text: "Done — I'm watching Samba OG Shoes at $95. I'll message you when it's in stock at $90 or less.",
    pause: 3_000,
  },
] as const;

function TypingDots() {
  return (
    <span className="flex h-5 items-center gap-1" aria-label="Sathi is typing">
      {[0, 1, 2].map((index) => (
        <span
          key={index}
          className="size-1.5 animate-bounce rounded-full bg-muted-foreground"
          style={{ animationDelay: `${index * 120}ms` }}
        />
      ))}
    </span>
  );
}

function CollaborationVisual() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "100px" });
  const reduceMotion = useReducedMotion();
  const [stepIndex, setStepIndex] = useState(0);
  const [typedText, setTypedText] = useState(USER_MESSAGE);
  const step = CHAT_STEPS[stepIndex];
  const finalStep = CHAT_STEPS.at(-1)!;
  const visibleStep = reduceMotion ? finalStep : step;
  const visibleText = reduceMotion ? finalStep.text : typedText;

  useEffect(() => {
    if (!inView || reduceMotion) return;

    const isTyping = typedText.length < step.text.length;
    const timeout = window.setTimeout(
      () => {
        if (isTyping) {
          setTypedText(step.text.slice(0, typedText.length + 1));
          return;
        }

        setStepIndex((current) => (current + 1) % CHAT_STEPS.length);
        setTypedText("");
      },
      isTyping ? 35 : step.pause,
    );

    return () => window.clearTimeout(timeout);
  }, [inView, reduceMotion, step, typedText]);

  const userText =
    !reduceMotion && visibleStep.kind === "user" ? visibleText : USER_MESSAGE;

  return (
    <div
      ref={ref}
      className="flex h-full w-full flex-col items-center justify-center gap-5 p-4"
    >
      <div className="pointer-events-none absolute bottom-0 left-0 z-20 h-20 w-full bg-gradient-to-t from-background to-transparent" />
      <div className="mx-auto flex w-full max-w-md flex-col gap-3">
        <div className="flex items-end justify-end gap-3">
          <div className="ml-auto min-h-12 max-w-[280px] rounded-2xl bg-secondary p-4 text-white shadow-[0_0_10px_rgba(0,0,0,0.05)]">
            <p className="text-sm">
              {userText}
              {!reduceMotion && visibleStep.kind === "user" && (
                <span className="ml-0.5 inline-block h-4 w-px animate-pulse bg-current align-middle" />
              )}
            </p>
          </div>
          <div className="flex w-fit flex-shrink-0 items-center rounded-full border border-border bg-background">
            <img
              className="size-8 flex-shrink-0 rounded-full"
              src="/api/portraits/women/79.jpg"
              alt=""
            />
          </div>
        </div>
        <div className="flex min-h-20 items-start gap-2">
          <div className="flex size-10 flex-shrink-0 items-center justify-center rounded-full border border-border bg-background shadow-[0_0_10px_rgba(0,0,0,0.05)]">
            <SathiLogo className="size-4 fill-[var(--secondary)]" />
          </div>
          {visibleStep.kind === "thinking" ? (
            <div className="rounded-2xl border border-border bg-accent px-4 py-3">
              <TypingDots />
            </div>
          ) : visibleStep.kind === "assistant" ? (
            <motion.div
              key={stepIndex}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              className="max-w-[300px] rounded-2xl border border-border bg-accent px-4 py-3"
            >
              <p className="text-sm text-foreground">
                {visibleText}
                {!reduceMotion && (
                  <span className="ml-0.5 inline-block h-4 w-px animate-pulse bg-current align-middle" />
                )}
              </p>
            </motion.div>
          ) : null}
        </div>
      </div>
      <span className="sr-only">
        Example flow: {USER_MESSAGE} I found 2 options. After a picker selection,
        Sathi confirms that the product watch is active.
      </span>
      <CardOverlay />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Card 2 — Product discovery stack                                   */
/* ------------------------------------------------------------------ */

const DISCOVERY_TOOLS = [
  { name: "OpenAI", icon: "/logos/openai.svg" },
  { name: "Firecrawl", icon: "/logos/firecrawl.svg" },
  { name: "Shopify", icon: "/logos/shopify.svg" },
  { name: "Convex", icon: "/logos/convex.svg" },
  { name: "Photon", icon: "/logos/photon.svg" },
];

function ToolIcon({ name, icon }: (typeof DISCOVERY_TOOLS)[number]) {
  return (
    <div
      title={name}
      className="flex size-full items-center justify-center rounded-full border border-border bg-background p-2.5 shadow-lg"
    >
      <img
        src={icon}
        alt={name}
        className="size-full object-contain dark:invert"
      />
    </div>
  );
}

function IntegrationsVisual() {
  return (
    <div className="relative flex h-full min-h-[300px] w-full items-center justify-center overflow-hidden">
      <div className="z-10 flex size-16 items-center justify-center rounded-full bg-secondary shadow-[0_0_40px_rgba(253,54,110,0.3)]">
        <SathiLogo className="size-10 fill-white" />
      </div>
      <OrbitingCircles radius={72} iconSize={44} duration={16}>
        {DISCOVERY_TOOLS.slice(0, 3).map((tool) => (
          <ToolIcon key={tool.name} {...tool} />
        ))}
      </OrbitingCircles>
      <OrbitingCircles reverse radius={122} iconSize={42} duration={24}>
        {DISCOVERY_TOOLS.slice(3).map((tool) => (
          <ToolIcon key={tool.name} {...tool} />
        ))}
      </OrbitingCircles>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 h-20 bg-gradient-to-t from-background to-transparent" />
      <CardOverlay />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Card 3 — Target price                                              */
/* ------------------------------------------------------------------ */

const PRICE_LINE =
  "M 0 42 C 75 48 105 65 170 62 C 230 58 255 92 320 89 C 390 86 415 122 475 126 C 525 130 555 146 600 154";
const PRICE_AREA = `${PRICE_LINE} L 600 220 L 0 220 Z`;

function InsightVisual() {
  return (
    <div className="relative flex h-[300px] size-full items-center justify-center overflow-hidden pt-8">
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="absolute left-8 top-8 z-10 rounded-full border border-border bg-accent px-3 py-1.5 font-mono text-sm"
      >
        Target $100
      </motion.div>
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        whileInView={{ opacity: 1, scale: 1 }}
        viewport={{ once: true }}
        transition={{ delay: 1.1 }}
        className="absolute bottom-12 right-8 z-10 rounded-full bg-secondary px-3 py-1.5 font-mono text-sm text-white"
      >
        Now $98
      </motion.div>
      <svg
        className="w-full min-w-[520px]"
        viewBox="0 0 600 220"
        fill="none"
        aria-label="Price drops below the $100 target"
      >
        <defs>
          <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgb(253 54 110 / 0.32)" />
            <stop offset="100%" stopColor="rgb(253 54 110 / 0)" />
          </linearGradient>
        </defs>
        <motion.line
          x1="0"
          y1="120"
          x2="600"
          y2="120"
          stroke="rgb(253 54 110 / 0.45)"
          strokeDasharray="7 7"
          initial={{ pathLength: 0 }}
          whileInView={{ pathLength: 1 }}
          viewport={{ once: true }}
        />
        <motion.path
          d={PRICE_AREA}
          fill="url(#priceGradient)"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
        />
        <motion.path
          d={PRICE_LINE}
          stroke="rgb(253 54 110)"
          strokeWidth="3"
          strokeLinecap="round"
          initial={{ pathLength: 0 }}
          whileInView={{ pathLength: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 1.4, ease: "easeOut" }}
        />
        <motion.circle
          cx="600"
          cy="154"
          r="6"
          fill="rgb(253 54 110)"
          initial={{ scale: 0 }}
          whileInView={{ scale: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 1.2 }}
        />
      </svg>
      <CardOverlay />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Card 4 — Watch lifecycle                                           */
/* ------------------------------------------------------------------ */

const WATCH_EVENTS = [
  { title: "2 options found", detail: "Picker ready", Icon: Search },
  { title: "Watch active", detail: "Samba OG · size 10", Icon: Eye },
  { title: "Price alert", detail: "$125 → $98", Icon: BellRing },
];

function AutomationVisual() {
  return (
    <div className="relative flex h-full min-h-[300px] w-full items-center justify-center overflow-hidden">
      <div className="relative z-10 grid w-full max-w-sm gap-4 px-6">
        <div className="absolute bottom-8 left-[60px] top-8 -z-10 w-px bg-border" />
        {WATCH_EVENTS.map(({ title, detail, Icon }, index) => (
          <motion.div
            key={title}
            initial={{ x: index % 2 ? 24 : -24, opacity: 0 }}
            whileInView={{ x: 0, opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.45, delay: index * 0.18 }}
            className="flex items-center gap-3 rounded-2xl border border-border bg-background/95 p-3 shadow-lg"
          >
            <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-secondary/10 text-secondary">
              <Icon className="size-5" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <p className="font-medium text-foreground">{title}</p>
              <p className="text-sm text-muted-foreground">{detail}</p>
            </div>
            {index === WATCH_EVENTS.length - 1 && (
              <span className="ml-auto size-2 rounded-full bg-secondary shadow-[0_0_12px_var(--secondary)]" />
            )}
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
              From one text to a live product watch
            </h2>
            <p className="text-muted-foreground text-center text-balance font-medium">
              Describe what you want or send a product link. Sathi finds the
              page, starts a watch, and messages you when it changes.
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 overflow-hidden">
          <BentoCard
            title="Ask in iMessage"
            description="Describe the product and constraints. Sathi asks one follow-up when the request needs more detail."
          >
            <CollaborationVisual />
          </BentoCard>
          <BentoCard
            title="Choose a product"
            description="Firecrawl searches live product pages. Open the private picker and choose the option you want to watch."
          >
            <IntegrationsVisual />
          </BentoCard>
          <BentoCard
            title="Set your target"
            description="Choose a size and target price. Sathi freshly checks the selected page before starting the monitor."
          >
            <InsightVisual />
          </BentoCard>
          <BentoCard
            title="Get change alerts"
            description="Sathi messages you when the price or availability changes. It never checks out or buys anything."
          >
            <AutomationVisual />
          </BentoCard>
        </div>
      </div>
    </section>
  );
}
