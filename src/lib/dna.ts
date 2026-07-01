import type { Layer } from "./types";

export function buildDna(
  layers: Layer[],
  selection: Map<string, string>,
): string {
  return layers
    .map((layer) => {
      const traitId = selection.get(layer.id);
      const traitIndex = layer.traits.findIndex((t) => t.id === traitId);
      return String(traitIndex >= 0 ? traitIndex : 0);
    })
    .join("-");
}

export function parseDna(
  layers: Layer[],
  dna: string,
): Map<string, string> {
  const indices = dna.split("-").map(Number);
  const selection = new Map<string, string>();
  layers.forEach((layer, i) => {
    const idx = indices[i] ?? 0;
    const trait = layer.traits[idx] ?? layer.traits[0];
    if (trait) selection.set(layer.id, trait.id);
  });
  return selection;
}

export function selectionToTraitIndices(
  layers: Layer[],
  selection: Map<string, string>,
): number[] {
  return layers.map((layer) => {
    const traitId = selection.get(layer.id);
    const idx = layer.traits.findIndex((t) => t.id === traitId);
    return idx >= 0 ? idx : 0;
  });
}
