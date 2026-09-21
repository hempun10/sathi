import { Fingerprint, ShieldCheck } from "@phosphor-icons/react";

import { BorderBeam } from "@/components/ui/border-beam";
import { Reveal, SectionHeader } from "@/components/landing/shared";

export function Trust() {
  const cards = [
    {
      Icon: ShieldCheck,
      title: "Approval before anything else",
      description:
        "A scraped page, a message, or a model output can never authorize a purchase. Only your single use code can, and only inside its 15 minute window.",
      beam: true,
    },
    {
      Icon: Fingerprint,
      title: "Private by default",
      description:
        "Your number is stored only as an HMAC. Dashboard links work once, expire in 15 minutes, and are replaced whenever a new one is issued.",
      beam: false,
    },
  ];
  return (
    <section id="trust" className="mx-auto max-w-6xl scroll-mt-24 px-4 py-24">
      <SectionHeader
        eyebrow="Trust"
        title="Built for secure spending"
        description="Where an autonomous agent meets your money, the default answer is no until you say yes."
      />
      <div className="mx-auto mt-12 grid max-w-4xl gap-6 sm:grid-cols-2">
        {cards.map((card, i) => (
          <Reveal key={card.title} delay={0.1 + i * 0.1}>
            <div className="relative h-full overflow-hidden rounded-2xl border border-neutral-200 bg-white p-8">
              <card.Icon className="size-10 text-neutral-700" />
              <h3 className="mt-4 text-xl font-semibold">{card.title}</h3>
              <p className="mt-2 text-sm text-pretty text-neutral-500">
                {card.description}
              </p>
              {card.beam && <BorderBeam size={100} duration={10} />}
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
