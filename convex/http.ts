import { registerStaticRoutes } from "@convex-dev/static-hosting";
import { httpRouter } from "convex/server";
import { auth } from "./auth";
import { components } from "./_generated/api";
import { httpAction } from "./_generated/server";
import { spectrum } from "./spectrum";

const http = httpRouter();

auth.addHttpRoutes(http);

http.route({
  path: "/api/health",
  method: "GET",
  handler: httpAction(async () =>
    Response.json(
      { status: "ok" },
      { headers: { "Cache-Control": "no-store" } },
    ),
  ),
});

spectrum.registerRoutes(http);
registerStaticRoutes(http, components.staticHosting);

export default http;
