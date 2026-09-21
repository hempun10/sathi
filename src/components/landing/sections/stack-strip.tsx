import { cn } from "@/lib/utils";
import { EASE } from "@/components/landing/shared";

export function StackStrip() {
  const stack = ["Convex", "Photon", "Spectrum", "Firecrawl", "Prava", "AgentMail"];
  return (
    <section className="bg-neutral-50 py-16">
      <p className="text-center text-sm font-medium tracking-widest text-neutral-400 uppercase">
        Built on infrastructure that proves itself first
      </p>
      <div className="mx-auto mt-6 flex max-w-4xl flex-wrap items-center justify-center gap-x-10 gap-y-4 px-4">
        {stack.map((name) => (
          <span
            key={name}
            className={cn(
              "text-xl font-semibold text-neutral-300 transition-colors duration-700",
              EASE,
              "hover:text-neutral-500",
            )}
          >
            {name}
          </span>
        ))}
      </div>
    </section>
  );
}
