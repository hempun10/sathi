import Section0 from "@/components/sections/Section0";
import Hero from "@/components/sections/Hero";
import Company from "@/components/sections/Company";
import Bento from "@/components/sections/Bento";
import Quote from "@/components/sections/Quote";
import Growth from "@/components/sections/Growth";
import Faq from "@/components/sections/Faq";
import Cta from "@/components/sections/Cta";
import Footer from "@/components/sections/Footer";

export default function SkyAgent() {
  return (
    <div className="relative min-h-screen w-full overflow-x-clip bg-background">
      <Section0 />
      <main className="flex w-full flex-col items-center">
        <Hero />
        <Company />
        <Bento />
        <Quote />
        <Growth />
        <Faq />
        <Cta />
      </main>
      <Footer />
    </div>
  );
}
