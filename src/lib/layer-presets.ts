import { createNoneTrait } from "./demo-data";
import { defaultWeightForTier } from "./rarity";
import type { Trait } from "./types";

/** How many bottom stack layers stay required on folder import (any names). */
export const DEFAULT_REQUIRED_LAYER_COUNT = 2;

export const NONE_TRAIT_WEIGHT = 70;
const IMPORTED_OPTIONAL_ITEM_WEIGHT = 10;

export function defaultOptionalForImportIndex(index: number): boolean {
  return index >= DEFAULT_REQUIRED_LAYER_COUNT;
}

function hasNoneTrait(traits: Trait[]): boolean {
  return traits.some((t) => t.name.trim().toLowerCase() === "none");
}

function normalizeFreshImportWeights(traits: Trait[]): Trait[] {
  const freshImport = traits.length > 0 && traits.every((t) => t.weight === 1);
  if (!freshImport) return traits;
  return traits.map((t) => ({
    ...t,
    weight: defaultWeightForTier(t.tier),
  }));
}

export function stripNoneTraits(traits: Trait[]): Trait[] {
  return traits.filter((t) => t.name.trim().toLowerCase() !== "none");
}

/**
 * Apply defaults after import/upload based on the layer's optional flag.
 * Works with any folder names — not tied to "Cape" or "Body".
 */
export function finalizeLayerTraits(
  traits: Trait[],
  optional: boolean,
): Trait[] {
  let result = normalizeFreshImportWeights(traits);

  if (!optional) {
    return stripNoneTraits(result);
  }

  if (!hasNoneTrait(result)) {
    const none = createNoneTrait();
    none.weight = NONE_TRAIT_WEIGHT;
    result = [none, ...result];
  }

  return result.map((trait) => {
    if (trait.name.trim().toLowerCase() === "none") {
      return {
        ...trait,
        tier: "common",
        weight: Math.max(trait.weight, NONE_TRAIT_WEIGHT),
      };
    }

    if (trait.weight <= 1) {
      return { ...trait, weight: IMPORTED_OPTIONAL_ITEM_WEIGHT };
    }

    return trait;
  });
}

export function optionalLayerHint(optional: boolean): string | null {
  if (!optional) {
    return "Required — always picks one trait from this layer.";
  }
  return "Skippable — includes None so this layer can be left empty.";
}
