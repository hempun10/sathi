import { motion, type Variants } from "framer-motion";
import { cn } from "@/lib/utils";

/**
 * Card hover overlay — transition-spec `card-overlay-scale-*`:
 * `div.pointer-events-none.absolute.inset-0` scaling 0.85 -> 1 over 0.3s easeOut,
 * triggered by section entry (whileInView) and card hover (whileHover).
 * Variant states are propagated from the enclosing BentoCard motion context.
 */
export const cardOverlayVariants: Variants = {
  initial: { scale: 0.85 },
  visible: { scale: 1, transition: { duration: 0.3, ease: "easeOut" } },
  hover: { scale: 1, transition: { duration: 0.3, ease: "easeOut" } },
};

export interface CardOverlayProps {
  className?: string;
}

export function CardOverlay({ className }: CardOverlayProps) {
  return (
    <motion.div
      variants={cardOverlayVariants}
      className={cn("pointer-events-none absolute inset-0", className)}
    />
  );
}

export default CardOverlay;
