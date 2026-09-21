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
    SITE_URL: v.string(),
    MESSAGE_CTA_URL: v.optional(v.string()),
  },
});
app.use(spectrum);
app.use(staticHosting);

export default app;
