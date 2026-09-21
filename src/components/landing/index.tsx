import {
  IslandNav,
  Hero,
  StackStrip,
  Benefits,
  TaglineReveal,
  HowItWorks,
  Trust,
  Faq,
  FinalCta,
} from "@/components/landing/sections";

export function Landing({ onNavigate }: { onNavigate: (to: string) => void }) {
  return (
    <div className="min-h-screen bg-white font-sans text-neutral-900 antialiased">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:rounded-lg focus:bg-neutral-900 focus:px-4 focus:py-2 focus:text-sm focus:text-white"
      >
        Skip to content
      </a>
      <IslandNav onNavigate={onNavigate} />
      <main id="main">
        <Hero />
        <StackStrip />
        <Benefits />
        <TaglineReveal />
        <HowItWorks />
        <Trust />
        <Faq />
        <FinalCta onNavigate={onNavigate} />
      </main>
    </div>
  );
}
