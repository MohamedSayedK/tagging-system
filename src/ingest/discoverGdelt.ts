import { ensureIndices } from "../search/index-def.js";
import { discoverFromGdelt } from "./registryJobs.js";

/** Usage: npm run discover:gdelt -- [--hours 6] [--max-stamps 96]. Each stamp is two files of about 1-3 MB. */
function flag(name: string, fallback: number): number {
  const i = process.argv.indexOf(`--${name}`);
  const v = i >= 0 ? Number(process.argv[i + 1]) : fallback;
  if (!Number.isFinite(v) || v <= 0) throw new Error(`--${name} must be a positive number`);
  return v;
}

await ensureIndices();
console.log(JSON.stringify(await discoverFromGdelt({ hours: flag("hours", 6), maxStamps: flag("max-stamps", 96) })));
