import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Play, X } from "lucide-react";
import { Badge } from "@/lib/ds-components/Badge";
import { PrimaryButton } from "@/lib/ds-components/PrimaryButton";
import { Reveal } from "@/lib/transitions/Reveal";
import { cn } from "@/lib/utils";

/**
 * Landing hero adapted from the original design reference.
 * - radial-gradient backdrop, centered max-w-3xl column: badge, h1, subcopy, CTAs.
 * - staggered page-load entrance via Reveal (y:20/opacity:0 -> 0/1, 0.6s easeOut,
 *   stagger 0.1 — transition-spec page-load-hero-stagger): badge 0s, headline block
 *   0.1s, CTAs 0.2s, dashboard card 0.3s.
 * - The "dashboard mockup" is the reference HeroVideoDialog: the hero passes NO
 *   thumbnailSrc (verified in the page bundle + RSC payload), so the reference itself
 *   renders the `aspect-video bg-background` surface with the centered play button —
 *   there is no dashboard image asset in the shipped DOM. Clicking it opens the
 *   reference YouTube dialog (animationStyle "from-center", spring 300/30).
 *
 * Note: transition-spec hero-glow-fade (selector `div.absolute.top-[60%].left-1/2`)
 * is NOT wired here — in structure.json that selector resolves to elements inside the
 * bento section (a 2px gradient line / globe mask in feature cards), not section#hero;
 * the captured hero contains no centered absolute glow element.
 */

const HERO_VIDEO_SRC = "https://www.youtube.com/embed/qh3NGpYRG3I?si=4rb-zSdDkVK9qxxb";

/** Reference HeroVideoDialog (page chunk), as configured by the hero: no thumbnail. */
function HeroVideoDialog({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={cn("relative", className)}>
      <div className="group relative cursor-pointer" onClick={() => setOpen(true)}>
        <div className="w-full aspect-video bg-background rounded-2xl" />
        <div className="absolute isolate inset-0 flex scale-[0.9] items-center justify-center rounded-2xl transition-all duration-200 ease-out group-hover:scale-100">
          <div className="flex size-28 items-center justify-center rounded-full bg-gradient-to-t from-secondary/20 to-secondary/15 backdrop-blur-md">
            <div className="relative flex size-20 scale-100 items-center justify-center rounded-full bg-gradient-to-t from-secondary to-white/10 shadow-md transition-all duration-200 ease-out group-hover:scale-[1.2]">
              <Play
                className="size-8 scale-100 fill-white text-white transition-transform duration-200 ease-out group-hover:scale-105"
                style={{
                  filter:
                    "drop-shadow(0 4px 3px rgb(0 0 0 / 0.07)) drop-shadow(0 2px 2px rgb(0 0 0 / 0.06))",
                }}
              />
            </div>
          </div>
        </div>
      </div>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-md"
          >
            <motion.div
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.5, opacity: 0 }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              className="relative mx-4 aspect-video w-full max-w-4xl md:mx-0"
            >
              <motion.button
                type="button"
                aria-label="Close video"
                className="absolute cursor-pointer hover:scale-[98%] transition-all duration-200 ease-out -top-16 right-0 rounded-full bg-neutral-900/50 p-2 text-xl text-white ring-1 backdrop-blur-md dark:bg-neutral-100/50 dark:text-black"
                onClick={() => setOpen(false)}
              >
                <X className="size-5" />
              </motion.button>
              <div className="relative isolate z-[1] size-full overflow-hidden rounded-2xl border-2 border-white">
                <iframe
                  src={HERO_VIDEO_SRC}
                  title="Hero Video"
                  className="size-full"
                  allowFullScreen
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function Hero() {
  return (
    <section id="hero" className="w-full relative">
      <div className="relative flex flex-col items-center w-full px-6">
        <div className="absolute inset-0">
          <div className="absolute inset-0 -z-10 h-[600px] md:h-[800px] w-full [background:radial-gradient(125%_125%_at_50%_10%,var(--background)_40%,var(--secondary)_100%)] rounded-b-xl" />
        </div>
        <div className="relative z-10 pt-32 max-w-3xl mx-auto h-full w-full flex flex-col gap-10 items-center justify-center">
          <Reveal>
            <Badge>Product discovery and alerts</Badge>
          </Reveal>
          <Reveal delay={0.1} className="flex flex-col items-center justify-center gap-5">
            <h1 className="text-3xl md:text-4xl lg:text-5xl xl:text-6xl font-medium tracking-tighter text-balance text-center text-primary">
              Find it. Watch it. Know when it changes.
            </h1>
            <p className="text-base md:text-lg text-center text-muted-foreground font-medium text-balance leading-relaxed tracking-tight">
              Describe what you want or send a product link. Sathi finds
              options, watches your pick, and alerts you in iMessage.
            </p>
          </Reveal>
          <Reveal delay={0.2} className="flex items-center gap-2.5 flex-wrap justify-center">
            <PrimaryButton
              variant="secondary"
              href="#bento"
              className="h-9 w-fit px-5 text-primary-foreground dark:text-secondary-foreground"
            >
              How it works
            </PrimaryButton>
            <PrimaryButton variant="outline" href="/dashboard" className="w-32 px-5">
              Dashboard
            </PrimaryButton>
          </Reveal>
        </div>
      </div>
      <Reveal delay={0.3} className="relative px-6 mt-10">
        <div className="relative size-full shadow-xl rounded-2xl overflow-hidden">
          <HeroVideoDialog className="block dark:hidden" />
          <HeroVideoDialog className="hidden dark:block" />
        </div>
      </Reveal>
    </section>
  );
}
