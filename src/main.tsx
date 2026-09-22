import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { ConvexReactClient } from "convex/react";
import { ThemeProvider } from "next-themes";
import App from "./App";
import "./index.css";

const root = createRoot(document.getElementById("root")!);
const convexUrl = import.meta.env.VITE_CONVEX_URL;

if (convexUrl) {
  root.render(
    <StrictMode>
      <ConvexAuthProvider client={new ConvexReactClient(convexUrl)}>
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
          <App />
        </ThemeProvider>
      </ConvexAuthProvider>
    </StrictMode>,
  );
} else {
  root.render(
    <StrictMode>
      <main className="page">
        <h1>Sathi</h1>
        <p className="status">Convex URL is not configured.</p>
      </main>
    </StrictMode>,
  );
}
