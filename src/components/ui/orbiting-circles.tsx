import { Children, type CSSProperties, type HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

interface OrbitingCirclesProps extends HTMLAttributes<HTMLDivElement> {
  reverse?: boolean;
  duration?: number;
  radius?: number;
  path?: boolean;
  iconSize?: number;
  speed?: number;
}

export function OrbitingCircles({
  className,
  children,
  reverse,
  duration = 20,
  radius = 160,
  path = true,
  iconSize = 30,
  speed = 1,
  ...props
}: OrbitingCirclesProps) {
  return (
    <>
      {path && (
        <svg
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 size-full"
        >
          <circle
            className="stroke-black/10 stroke-1 dark:stroke-white/10"
            cx="50%"
            cy="50%"
            r={radius}
            fill="none"
          />
        </svg>
      )}
      {Children.map(children, (child, index) => (
        <div
          style={
            {
              "--duration": duration / speed,
              "--radius": radius,
              "--angle": (360 / Children.count(children)) * index,
              "--icon-size": `${iconSize}px`,
            } as CSSProperties
          }
          className={cn(
            "absolute flex size-(--icon-size) transform-gpu items-center justify-center rounded-full animate-orbit motion-reduce:[animation-play-state:paused]",
            reverse && "[animation-direction:reverse]",
            className,
          )}
          {...props}
        >
          {child}
        </div>
      ))}
    </>
  );
}
