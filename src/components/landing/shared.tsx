import { motion } from "motion/react";
import { ArrowRight } from "@phosphor-icons/react";

import { cn } from "@/lib/utils";
import { ShimmerButton } from "@/components/ui/shimmer-button";

export const EASE = "ease-[cubic-bezier(0.32,0.72,0,1)]";

export function Reveal({
  children,
  className,
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 64, filter: "blur(12px)" }}
      whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      viewport={{ once: true, margin: "-50px" }}
      transition={{ duration: 0.8, delay, ease: [0.32, 0.72, 0, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export function SectionHeader({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <Reveal className="mx-auto max-w-[680px] text-center">
      <p className="text-sm font-semibold tracking-widest text-neutral-500 uppercase">
        {eyebrow}
      </p>
      <h2 className="mt-2 text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
        {title}
      </h2>
      <p className="mt-4 text-base text-pretty text-neutral-500">
        {description}
      </p>
    </Reveal>
  );
}

/** iMessage style chat mockup used in the hero and the bento grid. */
export function ChatMockup({ compact = false }: { compact?: boolean }) {
  return (
    <div className={cn("flex flex-col gap-2 text-sm", compact ? "p-3" : "p-6")}>
      <div className="max-w-[80%] self-end rounded-2xl rounded-br-sm bg-blue-500 px-3 py-2 text-white">
        Watch this for me: shop.example.com/products/trail-runner, size 10,
        black
      </div>
      <div className="max-w-[80%] self-start rounded-2xl rounded-bl-sm bg-neutral-200 px-3 py-2 text-neutral-800">
        Watching. I will only act on a real price change.
      </div>
      <div className="max-w-[80%] self-start rounded-2xl rounded-bl-sm bg-neutral-200 px-3 py-2 text-neutral-800">
        Price dropped. Delivered total: <strong>$86.40</strong>. Reply{" "}
        <strong className="font-mono">APPROVE 4812</strong> within 15 minutes
        to buy exactly this order.
      </div>
      <div className="max-w-[80%] self-end rounded-2xl rounded-br-sm bg-blue-500 px-3 py-2 text-white font-mono">
        APPROVE 4812
      </div>
      <div className="max-w-[80%] self-start rounded-2xl rounded-bl-sm bg-neutral-200 px-3 py-2 text-neutral-800">
        Order confirmed. Receipt: $86.40 on your card ending 4242. Tracking
        follows here.
      </div>
    </div>
  );
}

export function PrimaryCta({
  messageUrl,
  loading,
}: {
  messageUrl: string | null | undefined;
  loading: boolean;
}) {
  if (loading || !messageUrl) {
    return (
      <ShimmerButton
        disabled
        className="cursor-not-allowed px-3 py-2 text-base font-semibold opacity-60"
      >
        {loading ? "Checking message access…" : "Message access coming soon"}
      </ShimmerButton>
    );
  }
  return (
    <a href={messageUrl} className="inline-block">
      <ShimmerButton className="px-3 py-2 text-base font-semibold transition-transform duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] hover:scale-[1.03] active:scale-[0.98]">
        Open Messages to start
        <ArrowRight className="ml-2 inline size-4" weight="bold" />
      </ShimmerButton>
    </a>
  );
}
