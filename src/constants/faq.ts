export interface FaqItem {
  id: number;
  question: string;
  answer: string;
}

export const faqTitle = "Frequently Asked Questions";
export const faqDescription =
  "Straight answers about Sathi, the iMessage agent that buys while you sleep.";

export const faqItems: FaqItem[] = [
  {
    id: 1,
    question: "What is Sathi?",
    answer:
      "Sathi is your iMessage shopping agent. Text a product link, grant Prava payment control, and Sathi watches the price and buys on its own. The receipt comes back in Messages.",
  },
  {
    id: 2,
    question: "How does a buy work?",
    answer:
      "Send a URL in iMessage. Sathi watches the live product page. When the price is right, it checks out through Prava using the payment control you already granted. Then you get the order confirmation.",
  },
  {
    id: 3,
    question: "Do I approve every order?",
    answer:
      "No. You grant Prava payment control once. After that, Sathi can buy while you sleep. There is no per-order approval code.",
  },
  {
    id: 4,
    question: "What can I buy right now?",
    answer:
      "This is an invite-only hackathon beta on one controlled Shopify store, USD, quantity one, and one active watch. It is not a general shopping agent for every site.",
  },
  {
    id: 5,
    question: "How do I open settings?",
    answer:
      "Text settings to your iMessage agent. You get a private one-time link. It works once and expires after 15 minutes. There is no password.",
  },
  {
    id: 6,
    question: "Is this a public product?",
    answer:
      "Not yet. Access is invite only during the Convex All Gas beta. Features can change, and there is no uptime promise.",
  },
];
