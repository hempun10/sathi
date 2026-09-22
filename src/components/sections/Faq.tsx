import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/lib/ds-components/Accordion";
import { faqDescription, faqItems, faqTitle } from "@/constants/faq";

export default function Faq() {
  return (
    <section id="faq" className="w-full px-5 md:px-10">
      <div className="relative mx-5 border-x md:mx-10">
        <div className="absolute top-0 -left-4 h-full w-4 bg-[size:10px_10px] text-primary/5 [background-image:repeating-linear-gradient(315deg,currentColor_0_1px,#0000_0_50%)] md:-left-14 md:w-14" />
        <div className="absolute top-0 -right-4 h-full w-4 bg-[size:10px_10px] text-primary/5 [background-image:repeating-linear-gradient(315deg,currentColor_0_1px,#0000_0_50%)] md:-right-14 md:w-14" />
        <div className="h-full w-full border-b p-10 md:p-14">
          <div className="mx-auto flex max-w-xl flex-col items-center justify-center gap-2">
            <h2 className="text-center text-3xl font-medium tracking-tighter text-balance md:text-4xl">
              {faqTitle}
            </h2>
            <p className="text-center font-medium text-balance text-muted-foreground">
              {faqDescription}
            </p>
          </div>
        </div>
        <div className="mx-auto w-full max-w-3xl px-10 py-10">
          <Accordion
            type="single"
            collapsible
            className="grid w-full gap-2 border-b-0"
          >
            {faqItems.map((item) => (
              <AccordionItem
                key={item.id}
                value={String(item.id)}
                className="grid gap-2 border-0"
              >
                <AccordionTrigger className="cursor-pointer rounded-lg border border-border bg-accent px-4 py-3.5 no-underline hover:no-underline data-[state=open]:ring data-[state=open]:ring-primary/20">
                  {item.question}
                </AccordionTrigger>
                <AccordionContent>{item.answer}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </div>
    </section>
  );
}
