import { useQuery } from "convex/react";
import { ChatCircle } from "@phosphor-icons/react";

import { api } from "../../../../convex/_generated/api";
import { AnimatedShinyText } from "@/components/ui/animated-shiny-text";
import { BorderBeam } from "@/components/ui/border-beam";
import { DotPattern } from "@/components/ui/dot-pattern";
import { ChatMockup, PrimaryCta, Reveal } from "@/components/landing/shared";

export function Hero() {
  const config = useQuery(api.health.publicConfig);

  return (
    <section className="relative overflow-hidden">
      <DotPattern
        className="absolute inset-0 [mask-image:radial-gradient(60%_60%_at_50%_35%,white,transparent)]"
        width={22}
        height={22}
        cr={1}
      />
      <div className="relative mx-auto max-w-6xl px-4 pt-32 pb-16 text-center sm:pt-40">
        <Reveal>
          <div className="inline-flex items-center justify-center">
            <AnimatedShinyText className="rounded-full border border-neutral-200 bg-neutral-50 px-4 py-1 text-sm">
              Invite only beta · Convex All Gas Hackathon
            </AnimatedShinyText>
          </div>
        </Reveal>

        <Reveal delay={0.1}>
          <h1 className="mx-auto mt-6 max-w-[680px] bg-gradient-to-r from-black to-[#666666] bg-clip-text text-4xl font-semibold tracking-tight text-balance text-transparent sm:text-6xl">
            Your agent buys nothing
            <br />
            without your yes
          </h1>
        </Reveal>

        <Reveal delay={0.2}>
          <p className="mx-auto mt-6 max-w-[680px] text-lg text-pretty text-neutral-500">
            Text a product link to Approved Buy. It watches the price, sends
            you one exact quote, and checks out only after you reply with your
            approval code.
          </p>
        </Reveal>

        <Reveal delay={0.3}>
          <div className="mt-8 flex items-center justify-center">
            <PrimaryCta
              messageUrl={config?.messageUrl}
              loading={config === undefined}
            />
          </div>
        </Reveal>

        <Reveal delay={0.35}>
          <p className="mt-4 text-sm text-neutral-400">
            Free during the beta · No card required · Webhook proof already
            passed on the live deployment
          </p>
        </Reveal>

        <Reveal delay={0.45}>
          <div className="relative mx-auto mt-16 max-w-md overflow-hidden rounded-2xl border border-neutral-200 bg-white text-left shadow-xl">
            <div className="flex items-center gap-2 border-b border-neutral-100 px-4 py-3">
              <span className="flex size-8 items-center justify-center rounded-full bg-neutral-900 text-white">
                <ChatCircle className="size-4" weight="fill" />
              </span>
              <div>
                <p className="text-sm font-semibold">Approved Buy</p>
                <p className="text-xs text-neutral-400">iMessage</p>
              </div>
            </div>
            <ChatMockup compact />
            <BorderBeam size={120} duration={8} />
          </div>
        </Reveal>
      </div>
    </section>
  );
}
