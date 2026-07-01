/** Lower rank = drawn first (back). Higher rank = drawn last (front). */
const STACK_RANKS: ReadonlyArray<{ pattern: RegExp; rank: number }> = [
  { pattern: /background|backdrop|^bg$/i, rank: 0 },
  { pattern: /base|floor|ground/i, rank: 5 },
  { pattern: /body|torso|skin|character/i, rank: 10 },
  { pattern: /shirt|tee|top|clothes/i, rank: 20 },
  { pattern: /sweat|hoodie|jacket|coat|outer/i, rank: 30 },
  { pattern: /head|hair|face/i, rank: 40 },
  { pattern: /eye|glasses|visor|brow/i, rank: 50 },
  { pattern: /hat|headwear|cap|beanie/i, rank: 60 },
  { pattern: /accessory|accessories|prop|hand|item/i, rank: 70 },
  { pattern: /overlay|fx|effect|frame/i, rank: 80 },
];

export function layerStackRank(layerName: string): number {
  const normalized = layerName.trim();
  for (const { pattern, rank } of STACK_RANKS) {
    if (pattern.test(normalized)) return rank;
  }
  return 50;
}

export function sortLayerGroupsByStack(
  groups: ReadonlyArray<{ layerName: string; files: File[] }>,
): { layerName: string; files: File[] }[] {
  return [...groups].sort((a, b) => {
    const rankDiff = layerStackRank(a.layerName) - layerStackRank(b.layerName);
    if (rankDiff !== 0) return rankDiff;
    return a.layerName.localeCompare(b.layerName, undefined, {
      sensitivity: "base",
    });
  });
}

export function sortLayersByStack<T extends { name: string }>(layers: T[]): T[] {
  return [...layers].sort((a, b) => {
    const rankDiff = layerStackRank(a.name) - layerStackRank(b.name);
    if (rankDiff !== 0) return rankDiff;
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });
}
