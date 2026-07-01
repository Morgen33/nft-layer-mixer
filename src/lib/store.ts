"use client";

import { create } from "zustand";
import { compositeTraits } from "./compositor";
import {
  createDemoLayers,
  loadTraitsFromFiles,
  revokeLayerUrls,
} from "./demo-data";
import {
  groupFilesIntoLayers,
  type FileWithPath,
} from "./folder-import";
import {
  buildTraitDistribution,
  computeEta,
  computeGenerationSpeed,
  generateCollection,
} from "./generator";
import {
  collectionSizeHint,
  getValidCombinationCount,
} from "./combo-enumerator";
import {
  defaultOptionalForImportIndex,
  finalizeLayerTraits,
} from "./layer-presets";
import {
  isDuplicateExclusion,
  rollCombination,
} from "./rules-engine";
import {
  defaultWeightForTier,
  traitPercentage,
  weightForTargetPercentage,
} from "./rarity";
import { exportCollectionZip, revokeAssetUrls } from "./zip-export";
import type {
  DependencyRule,
  ExclusionRule,
  GeneratedAsset,
  Layer,
  MetadataConfig,
  RarityTier,
  RollResult,
  SelectedTraitInfo,
  Trait,
} from "./types";

let idCounter = 0;
function uid(prefix: string): string {
  return `${prefix}-${++idCounter}-${Math.random().toString(36).slice(2, 7)}`;
}

interface GeneratorStore {
  layers: Layer[];
  dependencies: DependencyRule[];
  exclusions: ExclusionRule[];
  metadataConfig: MetadataConfig;
  canvasSize: number;
  editionSize: number;

  tierFilter: RarityTier | "all";
  previewTraits: SelectedTraitInfo[];
  previewUrl: string | null;
  previewDna: string;

  isGenerating: boolean;
  generationProgress: number;
  generationTotal: number;
  generationSpeed: number;
  generationEta: number;
  recentPreviews: GeneratedAsset[];
  generatedAssets: GeneratedAsset[];
  traitDistribution: Record<string, Record<string, number>>;
  generationError: string | null;
  isRollingDice: boolean;

  initDemo: () => void;
  addLayer: (name: string) => void;
  removeLayer: (layerId: string) => void;
  moveLayer: (layerId: string, direction: "front" | "back") => void;
  updateLayerName: (layerId: string, name: string) => void;
  setLayerOptional: (layerId: string, optional: boolean) => void;
  addTraitsToLayer: (layerId: string, files: FileList | File[]) => Promise<void>;
  importCollectionFromFiles: (files: FileWithPath[]) => Promise<void>;
  importFilesIntoLayer: (layerId: string, files: FileWithPath[]) => Promise<void>;
  updateTraitWeight: (layerId: string, traitId: string, weight: number) => void;
  updateTraitPercentage: (
    layerId: string,
    traitId: string,
    percentage: number,
  ) => void;
  updateTraitTier: (layerId: string, traitId: string, tier: RarityTier) => void;
  addNoneTraitToLayer: (layerId: string) => void;
  applyTierWeightsToLayer: (layerId: string) => void;
  removeTrait: (layerId: string, traitId: string) => void;
  equalizeLayer: (layerId: string) => void;
  normalizeLayer: (layerId: string) => void;
  setTierFilter: (filter: RarityTier | "all") => void;

  addDependency: (rule: Omit<DependencyRule, "id">) => void;
  removeDependency: (id: string) => void;
  addExclusion: (rule: Omit<ExclusionRule, "id">) => void;
  addExclusionBatch: (
    sourceLayerId: string,
    sourceTraitId: string,
    targets: { layerId: string; traitId: string }[],
  ) => number;
  addExclusionMatrix: (
    sources: { layerId: string; traitId: string }[],
    targets: { layerId: string; traitId: string }[],
  ) => number;
  removeExclusion: (id: string) => void;
  clearExclusions: () => void;

  setMetadataConfig: (config: Partial<MetadataConfig>) => void;
  setCanvasSize: (size: number) => void;
  setEditionSize: (size: number) => void;

  rollDice: () => Promise<void>;
  startGeneration: () => Promise<void>;
  cancelGeneration: () => void;
  exportZip: () => Promise<void>;
  clearGeneration: () => void;

  getMaxCombinations: () => number;
  getMaxCombinationsLabel: () => string;
  getCollectionSizeHint: (target: number) => string;
}

let abortController: AbortController | null = null;
let previewUrlRef: string | null = null;

function buildTraitInfoFromSelection(
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

export const useGeneratorStore = create<GeneratorStore>((set, get) => ({
  layers: [],
  dependencies: [],
  exclusions: [],
  metadataConfig: {
    namePrefix: "Layer Mixer Collection",
    description: "A generative NFT collection created with NFT Layer Mixer.",
    symbol: "MIXER",
    externalUrl: "",
    sellerFeeBasisPoints: 500,
    exportSolanaManifest: true,
  },
  canvasSize: 512,
  editionSize: 100,
  tierFilter: "all",
  previewTraits: [],
  previewUrl: null,
  previewDna: "",
  isGenerating: false,
  generationProgress: 0,
  generationTotal: 0,
  generationSpeed: 0,
  generationEta: 0,
  recentPreviews: [],
  generatedAssets: [],
  traitDistribution: {},
  generationError: null,
  isRollingDice: false,

  initDemo: () => {
    const state = get();
    revokeLayerUrls(state.layers);
    if (previewUrlRef) URL.revokeObjectURL(previewUrlRef);
    revokeAssetUrls(state.generatedAssets);

    const layers = createDemoLayers();

    set({
      layers,
      dependencies: [],
      exclusions: [],
      previewTraits: [],
      previewUrl: null,
      previewDna: "",
      generatedAssets: [],
      recentPreviews: [],
      generationError: null,
    });
  },

  addLayer: (name) => {
    const layers = get().layers;
    set({
      layers: [
        ...layers,
        {
          id: uid("layer"),
          name,
          order: layers.length,
          optional: true,
          traits: [],
        },
      ],
    });
  },

  removeLayer: (layerId) => {
    const state = get();
    const layer = state.layers.find((l) => l.id === layerId);
    if (layer) revokeLayerUrls([layer]);
    set({
      layers: state.layers
        .filter((l) => l.id !== layerId)
        .map((l, i) => ({ ...l, order: i })),
      dependencies: state.dependencies.filter(
        (d) => d.sourceLayerId !== layerId && d.targetLayerId !== layerId,
      ),
      exclusions: state.exclusions.filter(
        (e) => e.layerAId !== layerId && e.layerBId !== layerId,
      ),
    });
  },

  moveLayer: (layerId, direction) => {
    const layers = [...get().layers];
    const index = layers.findIndex((l) => l.id === layerId);
    if (index < 0) return;

    const targetIndex = direction === "front" ? index + 1 : index - 1;
    if (targetIndex < 0 || targetIndex >= layers.length) return;

    [layers[index], layers[targetIndex]] = [layers[targetIndex], layers[index]];
    set({
      layers: layers.map((l, i) => {
        const optional = i === 0 ? false : l.optional;
        return {
          ...l,
          order: i,
          optional,
          traits:
            i === 0 ? finalizeLayerTraits(l.traits, false) : l.traits,
        };
      }),
    });
  },

  updateLayerName: (layerId, name) => {
    set({
      layers: get().layers.map((l) =>
        l.id === layerId ? { ...l, name } : l,
      ),
    });
  },

  setLayerOptional: (layerId, optional) => {
    const layerIndex = get().layers.findIndex((l) => l.id === layerId);
    if (layerIndex === 0) optional = false;

    set({
      layers: get().layers.map((l) =>
        l.id === layerId
          ? {
              ...l,
              optional,
              traits: finalizeLayerTraits(l.traits, optional),
            }
          : l,
      ),
    });
  },

  addTraitsToLayer: async (layerId, files) => {
    const traits = await loadTraitsFromFiles(files);
    set({
      layers: get().layers.map((l) =>
        l.id === layerId
          ? {
              ...l,
              traits: finalizeLayerTraits(
                [...l.traits, ...traits],
                l.optional,
              ),
            }
          : l,
      ),
      generationError: null,
    });
  },

  importCollectionFromFiles: async (files) => {
    const groups = groupFilesIntoLayers(files);
    if (groups.length === 0) {
      set({ generationError: "No image files found in that folder." });
      return;
    }

    const state = get();
    revokeLayerUrls(state.layers);
    if (previewUrlRef) URL.revokeObjectURL(previewUrlRef);
    revokeAssetUrls(state.generatedAssets);

    const layers: Layer[] = [];
    for (let i = 0; i < groups.length; i++) {
      const group = groups[i];
      const rawTraits = await loadTraitsFromFiles(group.files);
      const optional = defaultOptionalForImportIndex(i);
      layers.push({
        id: uid("layer"),
        name: group.layerName,
        order: i,
        optional,
        traits: finalizeLayerTraits(rawTraits, optional),
      });
    }

    set({
      layers,
      dependencies: [],
      exclusions: [],
      previewTraits: [],
      previewUrl: null,
      previewDna: "",
      generatedAssets: [],
      recentPreviews: [],
      generationError: null,
    });
  },

  importFilesIntoLayer: async (layerId, files) => {
    const layer = get().layers.find((l) => l.id === layerId);
    if (!layer) return;

    const groups = groupFilesIntoLayers(files, { targetLayerName: layer.name });
    const allFiles = groups.flatMap((g) => g.files);
    if (allFiles.length === 0) {
      set({ generationError: "No image files found in that folder." });
      return;
    }

    const traits = await loadTraitsFromFiles(allFiles);
    set({
      layers: get().layers.map((l) =>
        l.id === layerId
          ? {
              ...l,
              traits: finalizeLayerTraits(
                [...l.traits, ...traits],
                l.optional,
              ),
            }
          : l,
      ),
      generationError: null,
    });
  },

  updateTraitWeight: (layerId, traitId, weight) => {
    set({
      layers: get().layers.map((l) =>
        l.id === layerId
          ? {
              ...l,
              traits: l.traits.map((t) =>
                t.id === traitId ? { ...t, weight: Math.max(0, weight) } : t,
              ),
            }
          : l,
      ),
    });
  },

  updateTraitTier: (layerId, traitId, tier) => {
    set({
      tierFilter: "all",
      layers: get().layers.map((l) =>
        l.id === layerId
          ? {
              ...l,
              traits: l.traits.map((t) =>
                t.id === traitId
                  ? { ...t, tier, weight: defaultWeightForTier(tier) }
                  : t,
              ),
            }
          : l,
      ),
    });
  },

  updateTraitPercentage: (layerId, traitId, percentage) => {
    const layer = get().layers.find((l) => l.id === layerId);
    if (!layer) return;

    const pct = Math.max(0, Math.min(100, percentage));

    if (pct >= 100) {
      set({
        layers: get().layers.map((l) =>
          l.id === layerId
            ? {
                ...l,
                traits: l.traits.map((t) =>
                  t.id === traitId
                    ? { ...t, weight: 100 }
                    : { ...t, weight: 0 },
                ),
              }
            : l,
        ),
      });
      return;
    }

    const otherTotal = layer.traits
      .filter((t) => t.id !== traitId)
      .reduce((sum, t) => sum + Math.max(0, t.weight), 0);
    const weight = weightForTargetPercentage(pct, otherTotal);
    get().updateTraitWeight(layerId, traitId, weight);
  },

  addNoneTraitToLayer: (layerId) => {
    const layer = get().layers.find((l) => l.id === layerId);
    if (!layer) return;
    get().setLayerOptional(layerId, true);
  },

  applyTierWeightsToLayer: (layerId) => {
    set({
      layers: get().layers.map((l) =>
        l.id === layerId
          ? {
              ...l,
              traits: l.traits.map((t) => ({
                ...t,
                weight: defaultWeightForTier(t.tier),
              })),
            }
          : l,
      ),
    });
  },

  removeTrait: (layerId, traitId) => {
    const state = get();
    const layer = state.layers.find((l) => l.id === layerId);
    const trait = layer?.traits.find((t) => t.id === traitId);
    if (trait?.imageUrl.startsWith("blob:")) {
      URL.revokeObjectURL(trait.imageUrl);
    }
    set({
      layers: state.layers.map((l) =>
        l.id === layerId
          ? { ...l, traits: l.traits.filter((t) => t.id !== traitId) }
          : l,
      ),
    });
  },

  equalizeLayer: (layerId) => {
    set({
      layers: get().layers.map((l) => {
        if (l.id !== layerId || l.traits.length === 0) return l;
        const weight = 1;
        return {
          ...l,
          traits: l.traits.map((t) => ({ ...t, weight })),
        };
      }),
    });
  },

  normalizeLayer: (layerId) => {
    set({
      layers: get().layers.map((l) => {
        if (l.id !== layerId) return l;
        const total = l.traits.reduce((s, t) => s + t.weight, 0);
        if (total <= 0) return l;
        const scale = 100 / total;
        return {
          ...l,
          traits: l.traits.map((t) => ({
            ...t,
            weight: Math.round(t.weight * scale * 100) / 100,
          })),
        };
      }),
    });
  },

  setTierFilter: (filter) => set({ tierFilter: filter }),

  addDependency: (rule) => {
    set({
      dependencies: [...get().dependencies, { ...rule, id: uid("dep") }],
    });
  },

  removeDependency: (id) => {
    set({
      dependencies: get().dependencies.filter((d) => d.id !== id),
    });
  },

  addExclusion: (rule) => {
    if (isDuplicateExclusion(rule, get().exclusions)) return;
    set({
      exclusions: [...get().exclusions, { ...rule, id: uid("exc") }],
    });
  },

  addExclusionBatch: (sourceLayerId, sourceTraitId, targets) => {
    return get().addExclusionMatrix(
      [{ layerId: sourceLayerId, traitId: sourceTraitId }],
      targets,
    );
  },

  addExclusionMatrix: (sources, targets) => {
    const exclusions = [...get().exclusions];
    let added = 0;

    for (const source of sources) {
      for (const target of targets) {
        if (
          source.layerId === target.layerId &&
          source.traitId === target.traitId
        ) {
          continue;
        }

        const rule = {
          layerAId: source.layerId,
          traitAId: source.traitId,
          layerBId: target.layerId,
          traitBId: target.traitId,
        };
        if (isDuplicateExclusion(rule, exclusions)) continue;
        exclusions.push({ ...rule, id: uid("exc") });
        added++;
      }
    }

    if (added > 0) {
      set({ exclusions });
    }
    return added;
  },

  removeExclusion: (id) => {
    set({
      exclusions: get().exclusions.filter((e) => e.id !== id),
    });
  },

  clearExclusions: () => {
    set({ exclusions: [] });
  },

  setMetadataConfig: (config) => {
    set({ metadataConfig: { ...get().metadataConfig, ...config } });
  },

  setCanvasSize: (size) => set({ canvasSize: size }),
  setEditionSize: (size) => set({ editionSize: Math.max(1, size) }),

  rollDice: async () => {
    const { layers, dependencies, exclusions } = get();

    if (layers.length === 0) {
      set({
        generationError:
          "No layers loaded yet. Import a collection folder or wait a moment, then try again.",
      });
      return;
    }

    if (layers.some((layer) => layer.traits.length === 0)) {
      set({
        generationError:
          "Every layer needs at least one trait before you can roll.",
      });
      return;
    }

    set({ isRollingDice: true, generationError: null });

    try {
      const rolled = rollCombination(
        layers,
        dependencies,
        exclusions,
        new Set(),
      );
      if (!rolled) {
        set({
          isRollingDice: false,
          generationError:
            "No valid combinations left with your current rules. Remove a few bans or add more traits.",
        });
        return;
      }

      const traitInfo = buildTraitInfoFromSelection(layers, rolled.selection);
      const orderedTraits = layers.map((layer) => {
        const traitId = rolled.selection.get(layer.id);
        const trait = layer.traits.find((t) => t.id === traitId);
        if (!trait) {
          throw new Error(`Missing trait for layer "${layer.name}".`);
        }
        return trait;
      });

      const blob = await compositeTraits(
        orderedTraits,
        get().canvasSize,
        get().canvasSize,
      );

      if (previewUrlRef) URL.revokeObjectURL(previewUrlRef);
      previewUrlRef = URL.createObjectURL(blob);

      set({
        previewTraits: traitInfo,
        previewUrl: previewUrlRef,
        previewDna: rolled.dna,
        generationError: null,
        isRollingDice: false,
      });
    } catch (error) {
      set({
        isRollingDice: false,
        generationError:
          error instanceof Error
            ? error.message
            : "Preview failed. Check that trait images are valid PNG/JPG files.",
      });
    }
  },

  startGeneration: async () => {
    const state = get();
    const { count: max, exact } = getValidCombinationCount(
      state.layers,
      state.dependencies,
      state.exclusions,
    );

    if (state.layers.length === 0) {
      set({ generationError: "Add at least one layer with traits." });
      return;
    }

    if (state.layers.some((l) => l.traits.length === 0)) {
      set({ generationError: "Every layer must have at least one trait." });
      return;
    }

    if (exact && state.editionSize > max) {
      set({
        generationError: `Requested ${state.editionSize.toLocaleString()} NFTs exceeds maximum unique combinations (${max.toLocaleString()}). ${collectionSizeHint(state.editionSize, state.layers.length)}`,
      });
      return;
    }

    if (!exact && state.editionSize > max) {
      set({
        generationError: `Edition size may exceed valid combinations. ${collectionSizeHint(state.editionSize, state.layers.length)}`,
      });
      return;
    }

    if (state.editionSize >= 5_000) {
      const proceed = typeof window !== "undefined"
        ? window.confirm(
            `Generating ${state.editionSize.toLocaleString()} NFTs uses a lot of browser memory. Keep this tab open until export finishes. Continue?`,
          )
        : true;
      if (!proceed) return;
    }

    revokeAssetUrls(state.generatedAssets);
    abortController = new AbortController();
    const startTime = performance.now();

    set({
      isGenerating: true,
      generationProgress: 0,
      generationTotal: state.editionSize,
      generationSpeed: 0,
      generationEta: 0,
      recentPreviews: [],
      generatedAssets: [],
      traitDistribution: {},
      generationError: null,
    });

    try {
      const assets = await generateCollection({
        layers: state.layers,
        dependencies: state.dependencies,
        exclusions: state.exclusions,
        count: state.editionSize,
        canvasSize: state.canvasSize,
        metadataConfig: state.metadataConfig,
        signal: abortController.signal,
        onProgress: (current, total, asset) => {
          const elapsed = performance.now() - startTime;
          set((s) => {
            const generatedAssets = asset
              ? [...s.generatedAssets, asset]
              : s.generatedAssets;

            const trimmedAssets = generatedAssets.map((entry, index) => {
              if (
                index < generatedAssets.length - 4 &&
                entry.previewUrl.startsWith("blob:")
              ) {
                URL.revokeObjectURL(entry.previewUrl);
                return { ...entry, previewUrl: "" };
              }
              return entry;
            });

            return {
              generationProgress: current,
              generationTotal: total,
              generationSpeed: computeGenerationSpeed(current, elapsed),
              generationEta: computeEta(current, total, elapsed),
              recentPreviews: asset
                ? [...s.recentPreviews, asset].slice(-4)
                : s.recentPreviews,
              generatedAssets: trimmedAssets,
              traitDistribution: buildTraitDistribution(trimmedAssets),
            };
          });
        },
      });

      set({
        generatedAssets: assets,
        traitDistribution: buildTraitDistribution(assets),
        isGenerating: false,
      });
    } catch (e) {
      set({
        isGenerating: false,
        generationError:
          e instanceof Error ? e.message : "Generation failed",
      });
    } finally {
      abortController = null;
    }
  },

  cancelGeneration: () => {
    abortController?.abort();
    set({ isGenerating: false });
  },

  exportZip: async () => {
    const { generatedAssets, metadataConfig } = get();
    if (generatedAssets.length === 0) return;
    const slug =
      metadataConfig.namePrefix
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "") || "collection";
    await exportCollectionZip(generatedAssets, metadataConfig, slug);
  },

  clearGeneration: () => {
    revokeAssetUrls(get().generatedAssets);
    set({
      generatedAssets: [],
      recentPreviews: [],
      traitDistribution: {},
      generationProgress: 0,
      generationError: null,
    });
  },

  getMaxCombinations: () => {
    const state = get();
    return getValidCombinationCount(
      state.layers,
      state.dependencies,
      state.exclusions,
    ).count;
  },

  getMaxCombinationsLabel: () => {
    const state = get();
    return getValidCombinationCount(
      state.layers,
      state.dependencies,
      state.exclusions,
    ).label;
  },

  getCollectionSizeHint: (target) => {
    return collectionSizeHint(target, get().layers.length);
  },
}));

export type { RollResult, Trait };
