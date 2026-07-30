import type {
  DependencyRule,
  ExclusionRule,
  Layer,
  Trait,
} from "./types";
import { pickWeightedTrait } from "./weighted-random";

const MAX_RANDOM_ROLL_ATTEMPTS = 80;
const MAX_DFS_NODES = 8_000;
const MAX_ROLL_MS = 150;

function buildDna(layers: Layer[], selection: Map<string, string>): string {
  return layers
    .map((layer) => {
      const traitId = selection.get(layer.id);
      const idx = layer.traits.findIndex((t) => t.id === traitId);
      return String(idx >= 0 ? idx : 0);
    })
    .join("-");
}

function pairKey(
  layerAId: string,
  traitAId: string,
  layerBId: string,
  traitBId: string,
): string {
  const a = `${layerAId}:${traitAId}`;
  const b = `${layerBId}:${traitBId}`;
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/** O(1) exclusion lookups — scanning hundreds of rules per trait freezes the UI. */
export function buildExclusionIndex(exclusions: ExclusionRule[]): Set<string> {
  const index = new Set<string>();
  for (const rule of exclusions) {
    index.add(
      pairKey(rule.layerAId, rule.traitAId, rule.layerBId, rule.traitBId),
    );
  }
  return index;
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
  exclusions: ExclusionRule[] | Set<string>,
): boolean {
  const key = pairKey(layerAId, traitAId, layerBId, traitBId);
  if (exclusions instanceof Set) {
    return exclusions.has(key);
  }
  return exclusions.some(
    (rule) =>
      pairKey(rule.layerAId, rule.traitAId, rule.layerBId, rule.traitBId) ===
      key,
  );
}

export function filterCompatibleTraits(
  layer: Layer,
  candidateTraits: Trait[],
  selection: Map<string, string>,
  exclusions: ExclusionRule[] | Set<string>,
): Trait[] {
  const index =
    exclusions instanceof Set ? exclusions : buildExclusionIndex(exclusions);

  if (index.size === 0 || selection.size === 0) {
    return candidateTraits;
  }

  return candidateTraits.filter((trait) => {
    for (const [otherLayerId, otherTraitId] of selection) {
      if (index.has(pairKey(layer.id, trait.id, otherLayerId, otherTraitId))) {
        return false;
      }
    }
    return true;
  });
}

/**
 * Backtracking search with a hard node/time budget so heavy ban sets
 * cannot freeze the browser tab.
 */
export function findValidCombination(
  layers: Layer[],
  dependencies: DependencyRule[],
  exclusions: ExclusionRule[] | Set<string>,
  existingDna: Set<string>,
  randomize = true,
): { selection: Map<string, string>; dna: string } | null {
  const selection = new Map<string, string>();
  let found: { selection: Map<string, string>; dna: string } | null = null;
  let nodes = 0;
  const started = performance.now();
  const index =
    exclusions instanceof Set ? exclusions : buildExclusionIndex(exclusions);

  function dfs(layerIndex: number): boolean {
    if (found) return true;
    nodes += 1;
    if (nodes > MAX_DFS_NODES) return false;
    if (performance.now() - started > MAX_ROLL_MS) return false;

    if (layerIndex >= layers.length) {
      const dna = buildDna(layers, selection);
      if (existingDna.has(dna)) return false;
      found = { selection: new Map(selection), dna };
      return true;
    }

    const layer = layers[layerIndex]!;
    if (layer.traits.length === 0) return false;

    const forced = getForcedTrait(layer, selection, dependencies);
    const candidates = orderedCandidates(
      forced
        ? filterCompatibleTraits(layer, [forced], selection, index)
        : filterCompatibleTraits(layer, layer.traits, selection, index),
      randomize,
    );

    for (const trait of candidates) {
      selection.set(layer.id, trait.id);
      if (dfs(layerIndex + 1)) return true;
      selection.delete(layer.id);
      if (nodes > MAX_DFS_NODES) return false;
      if (performance.now() - started > MAX_ROLL_MS) return false;
    }

    return false;
  }

  dfs(0);
  return found;
}

export function rollCombination(
  layers: Layer[],
  dependencies: DependencyRule[],
  exclusions: ExclusionRule[],
  existingDna: Set<string>,
): { selection: Map<string, string>; dna: string } | null {
  const index = buildExclusionIndex(exclusions);

  const found = findValidCombination(
    layers,
    dependencies,
    index,
    existingDna,
    true,
  );
  if (found) return found;

  const started = performance.now();
  for (let attempt = 0; attempt < MAX_RANDOM_ROLL_ATTEMPTS; attempt++) {
    if (performance.now() - started > MAX_ROLL_MS) break;

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
          index,
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
        index,
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
  return pairKey(rule.layerAId, rule.traitAId, rule.layerBId, rule.traitBId);
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

  if (exclusions.length > 200) {
    warnings.push(
      `${exclusions.length.toLocaleString()} ban rules active — that's a lot. Rolls may fail or feel slow. Clear some bans if generation struggles.`,
    );
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

  // Cheap per-trait full-layer wipe check (uses index).
  const index = buildExclusionIndex(exclusions);
  for (const layer of layers) {
    if (layer.traits.length === 0) continue;

    for (const trait of layer.traits) {
      for (const otherLayer of layers) {
        if (otherLayer.id === layer.id || otherLayer.traits.length === 0) {
          continue;
        }

        let blocked = 0;
        for (const other of otherLayer.traits) {
          if (
            index.has(
              pairKey(layer.id, trait.id, otherLayer.id, other.id),
            )
          ) {
            blocked += 1;
          }
        }

        if (blocked >= otherLayer.traits.length) {
          warnings.push(
            `“${trait.name}” (${layer.name}) bans every trait in “${otherLayer.name}” — rolls using that trait may fail.`,
          );
        }
      }
    }
  }

  if (dependencies.length > 0) {
    for (const dep of dependencies) {
      if (
        index.has(
          pairKey(
            dep.sourceLayerId,
            dep.sourceTraitId,
            dep.targetLayerId,
            dep.targetTraitId,
          ),
        )
      ) {
        warnings.push(
          "A dependency rule conflicts with a ban — the forced pair can never appear.",
        );
        break;
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

  return null;
}
