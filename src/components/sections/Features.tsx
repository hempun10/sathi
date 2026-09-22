import {
  forwardRef,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentProps,
} from "react";
import * as AccordionPrimitive from "@radix-ui/react-accordion";
import { motion, useInView } from "framer-motion";
import { Accordion } from "@/lib/ds-components/Accordion";
import { cn } from "@/lib/utils";

/**
 * "Simple. Seamless. Smart." — 4-step vertical stepper + swapping mockup image.
 * Verbatim port of the reference `Feature` component (page chunk module 54246,
 * transition-spec how-it-works-stepper): radix Accordion (single, controlled) rows
 * `div.mt-px` auto-advance every collapseDelay (5s) once the section is 50% in view,
 * a linear progress line fills over the active row for collapseDelay ms, and the
 * mockup image cross-blurs per active step. Mobile renders a snap-x card carousel
 * (lg:hidden) with the same progress line and scroll-synced active index.
 *
 * Notes:
 * - Step images are the reference Unsplash photos, mirrored locally in /public
 *   (download-log.json + three additions following the same naming scheme).
 * - Reference content used `animate-slide-up/down`; this clone's index.css defines
 *   the identical height keyframes as `animate-accordion-down/up`
 *   (0 -> var(--radix-accordion-content-height)), so those tokens are used —
 *   radix Presence needs real keyframes to unmount closed content.
 */

interface FeatureItem {
  id: number;
  title: string;
  content: string;
  image: string;
}

const FEATURE_ITEMS: FeatureItem[] = [
  {
    id: 1,
    title: "Ask Your AI Agent Directly",
    content:
      "Speak or type your command—let SkyAgent capture your intent. Your request instantly sets the process in motion.",
    image: "/photo-1720371300677-ba4838fa0678",
  },
  {
    id: 2,
    title: "Let SkyAgent Process It",
    content:
      "We prioritize the needs and preferences of our users in our design process.",
    image: "/photo-1686170287433-c95faf6d3608",
  },
  {
    id: 3,
    title: "Receive Instant, Actionable Results",
    content:
      "Our features seamlessly integrate with your existing systems for a smooth experience.",
    image: "/photo-1720378042271-60aff1e1c538",
  },
  {
    id: 4,
    title: "Continuous Improvement",
    content:
      "We are constantly updating and improving our features to provide the best experience.",
    image: "/photo-1666882990322-e7f3b8df4f75",
  },
];

/* Reference-local accordion primitives (module 54246): thinner than the DS
   shadcn-style Accordion — no chevron, h-[45px] rows, p-3 content. */
const StepItem = forwardRef<
  HTMLDivElement,
  ComponentProps<typeof AccordionPrimitive.Item>
>(({ children, className, ...props }, ref) => (
  <AccordionPrimitive.Item
    className={cn(
      "mt-px overflow-hidden focus-within:relative focus-within:z-10",
      className,
    )}
    {...props}
    ref={ref}
  >
    {children}
  </AccordionPrimitive.Item>
));
StepItem.displayName = "StepItem";

const StepTrigger = forwardRef<
  HTMLButtonElement,
  ComponentProps<typeof AccordionPrimitive.Trigger>
>(({ children, className, ...props }, ref) => (
  <AccordionPrimitive.Header className="flex">
    <AccordionPrimitive.Trigger
      className={cn(
        "group flex h-[45px] flex-1 cursor-pointer items-center justify-between p-3 text-[15px] leading-none outline-none",
        className,
      )}
      {...props}
      ref={ref}
    >
      {children}
    </AccordionPrimitive.Trigger>
  </AccordionPrimitive.Header>
));
StepTrigger.displayName = "StepTrigger";

const StepContent = forwardRef<
  HTMLDivElement,
  ComponentProps<typeof AccordionPrimitive.Content>
>(({ children, className, ...props }, ref) => (
  <AccordionPrimitive.Content
    className={cn(
      "overflow-hidden text-[15px] font-medium data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down",
      className,
    )}
    {...props}
    ref={ref}
  >
    <div className="p-3">{children}</div>
  </AccordionPrimitive.Content>
));
StepContent.displayName = "StepContent";

type LinePosition = "left" | "right" | "top" | "bottom";

interface FeatureStepperProps {
  collapseDelay?: number;
  ltr?: boolean;
  linePosition?: LinePosition;
  lineColor?: string;
  featureItems: FeatureItem[];
}

function FeatureStepper({
  collapseDelay = 5000,
  ltr = false,
  linePosition = "left",
  lineColor = "bg-neutral-500 dark:bg-white",
  featureItems,
}: FeatureStepperProps) {
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [prevIndex, setPrevIndex] = useState(-1);

  const carouselRef = useRef<HTMLUListElement>(null);
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.5 });

  // Open the first step shortly after the section scrolls half into view.
  useEffect(() => {
    const timer = setTimeout(() => {
      setCurrentIndex(inView ? 0 : -1);
    }, 100);
    return () => clearTimeout(timer);
  }, [inView]);

  const scrollToCard = useCallback((index: number) => {
    if (carouselRef.current) {
      const card = carouselRef.current.querySelectorAll(".card")[
        index
      ] as HTMLElement | undefined;
      if (card) {
        const cardRect = card.getBoundingClientRect();
        const carouselRect = carouselRef.current.getBoundingClientRect();
        const offset =
          cardRect.left -
          carouselRect.left -
          (carouselRect.width - cardRect.width) / 2;
        carouselRef.current.scrollTo({
          left: carouselRef.current.scrollLeft + offset,
          behavior: "smooth",
        });
      }
    }
  }, []);

  // Auto-advance the active step; the interval resets on every index change.
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentIndex((prev) =>
        prev !== undefined ? (prev + 1) % featureItems.length : 0,
      );
    }, collapseDelay);
    return () => clearInterval(timer);
  }, [collapseDelay, currentIndex, featureItems.length]);

  // Keep the mobile carousel centered on the upcoming card.
  useEffect(() => {
    const timer = setInterval(() => {
      scrollToCard(
        (currentIndex !== undefined ? currentIndex + 1 : 0) %
          featureItems.length,
      );
    }, collapseDelay);
    return () => clearInterval(timer);
  }, [collapseDelay, currentIndex, featureItems.length, scrollToCard]);

  // Mobile carousel swipes drive the active index.
  useEffect(() => {
    const carousel = carouselRef.current;
    if (carousel) {
      const handleScroll = () => {
        const card = carousel.querySelector(".card") as HTMLElement | null;
        setCurrentIndex(
          Math.min(
            Math.floor(carousel.scrollLeft / (card?.clientWidth || 0)),
            featureItems.length - 1,
          ),
        );
      };
      carousel.addEventListener("scroll", handleScroll);
      return () => carousel.removeEventListener("scroll", handleScroll);
    }
  }, [featureItems.length]);

  // Each step change re-triggers the image blur-in.
  useEffect(() => {
    if (currentIndex !== prevIndex) {
      setImageLoaded(false);
      setPrevIndex(currentIndex);
    }
  }, [currentIndex, prevIndex]);

  const progressLine = (index: number) => (
    <div
      className={cn(
        "absolute overflow-hidden rounded-lg transition-opacity",
        "data-[state=closed]:opacity-0 data-[state=open]:opacity-100",
        "bg-neutral-300/50 dark:bg-neutral-300/30",
        {
          "bottom-0 top-0 h-full w-0.5 left-0": linePosition === "left",
          "bottom-0 top-0 h-full w-0.5 right-0": linePosition === "right",
          "left-0 right-0 top-0 h-0.5 w-full": linePosition === "top",
          "left-0 right-0 bottom-0 h-0.5 w-full": linePosition === "bottom",
        },
      )}
      data-state={currentIndex === index ? "open" : "closed"}
    >
      <div
        className={cn(
          "absolute transition-all ease-linear",
          lineColor,
          {
            "left-0 top-0 w-full": ["left", "right"].includes(linePosition),
            "left-0 top-0 h-full": ["top", "bottom"].includes(linePosition),
          },
          currentIndex === index
            ? ["left", "right"].includes(linePosition)
              ? "h-full"
              : "w-full"
            : ["left", "right"].includes(linePosition)
              ? "h-0"
              : "w-0",
        )}
        style={{
          transitionDuration: currentIndex === index ? `${collapseDelay}ms` : "0s",
        }}
      />
    </div>
  );

  return (
    <div ref={ref} className="w-full">
      <div className="flex w-full flex-col items-center justify-center max-w-7xl mx-auto">
        <div className="grid h-full grid-cols-5 gap-x-10 px-10 md:px-20 items-center w-full">
          <div
            className={cn(
              "col-span-2 w-full h-full hidden lg:flex md:items-center",
              ltr ? "md:order-2 md:justify-end" : "justify-start",
            )}
          >
            <Accordion
              className="w-full h-full flex flex-col gap-8"
              type="single"
              defaultValue={`item-${currentIndex}`}
              value={`item-${currentIndex}`}
              onValueChange={(value) => {
                const index = Number(value.split("-")[1]);
                if (!Number.isNaN(index)) setCurrentIndex(index);
              }}
            >
              {featureItems.map((item, index) => (
                <StepItem
                  key={item.id}
                  className={cn(
                    "relative data-[state=open]:bg-white dark:data-[state=open]:bg-[#27272A] rounded-lg data-[state=closed]:rounded-none data-[state=closed]:border-0",
                    "dark:data-[state=open]:shadow-[0px_0px_0px_1px_rgba(249,250,251,0.06),0px_0px_0px_1px_var(--color-zinc-800,#27272A),0px_1px_2px_-0.5px_rgba(0,0,0,0.24),0px_2px_4px_-1px_rgba(0,0,0,0.24)]",
                    "data-[state=open]:shadow-[0px_0px_1px_0px_rgba(0,0,0,0.16),0px_1px_2px_-0.5px_rgba(0,0,0,0.16)]",
                  )}
                  value={`item-${index}`}
                >
                  {progressLine(index)}
                  <StepTrigger className="font-semibold text-lg tracking-tight text-left">
                    {item.title}
                  </StepTrigger>
                  <StepContent className="text-sm font-medium">
                    {item.content}
                  </StepContent>
                </StepItem>
              ))}
            </Accordion>
          </div>

          <div
            className={cn(
              "col-span-5 h-[350px] min-h-[200px] w-auto lg:col-span-3",
              ltr && "md:order-1",
            )}
          >
            {(() => {
              const item = featureItems[currentIndex];
              return item ? (
                <div className="relative h-full w-full overflow-hidden">
                  <div
                    className={cn(
                      "absolute inset-0 bg-gray-200 rounded-xl border border-neutral-300/50",
                      "transition-all duration-150",
                      imageLoaded ? "opacity-0" : "opacity-100",
                    )}
                  />
                  <motion.img
                    key={currentIndex}
                    src={item.image}
                    alt={item.title}
                    className={cn(
                      "aspect-auto h-full w-full rounded-xl border border-neutral-300/50 object-cover p-1",
                      "transition-all duration-300",
                      imageLoaded ? "opacity-100 blur-0" : "opacity-0 blur-xl",
                    )}
                    initial={{ opacity: 0, filter: "blur(5px)" }}
                    animate={{
                      opacity: imageLoaded ? 1 : 0,
                      filter: imageLoaded ? "blur(0px)" : "blur(5px)",
                    }}
                    transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
                    onLoad={() => setImageLoaded(true)}
                    loading="eager"
                    sizes="(max-width: 768px) 100vw, 50vw"
                  />
                </div>
              ) : (
                <div className="aspect-auto h-full w-full rounded-xl border border-neutral-300/50 bg-gray-200 p-1 animate-pulse" />
              );
            })()}
          </div>

          <ul
            ref={carouselRef}
            className="col-span-5 flex snap-x flex-nowrap overflow-x-auto [-ms-overflow-style:none] [-webkit-mask-image:linear-gradient(90deg,transparent,black_10%,white_90%,transparent)] [mask-image:linear-gradient(90deg,transparent,black_10%,white_90%,transparent)] [scrollbar-width:none] lg:hidden [&::-webkit-scrollbar]:hidden snap-mandatory"
            style={{ padding: "50px calc(50%)" }}
          >
            {featureItems.map((item, index) => (
              <a
                key={item.id}
                className="card relative grid h-full max-w-64 shrink-0 items-start justify-center p-3 bg-background border-l last:border-r border-t border-b first:rounded-tl-xl last:rounded-tr-xl"
                onClick={() => setCurrentIndex(index)}
                style={{ scrollSnapAlign: "center" }}
              >
                {progressLine(index)}
                <div className="flex flex-col gap-2">
                  <h2 className="text-lg font-bold">{item.title}</h2>
                  <p className="mx-0 max-w-sm text-balance text-sm font-medium leading-relaxed">
                    {item.content}
                  </p>
                </div>
              </a>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

export default function Features() {
  return (
    <section
      id="features"
      className="flex flex-col items-center justify-center gap-5 w-full relative"
    >
      <div className="border-b w-full h-full p-10 md:p-14">
        <div className="max-w-xl mx-auto flex flex-col items-center justify-center gap-2">
          <h2 className="text-3xl md:text-4xl font-medium tracking-tighter text-center text-balance">
            Simple. Seamless. Smart.
          </h2>
          <p className="text-muted-foreground text-center text-balance font-medium">
            Discover how SkyAgent transforms your commands into action in four
            easy steps
          </p>
        </div>
      </div>
      <div className="w-full h-full lg:h-[450px] flex items-center justify-center">
        {/* Reference passes linePosition="bottom" (captured DOM: mobile card
            progress lines carry left-0 right-0 bottom-0 h-0.5 w-full). */}
        <FeatureStepper linePosition="bottom" featureItems={FEATURE_ITEMS} />
      </div>
    </section>
  );
}
