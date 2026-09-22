import { LogoMarquee } from "@/lib/ds-components/LogoMarquee";

/**
 * Company — "Trusted by fast-growing startups" logo strip (section-map: company).
 * Section shell verbatim from the reference DOM
 * (`section.flex.flex-col.items-center.justify-center.gap-10.py-10.pt-20.w-full.relative.px-6`);
 * the strip itself is the LogoMarquee ds-component with its default 8-logo set
 * (reference renders a static grid with crosshair hairlines + hover "Learn More",
 * not a scrolling marquee — structure.json company section).
 */
export default function Company() {
  return (
    <section
      id="company"
      className="flex flex-col items-center justify-center gap-10 py-10 pt-20 w-full relative px-6"
    >
      <LogoMarquee label="The stack behind Sathi" />
    </section>
  );
}
