import { useGeneratorStore } from "@/lib/store";

export interface ResolvedTrait {
  layerId: string;
  traitId: string;
  layerName: string;
  traitName: string;
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/['']/g, "'")
    .replace(/[^a-z0-9/'"\s-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function scoreTraitMatch(phrase: string, layerName: string, traitName: string): number {
  const p = normalize(phrase);
  const layer = normalize(layerName);
  const trait = normalize(traitName);
  const combined = `${layer} ${trait}`;
  const slash = `${layer}/${trait}`;

  if (trait === p || combined === p || slash === p) return 100;
  if (trait.startsWith(p) || combined.startsWith(p)) return 85;
  if (trait.includes(p) || combined.includes(p)) return 70;

  const phraseWords = p.split(" ").filter(Boolean);
  if (phraseWords.length > 1 && phraseWords.every((w) => combined.includes(w))) {
    return 65;
  }

  if (phraseWords.length === 1 && layer.includes(phraseWords[0]!)) return 20;
  if (phraseWords.length >= 2 && layer.includes(phraseWords[0]!)) {
    const rest = phraseWords.slice(1).join(" ");
    if (trait.includes(rest) || rest.includes(trait)) return 75;
  }

  return 0;
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

export function resolveTraitPhrase(phrase: string): {
  matches: ResolvedTrait[];
  best?: ResolvedTrait;
} {
  const trimmed = phrase.trim();
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

export function splitTraitList(text: string): string[] {
  return text
    .split(/\s*,\s*|\s+and\s+|\s+or\s+/i)
    .map((part) => part.replace(/^["']|["']$/g, "").trim())
    .filter(Boolean);
}

export function resolveTraitPhrases(phrases: string[]): {
  resolved: ResolvedTrait[];
  missing: string[];
  ambiguous: { phrase: string; options: ResolvedTrait[] }[];
} {
  const resolved: ResolvedTrait[] = [];
  const missing: string[] = [];
  const ambiguous: { phrase: string; options: ResolvedTrait[] }[] = [];

  for (const phrase of phrases) {
    const result = resolveTraitPhrase(phrase);
    if (result.best) {
      if (!resolved.some((t) => t.traitId === result.best!.traitId)) {
        resolved.push(result.best);
      }
      continue;
    }

    if (result.matches.length === 0) {
      missing.push(phrase);
    } else {
      ambiguous.push({ phrase, options: result.matches.slice(0, 5) });
    }
  }

  return { resolved, missing, ambiguous };
}

export function formatTraitRef(trait: ResolvedTrait): string {
  return `**${trait.traitName}** (${trait.layerName})`;
}

export function formatTraitList(traits: ResolvedTrait[]): string {
  return traits.map(formatTraitRef).join(", ");
}
