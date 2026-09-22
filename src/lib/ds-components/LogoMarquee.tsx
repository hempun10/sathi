import { ArrowRight } from "lucide-react";
import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";
import { logos, type LogoDef } from "@/constants/logos";

/**
 * Stack logo strip. Each cell slides the wordmark up on hover and tints it
 * (plus "Learn More") in that brand's color.
 */

function LogoArtwork({ logo }: { logo: LogoDef }) {
  if (logo.paths.length === 0) {
    return (
      <span className="flex items-center gap-2.5" aria-label={logo.name}>
        {logo.src && (
          <span
            aria-hidden
            className="size-7 shrink-0 bg-foreground transition-colors duration-300 group-hover:bg-[var(--brand)]"
            style={{
              WebkitMaskImage: `url(${logo.src})`,
              maskImage: `url(${logo.src})`,
              WebkitMaskRepeat: "no-repeat",
              maskRepeat: "no-repeat",
              WebkitMaskPosition: "center",
              maskPosition: "center",
              WebkitMaskSize: "contain",
              maskSize: "contain",
            }}
          />
        )}
        <span className="text-xl md:text-2xl font-semibold tracking-tight text-foreground transition-colors duration-300 group-hover:text-[var(--brand)]">
          {logo.name}
        </span>
      </span>
    );
  }

  return (
    <svg
      className="fill-black transition-colors duration-300 dark:fill-white group-hover:fill-[var(--brand)]"
      width={logo.width}
      height={logo.height}
      viewBox={logo.viewBox}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      role="img"
      aria-label={logo.name}
    >
      {logo.mask && (
        <mask
          id={logo.mask.id}
          width={logo.mask.width}
          height={logo.mask.height}
          x={logo.mask.x}
          y={logo.mask.y}
          maskUnits="userSpaceOnUse"
        >
          <path fill="white" d={logo.mask.d} />
        </mask>
      )}
      {logo.maskedPaths && logo.mask && (
        <g mask={`url(#${logo.mask.id})`}>
          {logo.maskedPaths.map((d) => (
            <path key={d.slice(0, 24)} d={d} />
          ))}
        </g>
      )}
      {logo.paths.map((p) => (
        <path
          key={p.d.slice(0, 24)}
          d={p.d}
          fill={p.fill}
          fillRule={p.fillRule}
          clipRule={p.clipRule}
        />
      ))}
    </svg>
  );
}

export interface LogoMarqueeProps {
  items?: LogoDef[];
  label?: string | null;
  className?: string;
}

export function LogoMarquee({
  items = logos,
  label = "The stack behind Sathi",
  className,
}: LogoMarqueeProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-10 w-full", className)}>
      {label != null && <p className="text-muted-foreground font-medium">{label}</p>}
      <div className="grid w-full max-w-7xl grid-cols-2 md:grid-cols-4 overflow-hidden border-y border-border items-center justify-center z-20">
        {items.map((logo) => (
          <a
            key={logo.id}
            href="#"
            onClick={(e) => e.preventDefault()}
            style={{ "--brand": logo.color } as CSSProperties}
            className="group w-full h-28 flex items-center justify-center relative p-4 before:absolute before:-left-1 before:top-0 before:z-10 before:h-screen before:w-px before:bg-border before:content-[''] after:absolute after:-top-1 after:left-0 after:z-10 after:h-px after:w-screen after:bg-border after:content-['']"
          >
            <div className="flex h-full w-full items-center justify-center transition-all duration-300 [cubic-bezier(0.165,0.84,0.44,1)] translate-y-0 group-hover:-translate-y-4">
              <LogoArtwork logo={logo} />
            </div>
            <div className="absolute inset-0 flex items-center justify-center opacity-0 translate-y-8 transition-all duration-300 ease-[cubic-bezier(0.165,0.84,0.44,1)] group-hover:opacity-100 group-hover:translate-y-4">
              <span className="flex items-center gap-2 text-sm font-medium text-[var(--brand)]">
                Learn More <ArrowRight className="w-4 h-4" />
              </span>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}

export default LogoMarquee;
