import Section0 from "@/components/sections/Section0";
import Hero from "@/components/sections/Hero";
import Company from "@/components/sections/Company";
import Bento from "@/components/sections/Bento";
import Faq from "@/components/sections/Faq";
import Footer from "@/components/sections/Footer";

export default function LandingPage() {
  return (
    <div className="relative min-h-screen w-full overflow-x-clip bg-background">
      <Section0 />
      <main className="flex w-full flex-col items-center">
        <Hero />
        <Company />
        <Bento />
        <Faq />
      </main>
      <Footer />
    </div>
  );
}
