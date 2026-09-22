import { TestimonialMarquee } from "@/lib/ds-components/TestimonialMarquee";
import {
  testimonialColumns,
  testimonialDurations,
} from "@/constants/testimonials";

/**
 * Testimonials section — verbatim from the reference (structure.json
 * section#testimonials):
 * section.flex.flex-col.items-center.justify-center.w-full
 * > header (border-b w-full h-full p-10 md:p-14 > max-w-xl …; title/description
 *   reuse the reference's bentoSection copy)
 * > div.h-full > div.px-10 > the vertical 5-column marquee (40s/60s/30s/70s/40s,
 *   pause on hover, top/bottom fade masks — all inside TestimonialMarquee).
 */
export function Testimonials() {
  return (
    <section
      id="testimonials"
      className="flex flex-col items-center justify-center w-full"
    >
      <div className="border-b w-full h-full p-10 md:p-14">
        <div className="max-w-xl mx-auto flex flex-col items-center justify-center gap-2">
          <h2 className="text-3xl md:text-4xl font-medium tracking-tighter text-center text-balance">
            Empower Your Workflow with AI
          </h2>
          <p className="text-muted-foreground text-center text-balance font-medium">
            Ask your AI Agent for real-time collaboration, seamless integrations,
            and actionable insights to streamline your operations.
          </p>
        </div>
      </div>
      <div className="h-full">
        <div className="px-10">
          <TestimonialMarquee
            columns={testimonialColumns}
            durations={testimonialDurations}
          />
        </div>
      </div>
    </section>
  );
}

export default Testimonials;
