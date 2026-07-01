import type { DependencyRule, ExclusionRule, Layer } from "./types";
import { filterCompatibleTraits, getForcedTrait } from "./rules-engine";
import { maxCombinations } from "./rarity";

/** Stop full enumeration above this to keep the UI responsive. */
export const ENUMERATION_CAP = 250_000;

export type ComboSelection = {
  dna: string;
  selection: Map<string, string>;
};

function buildDna(layers: Layer[], selection: Map<string, string>): string {
  return layers
    .map((layer) => {
      const traitId = selection.get(layer.id);
      const idx = layer.traits.findIndex((t) => t.id === traitId);
      return String(idx >= 0 ? idx : 0);
    })
    .join("-");
}

export function comboWeight(
  layers: Layer[],
  selection: Map<string, string>,
): number {
  let weight = 1;
  for (const layer of layers) {
    const traitId = selection.get(layer.id);
    const trait = layer.traits.find((t) => t.id === traitId);
    weight *= Math.max(0, trait?.weight ?? 0) || 1;
  }
  return weight;
}

function enumerateDfs(
  layers: Layer[],
  dependencies: DependencyRule[],
  exclusions: ExclusionRule[],
  layerIndex: number,
  selection: Map<string, string>,
  out: ComboSelection[],
  limit: number,
): void {
  if (out.length >= limit) return;

  if (layerIndex >= layers.length) {
    out.push({
      dna: buildDna(layers, selection),
      selection: new Map(selection),
    });
    return;
  }

  const layer = layers[layerIndex];
  const forced = getForcedTrait(layer, selection, dependencies);
  const candidates = forced
    ? filterCompatibleTraits(layer, [forced], selection, exclusions)
    : filterCompatibleTraits(layer, layer.traits, selection, exclusions);

  for (const trait of candidates) {
    selection.set(layer.id, trait.id);
    enumerateDfs(
      layers,
      dependencies,
      exclusions,
      layerIndex + 1,
      selection,
      out,
      limit,
    );
    selection.delete(layer.id);
    if (out.length >= limit) return;
  }
}

export function enumerateValidCombinations(
  layers: Layer[],
  dependencies: DependencyRule[],
  exclusions: ExclusionRule[],
  limit = ENUMERATION_CAP,
): ComboSelection[] {
  if (layers.length === 0 || layers.some((l) => l.traits.length === 0)) {
    return [];
  }
  const out: ComboSelection[] = [];
  enumerateDfs(layers, dependencies, exclusions, 0, new Map(), out, limit);
  return out;
}

export function countValidCombinations(
  layers: Layer[],
  dependencies: DependencyRule[],
  exclusions: ExclusionRule[],
): { count: number; exact: boolean } {
  if (layers.length === 0 || layers.some((l) => l.traits.length === 0)) {
    return { count: 0, exact: true };
  }

  const theoretical = maxCombinations(layers);
  const hasRules = dependencies.length > 0 || exclusions.length > 0;

  if (!hasRules) {
    return { count: theoretical, exact: true };
  }

  if (theoretical > ENUMERATION_CAP) {
    return { count: theoretical, exact: false };
  }

  let count = 0;
  let exact = true;

  function dfs(layerIndex: number, selection: Map<string, string>) {
    if (!exact) return;
    if (layerIndex >= layers.length) {
      count++;
      if (count > ENUMERATION_CAP) exact = false;
      return;
    }

    const layer = layers[layerIndex];
    const forced = getForcedTrait(layer, selection, dependencies);
    const candidates = forced
      ? filterCompatibleTraits(layer, [forced], selection, exclusions)
      : filterCompatibleTraits(layer, layer.traits, selection, exclusions);

    for (const trait of candidates) {
      selection.set(layer.id, trait.id);
      dfs(layerIndex + 1, selection);
      if (!exact) return;
    }
    selection.delete(layer.id);
  }

  dfs(0, new Map());
  return { count: exact ? count : ENUMERATION_CAP, exact };
}

export function getValidCombinationCount(
  layers: Layer[],
  dependencies: DependencyRule[],
  exclusions: ExclusionRule[],
): { count: number; exact: boolean; label: string } {
  const { count, exact } = countValidCombinations(
    layers,
    dependencies,
    exclusions,
  );
  const label = exact ? count.toLocaleString() : `${count.toLocaleString()}+`;
  return { count, exact, label };
}

/** Traits per layer (equal split) to reach a target unique count. */
export function traitsPerLayerForTarget(
  target: number,
  layerCount: number,
): number {
  if (layerCount <= 0 || target <= 1) return 0;
  return Math.ceil(Math.pow(target, 1 / layerCount));
}

export function collectionSizeHint(
  target: number,
  layerCount: number,
): string {
  if (layerCount <= 0) return "Add layers with traits first.";
  const perLayer = traitsPerLayerForTarget(target, layerCount);
  return `For ${target.toLocaleString()} unique NFTs across ${layerCount} layers, aim for about ${perLayer} traits per layer (more is safer if you use exclusion rules).`;
}

export function weightedSampleCombinations(
  pool: ComboSelection[],
  count: number,
  layers: Layer[],
): ComboSelection[] {
  if (count >= pool.length) return [...pool];
  const remaining = [...pool];
  const selected: ComboSelection[] = [];

  while (selected.length < count && remaining.length > 0) {
    const weights = remaining.map((c) => comboWeight(layers, c.selection));
    const total = weights.reduce((a, b) => a + b, 0);
    let pick = Math.random() * (total || remaining.length);
    let idx = 0;
    for (let i = 0; i < weights.length; i++) {
      pick -= total > 0 ? weights[i] : 1;
      if (pick <= 0) {
        idx = i;
        break;
      }
    }
    selected.push(remaining[idx]);
    remaining.splice(idx, 1);
  }

  return selected;
}
