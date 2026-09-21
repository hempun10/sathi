import {
  CalendarCheck,
  Chats,
  Fingerprint,
  Receipt,
  Target,
  SealCheck,
} from "@phosphor-icons/react";

import { BentoCard, BentoGrid } from "@/components/ui/bento-grid";
import { NumberTicker } from "@/components/ui/number-ticker";
import { ChatMockup, Reveal, SectionHeader } from "@/components/landing/shared";

export function Benefits() {
  return (
    <section id="features" className="mx-auto max-w-6xl scroll-mt-24 px-4 py-24">
      <SectionHeader
        eyebrow="Benefits"
        title="An agent that spends nothing on its own"
        description="Live iMessage conversations, exact quotes, and receipts you can verify. Every step is gated by proofs, not promises."
      />
      <Reveal delay={0.15}>
        <BentoGrid className="mt-12 lg:grid-rows-2">
          <BentoCard
            name="Everything in one thread"
            description="Questions, quotes, approvals, and receipts all live in the same iMessage conversation."
            Icon={Chats}
            href="#how-it-works"
            cta="See the flow"
            className="lg:col-span-2"
            background={
              <div className="absolute inset-x-4 top-4 h-56 overflow-hidden rounded-xl border border-neutral-100 bg-white [mask-image:linear-gradient(to_bottom,black_55%,transparent)]">
                <ChatMockup compact />
              </div>
            }
          />
          <BentoCard
            name="One quote, one order"
            description="You approve one exact delivered total. That approval can only ever buy that order."
            Icon={SealCheck}
            href="#trust"
            cta="Why approval comes first"
            className="lg:col-span-1"
            background={
              <div className="absolute inset-x-4 top-6 flex h-56 flex-col items-center justify-start [mask-image:linear-gradient(to_bottom,black_60%,transparent)]">
                <span className="font-mono text-6xl font-semibold tracking-tight text-neutral-800">
                  <NumberTicker value={1} />
                </span>
                <span className="mt-1 text-sm text-neutral-400">
                  order per approved quote
                </span>
              </div>
            }
          />
          <BentoCard
            name="Receipts you can verify"
            description="The moment an order lands, the receipt lands in your iMessage with total, card, and tracking."
            Icon={Receipt}
            href="#faq"
            cta="Read the FAQ"
            className="lg:col-span-1"
            background={
              <div className="absolute inset-x-4 top-6 flex h-56 items-end justify-center gap-2 [mask-image:linear-gradient(to_bottom,black_60%,transparent)]">
                {[40, 65, 30, 80, 55, 95, 70].map((h, i) => (
                  <div
                    key={i}
                    className="w-6 rounded-t-md bg-neutral-200"
                    style={{ height: `${h}%` }}
                  />
                ))}
              </div>
            }
          />
          <BentoCard
            name="Never miss a real drop"
            description="Monitors watch around the clock and only ping you when a change actually matters."
            Icon={Target}
            href="#how-it-works"
            cta="How watches work"
            className="lg:col-span-1"
            background={
              <div className="absolute inset-x-4 top-6 flex h-56 flex-col items-center justify-start gap-2 [mask-image:linear-gradient(to_bottom,black_60%,transparent)]">
                {["Price change detected", "Diff verified", "Quote composed"].map(
                  (step) => (
                    <div
                      key={step}
                      className="flex w-full items-center gap-2 rounded-lg border border-neutral-100 bg-white px-3 py-2 text-xs text-neutral-600 shadow-sm"
                    >
                      <CalendarCheck className="size-4 text-neutral-400" />
                      {step}
                    </div>
                  ),
                )}
              </div>
            }
          />
          <BentoCard
            name="Your number stays private"
            description="Sender identity is stored only as an HMAC. Dashboard links work once and expire in 15 minutes."
            Icon={Fingerprint}
            href="#trust"
            cta="How privacy works"
            className="lg:col-span-1"
            background={
              <div className="absolute inset-x-4 top-6 flex h-56 flex-col items-center justify-start [mask-image:linear-gradient(to_bottom,black_60%,transparent)]">
                <span className="font-mono text-2xl font-medium text-neutral-300">
                  9f2b…c41a
                </span>
                <span className="mt-2 text-sm text-neutral-400">
                  all we ever store
                </span>
              </div>
            }
          />
        </BentoGrid>
      </Reveal>
    </section>
  );
}
