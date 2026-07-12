"use client";

import {
  AUTOSAVE_PROJECT_ID,
  deleteGeneratedRecord,
  deleteProjectRecord,
  listProjectRecords,
  loadGeneratedRecord,
  loadProjectRecord,
  loadTraitImageUrl,
  persistGeneratedAssets,
  persistProject,
  type PersistedProjectData,
  type ProjectListItem,
  type ProjectRecord,
} from "./project-storage";
import { buildTraitDistribution } from "./generator";
import { revokeAssetUrls } from "./zip-export";
import { revokeLayerUrls } from "./demo-data";
import type { GeneratedAsset, Layer } from "./types";
import { useGeneratorStore } from "./store";

let autosaveTimer: ReturnType<typeof setTimeout> | null = null;
let generatedSaveTimer: ReturnType<typeof setTimeout> | null = null;
let autosaveUnsubscribe: (() => void) | null = null;
let autosaveSuspended = 0;
let lastSavedLayerFingerprint: string | null = null;

function activeProjectKey(): string {
  return useGeneratorStore.getState().activeProjectId ?? AUTOSAVE_PROJECT_ID;
}

function layerFingerprint(layers: Layer[]): string {
  return JSON.stringify(
    layers.map((layer) => ({
      id: layer.id,
      traits: layer.traits.map((trait) => trait.id),
    })),
  );
}

export function suspendAutosave(): void {
  autosaveSuspended += 1;
}

export function resumeAutosave(): void {
  autosaveSuspended = Math.max(0, autosaveSuspended - 1);
}

function snapshotFromState(): PersistedProjectData {
  const state = useGeneratorStore.getState();
  return {
    version: 1,
    layers: state.layers.map((layer) => ({
      id: layer.id,
      name: layer.name,
      order: layer.order,
      optional: layer.optional,
      traits: layer.traits.map((trait) => ({
        id: trait.id,
        name: trait.name,
        weight: trait.weight,
        tier: trait.tier,
      })),
    })),
    dependencies: state.dependencies,
    exclusions: state.exclusions,
    metadataConfig: state.metadataConfig,
    canvasSize: state.canvasSize,
    editionSize: state.editionSize,
  };
}

async function layersFromSnapshot(data: PersistedProjectData): Promise<Layer[]> {
  const layers: Layer[] = [];

  for (const layer of [...data.layers].sort((a, b) => a.order - b.order)) {
    const traits = [];
    for (const trait of layer.traits) {
      const imageUrl = await loadTraitImageUrl(trait.id);
      if (!imageUrl) continue;
      traits.push({
        ...trait,
        imageUrl,
      });
    }
    layers.push({
      ...layer,
      traits,
    });
  }

  return layers;
}

function clearEphemeralState() {
  useGeneratorStore.setState({
    previewTraits: [],
    previewUrl: null,
    previewDna: "",
    generatedAssets: [],
    recentPreviews: [],
    traitDistribution: {},
    generationProgress: 0,
    generationError: null,
    isGenerating: false,
    isRollingDice: false,
  });
}

async function applyProjectRecord(record: ProjectRecord) {
  const state = useGeneratorStore.getState();
  revokeLayerUrls(state.layers);
  revokeAssetUrls(state.generatedAssets);

  const layers = await layersFromSnapshot(record.data);
  if (layers.length === 0) {
    throw new Error("Saved project is missing trait images.");
  }

  clearEphemeralState();
  useGeneratorStore.setState({
    layers,
    dependencies: record.data.dependencies,
    exclusions: record.data.exclusions,
    metadataConfig: record.data.metadataConfig,
    canvasSize: record.data.canvasSize,
    editionSize: record.data.editionSize,
    generatedCanvasSize: null,
    activeProjectId: record.id,
    activeProjectName: record.name,
    lastSavedAt: record.updatedAt,
    persistenceError: null,
  });
  lastSavedLayerFingerprint = layerFingerprint(layers);

  await restoreGeneratedAssets(record.id);
}

export async function saveCurrentProject(
  id: string,
  name: string,
): Promise<void> {
  const state = useGeneratorStore.getState();
  if (state.layers.length === 0) {
    throw new Error("Nothing to save yet — add layers or import art first.");
  }

  useGeneratorStore.setState({ isSaving: true, persistenceError: null });

  try {
    const updatedAt = Date.now();
    const data = snapshotFromState();
    const record: ProjectRecord = { id, name, updatedAt, data };
    const fingerprint = layerFingerprint(state.layers);
    const writeImages = fingerprint !== lastSavedLayerFingerprint;
    await persistProject(record, state.layers, { writeImages });
    lastSavedLayerFingerprint = fingerprint;
    useGeneratorStore.setState({
      activeProjectId: id,
      activeProjectName: name,
      lastSavedAt: updatedAt,
      isSaving: false,
    });
  } catch (error) {
    useGeneratorStore.setState({
      isSaving: false,
      persistenceError:
        error instanceof Error ? error.message : "Could not save project.",
    });
    throw error;
  }
}

export async function autosaveCurrentProject(): Promise<void> {
  const state = useGeneratorStore.getState();
  if (
    autosaveSuspended > 0 ||
    !state.persistenceReady ||
    state.isGenerating ||
    state.layers.length === 0
  ) {
    return;
  }

  const name =
    state.metadataConfig.namePrefix.trim() || state.activeProjectName || "My Collection";

  useGeneratorStore.setState({ isSaving: true });
  try {
    await saveCurrentProject(AUTOSAVE_PROJECT_ID, name);
  } finally {
    useGeneratorStore.setState({ isSaving: false });
  }
}

export function scheduleAutosave() {
  if (autosaveTimer) clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(() => {
    void autosaveCurrentProject();
  }, 1200);
}

async function saveGeneratedAssets(): Promise<void> {
  const state = useGeneratorStore.getState();
  if (!state.persistenceReady) return;

  try {
    if (state.generatedAssets.length === 0) {
      await deleteGeneratedRecord(activeProjectKey());
    } else {
      await persistGeneratedAssets(
        activeProjectKey(),
        state.generatedCanvasSize ?? state.canvasSize,
        state.generatedAssets,
      );
    }
  } catch {
    // Non-fatal: the in-memory collection is still exportable this session.
  }
}

function scheduleGeneratedSave() {
  if (generatedSaveTimer) clearTimeout(generatedSaveTimer);
  generatedSaveTimer = setTimeout(() => {
    void saveGeneratedAssets();
  }, 400);
}

export function startAutosaveListener() {
  autosaveUnsubscribe?.();

  autosaveUnsubscribe = useGeneratorStore.subscribe((state, prev) => {
    if (!state.persistenceReady) return;

    // Persist the generated collection once a run finishes (or is cleared),
    // but never mid-generation when assets churn on every progress tick.
    if (!state.isGenerating && state.generatedAssets !== prev.generatedAssets) {
      scheduleGeneratedSave();
    }

    if (state.isGenerating) return;

    const changed =
      state.layers !== prev.layers ||
      state.dependencies !== prev.dependencies ||
      state.exclusions !== prev.exclusions ||
      state.metadataConfig !== prev.metadataConfig ||
      state.canvasSize !== prev.canvasSize ||
      state.editionSize !== prev.editionSize;

    if (changed) scheduleAutosave();
  });
}

async function restoreGeneratedAssets(projectId: string): Promise<void> {
  const record = await loadGeneratedRecord(projectId);
  if (!record || record.assets.length === 0) return;

  const assets: GeneratedAsset[] = record.assets.map((asset) => ({
    edition: asset.edition,
    dna: asset.dna,
    imageBlob: asset.imageBlob,
    previewUrl: URL.createObjectURL(asset.imageBlob),
    metadata: asset.metadata,
    traits: asset.traits,
  }));

  useGeneratorStore.setState({
    generatedAssets: assets,
    generatedCanvasSize: record.canvasSize,
    traitDistribution: buildTraitDistribution(assets),
    generationProgress: assets.length,
    generationTotal: assets.length,
  });
}

export async function bootstrapProjectPersistence(): Promise<void> {
  if (typeof window === "undefined") return;

  useGeneratorStore.setState({ persistenceReady: false });

  try {
    const autosave = await loadProjectRecord(AUTOSAVE_PROJECT_ID);
    if (autosave && autosave.data.layers.length > 0) {
      await applyProjectRecord(autosave);
    } else {
      useGeneratorStore.getState().initDemo();
      useGeneratorStore.setState({
        activeProjectId: AUTOSAVE_PROJECT_ID,
        activeProjectName: "Demo Collection",
        lastSavedAt: null,
      });
    }
  } catch (error) {
    useGeneratorStore.getState().initDemo();
    useGeneratorStore.setState({
      persistenceError:
        error instanceof Error
          ? error.message
          : "Could not restore your last session.",
    });
  }

  useGeneratorStore.setState({ persistenceReady: true });
  startAutosaveListener();
}

export async function loadSavedProject(id: string): Promise<void> {
  try {
    const record = await loadProjectRecord(id);
    if (!record) throw new Error("Saved project not found.");
    await applyProjectRecord(record);
    scheduleAutosave();
  } catch (error) {
    useGeneratorStore.setState({
      persistenceError:
        error instanceof Error ? error.message : "Could not load project.",
    });
    throw error;
  }
}

export async function saveNamedProject(name: string): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Enter a project name.");
  const id = `project-${Date.now()}`;
  await saveCurrentProject(id, trimmed);
}

export async function fetchSavedProjects(): Promise<ProjectListItem[]> {
  return listProjectRecords().then((items) =>
    items.filter((item) => item.id !== AUTOSAVE_PROJECT_ID),
  );
}

export async function removeSavedProject(id: string): Promise<void> {
  await deleteProjectRecord(id);
  const state = useGeneratorStore.getState();
  if (state.activeProjectId === id) {
    useGeneratorStore.setState({
      activeProjectId: AUTOSAVE_PROJECT_ID,
      activeProjectName: state.metadataConfig.namePrefix,
    });
  }
}
