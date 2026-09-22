export interface FaqItem {
  id: number;
  question: string;
  answer: string;
}

export const faqTitle = "Frequently Asked Questions";
export const faqDescription =
  "Straight answers about finding and watching products with Sathi.";

export const faqItems: FaqItem[] = [
  {
    id: 1,
    question: "What is Sathi?",
    answer:
      "Sathi is an owner-only iMessage assistant for product discovery and price alerts. Describe what you want or send a product link, then Sathi helps you start a watch.",
  },
  {
    id: 2,
    question: "How does product search work?",
    answer:
      "OpenAI decides whether your request needs clarification or is ready to search. Firecrawl then finds live product pages, and Sathi sends a private picker with up to four options.",
  },
  {
    id: 3,
    question: "Can I send a product link directly?",
    answer:
      "Yes. A public HTTPS product link skips search. Sathi scrapes the page, confirms its current price and availability, and starts a Firecrawl monitor.",
  },
  {
    id: 4,
    question: "Does Sathi buy anything?",
    answer:
      "No. Sathi only finds products, watches a selected page, and sends price or availability alerts. It cannot check out, make a payment, or authorize a purchase.",
  },
  {
    id: 5,
    question: "How do I open settings?",
    answer:
      "Text settings to your iMessage agent. You get a private one-time link that expires after 15 minutes. There is no password.",
  },
  {
    id: 6,
    question: "Is this a public product?",
    answer:
      "Not yet. Access is invite only during the Convex All Gas beta. Features can change, and there is no uptime promise.",
  },
];
