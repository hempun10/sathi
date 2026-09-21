import { useState } from "react";
import { ChatCircle } from "@phosphor-icons/react";

import { cn } from "@/lib/utils";
import { EASE } from "@/components/landing/shared";

const NAV_LINKS = [
  { label: "Features", href: "#features" },
  { label: "How it works", href: "#how-it-works" },
  { label: "Trust", href: "#trust" },
  { label: "FAQ", href: "#faq" },
];

export function IslandNav({ onNavigate }: { onNavigate: (to: string) => void }) {
  const [open, setOpen] = useState(false);
  const delays = ["delay-100", "delay-150", "delay-200", "delay-300"];

  return (
    <>
      <header className="fixed inset-x-0 top-6 z-50 mx-auto w-max px-4">
        <nav
          aria-label="Main"
          className="flex items-center gap-6 rounded-full border border-neutral-200 bg-white/70 px-4 py-2 shadow-sm backdrop-blur-xl"
        >
          <a
            href="/"
            aria-current="page"
            className="flex items-center gap-2 text-sm font-semibold"
          >
            <span className="flex size-6 items-center justify-center rounded-lg bg-neutral-900 text-white">
              <ChatCircle className="size-4" weight="fill" />
            </span>
            Approved Buy
          </a>
          <div className="hidden items-center gap-6 text-sm font-medium text-neutral-600 md:flex">
            {NAV_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className={cn(
                  "transition-colors duration-700",
                  EASE,
                  "hover:text-neutral-900",
                )}
              >
                {link.label}
              </a>
            ))}
          </div>
          <button
            type="button"
            onClick={() => onNavigate("/dashboard")}
            className={cn(
              "hidden text-sm font-semibold text-neutral-900 transition-colors duration-700 md:block",
              EASE,
              "hover:text-neutral-500",
            )}
          >
            Dashboard
          </button>
          <button
            type="button"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            className="relative flex size-8 items-center justify-center md:hidden"
          >
            <span
              className={cn(
                "absolute h-0.5 w-4 rounded-full bg-neutral-900 transition-all duration-700",
                EASE,
                open ? "rotate-45" : "-translate-y-1",
              )}
            />
            <span
              className={cn(
                "absolute h-0.5 w-4 rounded-full bg-neutral-900 transition-all duration-700",
                EASE,
                open ? "-rotate-45" : "translate-y-1",
              )}
            />
          </button>
        </nav>
      </header>

      <div
        aria-hidden={!open}
        className={cn(
          "fixed inset-0 z-40 bg-white/80 backdrop-blur-3xl transition-opacity duration-700",
          EASE,
          open ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      >
        <div className="flex h-full flex-col items-center justify-center gap-8">
          {NAV_LINKS.map((link, i) => (
            <a
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              tabIndex={open ? 0 : -1}
              className={cn(
                "text-3xl font-semibold text-neutral-900 transition-all duration-700",
                EASE,
                delays[i],
                open ? "translate-y-0 opacity-100" : "translate-y-12 opacity-0",
              )}
            >
              {link.label}
            </a>
          ))}
          <button
            type="button"
            tabIndex={open ? 0 : -1}
            onClick={() => {
              setOpen(false);
              onNavigate("/dashboard");
            }}
            className={cn(
              "text-3xl font-semibold text-neutral-400 transition-all duration-700",
              EASE,
              "delay-500",
              open ? "translate-y-0 opacity-100" : "translate-y-12 opacity-0",
            )}
          >
            Dashboard
          </button>
        </div>
      </div>
    </>
  );
}
