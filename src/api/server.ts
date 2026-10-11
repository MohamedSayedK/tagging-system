import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { buildApp } from "./app.js";
import { assertSafeBinding } from "./security.js";

// HOST defaults to this machine only. Listening on a network address requires BASIC_AUTH=user:password.
const host = process.env.HOST ?? "127.0.0.1";
const basicAuth = process.env.BASIC_AUTH || undefined;
assertSafeBinding(host, basicAuth);

// Serve the built UI (`npm run build:web`) when it exists, so one process is the whole app.
const dist = resolve(process.env.WEB_DIST ?? "web/dist");
const staticDir = existsSync(resolve(dist, "index.html")) ? dist : undefined;

const app = await buildApp({ logger: true, basicAuth, staticDir });
await app.listen({ port: Number(process.env.PORT ?? 3000), host });
if (staticDir) app.log.info(`serving the UI from ${staticDir}`);
