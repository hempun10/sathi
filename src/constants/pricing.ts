/**
 * Pricing tiers — verbatim from the reference site config (bundles/1874 `pricing.pricingItems`).
 * Includes the source's "Built-in components librarys" typo on Enterprise (text-fidelity gate).
 */

export interface PricingTier {
  name: string;
  href: string;
  price: string;
  period: string;
  yearlyPrice: string;
  features: string[];
  description: string;
  buttonText: string;
  /** Verbatim button classes from the source config. */
  buttonColor: string;
  isPopular: boolean;
}

export const pricingTitle = "Pricing that scales with you";
export const pricingDescription =
  "Whichever plan you pick, it's free until you love your docs. That's our promise.";

export const pricingTiers: PricingTier[] = [
  {
    name: "Free",
    href: "#",
    price: "$0",
    period: "month",
    yearlyPrice: "$0",
    features: [
      "Custom domain",
      "SEO-optimizations",
      "Auto-generated API docs",
      "Built-in components library",
    ],
    description: "Perfect for individual users",
    buttonText: "Start Free",
    buttonColor: "bg-accent text-primary",
    isPopular: false,
  },
  {
    name: "Startup",
    href: "#",
    price: "$12",
    period: "month",
    yearlyPrice: "$120",
    features: [
      "Custom domain",
      "SEO-optimizations",
      "Auto-generated API docs",
      "Built-in components library",
      "E-commerce integration",
      "User authentication system",
      "Multi-language support",
      "Real-time collaboration tools",
    ],
    description: "Ideal for professionals and small teams",
    buttonText: "Upgrade to Pro",
    buttonColor: "bg-secondary text-white",
    isPopular: true,
  },
  {
    name: "Enterprise",
    href: "#",
    price: "$24",
    period: "month",
    yearlyPrice: "$240",
    features: [
      "Custom domain",
      "SEO-optimizations",
      "Auto-generated API docs",
      "Built-in components librarys",
      "Real-time collaboration tools",
    ],
    description: "Best for large teams and enterprise-level organizations",
    buttonText: "Contact Sales",
    buttonColor: "bg-primary text-primary-foreground",
    isPopular: false,
  },
];
