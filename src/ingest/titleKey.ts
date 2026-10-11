import { createHash } from "node:crypto";

const MIN_WORDS = 4; // shorter headlines ("Breaking news") collide too easily to be treated as duplicates

/** Arabic orthographic normalisation, the same idea the search analyzer applies. */
function normaliseArabic(s: string): string {
  return s
    .replace(/[ً-ٰٟـ]/g, "") // diacritics, superscript alef, tatweel
    .replace(/[آأإٱ]/g, "ا") // alef variants -> alef
    .replace(/ى/g, "ي") // alef maqsura -> ya
    .replace(/ة/g, "ه"); // ta marbuta -> ha
}

/**
 * A fingerprint of a headline for spotting the same story republished by several outlets. Case, punctuation,
 * spacing, Arabic spelling variants and a trailing " - Outlet" / " | Outlet" do not change it. Undefined when
 * the headline is too short to compare safely.
 */
export function titleKey(title: string | undefined): string | undefined {
  if (!title) return undefined;
  // Drop a trailing outlet name: the last " - x" or " | x" segment when it is short.
  const parts = title.split(/\s+[|–—-]\s+/);
  const main = parts.length > 1 && (parts.at(-1)!.trim().split(/\s+/).length <= 4) ? parts.slice(0, -1).join(" ") : title;
  const words = normaliseArabic(main.toLowerCase())
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
  if (words.length < MIN_WORDS) return undefined;
  return createHash("sha1").update(words.join(" ")).digest("hex").slice(0, 20);
}
