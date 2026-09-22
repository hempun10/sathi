import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

/**
 * Fade-up reveal — transition-spec page-load-hero-stagger / intersection pattern:
 * initial { opacity: 0, y: 20 } -> visible { opacity: 1, y: 0 }, 0.6s easeOut, once.
 */
export interface RevealProps {
  children: ReactNode;
  className?: string;
  /** Stagger offset when composing multiple Reveals (hero stagger step is 0.1s). */
  delay?: number;
}

export function Reveal({ children, className, delay = 0 }: RevealProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.6, ease: "easeOut", delay }}
      className={cn(className)}
    >
      {children}
    </motion.div>
  );
}

export default Reveal;
