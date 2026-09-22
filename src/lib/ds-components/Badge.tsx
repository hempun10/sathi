import type { HTMLAttributes, ReactNode } from "react";
import { Layers3 } from "lucide-react";
import { cn } from "@/lib/utils";

export function BadgeIcon({ className }: { className?: string }) {
  return <Layers3 aria-hidden="true" className={cn("size-4", className)} />;
}

export interface BadgeProps extends HTMLAttributes<HTMLParagraphElement> {
  /** Leading icon; defaults to the reference's 16x16 layers icon. Pass null to omit. */
  icon?: ReactNode;
}

export function Badge({ icon, className, children, ...props }: BadgeProps) {
  return (
    <p
      className={cn(
        "border border-border bg-accent rounded-full text-sm h-8 px-3 flex items-center gap-2",
        className,
      )}
      {...props}
    >
      {icon === undefined ? <BadgeIcon /> : icon}
      {children}
    </p>
  );
}

export default Badge;
