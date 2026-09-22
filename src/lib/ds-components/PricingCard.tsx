import { cn } from "@/lib/utils";

/**
 * Pricing tier card — verbatim from the reference pricing section (structure.json):
 * - container: `rounded-xl grid grid-rows-[180px_auto_1fr] relative h-fit min-[650px]:h-full
 *   min-[900px]:h-fit`; default tiers `bg-[#F3F4F6] dark:bg-[#F9FAFB]/[0.02] border border-border`;
 *   popular tier `bg-accent` + elevated `md:shadow-[...]`.
 * - name row carries the gradient "Popular" pill; price row `text-4xl font-semibold` + `/month`;
 *   CTA button uses the tier's verbatim `buttonColor` (constants/pricing.ts); feature list has
 *   theme-paired 8x7 check icons in `size-5` circles; every card's list label is "Everything in Pro +".
 */

/** tokens.shadows.button — primary/accent CTAs ("Start Free", "Contact Sales") */
const SHADOW_RAISED =
  "shadow-[0px_1px_2px_0px_rgba(255,255,255,0.16)_inset,0px_3px_3px_-1.5px_rgba(16,24,40,0.24),0px_1px_1px_-0.5px_rgba(16,24,40,0.20)]";
/** blue secondary CTA ("Upgrade to Pro") */
const SHADOW_INSET =
  "shadow-[inset_0_1px_2px_rgba(255,255,255,0.25),0_3px_3px_-1.5px_rgba(16,24,40,0.06),0_1px_1px_rgba(16,24,40,0.08)]";

const POPULAR_BADGE =
  "bg-gradient-to-b from-secondary/50 from-[1.92%] to-secondary to-[100%] text-white h-6 inline-flex w-fit items-center justify-center px-2 rounded-full text-sm ml-2 shadow-[0px_6px_6px_-3px_rgba(0,0,0,0.08),0px_3px_3px_-1.5px_rgba(0,0,0,0.08),0px_1px_1px_-0.5px_rgba(0,0,0,0.08),0px_0px_0px_1px_rgba(255,255,255,0.12)_inset,0px_1px_0px_0px_rgba(255,255,255,0.12)_inset]";

const POPULAR_SHADOW =
  "md:shadow-[0px_61px_24px_-10px_rgba(0,0,0,0.01),0px_34px_20px_-8px_rgba(0,0,0,0.05),0px_15px_15px_-6px_rgba(0,0,0,0.09),0px_4px_8px_-2px_rgba(0,0,0,0.10),0px_0px_0px_1px_rgba(0,0,0,0.08)]";

function FeatureCheck() {
  const d = "M1.5 3.48828L3.375 5.36328L6.5 0.988281";
  return (
    <div className="size-3 flex items-center justify-center">
      <svg className="block dark:hidden" width="8" height="7" viewBox="0 0 8 7" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path stroke="#101828" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" d={d} />
      </svg>
      <svg className="hidden dark:block" width="8" height="7" viewBox="0 0 8 7" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path stroke="#FAFAFA" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" d={d} />
      </svg>
    </div>
  );
}

export interface PricingCardProps {
  name: string;
  price: string;
  /** Billing period label rendered as `/{period}`; reference default "month". */
  period?: string;
  description: string;
  buttonText: string;
  /** Verbatim classes from constants/pricing.ts, e.g. "bg-secondary text-white". */
  buttonColor?: string;
  features: string[];
  popular?: boolean;
  /** Feature-list label; reference renders "Everything in Pro +" on every tier. */
  featuresLabel?: string;
  className?: string;
}

export function PricingCard({
  name,
  price,
  period = "month",
  description,
  buttonText,
  buttonColor = "bg-primary text-primary-foreground",
  features,
  popular = false,
  featuresLabel = "Everything in Pro +",
  className,
}: PricingCardProps) {
  const buttonShadow = buttonColor.includes("bg-secondary") ? SHADOW_INSET : SHADOW_RAISED;

  return (
    <div
      className={cn(
        "rounded-xl grid grid-rows-[180px_auto_1fr] relative h-fit min-[650px]:h-full min-[900px]:h-fit",
        popular ? cn("bg-accent", POPULAR_SHADOW) : "bg-[#F3F4F6] dark:bg-[#F9FAFB]/[0.02] border border-border",
        className,
      )}
    >
      <div className="flex flex-col gap-4 p-4">
        <p className="text-sm">
          {name}
          {popular && <span className={POPULAR_BADGE}>Popular</span>}
        </p>
        <div className="flex items-baseline mt-2">
          <span className="text-4xl font-semibold">{price}</span>
          <span className="ml-2">/{period}</span>
        </div>
        <p className="text-sm mt-2">{description}</p>
      </div>
      <div className="flex flex-col gap-2 p-4">
        <button
          type="button"
          className={cn(
            "h-10 w-full flex items-center justify-center text-sm font-normal tracking-wide rounded-full px-4 cursor-pointer transition-all ease-out active:scale-95",
            buttonColor,
            buttonShadow,
          )}
        >
          {buttonText}
        </button>
      </div>
      <hr className="border-border dark:border-white/20" />
      <div className="p-4">
        <p className="text-sm mb-4">{featuresLabel}</p>
        <ul className="space-y-3">
          {features.map((feature) => (
            <li key={feature} className="flex items-center gap-2">
              <div
                className={cn(
                  "size-5 rounded-full border flex items-center justify-center",
                  popular ? "bg-muted-foreground/40 border-border" : "border-primary/20",
                )}
              >
                <FeatureCheck />
              </div>
              <span className="text-sm">{feature}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default PricingCard;
