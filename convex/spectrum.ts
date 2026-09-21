import { Spectrum } from "@spectrum-ts/convex";
import { components, internal } from "./_generated/api";

export const spectrum: Spectrum = new Spectrum(components.spectrum, {
  onBatch: internal.photon.respond,
  sender: internal.sender.deliver,
  mode: "collapse",
  debounceMs: 500,
  pacingMs: 800,
});
