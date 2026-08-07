"use client";

import type {
  DependencyRule,
  ExclusionRule,
  Layer,
  MetadataConfig,
} from "./types";

export const DEFAULT_BATCH_SIZE = 1_000;
export const COLLECTION_PROGRESS_VERSION = 1 as const;

const DB_NAME = "nft-layer-mixer";
const DB_VERSION = 4;
const COLLECTION_RUNS_STORE = "collection-runs";

export interface CollectionRunBatchSummary {
  batchNumber: number;
  fromEdition: number;
  toEdition: number;
  count: number;
  completedAt: number;
}

export interface CollectionRun {
  id: string;
  version: typeof COLLECTION_PROGRESS_VERSION;
  name: string;
  projectId: string;
  totalTarget: number;
  batchSize: number;
  nextEdition: number;
  completedCount: number;
  canvasSize: number;
  fingerprint: string;
  usedDna: string[];
  batches: CollectionRunBatchSummary[];
  metadataNamePrefix: string;
  createdAt: number;
  updatedAt: number;
}

export interface CollectionProgressManifest {
  version: typeof COLLECTION_PROGRESS_VERSION;
  kind: "nft-layer-mixer-collection-progress";
  run: CollectionRun;
  exportedAt: number;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () =>
      reject(request.error ?? new Error("IndexedDB failed"));
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("projects")) {
        db.createObjectStore("projects", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("images")) {
        db.createObjectStore("images");
      }
      if (!db.objectStoreNames.contains("generated")) {
        db.createObjectStore("generated", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("generated-images")) {
        db.createObjectStore("generated-images");
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
    tx.onerror = () =>
      reject(tx.error ?? new Error("IndexedDB transaction failed"));
    tx.onabort = () =>
      reject(tx.error ?? new Error("IndexedDB transaction aborted"));
  });
}

/** Stable fingerprint so batches can't continue after layers/rules change. */
export function buildCollectionFingerprint(
  layers: Layer[],
  dependencies: DependencyRule[],
  exclusions: ExclusionRule[],
  canvasSize: number,
): string {
  const layerPart = layers
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((layer) => ({
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
    }));

  const depPart = dependencies.map((rule) => ({
    sourceLayerId: rule.sourceLayerId,
    sourceTraitId: rule.sourceTraitId,
    targetLayerId: rule.targetLayerId,
    targetTraitId: rule.targetTraitId,
  }));

  const exclPart = exclusions.map((rule) => ({
    layerAId: rule.layerAId,
    traitAId: rule.traitAId,
    layerBId: rule.layerBId,
    traitBId: rule.traitBId,
  }));

  return JSON.stringify({ layerPart, depPart, exclPart, canvasSize });
}

export function createCollectionRun(input: {
  name: string;
  projectId: string;
  totalTarget: number;
  batchSize?: number;
  canvasSize: number;
  fingerprint: string;
  metadataNamePrefix: string;
}): CollectionRun {
  const now = Date.now();
  const batchSize = Math.max(1, input.batchSize ?? DEFAULT_BATCH_SIZE);
  const totalTarget = Math.max(1, Math.floor(input.totalTarget));

  return {
    id: `run-${now}`,
    version: COLLECTION_PROGRESS_VERSION,
    name: input.name.trim() || "Collection Run",
    projectId: input.projectId,
    totalTarget,
    batchSize,
    nextEdition: 1,
    completedCount: 0,
    canvasSize: input.canvasSize,
    fingerprint: input.fingerprint,
    usedDna: [],
    batches: [],
    metadataNamePrefix: input.metadataNamePrefix,
    createdAt: now,
    updatedAt: now,
  };
}

export function getNextBatchCount(run: CollectionRun): number {
  const remaining = Math.max(0, run.totalTarget - run.completedCount);
  return Math.min(run.batchSize, remaining);
}

export function isCollectionRunComplete(run: CollectionRun): boolean {
  return run.completedCount >= run.totalTarget;
}

export function appendBatchToRun(
  run: CollectionRun,
  dnas: string[],
): CollectionRun {
  if (dnas.length === 0) return run;

  const fromEdition = run.nextEdition;
  const toEdition = fromEdition + dnas.length - 1;
  const used = new Set(run.usedDna);
  for (const dna of dnas) {
    if (used.has(dna)) {
      throw new Error(`Duplicate DNA detected in batch: ${dna}`);
    }
    used.add(dna);
  }

  return {
    ...run,
    usedDna: [...used],
    nextEdition: toEdition + 1,
    completedCount: run.completedCount + dnas.length,
    batches: [
      ...run.batches,
      {
        batchNumber: run.batches.length + 1,
        fromEdition,
        toEdition,
        count: dnas.length,
        completedAt: Date.now(),
      },
    ],
    updatedAt: Date.now(),
  };
}

export function toProgressManifest(run: CollectionRun): CollectionProgressManifest {
  return {
    version: COLLECTION_PROGRESS_VERSION,
    kind: "nft-layer-mixer-collection-progress",
    run,
    exportedAt: Date.now(),
  };
}

export function parseProgressManifest(raw: unknown): CollectionRun {
  if (!raw || typeof raw !== "object") {
    throw new Error("Invalid progress file.");
  }

  const data = raw as Partial<CollectionProgressManifest> & {
    usedDna?: string[];
  };

  // Accept either wrapped manifest or bare run object.
  const runCandidate =
    data.kind === "nft-layer-mixer-collection-progress" && data.run
      ? data.run
      : (raw as CollectionRun);

  if (!runCandidate || typeof runCandidate !== "object") {
    throw new Error("Progress file is missing collection run data.");
  }

  if (runCandidate.version !== COLLECTION_PROGRESS_VERSION) {
    throw new Error("Unsupported collection progress version.");
  }

  if (!Array.isArray(runCandidate.usedDna)) {
    throw new Error("Progress file is missing DNA history.");
  }

  if (
    !runCandidate.id ||
    !runCandidate.fingerprint ||
    !Number.isFinite(runCandidate.totalTarget) ||
    !Number.isFinite(runCandidate.nextEdition) ||
    !Number.isFinite(runCandidate.completedCount)
  ) {
    throw new Error("Progress file is incomplete or corrupted.");
  }

  if (runCandidate.completedCount !== runCandidate.usedDna.length) {
    throw new Error(
      "Progress file DNA count does not match completed editions.",
    );
  }

  if (runCandidate.nextEdition !== runCandidate.completedCount + 1) {
    throw new Error("Progress file edition numbering is inconsistent.");
  }

  if (runCandidate.completedCount > runCandidate.totalTarget) {
    throw new Error("Progress file exceeds its total target.");
  }

  return {
    ...runCandidate,
    usedDna: [...runCandidate.usedDna],
    batches: Array.isArray(runCandidate.batches) ? runCandidate.batches : [],
  };
}

export function assertRunCompatible(
  run: CollectionRun,
  layers: Layer[],
  dependencies: DependencyRule[],
  exclusions: ExclusionRule[],
  canvasSize: number,
): void {
  const fingerprint = buildCollectionFingerprint(
    layers,
    dependencies,
    exclusions,
    canvasSize,
  );
  if (fingerprint !== run.fingerprint) {
    throw new Error(
      "Layers, rules, or canvas size changed since this collection run started. Reset the run or restore the original project settings.",
    );
  }
}

export async function persistCollectionRun(run: CollectionRun): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(COLLECTION_RUNS_STORE, "readwrite");
  tx.objectStore(COLLECTION_RUNS_STORE).put(run);
  await txDone(tx);
  db.close();
}

export async function loadCollectionRun(
  id: string,
): Promise<CollectionRun | null> {
  const db = await openDb();
  const tx = db.transaction(COLLECTION_RUNS_STORE, "readonly");
  const record = await new Promise<CollectionRun | undefined>((resolve, reject) => {
    const request = tx.objectStore(COLLECTION_RUNS_STORE).get(id);
    request.onsuccess = () => resolve(request.result as CollectionRun | undefined);
    request.onerror = () => reject(request.error);
  });
  await txDone(tx);
  db.close();
  return record ?? null;
}

export async function loadActiveCollectionRun(
  projectId: string,
): Promise<CollectionRun | null> {
  const db = await openDb();
  const tx = db.transaction(COLLECTION_RUNS_STORE, "readonly");
  const records = await new Promise<CollectionRun[]>((resolve, reject) => {
    const request = tx.objectStore(COLLECTION_RUNS_STORE).getAll();
    request.onsuccess = () => resolve((request.result as CollectionRun[]) ?? []);
    request.onerror = () => reject(request.error);
  });
  await txDone(tx);
  db.close();

  const matching = records
    .filter((run) => run.projectId === projectId)
    .sort((a, b) => b.updatedAt - a.updatedAt);

  return matching[0] ?? null;
}

export async function deleteCollectionRun(id: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(COLLECTION_RUNS_STORE, "readwrite");
  tx.objectStore(COLLECTION_RUNS_STORE).delete(id);
  await txDone(tx);
  db.close();
}

export function downloadProgressManifest(run: CollectionRun): void {
  const manifest = toProgressManifest(run);
  const blob = new Blob([JSON.stringify(manifest, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${slugify(run.name)}-progress-batch${run.batches.length || 0}.json`;
  a.rel = "noopener";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  window.setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 5_000);
}

function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "collection"
  );
}

export type { MetadataConfig };
