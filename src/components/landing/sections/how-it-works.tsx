import { cn } from "@/lib/utils";
import { EASE, Reveal, SectionHeader } from "@/components/landing/shared";

export function HowItWorks() {
  const steps = [
    {
      title: "Text the product",
      description:
        "Send the link and the exact variant you want: size, color, quantity. Your message sets everything in motion.",
    },
    {
      title: "Approve the exact quote",
      description:
        "When a change matters, you get one delivered total and a single use approval code that expires in 15 minutes.",
    },
    {
      title: "Get the receipt",
      description:
        "The agent buys only that approved order, then texts back the receipt with the total, card, and tracking.",
    },
  ];
  return (
    <section id="how-it-works" className="scroll-mt-24 bg-neutral-50 py-24">
      <div className="mx-auto max-w-6xl px-4">
        <SectionHeader
          eyebrow="How it works"
          title="A text message to a verified purchase in three steps"
          description="No app to install, no account to create. The conversation you already have is the interface."
        />
        <div className="mt-16 grid gap-6 sm:grid-cols-3">
          {steps.map((step, i) => (
            <Reveal key={step.title} delay={0.1 + i * 0.1}>
              <div
                className={cn(
                  "h-full rounded-2xl border border-neutral-200 bg-white p-6 transition-shadow duration-700",
                  EASE,
                  "hover:shadow-lg",
                )}
              >
                <span className="flex size-10 items-center justify-center rounded-full bg-neutral-900 font-mono text-sm font-medium text-white">
                  {i + 1}
                </span>
                <h3 className="mt-4 text-lg font-semibold">{step.title}</h3>
                <p className="mt-2 text-sm text-pretty text-neutral-500">
                  {step.description}
                </p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
