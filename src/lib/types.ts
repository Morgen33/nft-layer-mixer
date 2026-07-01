export type RarityTier = "legendary" | "rare" | "uncommon" | "common";

export const RARITY_TIERS: RarityTier[] = [
  "legendary",
  "rare",
  "uncommon",
  "common",
];

export const RARITY_COLORS: Record<RarityTier, string> = {
  legendary: "#a855f7",
  rare: "#3b82f6",
  uncommon: "#22c55e",
  common: "#84cc16",
};

export const RARITY_LABELS: Record<RarityTier, string> = {
  legendary: "Legendary",
  rare: "Rare",
  uncommon: "Uncommon",
  common: "Common",
};

/** Default relative weights used when you pick a tier (controls real odds). */
export const TIER_DEFAULT_WEIGHTS: Record<RarityTier, number> = {
  legendary: 2,
  rare: 8,
  uncommon: 18,
  common: 40,
};

export interface Trait {
  id: string;
  name: string;
  weight: number;
  tier: RarityTier;
  imageUrl: string;
}

export interface Layer {
  id: string;
  name: string;
  order: number;
  /** When true, layer can roll "None" and skip showing a trait. */
  optional: boolean;
  traits: Trait[];
}

export interface DependencyRule {
  id: string;
  sourceLayerId: string;
  sourceTraitId: string;
  targetLayerId: string;
  targetTraitId: string;
}

export interface ExclusionRule {
  id: string;
  layerAId: string;
  traitAId: string;
  layerBId: string;
  traitBId: string;
}

export interface MetadataConfig {
  namePrefix: string;
  description: string;
  symbol: string;
  externalUrl: string;
  sellerFeeBasisPoints: number;
  exportSolanaManifest: boolean;
}

export interface SelectedTraitInfo {
  layerId: string;
  layerName: string;
  traitId: string;
  traitName: string;
  weight: number;
  percentage: number;
  tier: RarityTier;
}

export interface GeneratedAsset {
  edition: number;
  dna: string;
  imageBlob: Blob;
  previewUrl: string;
  metadata: NftMetadata;
  traits: SelectedTraitInfo[];
}

export interface NftAttribute {
  trait_type: string;
  value: string;
}

export interface NftMetadata {
  name: string;
  description: string;
  image: string;
  dna: string;
  edition: number;
  attributes: NftAttribute[];
  compiler: string;
}

export interface GenerationProgress {
  current: number;
  total: number;
  speed: number;
  etaSeconds: number;
  recentPreviews: GeneratedAsset[];
  traitCounts: Record<string, Record<string, number>>;
}

export interface RollResult {
  dna: string;
  traits: SelectedTraitInfo[];
  previewUrl: string | null;
}
