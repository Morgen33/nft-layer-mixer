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
  exclusionRuleKey,
  rollCombination,
} from "./rules-engine";
import {
  defaultWeightForTier,
  traitPercentage,
  weightForTargetPercentage,
} from "./rarity";
import {
  appendBatchToRun,
  assertRunCompatible,
  buildCollectionFingerprint,
  createCollectionRun,
  DEFAULT_BATCH_SIZE,
  deleteCollectionRun,
  downloadProgressManifest,
  getNextBatchCount,
  isCollectionRunComplete,
  parseProgressManifest,
  persistCollectionRun,
  type CollectionRun,
} from "./collection-run";
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
  generatedCanvasSize: number | null;
  traitDistribution: Record<string, Record<string, number>>;
  generationError: string | null;
  isRollingDice: boolean;

  isExporting: boolean;
  exportProgress: number;

  collectionRun: CollectionRun | null;
  collectionRunTarget: number;
  collectionRunBatchSize: number;

  persistenceReady: boolean;
  activeProjectId: string | null;
  activeProjectName: string;
  lastSavedAt: number | null;
  persistenceError: string | null;
  isSaving: boolean;

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
  startCollectionRun: (totalTarget?: number, batchSize?: number) => Promise<void>;
  startNextBatch: () => Promise<void>;
  importCollectionProgress: (raw: unknown) => Promise<void>;
  clearCollectionRun: () => Promise<void>;
  setCollectionRunTarget: (totalTarget: number) => void;
  setCollectionRunBatchSize: (batchSize: number) => void;
  downloadCollectionProgress: () => void;
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
  generatedCanvasSize: null,
  traitDistribution: {},
  generationError: null,
  isRollingDice: false,
  isExporting: false,
  exportProgress: 0,
  collectionRun: null,
  collectionRunTarget: 7676,
  collectionRunBatchSize: DEFAULT_BATCH_SIZE,
  persistenceReady: false,
  activeProjectId: null,
  activeProjectName: "My Collection",
  lastSavedAt: null,
  persistenceError: null,
  isSaving: false,

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
    const MAX_EXCLUSIONS = 200;
    const existing = get().exclusions;
    if (existing.length >= MAX_EXCLUSIONS) {
      set({
        generationError: `Ban limit reached (${MAX_EXCLUSIONS}). Clear some rules before adding more — too many bans freeze the browser.`,
      });
      return 0;
    }

    const exclusions = [...existing];
    const seen = new Set(exclusions.map((rule) => exclusionRuleKey(rule)));
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
        const key = exclusionRuleKey(rule);
        if (seen.has(key)) continue;
        if (exclusions.length >= MAX_EXCLUSIONS) break;

        exclusions.push({ ...rule, id: uid("exc") });
        seen.add(key);
        added++;
      }
      if (exclusions.length >= MAX_EXCLUSIONS) break;
    }

    if (added > 0) {
      set({
        exclusions,
        generationError:
          exclusions.length >= MAX_EXCLUSIONS
            ? `Added ${added} bans (hit the ${MAX_EXCLUSIONS} limit). Clear unused rules if rolls feel stuck.`
            : null,
      });
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

  setCanvasSize: (size) => {
    const clamped = Math.min(4096, Math.max(256, Math.round(size)));
    set({ canvasSize: clamped });
  },
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
      // Let "Rolling…" paint before the (possibly heavy) rules search.
      await new Promise<void>((resolve) => {
        window.setTimeout(resolve, 0);
      });

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
            exclusions.length > 0
              ? `No valid combo found with ${exclusions.length.toLocaleString()} ban rules. Clear some bans (Rules → Clear All) or loosen them, then try again.`
              : "No valid combinations left. Add more traits and try again.",
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
            let generatedAssets = s.generatedAssets;
            let recentPreviews = s.recentPreviews;

            if (asset) {
              generatedAssets = [...generatedAssets, asset];
              // Revoke only the one preview that just fell out of the live window.
              if (generatedAssets.length > 4) {
                const staleIndex = generatedAssets.length - 5;
                const stale = generatedAssets[staleIndex];
                if (stale?.previewUrl) {
                  URL.revokeObjectURL(stale.previewUrl);
                  generatedAssets[staleIndex] = { ...stale, previewUrl: "" };
                }
              }
              recentPreviews = [...recentPreviews, asset].slice(-4);
            }

            const updateDist =
              current === total || current % 25 === 0 || current === 1;

            return {
              generationProgress: current,
              generationTotal: total,
              generationSpeed: computeGenerationSpeed(current, elapsed),
              generationEta: computeEta(current, total, elapsed),
              recentPreviews,
              generatedAssets,
              ...(updateDist
                ? {
                    traitDistribution: buildTraitDistribution(generatedAssets),
                  }
                : {}),
            };
          });
        },
      });

      // Keep export blobs; drop most preview URLs so the UI stays light.
      const finalized = assets.map((asset, index) => {
        if (index >= assets.length - 4) return asset;
        if (asset.previewUrl) URL.revokeObjectURL(asset.previewUrl);
        return { ...asset, previewUrl: "" };
      });

      set({
        generatedAssets: finalized,
        generatedCanvasSize: state.canvasSize,
        traitDistribution: buildTraitDistribution(finalized),
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

  setCollectionRunTarget: (totalTarget) => {
    set({ collectionRunTarget: Math.max(1, Math.floor(totalTarget) || 1) });
  },

  setCollectionRunBatchSize: (batchSize) => {
    set({
      collectionRunBatchSize: Math.max(1, Math.floor(batchSize) || DEFAULT_BATCH_SIZE),
    });
  },

  startCollectionRun: async (totalTarget, batchSize) => {
    const state = get();
    const target = Math.max(
      1,
      Math.floor(totalTarget ?? state.collectionRunTarget) || 1,
    );
    const size = Math.max(
      1,
      Math.floor(batchSize ?? state.collectionRunBatchSize) || DEFAULT_BATCH_SIZE,
    );

    if (state.layers.length === 0 || state.layers.some((l) => l.traits.length === 0)) {
      set({
        generationError:
          "Add layers with traits before starting a collection run.",
      });
      return;
    }

    if (state.collectionRun && !isCollectionRunComplete(state.collectionRun)) {
      const proceed =
        typeof window === "undefined"
          ? true
          : window.confirm(
              "Replace the current unfinished collection run? DNA history from the old run will be cleared.",
            );
      if (!proceed) return;
      await deleteCollectionRun(state.collectionRun.id);
    }

    const fingerprint = buildCollectionFingerprint(
      state.layers,
      state.dependencies,
      state.exclusions,
      state.canvasSize,
    );

    const run = createCollectionRun({
      name: state.metadataConfig.namePrefix || "Collection Run",
      projectId: state.activeProjectId || "local",
      totalTarget: target,
      batchSize: size,
      canvasSize: state.canvasSize,
      fingerprint,
      metadataNamePrefix: state.metadataConfig.namePrefix,
    });

    await persistCollectionRun(run);
    set({
      collectionRun: run,
      collectionRunTarget: target,
      collectionRunBatchSize: size,
      generationError: null,
    });

    await get().startNextBatch();
  },

  startNextBatch: async () => {
    const state = get();
    const run = state.collectionRun;

    if (!run) {
      set({
        generationError:
          "Start a collection run first (set total target, then Generate Next Batch).",
      });
      return;
    }

    if (isCollectionRunComplete(run)) {
      set({
        generationError:
          "This collection run is already complete. Start a new run for another collection.",
      });
      return;
    }

    try {
      assertRunCompatible(
        run,
        state.layers,
        state.dependencies,
        state.exclusions,
        state.canvasSize,
      );
    } catch (error) {
      set({
        generationError:
          error instanceof Error ? error.message : "Collection run is incompatible.",
      });
      return;
    }

    const batchCount = getNextBatchCount(run);
    if (batchCount <= 0) {
      set({ generationError: "No remaining NFTs in this collection run." });
      return;
    }

    revokeAssetUrls(state.generatedAssets);
    abortController = new AbortController();
    const startTime = performance.now();
    const fromEdition = run.nextEdition;
    const toEdition = fromEdition + batchCount - 1;

    set({
      isGenerating: true,
      generationProgress: 0,
      generationTotal: batchCount,
      generationSpeed: 0,
      generationEta: 0,
      recentPreviews: [],
      generatedAssets: [],
      traitDistribution: {},
      generationError: null,
      editionSize: batchCount,
    });

    try {
      const assets = await generateCollection({
        layers: state.layers,
        dependencies: state.dependencies,
        exclusions: state.exclusions,
        count: batchCount,
        canvasSize: state.canvasSize,
        metadataConfig: state.metadataConfig,
        startEdition: fromEdition,
        existingDna: new Set(run.usedDna),
        signal: abortController.signal,
        onProgress: (current, total, asset) => {
          const elapsed = performance.now() - startTime;
          set((s) => {
            let generatedAssets = s.generatedAssets;
            let recentPreviews = s.recentPreviews;

            if (asset) {
              generatedAssets = [...generatedAssets, asset];
              if (generatedAssets.length > 4) {
                const staleIndex = generatedAssets.length - 5;
                const stale = generatedAssets[staleIndex];
                if (stale?.previewUrl) {
                  URL.revokeObjectURL(stale.previewUrl);
                  generatedAssets[staleIndex] = { ...stale, previewUrl: "" };
                }
              }
              recentPreviews = [...recentPreviews, asset].slice(-4);
            }

            const updateDist =
              current === total || current % 25 === 0 || current === 1;

            return {
              generationProgress: current,
              generationTotal: total,
              generationSpeed: computeGenerationSpeed(current, elapsed),
              generationEta: computeEta(current, total, elapsed),
              recentPreviews,
              generatedAssets,
              ...(updateDist
                ? {
                    traitDistribution: buildTraitDistribution(generatedAssets),
                  }
                : {}),
            };
          });
        },
      });

      const finalized = assets.map((asset, index) => {
        if (index >= assets.length - 4) return asset;
        if (asset.previewUrl) URL.revokeObjectURL(asset.previewUrl);
        return { ...asset, previewUrl: "" };
      });

      const updatedRun = appendBatchToRun(
        run,
        finalized.map((asset) => asset.dna),
      );
      await persistCollectionRun(updatedRun);

      set({
        generatedAssets: finalized,
        generatedCanvasSize: state.canvasSize,
        traitDistribution: buildTraitDistribution(finalized),
        collectionRun: updatedRun,
        isGenerating: false,
        generationError: null,
      });

      // Auto-download portable progress after each successful batch.
      downloadProgressManifest(updatedRun);
    } catch (e) {
      set({
        isGenerating: false,
        generationError:
          e instanceof Error
            ? e.message
            : `Batch ${fromEdition}–${toEdition} failed.`,
      });
    } finally {
      abortController = null;
    }
  },

  importCollectionProgress: async (raw) => {
    try {
      const run = parseProgressManifest(raw);
      const state = get();
      assertRunCompatible(
        run,
        state.layers,
        state.dependencies,
        state.exclusions,
        state.canvasSize,
      );
      await persistCollectionRun(run);
      set({
        collectionRun: run,
        collectionRunTarget: run.totalTarget,
        collectionRunBatchSize: run.batchSize,
        generationError: null,
        persistenceError: null,
      });
    } catch (error) {
      set({
        generationError:
          error instanceof Error
            ? error.message
            : "Could not import collection progress.",
      });
      throw error;
    }
  },

  clearCollectionRun: async () => {
    const run = get().collectionRun;
    if (run) {
      await deleteCollectionRun(run.id);
    }
    set({
      collectionRun: null,
      generationError: null,
    });
  },

  downloadCollectionProgress: () => {
    const run = get().collectionRun;
    if (!run) {
      set({
        generationError: "No active collection run to download.",
      });
      return;
    }
    downloadProgressManifest(run);
  },

  cancelGeneration: () => {
    abortController?.abort();
    set({ isGenerating: false });
  },

  exportZip: async () => {
    const {
      generatedAssets,
      metadataConfig,
      canvasSize,
      generatedCanvasSize,
      collectionRun,
    } = get();

    if (generatedAssets.length === 0) {
      set({
        generationError:
          "Nothing to export yet. Click Generate in the center panel first.",
      });
      return;
    }

    if (generatedCanvasSize !== null && generatedCanvasSize !== canvasSize) {
      set({
        generationError: `Your collection was generated at ${generatedCanvasSize}×${generatedCanvasSize}px, but canvas is now ${canvasSize}×${canvasSize}px. Click Generate again at the new size, then export.`,
      });
      return;
    }

    if (get().isExporting) return;

    const slug =
      metadataConfig.namePrefix
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "") || "collection";

    set({ isExporting: true, exportProgress: 0, generationError: null });
    try {
      await exportCollectionZip(
        generatedAssets,
        metadataConfig,
        slug,
        (pct) => {
          set({ exportProgress: pct });
        },
        collectionRun,
      );
      if (collectionRun) {
        downloadProgressManifest(collectionRun);
      }
      set({ isExporting: false, exportProgress: 100, generationError: null });
    } catch (error) {
      set({
        isExporting: false,
        exportProgress: 0,
        generationError:
          error instanceof Error
            ? error.message
            : "Export failed. Try generating a smaller edition or lower canvas size.",
      });
    }
  },

  clearGeneration: () => {
    revokeAssetUrls(get().generatedAssets);
    set({
      generatedAssets: [],
      generatedCanvasSize: null,
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
