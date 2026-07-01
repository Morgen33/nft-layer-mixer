import type { Layer, RarityTier, Trait } from "./types";
import { TIER_DEFAULT_WEIGHTS } from "./types";

export function traitPercentage(trait: Trait, layer: Layer): number {
  const total = layer.traits.reduce((sum, t) => sum + Math.max(0, t.weight), 0);
  if (total <= 0) return 0;
  return (Math.max(0, trait.weight) / total) * 100;
}

export function layerTotalWeight(layer: Layer): number {
  return layer.traits.reduce((sum, t) => sum + Math.max(0, t.weight), 0);
}

export function equalizeLayerWeights(layer: Layer): Trait[] {
  if (layer.traits.length === 0) return [];
  const weight = 1;
  return layer.traits.map((t) => ({ ...t, weight }));
}

export function normalizeLayerWeights(layer: Layer): Trait[] {
  const total = layerTotalWeight(layer);
  if (total <= 0 || layer.traits.length === 0) {
    return equalizeLayerWeights(layer);
  }
  const scale = 100 / total;
  return layer.traits.map((t) => ({
    ...t,
    weight: Math.round(Math.max(0, t.weight) * scale * 100) / 100,
  }));
}

export function maxCombinations(layers: Layer[]): number {
  if (layers.length === 0) return 0;
  return layers.reduce((acc, layer) => {
    const count = Math.max(layer.traits.length, 1);
    if (acc > Number.MAX_SAFE_INTEGER / count) return Number.MAX_SAFE_INTEGER;
    return acc * count;
  }, 1);
}

export function formatPercentage(value: number): string {
  if (value >= 10) return value.toFixed(1);
  if (value >= 1) return value.toFixed(2);
  return value.toFixed(3);
}

export function weightForTargetPercentage(
  targetPct: number,
  otherWeightsTotal: number,
): number {
  const pct = Math.max(0, Math.min(100, targetPct));
  if (pct <= 0) return 0;
  if (pct >= 100) return Math.max(otherWeightsTotal, 1) * 100;
  if (otherWeightsTotal <= 0) return pct;
  return Math.round(((otherWeightsTotal * pct) / (100 - pct)) * 100) / 100;
}

export function defaultWeightForTier(tier: RarityTier): number {
  return TIER_DEFAULT_WEIGHTS[tier];
}
