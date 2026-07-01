import type { Trait } from "./types";

export function pickWeightedIndex(weights: number[]): number {
  const w = weights.map((x) => Math.max(0, Number(x)) || 0);
  const total = w.reduce((a, b) => a + b, 0);
  if (total <= 0) return Math.floor(Math.random() * weights.length);
  let r = Math.random() * total;
  for (let i = 0; i < w.length; i++) {
    r -= w[i];
    if (r <= 0) return i;
  }
  return w.length - 1;
}

export function pickWeightedTrait(traits: Trait[]): Trait {
  if (traits.length === 0) {
    throw new Error("Cannot pick from empty trait list");
  }
  const idx = pickWeightedIndex(traits.map((t) => t.weight));
  return traits[idx];
}
