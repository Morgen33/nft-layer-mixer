import { compositeTraits } from "./compositor";
import {
  enumerateValidCombinations,
  countValidCombinations,
  weightedSampleCombinations,
  type ComboSelection,
} from "./combo-enumerator";
import { traitPercentage } from "./rarity";
import { rollCombination, findValidCombination } from "./rules-engine";
import type {
  DependencyRule,
  ExclusionRule,
  GeneratedAsset,
  Layer,
  MetadataConfig,
  NftMetadata,
  SelectedTraitInfo,
} from "./types";

export type GenerateOptions = {
  layers: Layer[];
  dependencies: DependencyRule[];
  exclusions: ExclusionRule[];
  count: number;
  canvasSize: number;
  metadataConfig: MetadataConfig;
  onProgress?: (current: number, total: number, asset?: GeneratedAsset) => void;
  signal?: AbortSignal;
  batchSize?: number;
};

const POOL_ENUM_LIMIT = 100_000;

function buildTraitInfo(
  layers: Layer[],
  selection: Map<string, string>,
): SelectedTraitInfo[] {
  return layers.map((layer) => {
    const traitId = selection.get(layer.id)!;
    const trait = layer.traits.find((t) => t.id === traitId)!;
    return {
      layerId: layer.id,
      layerName: layer.name,
      traitId: trait.id,
      traitName: trait.name,
      weight: trait.weight,
      percentage: traitPercentage(trait, layer),
      tier: trait.tier,
    };
  });
}

function buildMetadata(
  edition: number,
  dna: string,
  traitInfo: SelectedTraitInfo[],
  config: MetadataConfig,
): NftMetadata {
  return {
    name: `${config.namePrefix} #${edition}`,
    description: config.description,
    image: `${edition}.png`,
    dna,
    edition,
    attributes: traitInfo.map((t) => ({
      trait_type: t.layerName,
      value: t.traitName,
    })),
    compiler: "NFT Layer Mixer",
  };
}

function resolveBatchSize(
  count: number,
  canvasSize: number,
  explicit?: number,
): number {
  if (explicit) return explicit;
  let batch = 8;
  if (count >= 10_000) batch = 48;
  else if (count >= 1_000) batch = 32;
  else if (count >= 200) batch = 16;

  if (canvasSize >= 2048) return Math.max(2, Math.floor(batch / 4));
  if (canvasSize >= 1024) return Math.max(4, Math.floor(batch / 2));
  return batch;
}

async function compositeJobs(
  jobs: ComboSelection[],
  startEdition: number,
  layers: Layer[],
  canvasSize: number,
  metadataConfig: MetadataConfig,
): Promise<GeneratedAsset[]> {
  return Promise.all(
    jobs.map(async (job, offset) => {
      const edition = startEdition + offset + 1;
      const traitInfo = buildTraitInfo(layers, job.selection);
      const orderedTraits = layers.map((layer) => {
        const traitId = job.selection.get(layer.id)!;
        return layer.traits.find((t) => t.id === traitId)!;
      });

      const imageBlob = await compositeTraits(
        orderedTraits,
        canvasSize,
        canvasSize,
      );
      const previewUrl = URL.createObjectURL(imageBlob);

      return {
        edition,
        dna: job.dna,
        imageBlob,
        previewUrl,
        metadata: buildMetadata(edition, job.dna, traitInfo, metadataConfig),
        traits: traitInfo,
      };
    }),
  );
}

export async function generateCollection(
  opts: GenerateOptions,
): Promise<GeneratedAsset[]> {
  const {
    layers,
    dependencies,
    exclusions,
    count,
    canvasSize,
    metadataConfig,
    onProgress,
    signal,
    batchSize: explicitBatchSize,
  } = opts;

  const batchSize = resolveBatchSize(count, canvasSize, explicitBatchSize);
  const { count: validCount, exact: validExact } = countValidCombinations(
    layers,
    dependencies,
    exclusions,
  );

  if (validExact && count > validCount) {
    throw new Error(
      `Requested ${count.toLocaleString()} NFTs exceeds maximum unique combinations (${validCount.toLocaleString()}). Add more traits or remove exclusion rules.`,
    );
  }

  const results: GeneratedAsset[] = [];

  const usePool =
    validExact &&
    validCount <= POOL_ENUM_LIMIT &&
    validCount > 0 &&
    count <= validCount;

  if (usePool) {
    const pool = enumerateValidCombinations(
      layers,
      dependencies,
      exclusions,
      validCount,
    );
    const selected =
      count === pool.length
        ? pool
        : weightedSampleCombinations(pool, count, layers);

    for (let i = 0; i < selected.length; i += batchSize) {
      if (signal?.aborted) throw new Error("Generation cancelled");
      const batch = selected.slice(i, i + batchSize);
      const batchResults = await compositeJobs(
        batch,
        i,
        layers,
        canvasSize,
        metadataConfig,
      );
      for (const asset of batchResults) {
        results.push(asset);
        onProgress?.(results.length, count, asset);
      }
      await new Promise((r) => setTimeout(r, 0));
    }

    return results;
  }

  const dnaSet = new Set<string>();

  while (results.length < count) {
    if (signal?.aborted) throw new Error("Generation cancelled");

    const batchEnd = Math.min(results.length + batchSize, count);
    const batchJobs: ComboSelection[] = [];

    for (let i = results.length; i < batchEnd; i++) {
      let rolled: ComboSelection | null = null;
      rolled = findValidCombination(
        layers,
        dependencies,
        exclusions,
        dnaSet,
        true,
      );
      if (!rolled) {
        const fallback = rollCombination(
          layers,
          dependencies,
          exclusions,
          dnaSet,
        );
        if (fallback) {
          rolled = { dna: fallback.dna, selection: fallback.selection };
        }
      }
      if (!rolled) {
        throw new Error(
          `Could not generate unique DNA at edition ${i + 1}. Add more traits or loosen exclusion rules.`,
        );
      }
      dnaSet.add(rolled.dna);
      batchJobs.push(rolled);
    }

    const batchResults = await compositeJobs(
      batchJobs,
      results.length,
      layers,
      canvasSize,
      metadataConfig,
    );
    for (const asset of batchResults) {
      results.push(asset);
      onProgress?.(results.length, count, asset);
    }

    await new Promise((r) => setTimeout(r, 0));
  }

  return results;
}

export function computeGenerationSpeed(
  count: number,
  elapsedMs: number,
): number {
  if (elapsedMs <= 0) return 0;
  return Math.round((count / elapsedMs) * 1000 * 10) / 10;
}

export function computeEta(
  current: number,
  total: number,
  elapsedMs: number,
): number {
  if (current <= 0) return 0;
  const remaining = total - current;
  const msPerItem = elapsedMs / current;
  return Math.ceil((remaining * msPerItem) / 1000);
}

export function buildTraitDistribution(
  assets: GeneratedAsset[],
): Record<string, Record<string, number>> {
  const counts: Record<string, Record<string, number>> = {};
  for (const asset of assets) {
    for (const trait of asset.traits) {
      counts[trait.layerName] ??= {};
      counts[trait.layerName][trait.traitName] =
        (counts[trait.layerName][trait.traitName] ?? 0) + 1;
    }
  }
  return counts;
}
