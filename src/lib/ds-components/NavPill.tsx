import { useEffect, useRef, useState } from "react";
import type { MouseEvent } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

/**
 * Header nav pill — ported from the reference Navbar component (layout chunk):
 * - ul: `relative mx-auto flex w-fit rounded-full h-11 px-2 items-center justify-center`
 * - items: li `z-10 cursor-pointer h-full flex items-center justify-center px-4 py-2
 *   text-sm font-medium transition-colors duration-200` + active `text-primary` /
 *   inactive `text-primary/60 hover:text-primary`, all `tracking-tight`
 * - sliding indicator: motion.li `absolute inset-0 my-1.5 rounded-full bg-accent/60
 *   border border-border`, animated to the active item's left/width with
 *   spring stiffness 400 damping 30 (animation-runtime-dump n1 / transition-spec scroll-spy-nav-pill).
 * Scroll-spy: active item = section whose top is nearest to viewport y=100; click
 * smooth-scrolls to the section top - 100 and locks the spy for 500ms.
 */

export interface NavPillItem {
  name: string;
  href: string;
}

export interface NavPillProps {
  items: NavPillItem[];
  className?: string;
}

export function NavPill({ items, className }: NavPillProps) {
  const listRef = useRef<HTMLUListElement>(null);
  const [left, setLeft] = useState(0);
  const [width, setWidth] = useState(0);
  const [ready, setReady] = useState(false);
  const [active, setActive] = useState<string>(() => items[0]?.href.substring(1) ?? "");
  const [locked, setLocked] = useState(false);

  const measure = (id: string) => {
    const anchor = listRef.current?.querySelector<HTMLAnchorElement>(
      `[href="#${id}"]`,
    );
    const li = anchor?.parentElement;
    if (li) {
      setLeft(li.offsetLeft);
      setWidth(li.getBoundingClientRect().width);
      return true;
    }
    return false;
  };

  // Initial pill position on the first item.
  useEffect(() => {
    const first = items[0]?.href.substring(1);
    if (first && measure(first)) setReady(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Scroll-spy: nearest section top to y=100 wins.
  useEffect(() => {
    const onScroll = () => {
      if (locked) return;
      const ids = items.map((item) => item.href.substring(1));
      let current = ids[0];
      let best = Infinity;
      for (const id of ids) {
        const el = document.getElementById(id);
        if (el) {
          const dist = Math.abs(el.getBoundingClientRect().top - 100);
          if (dist < best) {
            best = dist;
            current = id;
          }
        }
      }
      setActive(current);
      measure(current);
    };
    window.addEventListener("scroll", onScroll);
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locked]);

  const handleClick = (e: MouseEvent<HTMLAnchorElement>, item: NavPillItem) => {
    e.preventDefault();
    const id = item.href.substring(1);
    const target = document.getElementById(id);
    if (!target) return;
    setLocked(true);
    setActive(id);
    const li = e.currentTarget.parentElement;
    if (li) {
      setLeft(li.offsetLeft);
      setWidth(li.getBoundingClientRect().width);
    }
    const top = target.getBoundingClientRect().top + window.pageYOffset - 100;
    window.scrollTo({ top, behavior: "smooth" });
    setTimeout(() => setLocked(false), 500);
  };

  return (
    <div className={cn("w-full hidden md:block", className)}>
      <ul
        ref={listRef}
        className="relative mx-auto flex w-fit rounded-full h-11 px-2 items-center justify-center"
      >
        {items.map((item) => {
          const id = item.href.substring(1);
          return (
            <li
              key={item.name}
              className={cn(
                "z-10 cursor-pointer h-full flex items-center justify-center px-4 py-2 text-sm font-medium transition-colors duration-200 tracking-tight",
                active === id ? "text-primary" : "text-primary/60 hover:text-primary",
              )}
            >
              <a href={item.href} onClick={(e) => handleClick(e, item)}>
                {item.name}
              </a>
            </li>
          );
        })}
        {ready && (
          <motion.li
            animate={{ left, width }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
            className="absolute inset-0 my-1.5 rounded-full bg-accent/60 border border-border"
          />
        )}
      </ul>
    </div>
  );
}

export default NavPill;
