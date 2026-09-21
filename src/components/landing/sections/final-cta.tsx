import { useQuery } from "convex/react";
import { ChatCircle } from "@phosphor-icons/react";

import { api } from "../../../../convex/_generated/api";
import { cn } from "@/lib/utils";
import { DotPattern } from "@/components/ui/dot-pattern";
import { EASE, PrimaryCta, Reveal } from "@/components/landing/shared";

export function FinalCta({ onNavigate }: { onNavigate: (to: string) => void }) {
  const config = useQuery(api.health.publicConfig);
  const health = useQuery(api.health.get);

  return (
    <section className="relative overflow-hidden">
      <DotPattern
        className="absolute inset-0 [mask-image:radial-gradient(50%_60%_at_50%_50%,white,transparent)]"
        width={22}
        height={22}
        cr={1}
      />
      <div className="relative mx-auto max-w-6xl px-4 py-24 text-center">
        <Reveal>
          <h2 className="mx-auto max-w-[680px] text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
            Your next purchase starts with a text
          </h2>
          <p className="mx-auto mt-4 max-w-[680px] text-pretty text-neutral-500">
            Free during the beta · No card required · Nothing ships without
            your approval
          </p>
          <div className="mt-8 flex items-center justify-center">
            <PrimaryCta
              messageUrl={config?.messageUrl}
              loading={config === undefined}
            />
          </div>
        </Reveal>
      </div>
      <footer className="relative bg-neutral-50">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 py-8 text-sm text-neutral-400 sm:flex-row">
          <p className="flex items-center gap-2">
            <span className="flex size-6 items-center justify-center rounded-md bg-neutral-900 text-white">
              <ChatCircle className="size-4" weight="fill" />
            </span>
            Approved Buy · Convex All Gas Hackathon
          </p>
          <nav aria-label="Legal" className="flex items-center gap-6">
            <button
              type="button"
              onClick={() => onNavigate("/privacy")}
              className={cn(
                "transition-colors duration-700",
                EASE,
                "hover:text-neutral-600",
              )}
            >
              Privacy
            </button>
            <button
              type="button"
              onClick={() => onNavigate("/terms")}
              className={cn(
                "transition-colors duration-700",
                EASE,
                "hover:text-neutral-600",
              )}
            >
              Terms
            </button>
          </nav>
          <p role="status" aria-live="polite">
            {health === undefined
              ? "Connecting to Convex…"
              : health.status === "ok"
                ? "Convex connected."
                : "Convex unavailable."}
          </p>
        </div>
      </footer>
    </section>
  );
}
