import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";
import { EASE } from "@/components/landing/shared";

const TAGLINE =
  "You never watch the page. You never miss the drop. You never pay for anything you did not approve.";

export function TaglineReveal() {
  const ref = useRef<HTMLHeadingElement>(null);
  const words = TAGLINE.split(" ");
  const [active, setActive] = useState(0);

  useEffect(() => {
    let raf = 0;
    const update = () => {
      const el = ref.current;
      if (!el) {
        return;
      }
      const rect = el.getBoundingClientRect();
      const vh = window.innerHeight;
      const progress = Math.min(
        1,
        Math.max(0, (vh * 0.85 - rect.top) / (vh * 0.6)),
      );
      setActive(Math.round(progress * words.length));
    };
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [words.length]);

  return (
    <section className="mx-auto max-w-6xl px-4 py-24">
      <h2
        ref={ref}
        className="mx-auto max-w-[680px] text-center text-4xl font-semibold tracking-tight text-balance sm:text-6xl"
      >
        {words.map((word, i) => (
          <span
            key={i}
            className={cn(
              "transition-colors duration-700",
              EASE,
              i < active ? "text-neutral-900" : "text-neutral-900/30",
            )}
          >
            {word}{" "}
          </span>
        ))}
      </h2>
    </section>
  );
}
