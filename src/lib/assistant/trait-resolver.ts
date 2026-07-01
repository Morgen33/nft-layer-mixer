import { useGeneratorStore } from "@/lib/store";

export interface ResolvedTrait {
  layerId: string;
  traitId: string;
  layerName: string;
  traitName: string;
}

export type TraitGroupKind = "single" | "group" | "layer" | "missing" | "ambiguous";

export interface TraitGroupResult {
  traits: ResolvedTrait[];
  kind: TraitGroupKind;
  phrase: string;
}

const LAYER_WORDS = [
  "backgrounds",
  "background",
  "neon",
  "skins",
  "skin",
  "teef",
  "jackets",
  "jacket",
  "eyes",
  "eye",
  "visors",
  "visor",
  "capes",
  "cape",
  "hats",
  "hat",
  "accessories",
  "accessory",
];

const PHRASE_SYNONYMS: [RegExp, string][] = [
  [/forward\s+facing/gi, "front snap"],
  [/\bbiz\b/gi, "biz cap"],
  [/pill\s+pack/gi, "pills pack"],
  [/trans(?:lucent)?\s+skins?/gi, "trans"],
];

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/['']/g, "'")
    .replace(/[^a-z0-9/'"\s-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeContractions(text: string): string {
  return text
    .replace(/\bdont\b/gi, "don't")
    .replace(/\bcant\b/gi, "can't")
    .replace(/\bwont\b/gi, "won't")
    .replace(/\bisnt\b/gi, "isn't")
    .replace(/\bshouldnt\b/gi, "shouldn't");
}

function applyPhraseSynonyms(phrase: string): string {
  let result = phrase;
  for (const [pattern, replacement] of PHRASE_SYNONYMS) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

function stemsForMatch(phrase: string): string[] {
  const n = normalize(phrase);
  const stems = new Set<string>([n]);

  if (n.endsWith("ies") && n.length > 4) {
    stems.add(`${n.slice(0, -3)}y`);
  }
  if (n.endsWith("es") && n.length > 4) {
    stems.add(n.slice(0, -2));
    stems.add(n.slice(0, -1));
  }
  if (n.endsWith("s") && !n.endsWith("ss") && n.length > 3) {
    stems.add(n.slice(0, -1));
  }

  return [...stems];
}

function cleanPhrase(phrase: string): string {
  return applyPhraseSynonyms(
    phrase
      .replace(/^["']|["']$/g, "")
      .replace(/^(?:all|any|every)\s+(?:of\s+(?:the\s+)?)?/i, "")
      .replace(/^(?:under|in)\s+(?:the\s+)?/i, "")
      .replace(/^(?:from\s+)?(?:the\s+)?/i, "")
      .trim(),
  );
}

function isPluralish(phrase: string): boolean {
  const raw = phrase.trim().toLowerCase();
  if (/^(all|any|every)\b/.test(raw)) return true;
  const cleaned = cleanPhrase(phrase);
  return cleaned.endsWith("s") && !cleaned.endsWith("ss");
}

function scoreTraitMatch(
  phrase: string,
  layerName: string,
  traitName: string,
): number {
  const stems = stemsForMatch(phrase);
  let best = 0;

  for (const stem of stems) {
    const p = stem;
    const layer = normalize(layerName);
    const trait = normalize(traitName);
    const combined = `${layer} ${trait}`;
    const slash = `${layer}/${trait}`;

    if (trait === p || combined === p || slash === p) best = Math.max(best, 100);
    else if (trait.startsWith(p) || combined.startsWith(p)) best = Math.max(best, 85);
    else if (trait.includes(p) || combined.includes(p)) best = Math.max(best, 70);

    const phraseWords = p.split(" ").filter(Boolean);
    if (phraseWords.length > 1 && phraseWords.every((w) => combined.includes(w))) {
      best = Math.max(best, 90);
    }

    if (phraseWords.length >= 2 && layer.includes(phraseWords[0]!)) {
      const rest = phraseWords.slice(1).join(" ");
      if (trait.includes(rest) || rest.includes(trait)) best = Math.max(best, 75);
    }
  }

  return best;
}

export function listAllTraits(): ResolvedTrait[] {
  const { layers } = useGeneratorStore.getState();
  return layers.flatMap((layer) =>
    layer.traits.map((trait) => ({
      layerId: layer.id,
      traitId: trait.id,
      layerName: layer.name,
      traitName: trait.name,
    })),
  );
}

function isExplicitLayerPhrase(phrase: string): boolean {
  const raw = phrase.trim().toLowerCase();
  if (/^(?:all|any|every)\s+/i.test(raw)) return true;
  if (/^(?:under|in)\s+/i.test(raw)) return true;

  const cleaned = normalize(cleanPhrase(phrase));
  const { layers } = useGeneratorStore.getState();

  return layers.some((layer) => {
    const name = normalize(layer.name);
    return cleaned === name || cleaned === `${name}s` || cleaned === `${name}es`;
  });
}

export function resolveLayerTraits(phrase: string): ResolvedTrait[] {
  if (!isExplicitLayerPhrase(phrase)) return [];

  const { layers } = useGeneratorStore.getState();
  const p = normalize(cleanPhrase(phrase));

  const layer = layers.find((entry) => {
    const name = normalize(entry.name);
    return p === name || p === `${name}s` || p === `${name}es`;
  });

  if (!layer) return [];

  return layer.traits
    .filter((trait) => trait.name !== "None")
    .map((trait) => ({
      layerId: layer.id,
      traitId: trait.id,
      layerName: layer.name,
      traitName: trait.name,
    }));
}

function extractLayerHint(phrase: string): {
  layerHint?: string;
  searchText: string;
} {
  let searchText = applyPhraseSynonyms(phrase);
  let layerHint: string | undefined;

  for (const word of LAYER_WORDS) {
    const re = new RegExp(`\\b${word}\\b`, "i");
    if (re.test(searchText)) {
      layerHint = word.replace(/s$/, "");
      searchText = searchText.replace(re, " ").replace(/\s+/g, " ").trim();
      break;
    }
  }

  return { layerHint, searchText: cleanPhrase(searchText) };
}

export function resolveTraitPattern(phrase: string): ResolvedTrait[] {
  const { layerHint, searchText } = extractLayerHint(phrase);
  const tokens = normalize(searchText)
    .split(" ")
    .filter((token) => token.length > 1);

  if (tokens.length === 0 && !layerHint) return [];

  let candidates = listAllTraits().filter((trait) => trait.traitName !== "None");

  if (layerHint) {
    candidates = candidates.filter((trait) => {
      const layer = normalize(trait.layerName);
      return layer.includes(layerHint!) || layer.startsWith(layerHint!);
    });
  }

  if (tokens.length === 0) {
    return candidates;
  }

  return candidates.filter((trait) => {
    const name = normalize(trait.traitName);
    return tokens.every((token) => {
      if (token === "trans") {
        return name.includes("trans") || name.includes("translucent");
      }
      return name.includes(token);
    });
  });
}

export function resolveTraitPhrase(phrase: string): {
  matches: ResolvedTrait[];
  best?: ResolvedTrait;
} {
  const trimmed = cleanPhrase(phrase.trim());
  if (!trimmed) return { matches: [] };

  const layerTrait = trimmed.match(/^(.+?)\s*[\/|]\s*(.+)$/);
  const searchPhrase = layerTrait ? `${layerTrait[1]} ${layerTrait[2]}` : trimmed;

  const scored = listAllTraits()
    .map((trait) => ({
      trait,
      score: scoreTraitMatch(searchPhrase, trait.layerName, trait.traitName),
    }))
    .filter((entry) => entry.score >= 60)
    .sort((a, b) => b.score - a.score);

  const matches = scored.map((entry) => entry.trait);
  const topScore = scored[0]?.score ?? 0;
  const tied = scored.filter((entry) => entry.score === topScore);

  if (topScore >= 85 && tied.length === 1) {
    return { matches, best: tied[0]!.trait };
  }

  if (topScore >= 60 && scored.length === 1) {
    return { matches, best: matches[0] };
  }

  if (topScore >= 90 && tied.length === 1) {
    return { matches: tied.map((e) => e.trait), best: tied[0]!.trait };
  }

  if (topScore >= 100 && matches.length >= 1) {
    return { matches: [matches[0]!], best: matches[0] };
  }

  return { matches };
}

function allMatchesShareStem(matches: ResolvedTrait[], stem: string): boolean {
  const s = normalize(stem);
  if (s.length < 4) return false;
  return matches.every((trait) => normalize(trait.traitName).includes(s));
}

export function resolveTraitGroup(phrase: string): TraitGroupResult {
  const raw = applyPhraseSynonyms(phrase.trim());
  const cleaned = cleanPhrase(raw);
  if (!cleaned && !isExplicitLayerPhrase(raw)) {
    return { traits: [], kind: "missing", phrase: raw };
  }

  const patternTraits = resolveTraitPattern(raw);
  if (patternTraits.length > 0 && (cleaned.split(" ").length > 1 || /^(?:all|any|every)\b/i.test(raw))) {
    if (patternTraits.length === 1) {
      return { traits: patternTraits, kind: "single", phrase: raw };
    }
    return { traits: patternTraits, kind: "group", phrase: raw };
  }

  const result = resolveTraitPhrase(cleaned || raw);
  if (result.best) {
    return { traits: [result.best], kind: "single", phrase: raw };
  }

  if (result.matches.length > 1) {
    const plural = isPluralish(raw);
    const primaryStem = stemsForMatch(cleaned)[0] ?? cleaned;
    if (plural || allMatchesShareStem(result.matches, primaryStem)) {
      return { traits: result.matches, kind: "group", phrase: raw };
    }
    return { traits: result.matches, kind: "ambiguous", phrase: raw };
  }

  if (result.matches.length === 1) {
    return { traits: result.matches, kind: "single", phrase: raw };
  }

  if (patternTraits.length > 0) {
    if (patternTraits.length === 1) {
      return { traits: patternTraits, kind: "single", phrase: raw };
    }
    return { traits: patternTraits, kind: "group", phrase: raw };
  }

  const layerTraits = resolveLayerTraits(raw);
  if (layerTraits.length > 0) {
    return { traits: layerTraits, kind: "layer", phrase: raw };
  }

  return { traits: [], kind: "missing", phrase: raw };
}

export function splitTraitList(text: string): string[] {
  return text
    .split(/\s*,\s*|\s+and\s+|\s+or\s+/i)
    .map((part) => part.replace(/^["']|["']$/g, "").trim())
    .filter(Boolean);
}

export function expandBanPhrases(leftText: string, rightText: string): {
  left: string[];
  right: string[];
} {
  let right = rightText.trim();
  const left = splitTraitList(leftText);

  const includingMatch = right.match(/^(.+?)\s+including\s+(.+)$/i);
  if (includingMatch) {
    const main = splitTraitList(includingMatch[1]!);
    const extra = splitTraitList(includingMatch[2]!);
    return { left, right: [...main, ...extra] };
  }

  return { left, right: splitTraitList(right) };
}

export function resolveTraitGroups(phrases: string[]): {
  resolved: ResolvedTrait[];
  missing: string[];
  ambiguous: { phrase: string; options: ResolvedTrait[] }[];
} {
  const resolved: ResolvedTrait[] = [];
  const missing: string[] = [];
  const ambiguous: { phrase: string; options: ResolvedTrait[] }[] = [];

  for (const phrase of phrases) {
    const group = resolveTraitGroup(phrase);

    if (group.kind === "missing") {
      missing.push(phrase);
      continue;
    }

    if (group.kind === "ambiguous") {
      ambiguous.push({ phrase, options: group.traits });
      continue;
    }

    for (const trait of group.traits) {
      if (!resolved.some((t) => t.traitId === trait.traitId)) {
        resolved.push(trait);
      }
    }
  }

  return { resolved, missing, ambiguous };
}

export function formatTraitRef(trait: ResolvedTrait): string {
  return `**${trait.traitName}** (${trait.layerName})`;
}

export function formatTraitList(traits: ResolvedTrait[]): string {
  if (traits.length === 0) return "";
  if (traits.length <= 3) return traits.map(formatTraitRef).join(", ");
  return `${traits.slice(0, 3).map(formatTraitRef).join(", ")} and ${traits.length - 3} more`;
}

export function summarizeTraitGroup(traits: ResolvedTrait[], label: string): string {
  if (traits.length === 0) return label;
  const layers = [...new Set(traits.map((t) => t.layerName))];
  if (traits.length === 1) return formatTraitRef(traits[0]!);
  const layerPart = layers.length === 1 ? ` in ${layers[0]}` : ` (${layers.join(", ")})`;
  return `**${traits.length} ${label}**${layerPart}`;
}

export function getTraitsInLayer(layerName: string): ResolvedTrait[] {
  const target = normalize(layerName);
  return listAllTraits().filter(
    (trait) =>
      trait.traitName !== "None" &&
      (normalize(trait.layerName) === target ||
        normalize(trait.layerName).includes(target)),
  );
}
