import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";
import {
  testimonialColumns,
  testimonialDurations,
  type Testimonial,
} from "@/constants/testimonials";

/**
 * Vertical testimonial marquee — verbatim from the reference testimonials section
 * (structure.json; transition-spec testimonial-marquee):
 * container `relative max-h-[750px] overflow-hidden` > `gap-0 md:columns-2 xl:columns-3`
 * with 5 columns (durations 40s/60s/30s/70s/40s via the `--duration` custom property
 * consumed by --animate-marquee-vertical in index.css), each repeating its card set 4x
 * for the seamless translateY(0 -> -50%) loop. `group-hover:[animation-play-state:paused]`
 * pauses on hover (rule exists in the reference CSS); top/bottom fade masks sit above.
 */

const CARD_SHADOW =
  "shadow-[0px_0px_0px_1px_rgba(0,0,0,0.04),0px_8px_12px_-4px_rgba(15,12,12,0.08),0px_1px_2px_0px_rgba(15,12,12,0.10)] dark:shadow-[0px_0px_0px_1px_rgba(250,250,250,0.1),0px_0px_0px_1px_#18181B,0px_8px_12px_-4px_rgba(15,12,12,0.3),0px_1px_2px_0px_rgba(15,12,12,0.3)]";

export function TestimonialCard({ testimonial }: { testimonial: Testimonial }) {
  return (
    <div
      className={cn(
        "flex w-full cursor-pointer break-inside-avoid flex-col items-center justify-between gap-6 rounded-xl p-4 bg-accent",
        CARD_SHADOW,
      )}
    >
      <div className="select-none leading-relaxed font-normal text-primary/90">
        <p>
          {testimonial.quote}
          <span className="p-1 py-0.5 font-medium dark:font-semibold text-secondary">
            {testimonial.highlight}
          </span>{" "}
          {testimonial.after}
        </p>
      </div>
      <div className="flex w-full select-none items-center justify-start gap-3.5">
        <img
          src={testimonial.img}
          alt={testimonial.name}
          className="size-8 rounded-full"
          loading="lazy"
        />
        <div>
          <p className="font-medium text-primary/90">{testimonial.name}</p>
          <p className="text-xs font-normal text-primary/50">{testimonial.role}</p>
        </div>
      </div>
    </div>
  );
}

export interface TestimonialMarqueeProps {
  /** One array per marquee column; defaults to the reference's 5 columns. */
  columns?: Testimonial[][];
  /** Per-column animation durations; reference: 40s/60s/30s/70s/40s. */
  durations?: string[];
  /** Copies of the card set per column for the seamless loop; reference repeats 4x. */
  repeat?: number;
  className?: string;
}

export function TestimonialMarquee({
  columns = testimonialColumns,
  durations = testimonialDurations,
  repeat = 4,
  className,
}: TestimonialMarqueeProps) {
  return (
    <div className={cn("relative max-h-[750px] overflow-hidden", className)}>
      <div className="gap-0 md:columns-2 xl:columns-3">
        {columns.map((column, columnIndex) => (
          <div
            key={columnIndex}
            className="group flex overflow-hidden p-2 [--gap:1rem] [gap:var(--gap)] flex-col"
            style={
              {
                "--duration": durations[columnIndex % durations.length],
              } as CSSProperties
            }
          >
            {Array.from({ length: repeat }).map((_, copyIndex) => (
              <div
                key={copyIndex}
                aria-hidden={copyIndex > 0}
                className="flex shrink-0 justify-around [gap:var(--gap)] animate-marquee-vertical flex-col group-hover:[animation-play-state:paused]"
              >
                {column.map((testimonial) => (
                  <TestimonialCard
                    key={`${testimonial.id}-${copyIndex}`}
                    testimonial={testimonial}
                  />
                ))}
              </div>
            ))}
          </div>
        ))}
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/6 md:h-1/5 w-full bg-gradient-to-t from-background from-20%" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-1/6 md:h-1/5 w-full bg-gradient-to-b from-background from-20%" />
    </div>
  );
}

export default TestimonialMarquee;
