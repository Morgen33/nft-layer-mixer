"use client";

import type {
  DependencyRule,
  ExclusionRule,
  GeneratedAsset,
  Layer,
  MetadataConfig,
  NftMetadata,
  SelectedTraitInfo,
} from "./types";

export const AUTOSAVE_PROJECT_ID = "__autosave__";
/** Above this, skip auto-saving generated images to keep the UI responsive. */
export const MAX_PERSISTED_GENERATED = 80;

const DB_NAME = "nft-layer-mixer";
const DB_VERSION = 4;
const PROJECTS_STORE = "projects";
const IMAGES_STORE = "images";
const GENERATED_STORE = "generated";
const GENERATED_IMAGES_STORE = "generated-images";
const COLLECTION_RUNS_STORE = "collection-runs";

export interface PersistedGeneratedMeta {
  edition: number;
  dna: string;
  metadata: NftMetadata;
  traits: SelectedTraitInfo[];
}

export interface GeneratedRecord {
  id: string;
  canvasSize: number;
  updatedAt: number;
  assets: PersistedGeneratedMeta[];
}

export interface PersistedTrait {
  id: string;
  name: string;
  weight: number;
  tier: Layer["traits"][number]["tier"];
}

export interface PersistedLayer {
  id: string;
  name: string;
  order: number;
  optional: boolean;
  traits: PersistedTrait[];
}

export interface PersistedProjectData {
  version: 1;
  layers: PersistedLayer[];
  dependencies: DependencyRule[];
  exclusions: ExclusionRule[];
  metadataConfig: MetadataConfig;
  canvasSize: number;
  editionSize: number;
}

export interface ProjectRecord {
  id: string;
  name: string;
  updatedAt: number;
  data: PersistedProjectData;
}

export interface ProjectListItem {
  id: string;
  name: string;
  updatedAt: number;
  layerCount: number;
  traitCount: number;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB failed"));
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(PROJECTS_STORE)) {
        db.createObjectStore(PROJECTS_STORE, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(IMAGES_STORE)) {
        db.createObjectStore(IMAGES_STORE);
      }
      if (!db.objectStoreNames.contains(GENERATED_STORE)) {
        db.createObjectStore(GENERATED_STORE, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(GENERATED_IMAGES_STORE)) {
        db.createObjectStore(GENERATED_IMAGES_STORE);
      }
      if (!db.objectStoreNames.contains(COLLECTION_RUNS_STORE)) {
        db.createObjectStore(COLLECTION_RUNS_STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB transaction failed"));
    tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction aborted"));
  });
}

async function yieldToBrowser(): Promise<void> {
  await new Promise<void>((resolve) => {
    window.setTimeout(resolve, 0);
  });
}

function generatedImageKey(projectId: string, edition: number): string {
  return `${projectId}:${edition}`;
}

async function imageUrlToBlob(url: string): Promise<Blob> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("Could not read trait image for save.");
  }
  return response.blob();
}

export async function persistProject(
  record: ProjectRecord,
  layers: Layer[],
  options?: { writeImages?: boolean },
): Promise<void> {
  const writeImages = options?.writeImages !== false;
  const imageEntries: { traitId: string; blob: Blob }[] = [];

  if (writeImages) {
    let processed = 0;
    for (const layer of layers) {
      for (const trait of layer.traits) {
        imageEntries.push({
          traitId: trait.id,
          blob: await imageUrlToBlob(trait.imageUrl),
        });
        processed += 1;
        if (processed % 8 === 0) {
          await yieldToBrowser();
        }
      }
    }
  }

  const db = await openDb();
  const tx = db.transaction([PROJECTS_STORE, IMAGES_STORE], "readwrite");
  const projects = tx.objectStore(PROJECTS_STORE);
  const images = tx.objectStore(IMAGES_STORE);

  if (writeImages) {
    for (const entry of imageEntries) {
      images.put(entry.blob, entry.traitId);
    }
  }

  projects.put(record);
  await txDone(tx);
  db.close();
}

export async function loadProjectRecord(
  id: string,
): Promise<ProjectRecord | null> {
  const db = await openDb();
  const tx = db.transaction(PROJECTS_STORE, "readonly");
  const projects = tx.objectStore(PROJECTS_STORE);
  const record = await new Promise<ProjectRecord | undefined>((resolve, reject) => {
    const request = projects.get(id);
    request.onsuccess = () => resolve(request.result as ProjectRecord | undefined);
    request.onerror = () => reject(request.error);
  });
  await txDone(tx);
  db.close();
  return record ?? null;
}

export async function loadTraitImageUrl(traitId: string): Promise<string | null> {
  const db = await openDb();
  const tx = db.transaction(IMAGES_STORE, "readonly");
  const images = tx.objectStore(IMAGES_STORE);
  const blob = await new Promise<Blob | undefined>((resolve, reject) => {
    const request = images.get(traitId);
    request.onsuccess = () => resolve(request.result as Blob | undefined);
    request.onerror = () => reject(request.error);
  });
  await txDone(tx);
  db.close();
  if (!blob) return null;
  return URL.createObjectURL(blob);
}

export async function listProjectRecords(): Promise<ProjectListItem[]> {
  const db = await openDb();
  const tx = db.transaction(PROJECTS_STORE, "readonly");
  const projects = tx.objectStore(PROJECTS_STORE);
  const records = await new Promise<ProjectRecord[]>((resolve, reject) => {
    const request = projects.getAll();
    request.onsuccess = () => resolve(request.result as ProjectRecord[]);
    request.onerror = () => reject(request.error);
  });
  await txDone(tx);
  db.close();

  return records
    .map((record) => ({
      id: record.id,
      name: record.name,
      updatedAt: record.updatedAt,
      layerCount: record.data.layers.length,
      traitCount: record.data.layers.reduce(
        (sum, layer) => sum + layer.traits.length,
        0,
      ),
    }))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function deleteProjectRecord(id: string): Promise<void> {
  const record = await loadProjectRecord(id);
  if (!record) return;

  const db = await openDb();
  const tx = db.transaction(
    [PROJECTS_STORE, IMAGES_STORE, GENERATED_STORE, GENERATED_IMAGES_STORE],
    "readwrite",
  );
  const projects = tx.objectStore(PROJECTS_STORE);
  const images = tx.objectStore(IMAGES_STORE);
  const generated = tx.objectStore(GENERATED_STORE);
  const generatedImages = tx.objectStore(GENERATED_IMAGES_STORE);

  projects.delete(id);
  for (const layer of record.data.layers) {
    for (const trait of layer.traits) {
      images.delete(trait.id);
    }
  }

  const existing = await new Promise<GeneratedRecord | undefined>((resolve, reject) => {
    const request = generated.get(id);
    request.onsuccess = () =>
      resolve(request.result as GeneratedRecord | undefined);
    request.onerror = () => reject(request.error);
  });
  generated.delete(id);
  if (existing?.assets) {
    for (const asset of existing.assets) {
      generatedImages.delete(generatedImageKey(id, asset.edition));
    }
  }

  await txDone(tx);
  db.close();
}

export async function persistGeneratedAssets(
  id: string,
  canvasSize: number,
  assets: GeneratedAsset[],
): Promise<{ saved: boolean; reason?: string }> {
  if (assets.length === 0) {
    await deleteGeneratedRecord(id);
    return { saved: true };
  }

  if (assets.length > MAX_PERSISTED_GENERATED) {
    await deleteGeneratedRecord(id);
    return {
      saved: false,
      reason: `Collection has ${assets.length.toLocaleString()} NFTs — too large to auto-save in the browser. Export the ZIP to keep them.`,
    };
  }

  // Clear previous images first so we don't leave orphans.
  await deleteGeneratedRecord(id);

  const chunkSize = 8;
  for (let i = 0; i < assets.length; i += chunkSize) {
    const chunk = assets.slice(i, i + chunkSize);
    const db = await openDb();
    const tx = db.transaction(GENERATED_IMAGES_STORE, "readwrite");
    const store = tx.objectStore(GENERATED_IMAGES_STORE);
    for (const asset of chunk) {
      store.put(asset.imageBlob, generatedImageKey(id, asset.edition));
    }
    await txDone(tx);
    db.close();
    await yieldToBrowser();
  }

  const record: GeneratedRecord = {
    id,
    canvasSize,
    updatedAt: Date.now(),
    assets: assets.map((asset) => ({
      edition: asset.edition,
      dna: asset.dna,
      metadata: asset.metadata,
      traits: asset.traits,
    })),
  };

  const db = await openDb();
  const tx = db.transaction(GENERATED_STORE, "readwrite");
  tx.objectStore(GENERATED_STORE).put(record);
  await txDone(tx);
  db.close();

  return { saved: true };
}

export async function loadGeneratedMetaOnly(
  id: string,
): Promise<{ canvasSize: number; assetCount: number } | null> {
  const db = await openDb();
  const tx = db.transaction(GENERATED_STORE, "readonly");
  const record = await new Promise<GeneratedRecord | undefined>((resolve, reject) => {
    const request = tx.objectStore(GENERATED_STORE).get(id);
    request.onsuccess = () =>
      resolve(request.result as GeneratedRecord | undefined);
    request.onerror = () => reject(request.error);
  });
  await txDone(tx);
  db.close();
  if (!record?.assets?.length) return null;
  return { canvasSize: record.canvasSize, assetCount: record.assets.length };
}

export async function loadGeneratedRecord(
  id: string,
): Promise<{
  canvasSize: number;
  assets: GeneratedAsset[];
} | null> {
  const db = await openDb();
  const metaTx = db.transaction(GENERATED_STORE, "readonly");
  const metaStore = metaTx.objectStore(GENERATED_STORE);
  const record = await new Promise<
    | (GeneratedRecord & { assets: Array<PersistedGeneratedMeta & { imageBlob?: Blob }> })
    | undefined
  >((resolve, reject) => {
    const request = metaStore.get(id);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  await txDone(metaTx);

  if (!record || !record.assets?.length) {
    db.close();
    return null;
  }

  // Legacy v2 format stored blobs inline — drop it (would freeze on restore).
  const hasInlineBlobs = record.assets.some((asset) => {
    const legacy = asset as PersistedGeneratedMeta & { imageBlob?: Blob };
    return legacy.imageBlob instanceof Blob;
  });
  if (hasInlineBlobs) {
    db.close();
    await deleteGeneratedRecord(id);
    return null;
  }

  const assets: GeneratedAsset[] = [];
  const chunkSize = 16;
  for (let i = 0; i < record.assets.length; i += chunkSize) {
    const chunk = record.assets.slice(i, i + chunkSize);
    const imgTx = db.transaction(GENERATED_IMAGES_STORE, "readonly");
    const imgStore = imgTx.objectStore(GENERATED_IMAGES_STORE);

    const blobs = await Promise.all(
      chunk.map(
        (asset) =>
          new Promise<Blob | undefined>((resolve, reject) => {
            const request = imgStore.get(generatedImageKey(id, asset.edition));
            request.onsuccess = () => resolve(request.result as Blob | undefined);
            request.onerror = () => reject(request.error);
          }),
      ),
    );
    await txDone(imgTx);

    for (let j = 0; j < chunk.length; j++) {
      const meta = chunk[j]!;
      const blob = blobs[j];
      if (!blob) continue;
      assets.push({
        edition: meta.edition,
        dna: meta.dna,
        imageBlob: blob,
        // Only the UI's last-20 list needs previews — create those later.
        previewUrl: "",
        metadata: meta.metadata,
        traits: meta.traits,
      });
    }

    await yieldToBrowser();
  }

  db.close();
  if (assets.length === 0) return null;
  return { canvasSize: record.canvasSize, assets };
}

export async function deleteGeneratedRecord(id: string): Promise<void> {
  const db = await openDb();
  const metaTx = db.transaction(GENERATED_STORE, "readonly");
  const existing = await new Promise<GeneratedRecord | undefined>((resolve, reject) => {
    const request = metaTx.objectStore(GENERATED_STORE).get(id);
    request.onsuccess = () =>
      resolve(request.result as GeneratedRecord | undefined);
    request.onerror = () => reject(request.error);
  });
  await txDone(metaTx);

  const tx = db.transaction(
    [GENERATED_STORE, GENERATED_IMAGES_STORE],
    "readwrite",
  );
  tx.objectStore(GENERATED_STORE).delete(id);
  if (existing?.assets) {
    const images = tx.objectStore(GENERATED_IMAGES_STORE);
    for (const asset of existing.assets) {
      images.delete(generatedImageKey(id, asset.edition));
    }
  }
  await txDone(tx);
  db.close();
}
