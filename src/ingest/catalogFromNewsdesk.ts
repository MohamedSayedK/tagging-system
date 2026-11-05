// Usage: npm run catalog:from-newsdesk -- <newsdesk-new-sources.csv> <out.json> [--max-rank 2] [--exclude hosts.txt]
// Turns the website list from the owner's Newsdesk account (ADR 0003) into a catalog file for `catalog:import`.
// `--exclude` is a text file with one hostname per line (`#` starts a comment); subdomains go with them.
import { readFileSync, writeFileSync } from "node:fs";
import { newsdeskToCatalog } from "../registry/newsdeskList.js";

const [input, output] = process.argv.slice(2).filter((a, i, all) => !a.startsWith("--") && !all[i - 1]?.startsWith("--"));
const flag = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
if (!input || !output) {
  console.error("Usage: npm run catalog:from-newsdesk -- <list.csv> <out.json> [--max-rank 2] [--exclude hosts.txt]");
  process.exit(2);
}
const maxRank = Number(flag("max-rank") ?? 2);
if (!Number.isInteger(maxRank) || maxRank < 1) throw new Error("--max-rank must be a whole number from 1");
const excludeFile = flag("exclude");
const exclude = new Set(
  excludeFile ? readFileSync(excludeFile, "utf8").split(/\r?\n/).map((l) => l.replace(/#.*/, "").trim().toLowerCase()).filter(Boolean) : [],
);

const { file, excluded } = newsdeskToCatalog(readFileSync(input, "utf8"), { maxRank, exclude });
writeFileSync(output, file, "utf8");
console.log(`${JSON.parse(file).sources.length} sites written to ${output}; ${excluded.length} left out by --exclude`);
