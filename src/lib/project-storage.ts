"use client";

import type {
  DependencyRule,
  ExclusionRule,
  Layer,
  MetadataConfig,
} from "./types";

export const AUTOSAVE_PROJECT_ID = "__autosave__";
const DB_NAME = "nft-layer-mixer";
const DB_VERSION = 1;
const PROJECTS_STORE = "projects";
const IMAGES_STORE = "images";

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

async function imageUrlToBlob(url: string): Promise<Blob> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("Could not read trait image for save.");
  }
  return response.blob();
}

async function yieldToBrowser(): Promise<void> {
  await new Promise<void>((resolve) => {
    window.setTimeout(resolve, 0);
  });
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
  const tx = db.transaction([PROJECTS_STORE, IMAGES_STORE], "readwrite");
  const projects = tx.objectStore(PROJECTS_STORE);
  const images = tx.objectStore(IMAGES_STORE);

  projects.delete(id);
  for (const layer of record.data.layers) {
    for (const trait of layer.traits) {
      images.delete(trait.id);
    }
  }

  await txDone(tx);
  db.close();
}
