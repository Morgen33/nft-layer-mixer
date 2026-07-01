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

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/['']/g, "'")
    .replace(/[^a-z0-9/'"\s-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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
  return phrase
    .replace(/^["']|["']$/g, "")
    .replace(/^(?:all|any|every)\s+(?:of\s+(?:the\s+)?)?/i, "")
    .replace(/^(?:under|in)\s+(?:the\s+)?/i, "")
    .replace(/^(?:from\s+)?(?:the\s+)?/i, "")
    .trim();
}

function isPluralish(phrase: string): boolean {
  const raw = phrase.trim().toLowerCase();
  if (/^(all|any|every)\b/.test(raw)) return true;
  if (/\bhoodies\b|\bjackets\b|\bhats\b|\bvisors\b|\bcapes\b|\beyes\b/i.test(raw)) {
    return true;
  }
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
      best = Math.max(best, 65);
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

export function resolveLayerTraits(phrase: string): ResolvedTrait[] {
  const { layers } = useGeneratorStore.getState();
  const p = normalize(cleanPhrase(phrase));

  const layer = layers.find((entry) => {
    const name = normalize(entry.name);
    return name === p || name.includes(p) || p.includes(name);
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
  const raw = phrase.trim();
  const cleaned = cleanPhrase(raw);
  if (!cleaned) return { traits: [], kind: "missing", phrase: raw };

  const layerTraits = resolveLayerTraits(cleaned);
  if (layerTraits.length > 0) {
    return { traits: layerTraits, kind: "layer", phrase: raw };
  }

  const result = resolveTraitPhrase(cleaned);
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

  return { traits: [], kind: "missing", phrase: raw };
}

export function splitTraitList(text: string): string[] {
  return text
    .split(/\s*,\s*|\s+and\s+|\s+or\s+/i)
    .map((part) => part.replace(/^["']|["']$/g, "").trim())
    .filter(Boolean);
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
  return `**${traits.length} ${label}** (${layers.join(", ")})`;
}
