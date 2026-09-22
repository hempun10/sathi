export interface LogoPath {
  d: string;
  fill?: string;
  fillRule?: "evenodd";
  clipRule?: "evenodd";
}

export interface LogoDef {
  id: number;
  name: string;
  viewBox: string;
  width: number;
  height: number;
  /** Brand color used on hover. */
  color: string;
  /** Monochrome SVG in /public/logos, tinted via CSS mask. */
  src?: string;
  mask?: { id: string; x: number; y: number; width: number; height: number; d: string };
  maskedPaths?: string[];
  paths: LogoPath[];
}

/** Sponsor and product stack shown in the company strip. */
export const logos: LogoDef[] = [
  { id: 1, name: "Convex", viewBox: "0 0 140 32", width: 140, height: 32, color: "#F3B01C", src: "/logos/convex.svg", paths: [] },
  { id: 2, name: "Firecrawl", viewBox: "0 0 160 32", width: 160, height: 32, color: "#FF4A00", src: "/logos/firecrawl.svg", paths: [] },
  { id: 3, name: "Photon", viewBox: "0 0 130 32", width: 130, height: 32, color: "#47C6ED", src: "/logos/photon.svg", paths: [] },
  { id: 4, name: "Shopify", viewBox: "0 0 140 32", width: 140, height: 32, color: "#95BF47", src: "/logos/shopify.svg", paths: [] },
  { id: 5, name: "OpenAI", viewBox: "0 0 130 32", width: 130, height: 32, color: "#10A37F", src: "/logos/openai.svg", paths: [] },
  { id: 6, name: "Codex", viewBox: "0 0 120 32", width: 120, height: 32, color: "#000000", src: "/logos/codex.svg", paths: [] },
];
