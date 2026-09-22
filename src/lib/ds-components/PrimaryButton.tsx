import type { MouseEventHandler, ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Pill CTA button — variants derived verbatim from the reference:
 * - "primary":   pricing "Contact Sales" — bg-primary text-primary-foreground (structure.json)
 * - "secondary": hero "Try for Free" / header "Try for free" — bg-secondary blue pill with
 *   inset highlight shadow + border-white/[0.12] + hover:bg-secondary/80 (structure.json, cta-hover transition)
 * - "outline":   hero "Log in" — white/dark card bg with #E5E7EB / #27272A border
 * - "white":     CTA section "Start Your 30-Day Free Trial Today" — bg-white text-black font-semibold
 * Shared base: h-10 pill, text-sm font-normal tracking-wide, transition-all ease-out active:scale-95.
 * Shadows from generation-plan tokens.shadows.button / captured card buttons.
 */

const BASE =
  "h-10 flex items-center justify-center text-sm font-normal tracking-wide rounded-full px-4 cursor-pointer transition-all ease-out active:scale-95";

/** inset highlight + drop shadow (primary/accent buttons; tokens.shadows.button) */
const SHADOW_RAISED =
  "shadow-[0px_1px_2px_0px_rgba(255,255,255,0.16)_inset,0px_3px_3px_-1.5px_rgba(16,24,40,0.24),0px_1px_1px_-0.5px_rgba(16,24,40,0.20)]";
/** softer inset highlight used by the blue secondary CTA */
const SHADOW_INSET =
  "shadow-[inset_0_1px_2px_rgba(255,255,255,0.25),0_3px_3px_-1.5px_rgba(16,24,40,0.06),0_1px_1px_rgba(16,24,40,0.08)]";

const VARIANTS = {
  primary: cn("bg-primary text-primary-foreground hover:bg-primary/90", SHADOW_RAISED),
  secondary: cn(
    "bg-secondary text-white border border-white/[0.12] hover:bg-secondary/80",
    SHADOW_INSET,
  ),
  outline:
    "bg-white dark:bg-background border border-[#E5E7EB] dark:border-[#27272A] text-primary hover:bg-white/80 dark:hover:bg-background/80",
  white: "bg-white text-black font-semibold hover:bg-white/90",
} as const;

export type PrimaryButtonVariant = keyof typeof VARIANTS;

export interface PrimaryButtonProps {
  variant?: PrimaryButtonVariant;
  /** When set, renders an anchor (the reference CTAs are <a> tags). */
  href?: string;
  className?: string;
  children: ReactNode;
  onClick?: MouseEventHandler<HTMLElement>;
  type?: "button" | "submit" | "reset";
  ariaLabel?: string;
}

export function PrimaryButton({
  variant = "primary",
  href,
  className,
  children,
  onClick,
  type = "button",
  ariaLabel,
}: PrimaryButtonProps) {
  const classes = cn(BASE, VARIANTS[variant], className);
  if (href !== undefined) {
    return (
      <a href={href} className={classes} onClick={onClick} aria-label={ariaLabel}>
        {children}
      </a>
    );
  }
  return (
    <button type={type} className={classes} onClick={onClick} aria-label={ariaLabel}>
      {children}
    </button>
  );
}

export default PrimaryButton;
