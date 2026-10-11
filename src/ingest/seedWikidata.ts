// Usage: npm run seed:wikidata
// Adds MENA newspapers and news agencies from Wikidata to the registry (one request to the public SPARQL
// endpoint). Wikidata asks callers to identify themselves, so USER_AGENT must carry a contact URL.
import { ensureIndices } from "../search/index-def.js";
import { hasContactUrl, seedRegistryFromWikidata } from "./registryJobs.js";

if (!hasContactUrl()) {
  console.error(
    "Set USER_AGENT to a string with a contact URL first, e.g.\n" + '  $env:USER_AGENT = "TaggingBot/0.1 (+https://example.org/contact)"',
  );
  process.exit(2);
}

await ensureIndices();
console.log(JSON.stringify(await seedRegistryFromWikidata()));
