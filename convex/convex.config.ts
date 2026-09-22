import firecrawl from "@firecrawl/firecrawl-convex/convex.config";
import staticHosting from "@convex-dev/static-hosting/convex.config";
import spectrum from "@spectrum-ts/convex/convex.config";
import { defineApp } from "convex/server";
import { v } from "convex/values";

const app = defineApp({
  env: {
    SPECTRUM_WEBHOOK_SECRET: v.string(),
    SPECTRUM_PROJECT_ID: v.string(),
    SPECTRUM_PROJECT_SECRET: v.string(),
    SENDER_HMAC_SECRET: v.string(),
    OWNER_SENDER_KEY: v.string(),
    SITE_URL: v.string(),
    MESSAGE_CTA_URL: v.optional(v.string()),
    FIRECRAWL_API_KEY: v.string(),
    FIRECRAWL_MONITOR_WEBHOOK_TOKEN: v.string(),
    OPENAI_API_KEY: v.string(),
  },
});
app.use(spectrum);
app.use(firecrawl, {
  env: { FIRECRAWL_API_KEY: app.env.FIRECRAWL_API_KEY },
});
app.use(staticHosting);

export default app;
