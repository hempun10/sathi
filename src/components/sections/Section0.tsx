import { useEffect, useState } from "react";
import {
  AnimatePresence,
  motion,
  useMotionValueEvent,
  useScroll,
  type Variants,
} from "framer-motion";
import { Menu, Moon, Sun, X } from "lucide-react";
import { useTheme } from "next-themes";
import { NavPill } from "@/lib/ds-components/NavPill";
import { PrimaryButton } from "@/lib/ds-components/PrimaryButton";
import { cn } from "@/lib/utils";

/**
 * Section0 — sticky SkyAgent header (section-map index 0).
 * Ported from the reference Navbar (layout chunk + live DOM + structure.json):
 * - header: `sticky z-50 mx-4 flex justify-center transition-all duration-300 md:mx-0`,
 *   `top-4` at rest / `top-6` once scrollY > 10 (useScroll + change listener).
 * - inner motion.div tweens width 70rem -> 800px on scroll (0.3s, ease [0.25,0.1,0.25,1]).
 * - glass restyle past the hero (transition-spec sticky-header-glass):
 *   `shadow-none px-7` -> `px-2 border border-border backdrop-blur-lg bg-background/75`.
 * - nav is the NavPill ds-component (scroll-spy sliding pill, spring 400/30).
 * - theme toggle: next-themes useTheme, Sun/Moon lucide icons (transition-spec theme-toggle).
 */

const NAV_LINKS: { name: string; href: string }[] = [
  { name: "Home", href: "#hero" },
  { name: "How it Works", href: "#bento" },
  { name: "FAQ", href: "#faq" },
];

const HEADER_WIDTH_REST = "70rem";
const HEADER_WIDTH_SCROLLED = "800px";

/** SkyAgent logo mark — SVG paths verbatim from the reference header. */
function Logo({ className }: { className?: string }) {
  return (
    <svg
      width="42"
      height="24"
      viewBox="0 0 42 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("fill-[var(--secondary)] size-7 md:size-10", className)}
    >
      <g clipPath="url(#clip0_322_9172)">
        <path
          d="M22.3546 0.96832C22.9097 0.390834 23.6636 0.0664062 24.4487 0.0664062C27.9806 0.0664062 31.3091 0.066408 34.587 0.0664146C41.1797 0.0664284 44.481 8.35854 39.8193 13.2082L29.6649 23.7718C29.1987 24.2568 28.4016 23.9133 28.4016 23.2274V13.9234L29.5751 12.7025C30.5075 11.7326 29.8472 10.0742 28.5286 10.0742H13.6016L22.3546 0.96832Z"
          fill="current"
        />
        <path
          d="M19.6469 23.0305C19.0919 23.608 18.338 23.9324 17.5529 23.9324C14.021 23.9324 10.6925 23.9324 7.41462 23.9324C0.821896 23.9324 -2.47942 15.6403 2.18232 10.7906L12.3367 0.227022C12.8029 -0.257945 13.6 0.0855283 13.6 0.771372L13.6 10.0754L12.4265 11.2963C11.4941 12.2662 12.1544 13.9246 13.473 13.9246L28.4001 13.9246L19.6469 23.0305Z"
          fill="current"
        />
      </g>
      <defs>
        <clipPath id="clip0_322_9172">
          <rect width="42" height="24" fill="white" />
        </clipPath>
      </defs>
    </svg>
  );
}

/** Light/dark toggle — reference shadcn outline-icon button + next-themes. */
function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  return (
    <button
      data-slot="button"
      type="button"
      aria-label="Toggle theme"
      onClick={() => setTheme(theme === "light" ? "dark" : "light")}
      className="inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium transition-[color,box-shadow] disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive border border-input bg-background shadow-xs hover:bg-accent hover:text-accent-foreground size-9 cursor-pointer rounded-full h-8 w-8"
    >
      <Sun className="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0 text-primary" />
      <Moon className="absolute h-[1.2rem] w-[1.2rem] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100 text-primary" />
      <span className="sr-only">Toggle theme</span>
    </button>
  );
}

const BACKDROP_VARIANTS: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
  exit: { opacity: 0 },
};

const MENU_VARIANTS: Variants = {
  hidden: { opacity: 0, y: 100 },
  visible: {
    opacity: 1,
    y: 0,
    rotate: 0,
    transition: { type: "spring", damping: 15, stiffness: 200, staggerChildren: 0.03 },
  },
  exit: { opacity: 0, y: 100, transition: { duration: 0.1 } },
};

const LIST_VARIANTS: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
};

const ITEM_VARIANTS: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
};

export default function Section0() {
  const { scrollY } = useScroll();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [active, setActive] = useState("hero");

  // Reference scroll-spy (drives the mobile drawer link state): the active
  // section is the first whose bounds contain viewport y=150.
  useEffect(() => {
    const onScroll = () => {
      for (const link of NAV_LINKS) {
        const el = document.getElementById(link.href.substring(1));
        if (el) {
          const rect = el.getBoundingClientRect();
          if (rect.top <= 150 && rect.bottom >= 150) {
            setActive(link.href.substring(1));
            break;
          }
        }
      }
    };
    window.addEventListener("scroll", onScroll);
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // sticky-header-glass: scrolled = scrollY > 10 (reference Navbar).
  useMotionValueEvent(scrollY, "change", (latest) => setScrolled(latest > 10));

  const toggleMenu = () => setMenuOpen((open) => !open);

  return (
    <header
      className={cn(
        "sticky z-50 mx-4 flex justify-center transition-all duration-300 md:mx-0",
        scrolled ? "top-6" : "top-4 mx-0",
      )}
    >
      <motion.div
        initial={{ width: HEADER_WIDTH_REST }}
        animate={{ width: scrolled ? HEADER_WIDTH_SCROLLED : HEADER_WIDTH_REST }}
        transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
      >
        <div
          className={cn(
            "mx-auto max-w-7xl rounded-2xl transition-all duration-300 xl:px-0",
            scrolled
              ? "px-2 border border-border backdrop-blur-lg bg-background/75"
              : "shadow-none px-7",
          )}
        >
          <div className="flex h-[56px] items-center justify-between p-4">
            <a href="/" className="flex items-center gap-3">
              <Logo />
              <p className="text-lg font-semibold text-primary">Sathi</p>
            </a>
            <NavPill items={NAV_LINKS} />
            <div className="flex flex-row items-center gap-1 md:gap-3 shrink-0">
              <div className="flex items-center space-x-6">
                <PrimaryButton
                  variant="secondary"
                  href="/dashboard"
                  className="h-8 hidden md:flex w-fit text-primary-foreground dark:text-secondary-foreground"
                >
                  Dashboard
                </PrimaryButton>
              </div>
              <ThemeToggle />
              <button
                type="button"
                aria-label="Toggle menu"
                className="md:hidden border border-border size-8 rounded-md cursor-pointer flex items-center justify-center"
                onClick={toggleMenu}
              >
                {menuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
              </button>
            </div>
          </div>
        </div>
      </motion.div>
      <AnimatePresence>
        {menuOpen && (
          <>
            <motion.div
              className="fixed inset-0 bg-black/50 backdrop-blur-sm"
              initial="hidden"
              animate="visible"
              exit="exit"
              variants={BACKDROP_VARIANTS}
              transition={{ duration: 0.2 }}
              onClick={() => setMenuOpen(false)}
            />
            <motion.div
              className="fixed inset-x-0 w-[95%] mx-auto bottom-3 bg-background border border-border p-4 rounded-xl shadow-lg"
              initial="hidden"
              animate="visible"
              exit="exit"
              variants={MENU_VARIANTS}
            >
              <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <a href="/" className="flex items-center gap-3">
                    <Logo />
                    <p className="text-lg font-semibold text-primary">Sathi</p>
                  </a>
                  <button
                    type="button"
                    aria-label="Close menu"
                    onClick={toggleMenu}
                    className="border border-border rounded-md p-1 cursor-pointer"
                  >
                    <X className="size-5" />
                  </button>
                </div>
                <motion.ul
                  className="flex flex-col text-sm mb-4 border border-border rounded-md"
                  variants={LIST_VARIANTS}
                >
                  {NAV_LINKS.map((link) => (
                    <motion.li
                      key={link.name}
                      className="p-2.5 border-b border-border last:border-b-0"
                      variants={ITEM_VARIANTS}
                    >
                      <a
                        href={link.href}
                        onClick={(e) => {
                          e.preventDefault();
                          document
                            .getElementById(link.href.substring(1))
                            ?.scrollIntoView({ behavior: "smooth" });
                          setMenuOpen(false);
                        }}
                        className={cn(
                          "underline-offset-4 hover:text-primary/80 transition-colors",
                          active === link.href.substring(1)
                            ? "text-primary font-medium"
                            : "text-primary/60",
                        )}
                      >
                        {link.name}
                      </a>
                    </motion.li>
                  ))}
                </motion.ul>
                <div className="flex flex-col gap-2">
                  <PrimaryButton
                    variant="secondary"
                    href="/dashboard"
                    className="h-8 w-full text-primary-foreground dark:text-secondary-foreground"
                  >
                    Dashboard
                  </PrimaryButton>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </header>
  );
}
