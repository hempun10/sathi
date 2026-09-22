import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/lib/ds-components/Accordion";
import { faqDescription, faqItems, faqTitle } from "@/constants/faq";

/**
 * FAQ — section#faq verbatim from structure.json
 * (`flex flex-col items-center justify-center gap-10 pb-10 w-full relative`).
 * Header uses the reference SectionHeader wrapper (bundle module 9937:
 * `border-b w-full h-full p-10 md:p-14` > `max-w-xl mx-auto ... gap-2`).
 * All 6 items render closed initially (structure.json: every accordion-item
 * data-state="closed") — radix `type="single" collapsible`, no defaultValue.
 * Item/trigger classNames verified: cn() merge output matches the captured
 * class strings byte-for-byte (`last:border-b-0 border-0 grid gap-2`, trigger
 * with `border bg-accent ... data-[state=open]:ring-primary/20`).
 * Slide down/up 0.3s easeOut via --animate-accordion-down/up (transition-spec
 * faq-accordion), provided by the Accordion ds-component.
 */
export default function Faq() {
  return (
    <section
      id="faq"
      className="flex flex-col items-center justify-center gap-10 pb-10 w-full relative"
    >
      <div className="border-b w-full h-full p-10 md:p-14">
        <div className="max-w-xl mx-auto flex flex-col items-center justify-center gap-2">
          <h2 className="text-3xl md:text-4xl font-medium tracking-tighter text-center text-balance">
            {faqTitle}
          </h2>
          <p className="text-muted-foreground text-center text-balance font-medium">
            {faqDescription}
          </p>
        </div>
      </div>
      <div className="max-w-3xl w-full mx-auto px-10">
        <Accordion type="single" collapsible className="w-full border-b-0 grid gap-2">
          {faqItems.map((item) => (
            <AccordionItem
              key={item.id}
              value={String(item.id)}
              className="border-0 grid gap-2"
            >
              <AccordionTrigger className="border bg-accent border-border rounded-lg px-4 py-3.5 cursor-pointer no-underline hover:no-underline data-[state=open]:ring data-[state=open]:ring-primary/20">
                {item.question}
              </AccordionTrigger>
              <AccordionContent>{item.answer}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}
