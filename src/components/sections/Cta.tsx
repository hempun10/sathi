import { PrimaryButton } from "@/lib/ds-components/PrimaryButton";

/**
 * CTA — section#cta verbatim from structure.json
 * (`flex flex-col items-center justify-center w-full`).
 * Reference copy (bundle 1874 `ctaSection`): "Automate. Simplify. Thrive" /
 * "Start Your 30-Day Free Trial Today" / "Cancel anytime, no questions asked".
 * Background treatment: full-bleed rounded-xl bg-secondary card (h-[400px],
 * shadow-xl) with the agent-cta-background image object-cover'd over it —
 * local mirror at /_next/image (download-log.json; the Next.js optimizer query
 * string is preserved verbatim from the reference src and resolves to the
 * same mirrored file).
 * Button is the reference white pill -> PrimaryButton variant="white";
 * hover deepens bg + lifts shadow over 300ms (transition-spec cta-hover).
 */
export default function Cta() {
  return (
    <section id="cta" className="flex flex-col items-center justify-center w-full">
      <div className="w-full">
        <div className="h-[400px] md:h-[400px] overflow-hidden shadow-xl w-full border border-border rounded-xl bg-secondary relative z-20">
          <img
            className="absolute inset-0 w-full h-full object-cover object-right md:object-center"
            src="/agent-cta-background.png"
            alt="Sathi CTA background"
          />
          <div className="absolute inset-0 -top-32 md:-top-40 flex flex-col items-center justify-center">
            <h1 className="text-white text-4xl md:text-7xl font-medium tracking-tighter max-w-xs md:max-w-xl text-center">
              Sathi buys while you sleep.
            </h1>
            <div className="absolute bottom-10 flex flex-col items-center justify-center gap-2">
              <PrimaryButton variant="white" href="#bento" className="w-fit shadow-md">
                See how it works
              </PrimaryButton>
              <span className="text-white text-sm">Grant Prava once. Sathi handles the rest.</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
