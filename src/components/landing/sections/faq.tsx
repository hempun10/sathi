import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Reveal, SectionHeader } from "@/components/landing/shared";

export function Faq() {
  const items = [
    {
      q: "How do I get access?",
      a: "The beta is invite only. The live Photon project is on the Free tier, which supports up to 10 allowlisted users, so each message number is provisioned one at a time. You cannot start texting from an arbitrary phone.",
    },
    {
      q: "Can the agent buy something without my approval?",
      a: "No. Nothing is purchased without your exact approval. A message, a scraped page, or a model output can never authorize a purchase on its own. Only your single use code can, for that exact quote, inside its 15 minute window.",
    },
    {
      q: "What does the beta cost?",
      a: "Nothing. The beta is free for invited testers and no card is required to join. Paid tiers only appear after every provider proof passes.",
    },
    {
      q: "What can the agent do right now?",
      a: "Today it onboards you over iMessage, issues your private dashboard link, and keeps your profile. Product watching, checkout, and receipts ship only after all six provider proofs pass.",
    },
    {
      q: "What happens to my phone number?",
      a: "Your sender identity is stored only as an HMAC, never as a raw phone number. Claim tokens are stored only as SHA 256 hashes. No number, message text, or token appears in source or logs.",
    },
    {
      q: "How do I get back into my dashboard?",
      a: "Text the word settings to your iMessage agent. You get a fresh private link that works once and expires after 15 minutes. Any older link is invalidated the moment a new one is issued.",
    },
    {
      q: "What happens if I ignore a quote?",
      a: "Nothing at all. An unanswered quote expires and the agent keeps watching. You are never charged for ignoring a message.",
    },
  ];
  return (
    <section id="faq" className="mx-auto max-w-3xl scroll-mt-24 px-4 py-24">
      <SectionHeader
        eyebrow="FAQ"
        title="Frequently asked questions"
        description="Answers to common questions about Approved Buy and how the beta works."
      />
      <Reveal delay={0.15}>
        <Accordion type="single" collapsible className="mt-10 w-full">
          {items.map((item, i) => (
            <AccordionItem key={item.q} value={`item-${i}`}>
              <AccordionTrigger className="text-left text-base font-medium">
                {item.q}
              </AccordionTrigger>
              <AccordionContent className="text-pretty text-neutral-500">
                {item.a}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </Reveal>
    </section>
  );
}
