import type { Trait } from "./types";

export function isNoneTrait(trait: Trait): boolean {
  return trait.name.trim().toLowerCase() === "none";
}

export function isRenderableTrait(trait: Trait): boolean {
  return !isNoneTrait(trait);
}
