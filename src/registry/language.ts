const ARABIC_SCRIPT = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/g;
const LATIN = /[A-Za-z]/g;

// Latin script says nothing about language (Turkish, French and Spanish share it), so English is only
// claimed when its most common function words make up a good share of the text.
const ENGLISH_WORDS = new Set(
  "the of and to in is that for on with as was said by at from be will are has have it an this not but after new its were which their been more also over than into about could would".split(" "),
);
const ENGLISH_SHARE = 0.2;
const MIN_ENGLISH_WORDS = 6;

function looksEnglish(text: string): boolean {
  const words = text.toLowerCase().match(/[a-z']+/g) ?? [];
  if (words.length < MIN_ENGLISH_WORDS) return false;
  return words.filter((w) => ENGLISH_WORDS.has(w)).length / words.length >= ENGLISH_SHARE;
}

// GDELT and the registry use ISO 639-2 codes; the rest of the app uses two-letter ones.
const TWO_TO_THREE: Record<string, string> = {
  ar: "ara", en: "eng", fr: "fra", de: "deu", es: "spa", it: "ita", pt: "por", ru: "rus", tr: "tur", fa: "fas",
  he: "heb", ur: "urd", zh: "zho", ja: "jpn", ko: "kor", hi: "hin", id: "ind", nl: "nld", pl: "pol", uk: "ukr",
  ku: "kur", ps: "pus", am: "amh", so: "som", sw: "swa", ber: "ber",
};

/** `ar` -> `ara`; a code that is already three letters, or unknown, is returned lowercase as it is. */
export function toIso3(code: string): string {
  const c = code.trim().toLowerCase();
  return TWO_TO_THREE[c] ?? c;
}

/** `ar-SA` -> `ar`, ` EN_us ` -> `en`; undefined for anything that is not a language tag. */
export function baseLanguage(tag: string | undefined): string | undefined {
  const base = tag?.trim().toLowerCase().split(/[-_]/)[0];
  return base && /^[a-z]{2,3}$/.test(base) ? base : undefined;
}

/**
 * Rough language of some text by script: `ar` when Arabic-script letters dominate (this includes Persian and
 * Urdu, which share the script), `en` when Latin letters do, otherwise unknown. Needs a few words to judge.
 */
export function detectLanguage(texts: string[]): "ar" | "en" | undefined {
  const text = texts.join(" ");
  const arabic = (text.match(ARABIC_SCRIPT) ?? []).length;
  const latin = (text.match(LATIN) ?? []).length;
  const letters = arabic + latin;
  if (letters < 20) return undefined;
  if (arabic / letters >= 0.5) return "ar";
  if (latin / letters >= 0.8 && looksEnglish(text)) return "en";
  return undefined;
}
