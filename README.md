# Sathi

Sathi is an owner-only iMessage shopping agent built for the Convex All Gas Hackathon. It turns product requests into Firecrawl search choices, then monitors a selected URL for price or availability changes. It does not authorize purchases.

## Stack

- React, Vite, and TypeScript
- Convex for data, functions, auth, scheduling, realtime updates, and static hosting
- Spectrum and Photon for iMessage
- OpenAI and Firecrawl for request classification, product discovery, scraping, and monitoring

## Sponsor integrations

- **OpenAI:** `gpt-5.6-luna` classifies a URL-free owner message as `clarify`, `search`, or `unsupported`. Trusted code handles every downstream action. The model cannot create a watch, choose a merchant, or authorize spending.
- **Firecrawl:** Search provides product choices, Scrape establishes and verifies prices, and Monitor sends recurring watch webhooks. The app also validates public UCP profiles for checkout-support evidence.
- **AgentMail / Prava:** Both were investigated but blocked by external provider issues. Neither integration shipped in this submission.

## Run locally

You need Node.js 22, a Convex account, a Spectrum project, and OpenAI and Firecrawl API keys.

```bash
npm install
npx convex dev
```

Use [`.env.example`](.env.example) as the configuration checklist. Keep the two `VITE_` values in `.env.local`. Set each Convex deployment value with:

```bash
npx convex env set VARIABLE_NAME "value"
```

Then start the frontend in another terminal:

```bash
npm run dev
```

Run the checks with `npm test` and `npm run check`.

See [hackathon.md](hackathon.md) for the build history, provider proofs, blockers, and future plans.

## License

[MIT](LICENSE)
