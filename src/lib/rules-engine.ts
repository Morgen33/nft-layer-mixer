import type {
  DependencyRule,
  ExclusionRule,
  Layer,
  Trait,
} from "./types";
import { pickWeightedTrait } from "./weighted-random";

const MAX_RANDOM_ROLL_ATTEMPTS = 10_000;

function buildDna(layers: Layer[], selection: Map<string, string>): string {
  return layers
    .map((layer) => {
      const traitId = selection.get(layer.id);
      const idx = layer.traits.findIndex((t) => t.id === traitId);
      return String(idx >= 0 ? idx : 0);
    })
    .join("-");
}

function orderedCandidates(candidates: Trait[], randomize: boolean): Trait[] {
  if (!randomize || candidates.length <= 1) return candidates;

  const remaining = [...candidates];
  const ordered: Trait[] = [];
  while (remaining.length > 0) {
    const picked = pickWeightedTrait(remaining);
    ordered.push(picked);
    remaining.splice(
      remaining.findIndex((trait) => trait.id === picked.id),
      1,
    );
  }
  return ordered;
}

/**
 * Backtracking search finds a valid trait combo under heavy ban/dependency rules.
 * Random retries fail when many exclusions leave only a tiny valid set.
 */
export function findValidCombination(
  layers: Layer[],
  dependencies: DependencyRule[],
  exclusions: ExclusionRule[],
  existingDna: Set<string>,
  randomize = true,
): { selection: Map<string, string>; dna: string } | null {
  const selection = new Map<string, string>();
  let found: { selection: Map<string, string>; dna: string } | null = null;

  function dfs(layerIndex: number): boolean {
    if (found) return true;

    if (layerIndex >= layers.length) {
      const dna = buildDna(layers, selection);
      if (existingDna.has(dna)) return false;
      found = { selection: new Map(selection), dna };
      return true;
    }

    const layer = layers[layerIndex];
    if (layer.traits.length === 0) return false;

    const forced = getForcedTrait(layer, selection, dependencies);
    const candidates = orderedCandidates(
      forced
        ? filterCompatibleTraits(layer, [forced], selection, exclusions)
        : filterCompatibleTraits(layer, layer.traits, selection, exclusions),
      randomize,
    );

    for (const trait of candidates) {
      selection.set(layer.id, trait.id);
      if (dfs(layerIndex + 1)) return true;
      selection.delete(layer.id);
    }

    return false;
  }

  dfs(0);
  return found;
}

export function getForcedTrait(
  layer: Layer,
  selection: Map<string, string>,
  dependencies: DependencyRule[],
): Trait | null {
  for (const rule of dependencies) {
    if (rule.targetLayerId !== layer.id) continue;
    const sourceTraitId = selection.get(rule.sourceLayerId);
    if (sourceTraitId === rule.sourceTraitId) {
      return layer.traits.find((t) => t.id === rule.targetTraitId) ?? null;
    }
  }
  return null;
}

export function isExcluded(
  traitAId: string,
  layerAId: string,
  traitBId: string,
  layerBId: string,
  exclusions: ExclusionRule[],
): boolean {
  return exclusions.some(
    (rule) =>
      (rule.layerAId === layerAId &&
        rule.traitAId === traitAId &&
        rule.layerBId === layerBId &&
        rule.traitBId === traitBId) ||
      (rule.layerAId === layerBId &&
        rule.traitAId === traitBId &&
        rule.layerBId === layerAId &&
        rule.traitBId === traitAId),
  );
}

export function filterCompatibleTraits(
  layer: Layer,
  candidateTraits: Trait[],
  selection: Map<string, string>,
  exclusions: ExclusionRule[],
): Trait[] {
  return candidateTraits.filter((trait) => {
    for (const [otherLayerId, otherTraitId] of selection) {
      if (
        isExcluded(trait.id, layer.id, otherTraitId, otherLayerId, exclusions)
      ) {
        return false;
      }
    }
    return true;
  });
}

export function rollCombination(
  layers: Layer[],
  dependencies: DependencyRule[],
  exclusions: ExclusionRule[],
  existingDna: Set<string>,
): { selection: Map<string, string>; dna: string } | null {
  const found = findValidCombination(
    layers,
    dependencies,
    exclusions,
    existingDna,
    true,
  );
  if (found) return found;

  // Fallback for edge cases where every DFS path hits a used DNA first.
  for (let attempt = 0; attempt < MAX_RANDOM_ROLL_ATTEMPTS; attempt++) {
    const selection = new Map<string, string>();

    let valid = true;
    for (const layer of layers) {
      if (layer.traits.length === 0) {
        valid = false;
        break;
      }

      const forced = getForcedTrait(layer, selection, dependencies);
      if (forced) {
        const compatible = filterCompatibleTraits(
          layer,
          [forced],
          selection,
          exclusions,
        );
        if (compatible.length === 0) {
          valid = false;
          break;
        }
        selection.set(layer.id, forced.id);
        continue;
      }

      const available = filterCompatibleTraits(
        layer,
        layer.traits,
        selection,
        exclusions,
      );
      if (available.length === 0) {
        valid = false;
        break;
      }

      const picked = pickWeightedTrait(available);
      selection.set(layer.id, picked.id);
    }

    if (!valid) continue;

    const dna = buildDna(layers, selection);

    if (!existingDna.has(dna)) {
      return { selection, dna };
    }
  }

  return null;
}

export function exclusionRuleKey(rule: Omit<ExclusionRule, "id">): string {
  const a = `${rule.layerAId}:${rule.traitAId}`;
  const b = `${rule.layerBId}:${rule.traitBId}`;
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

export function isDuplicateExclusion(
  rule: Omit<ExclusionRule, "id">,
  exclusions: ExclusionRule[],
): boolean {
  const key = exclusionRuleKey(rule);
  return exclusions.some((existing) => exclusionRuleKey(existing) === key);
}

export function analyzeExclusions(
  layers: Layer[],
  dependencies: DependencyRule[],
  exclusions: ExclusionRule[],
): string[] {
  const warnings: string[] = [];
  const layerIds = new Set(layers.map((l) => l.id));

  if (exclusions.length === 0) {
    warnings.push("No incompatibility rules defined yet.");
    return warnings;
  }

  const seen = new Set<string>();
  for (const rule of exclusions) {
    const key = exclusionRuleKey(rule);
    if (seen.has(key)) {
      warnings.push("Duplicate ban detected — remove redundant rules.");
      break;
    }
    seen.add(key);

    if (!layerIds.has(rule.layerAId) || !layerIds.has(rule.layerBId)) {
      warnings.push("Some rules reference layers that no longer exist.");
      break;
    }

    if (rule.layerAId === rule.layerBId && rule.traitAId === rule.traitBId) {
      warnings.push("A trait cannot be banned against itself.");
    }
  }

  for (const layer of layers) {
    if (layer.traits.length === 0) continue;

    for (const trait of layer.traits) {
      const blockedByLayer = new Map<string, Set<string>>();

      for (const rule of exclusions) {
        if (rule.layerAId === layer.id && rule.traitAId === trait.id) {
          const set =
            blockedByLayer.get(rule.layerBId) ?? new Set<string>();
          set.add(rule.traitBId);
          blockedByLayer.set(rule.layerBId, set);
        } else if (rule.layerBId === layer.id && rule.traitBId === trait.id) {
          const set =
            blockedByLayer.get(rule.layerAId) ?? new Set<string>();
          set.add(rule.traitAId);
          blockedByLayer.set(rule.layerAId, set);
        }
      }

      for (const [otherLayerId, blockedTraitIds] of blockedByLayer) {
        const otherLayer = layers.find((l) => l.id === otherLayerId);
        if (!otherLayer) continue;

        if (blockedTraitIds.size >= otherLayer.traits.length) {
          warnings.push(
            `“${trait.name}” (${layer.name}) bans every trait in “${otherLayer.name}” — rolls using that trait may fail.`,
          );
        }
      }
    }
  }

  if (dependencies.length > 0) {
    for (const dep of dependencies) {
      for (const rule of exclusions) {
        const forcesPair =
          (rule.layerAId === dep.sourceLayerId &&
            rule.traitAId === dep.sourceTraitId &&
            rule.layerBId === dep.targetLayerId &&
            rule.traitBId === dep.targetTraitId) ||
          (rule.layerBId === dep.sourceLayerId &&
            rule.traitBId === dep.sourceTraitId &&
            rule.layerAId === dep.targetLayerId &&
            rule.traitAId === dep.targetTraitId);

        if (forcesPair) {
          warnings.push(
            "A dependency rule conflicts with a ban — the forced pair can never appear.",
          );
          break;
        }
      }
    }
  }

  if (warnings.length === 0) {
    warnings.push(
      `${exclusions.length} ban${exclusions.length === 1 ? "" : "s"} active — no obvious conflicts detected.`,
    );
  }

  return warnings;
}

export function validateRulesConfig(
  layers: Layer[],
  dependencies: DependencyRule[],
  exclusions: ExclusionRule[],
): string | null {
  const layerIds = new Set(layers.map((l) => l.id));

  for (const rule of dependencies) {
    if (!layerIds.has(rule.sourceLayerId) || !layerIds.has(rule.targetLayerId)) {
      return "Dependency rule references a missing layer.";
    }
  }

  for (const rule of exclusions) {
    if (!layerIds.has(rule.layerAId) || !layerIds.has(rule.layerBId)) {
      return "Exclusion rule references a missing layer.";
    }
  }

  for (const layer of layers) {
    if (layer.traits.length === 0) {
      return `Layer "${layer.name}" has no traits.`;
    }
  }

  return null;
}
