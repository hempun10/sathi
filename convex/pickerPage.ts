type PickerCandidateForOg = {
  title: string;
  imageUrl?: string;
};

/**
 * The static fallback used only when no candidate carries a usable photo.
 */
export const FALLBACK_PICK_IMAGE_URL =
  "https://precious-elk-593.convex.site/og-pick.jpg";
const FALLBACK_PICK_IMAGE_ALT = "Three product cards ready to watch";

/** Bound the description so a long list cannot bloat the preview. */
const MAX_OG_DESCRIPTION_LENGTH = 300;

export type PickerOpenGraph = {
  title: string;
  description: string;
  imageUrl: string;
  imageAlt: string;
};

/** Attribute- and text-safe HTML escaping for every provider-derived value. */
export const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character] ?? character,
  );

/** Only HTTPS images are ever emitted into the preview. */
const firstHttpsImage = (candidates: PickerCandidateForOg[]) => {
  for (const candidate of candidates) {
    const imageUrl = candidate.imageUrl;
    if (imageUrl === undefined) continue;
    try {
      const url = new URL(imageUrl);
      if (url.protocol === "https:") return { imageUrl, title: candidate.title };
    } catch {
      // An unparseable value simply has no image.
    }
  }
  return null;
};

/**
 * Build per-session preview metadata from the stored candidates: how many were
 * found, a bounded list of their titles, and the first real photo.
 */
export const pickerOpenGraph = (
  candidates: PickerCandidateForOg[],
): PickerOpenGraph => {
  const count = candidates.length;
  const title = `${count} product${count === 1 ? "" : "s"} found`;
  const listed = candidates
    .map((candidate) => candidate.title)
    .join(", ")
    .slice(0, MAX_OG_DESCRIPTION_LENGTH);
  const image = firstHttpsImage(candidates);
  return {
    title,
    description: listed.length === 0 ? title : listed,
    imageUrl: image?.imageUrl ?? FALLBACK_PICK_IMAGE_URL,
    imageAlt: image?.title ?? FALLBACK_PICK_IMAGE_ALT,
  };
};

export const renderPickerPage = (og: PickerOpenGraph, token: string) => {
  const ogTitle = escapeHtml(og.title);
  const ogDescription = escapeHtml(og.description);
  const ogImage = escapeHtml(og.imageUrl);
  const ogImageAlt = escapeHtml(og.imageAlt);
  const pickerToken = escapeHtml(token);
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Pick a product · Sathi</title>
    <meta
      name="description"
      content="Pick one of the products I found. Selecting starts a watch — nothing is purchased, and any purchase still needs your explicit approval."
    />
    <!-- Open Graph: drives the card preview inside iMessage, so this page is
         not previewed as the landing page. -->
    <meta property="og:type" content="website" />
    <meta property="og:title" content="${ogTitle}" />
    <meta property="og:description" content="${ogDescription}" />
    <meta property="og:image" content="${ogImage}" />
    <meta property="og:image:alt" content="${ogImageAlt}" />
    <meta name="twitter:card" content="summary_large_image" />
    <style>
      :root {
        --bg: #ffffff;
        --fg: #19191d;
        --card: #ffffff;
        --muted: #ededf0;
        --muted-fg: #6f6f78;
        --border: #e4e4ea;
        --btn-bg: #19191d;
        --btn-fg: #ffffff;
        --ok: #157347;
        --ok-bg: #e6f4ea;
        --warn: #8a6d00;
        --warn-bg: #fdf6dd;
        color-scheme: light dark;
      }
      @media (prefers-color-scheme: dark) {
        :root {
          --bg: #0c0c10;
          --fg: #ededf0;
          --card: #19191d;
          --muted: #222228;
          --muted-fg: #8e8e98;
          --border: #2a2a32;
          --btn-bg: #ededf0;
          --btn-fg: #19191d;
          --ok: #6ee7a8;
          --ok-bg: #14301f;
          --warn: #f0d67a;
          --warn-bg: #2f2712;
        }
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        padding: 16px 14px 28px;
        background: var(--bg);
        color: var(--fg);
        font: 15px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        -webkit-font-smoothing: antialiased;
      }
      header { margin: 0 2px 14px; }
      h1 { margin: 0; font-size: 17px; letter-spacing: -0.01em; }
      header p { margin: 4px 0 0; font-size: 13px; color: var(--muted-fg); }
      .grid {
        display: grid;
        gap: 12px;
        grid-template-columns: repeat(auto-fill, minmax(158px, 1fr));
      }
      .thumb {
        aspect-ratio: 1 / 1;
        background: var(--muted);
        border-radius: 10px;
        overflow: hidden;
        margin-bottom: 2px;
      }
      .thumb img {
        display: block;
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
      .card {
        display: flex;
        flex-direction: column;
        text-align: left;
        background: var(--card);
        border: 1px solid var(--border);
        border-radius: 14px;
        overflow: hidden;
        padding: 12px;
        gap: 8px;
        color: inherit;
        font: inherit;
        cursor: pointer;
        transition: border-color 0.15s ease;
      }
      .card[aria-expanded="true"] { border-color: var(--btn-bg); }
      .name {
        font-size: 13.5px;
        font-weight: 600;
        line-height: 1.3;
        margin: 0;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
        min-height: 2.6em;
      }
      .meta { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; }
      .price { font-size: 14px; font-weight: 700; letter-spacing: -0.01em; }
      .badge {
        font-size: 10.5px;
        font-weight: 600;
        padding: 2px 7px;
        border-radius: 999px;
        background: var(--muted);
        color: var(--muted-fg);
        white-space: nowrap;
      }
      .badge.verified { background: var(--ok-bg); color: var(--ok); }
      .badge.needs_verification { background: var(--warn-bg); color: var(--warn); }
      .merchant { font-size: 11.5px; color: var(--muted-fg); margin: 0; }
      .expand {
        border-top: 1px solid var(--border);
        margin-top: 2px;
        padding-top: 10px;
        display: flex;
        flex-direction: column;
        gap: 9px;
      }
      .expand[hidden] { display: none; }
      label { font-size: 12px; color: var(--muted-fg); display: block; }
      .expand input[type="text"],
      .expand input[type="number"] {
        width: 100%;
        margin-top: 4px;
        padding: 8px 9px;
        font: inherit;
        font-size: 14px;
        color: var(--fg);
        background: var(--bg);
        border: 1px solid var(--border);
        border-radius: 9px;
      }
      .chips { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 5px; }
      .chip {
        font: inherit;
        font-size: 12px;
        font-weight: 600;
        padding: 5px 10px;
        border: 1px solid var(--border);
        border-radius: 999px;
        background: transparent;
        color: inherit;
        cursor: pointer;
      }
      .chip[aria-pressed="true"] { background: var(--btn-bg); color: var(--btn-fg); }
      .watch {
        appearance: none;
        width: 100%;
        border: 0;
        border-radius: 10px;
        padding: 11px 8px;
        font: inherit;
        font-size: 13.5px;
        font-weight: 600;
        background: var(--btn-bg);
        color: var(--btn-fg);
        cursor: pointer;
        margin-top: 2px;
      }
      .watch:disabled { opacity: 0.6; cursor: default; }
      .note { font-size: 11.5px; color: var(--muted-fg); margin: 0; }
      .state { margin: 0 2px; font-size: 13.5px; }
      .state.error { color: #c0362c; }
      footer { margin: 18px 2px 0; font-size: 11.5px; color: var(--muted-fg); }
      .success {
        border: 1px solid var(--ok);
        background: var(--ok-bg);
        border-radius: 12px;
        padding: 12px;
        font-size: 13.5px;
      }
      .success strong { display: block; margin-bottom: 2px; }
    </style>
  </head>
  <body>
    <header>
      <h1 id="title">Pick a product</h1>
      <p>
        Choosing a product starts a watch. Nothing is purchased here, and any
        purchase still needs your explicit approval.
      </p>
    </header>

    <p class="state" id="state" role="status" aria-live="polite">
      Loading the products I found…
    </p>
    <div class="grid" id="grid" data-token="${pickerToken}" hidden></div>

    <footer>
      Selecting starts a watch. Nothing is purchased. You approve any purchase
      before it happens.
    </footer>

    <script>
      // Search candidates carry no image URL, and the page deliberately does not
      // fetch one from the merchant: that would mean a cross-origin image
      // request the backend never validated. Cards stay clean text.
      const BADGES = {
        verified: "Prava verified",
        unsupported: "Auto-checkout unsupported",
        needs_verification: "Needs Prava verification",
      };
      const grid = document.getElementById("grid");
      const token =
        new URLSearchParams(window.location.search).get("t") ||
        grid.dataset.token ||
        null;
      const title = document.getElementById("title");
      const state = document.getElementById("state");

      const formatUsd = (minor) => "$" + (minor / 100).toFixed(2);

      const fail = (message) => {
        state.textContent = message;
        state.className = "state error";
        state.hidden = false;
        grid.hidden = true;
      };

      const capFromInput = (input) => {
        const raw = input.value.trim();
        if (raw === "") return undefined;
        const dollars = Number(raw);
        if (!Number.isFinite(dollars) || dollars < 0) return NaN;
        const minor = Math.round(dollars * 100);
        return Number.isSafeInteger(minor) ? minor : NaN;
      };

      const submit = async (candidate, card) => {
        const sizeInput = card.querySelector(".size");
        const capInput = card.querySelector(".cap");
        const watch = card.querySelector(".watch");
        const cardState = card.querySelector(".expand-state");

        const capPriceMinor = capFromInput(capInput);
        if (Number.isNaN(capPriceMinor)) {
          cardState.textContent = "Enter a valid target price, or leave it empty.";
          cardState.className = "state error";
          return;
        }
        const sizeLabel = sizeInput.value.trim();

        watch.disabled = true;
        watch.textContent = "Starting watch…";
        cardState.textContent = "";
        cardState.className = "state";

        let response;
        try {
          response = await fetch("/api/pick", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              token,
              productUrl: candidate.url,
              ...(sizeLabel === "" ? {} : { sizeLabel }),
              ...(capPriceMinor === undefined ? {} : { capPriceMinor }),
            }),
          });
        } catch {
          watch.disabled = false;
          watch.textContent = "Watch this";
          cardState.textContent = "Couldn't reach the server. Try again.";
          cardState.className = "state error";
          return;
        }

        if (response.status === 404) {
          fail("This picker link is invalid, used, or expired. Text me again for a fresh list.");
          return;
        }
        if (response.status === 409) {
          watch.disabled = false;
          watch.textContent = "Watch this";
          cardState.textContent = "You already have a watch open. Finish it before starting another.";
          cardState.className = "state error";
          return;
        }
        if (!response.ok) {
          watch.disabled = false;
          watch.textContent = "Watch this";
          cardState.textContent = "I couldn't start that watch. Nothing was set up. Try again.";
          cardState.className = "state error";
          return;
        }

        const data = await response.json();
        const bits = [];
        if (data.sizeLabel) bits.push("size " + data.sizeLabel);
        if (typeof data.capPriceMinor === "number") {
          bits.push("a target of " + formatUsd(data.capPriceMinor));
        }
        const detail = bits.length === 0 ? "" : " (" + bits.join(", ") + ")";
        const success = document.createElement("div");
        success.className = "success";
        const strong = document.createElement("strong");
        strong.textContent = "Watching " + data.title + ".";
        const p = document.createElement("span");
        p.textContent =
          "I'll let you know when it changes" +
          detail +
          ". Nothing is purchased — you still approve any purchase first.";
        success.append(strong, p);
        card.querySelector(".expand").replaceChildren(success);
        card.querySelector(".expand").hidden = false;
      };

      const render = (candidates) => {
        if (candidates.length === 0) {
          fail("I didn't find any products to show. Text me again with a description.");
          return;
        }
        title.textContent = candidates.length + " product" + (candidates.length === 1 ? "" : "s") + " found";
        state.hidden = true;
        grid.hidden = false;
        grid.replaceChildren();

        for (const candidate of candidates) {
          const card = document.createElement("article");
          card.className = "card";
          card.tabIndex = 0;
          card.setAttribute("role", "button");
          card.setAttribute("aria-expanded", "false");

          if (typeof candidate.imageUrl === "string") {
            const thumb = document.createElement("div");
            thumb.className = "thumb";
            const img = document.createElement("img");
            img.src = candidate.imageUrl;
            img.alt = candidate.title;
            img.loading = "lazy";
            img.referrerPolicy = "no-referrer";
            // A broken photo should not leave a grey hole in the grid.
            img.addEventListener("error", () => thumb.remove());
            thumb.append(img);
            card.append(thumb);
          }

          const name = document.createElement("h2");
          name.className = "name";
          name.textContent = candidate.title;

          const meta = document.createElement("div");
          meta.className = "meta";
          const price = document.createElement("span");
          price.className = "price";
          price.textContent = formatUsd(candidate.priceMinor);
          const badge = document.createElement("span");
          badge.className = "badge " + candidate.checkoutSupport;
          badge.textContent = BADGES[candidate.checkoutSupport] || "Needs Prava verification";
          meta.append(price, badge);

          const merchant = document.createElement("p");
          merchant.className = "merchant";
          merchant.textContent = candidate.merchantHost;

          const expand = document.createElement("div");
          expand.className = "expand";
          expand.hidden = true;
          // The card toggles on click and on Enter/Space. Without this, tapping
          // into the size field or typing a space would collapse the form and
          // throw away what the owner was entering.
          expand.addEventListener("click", (event) => event.stopPropagation());
          expand.addEventListener("keydown", (event) => event.stopPropagation());

          const sizeLabel = document.createElement("label");
          sizeLabel.textContent = "Size (optional)";
          const sizeInput = document.createElement("input");
          sizeInput.type = "text";
          sizeInput.className = "size";
          sizeInput.maxLength = 40;
          sizeInput.placeholder = "e.g. 10, M, 42";
          sizeLabel.append(sizeInput);

          const capLabel = document.createElement("label");
          capLabel.textContent = "Target price (optional)";
          const chips = document.createElement("div");
          chips.className = "chips";
          const capInput = document.createElement("input");
          capInput.type = "number";
          capInput.className = "cap";
          capInput.min = "0";
          capInput.step = "0.01";
          capInput.placeholder = "Custom $";
          for (const amount of [100, 120, 150]) {
            const chip = document.createElement("button");
            chip.type = "button";
            chip.className = "chip";
            chip.textContent = "$" + amount;
            chip.setAttribute("aria-pressed", "false");
            chip.addEventListener("click", (event) => {
              event.stopPropagation();
              capInput.value = String(amount);
              for (const other of chips.querySelectorAll(".chip")) {
                other.setAttribute("aria-pressed", "false");
              }
              chip.setAttribute("aria-pressed", "true");
            });
            chips.append(chip);
          }
          capLabel.append(chips, capInput);

          const watch = document.createElement("button");
          watch.type = "button";
          watch.className = "watch";
          watch.textContent = "Watch this";

          const expandState = document.createElement("p");
          expandState.className = "state expand-state";

          const note = document.createElement("p");
          note.className = "note";
          note.textContent =
            "Starts a watch only. Nothing is purchased, and any purchase still needs your approval.";

          expand.append(sizeLabel, capLabel, watch, expandState, note);
          card.append(name, meta, merchant, expand);

          const toggle = () => {
            const open = card.getAttribute("aria-expanded") === "true";
            card.setAttribute("aria-expanded", String(!open));
            expand.hidden = open;
          };
          card.addEventListener("click", toggle);
          card.addEventListener("keydown", (event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              toggle();
            }
          });
          watch.addEventListener("click", (event) => {
            event.stopPropagation();
            void submit(candidate, card);
          });

          grid.append(card);
        }
      };

      if (token === null || token === "") {
        fail("This picker link is missing its token. Text me again for a fresh list.");
      } else {
        fetch("/api/pick?t=" + encodeURIComponent(token), {
          headers: { Accept: "application/json" },
        })
          .then((response) => {
            if (!response.ok) {
              throw new Error("pick request failed");
            }
            return response.json();
          })
          .then((data) => render(data.candidates))
          .catch(() =>
            fail("This picker link is invalid or has expired. Text me again for a fresh list."),
          );
      }
    </script>
  </body>
</html>
`;
};
