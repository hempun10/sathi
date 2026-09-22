import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

/**
 * Bento grid card — verbatim frame from the reference BentoSection/GrowthSection:
 * `flex flex-col items-start justify-end min-h-[600px] md:min-h-[500px] p-0.5 relative
 *  before:absolute before:-left-0.5 before:top-0 before:z-10 before:h-screen before:w-px
 *  before:bg-border before:content-[''] after:absolute after:-top-0.5 after:left-0 after:z-10
 *  after:h-px after:w-screen after:bg-border after:content-[''] group cursor-pointer
 *  max-h-[400px]`
 * (the before:/after: pseudos draw the crosshair grid hairlines between cards).
 * The card is a motion context (initial/whileInView/whileHover) so a CardOverlay inside
 * the content inherits the scale 0.85 -> 1 transition (transition-spec card-overlay-scale-*).
 */

export interface BentoCardProps {
  title: string;
  description: string;
  /** Visual content area (chat mock, globe, stat, automation rows...). */
  children?: ReactNode;
  className?: string;
  /** Overrides for the content area wrapper (e.g. fixed height, mask). */
  contentClassName?: string;
}

export function BentoCard({
  title,
  description,
  children,
  className,
  contentClassName,
}: BentoCardProps) {
  return (
    <motion.div
      initial="initial"
      whileInView="visible"
      whileHover="hover"
      viewport={{ once: true }}
      className={cn(
        "flex flex-col items-start justify-end min-h-[600px] md:min-h-[500px] p-0.5 relative",
        "before:absolute before:-left-0.5 before:top-0 before:z-10 before:h-screen before:w-px before:bg-border before:content-['']",
        "after:absolute after:-top-0.5 after:left-0 after:z-10 after:h-px after:w-screen after:bg-border after:content-['']",
        "group cursor-pointer max-h-[400px]",
        className,
      )}
    >
      <div
        className={cn(
          "relative flex size-full items-center justify-center h-full overflow-hidden",
          contentClassName,
        )}
      >
        {children}
      </div>
      <div className="flex-1 flex-col gap-2 p-6">
        <h3 className="text-lg tracking-tighter font-semibold">{title}</h3>
        <p className="text-muted-foreground">{description}</p>
      </div>
    </motion.div>
  );
}

export default BentoCard;
