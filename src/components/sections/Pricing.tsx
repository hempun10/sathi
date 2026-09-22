import { useState } from "react";
import { motion } from "framer-motion";
import { PricingCard } from "@/lib/ds-components/PricingCard";
import {
  pricingDescription,
  pricingTitle,
  pricingTiers,
} from "@/constants/pricing";
import { cn } from "@/lib/utils";

/**
 * Pricing section — verbatim from the reference (structure.json section#pricing
 * and bundles/page PricingSection module):
 * section.flex.flex-col.items-center.justify-center.gap-10.pb-10.w-full.relative
 * > header (border-b w-full h-full p-10 md:p-14 > max-w-xl …)
 * > div.relative.w-full.h-full with the monthly/yearly pill toggle absolutely
 *   positioned at -top-14 and the 3-tier grid
 *   (min-[650px]:grid-cols-2 min-[900px]:grid-cols-3).
 * Toggle swaps each card's price/period (monthly price <-> yearlyPrice) exactly
 * like the source; the sliding active pill is framer-motion layoutId "active-tab"
 * (spring 300/25, velocity 2, 0.2s).
 */

const BILLING_PERIODS = ["monthly", "yearly"] as const;
type BillingPeriod = (typeof BILLING_PERIODS)[number];

interface BillingToggleProps {
  activeTab: BillingPeriod;
  setActiveTab: (tab: BillingPeriod) => void;
  className?: string;
}

function BillingToggle({ activeTab, setActiveTab, className }: BillingToggleProps) {
  return (
    <div
      className={cn(
        "relative flex w-fit items-center rounded-full border p-0.5 backdrop-blur-sm cursor-pointer h-9 flex-row bg-muted",
        className,
      )}
    >
      {BILLING_PERIODS.map((period) => (
        <button
          key={period}
          type="button"
          onClick={() => setActiveTab(period)}
          className={cn(
            "relative z-[1] px-2 h-8 flex items-center justify-center cursor-pointer",
            activeTab === period && "z-0",
          )}
        >
          {activeTab === period && (
            <motion.div
              layoutId="active-tab"
              className="absolute inset-0 rounded-full bg-white dark:bg-[#3F3F46] shadow-md border border-border"
              transition={{ duration: 0.2, type: "spring", stiffness: 300, damping: 25, velocity: 2 }}
            />
          )}
          <span
            className={cn(
              "relative block text-sm font-medium duration-200 shrink-0",
              activeTab === period ? "text-primary" : "text-muted-foreground",
            )}
          >
            {period.charAt(0).toUpperCase() + period.slice(1)}
            {period === "yearly" && (
              <span className="ml-2 text-xs font-semibold text-secondary bg-secondary/15 py-0.5 w-[calc(100%+1rem)] px-1 rounded-full">
                -20%
              </span>
            )}
          </span>
        </button>
      ))}
    </div>
  );
}

export function Pricing() {
  const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>("monthly");
  const isYearly = billingPeriod === "yearly";

  return (
    <section
      id="pricing"
      className="flex flex-col items-center justify-center gap-10 pb-10 w-full relative"
    >
      <div className="border-b w-full h-full p-10 md:p-14">
        <div className="max-w-xl mx-auto flex flex-col items-center justify-center gap-2">
          <h2 className="text-3xl md:text-4xl font-medium tracking-tighter text-center text-balance">
            {pricingTitle}
          </h2>
          <p className="text-muted-foreground text-center text-balance font-medium">
            {pricingDescription}
          </p>
        </div>
      </div>
      <div className="relative w-full h-full">
        <div className="absolute -top-14 left-1/2 -translate-x-1/2">
          <BillingToggle
            activeTab={billingPeriod}
            setActiveTab={setBillingPeriod}
            className="mx-auto"
          />
        </div>
        <div className="grid min-[650px]:grid-cols-2 min-[900px]:grid-cols-3 gap-4 w-full max-w-6xl mx-auto px-6">
          {pricingTiers.map((tier) => (
            <PricingCard
              key={tier.name}
              name={tier.name}
              price={isYearly ? tier.yearlyPrice : tier.price}
              period={isYearly ? "year" : "month"}
              description={tier.description}
              buttonText={tier.buttonText}
              buttonColor={tier.buttonColor}
              features={tier.features}
              popular={tier.isPopular}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

export default Pricing;
