import { sortLayerGroupsByStack } from "./layer-stack-order";

export type FileWithPath = {
  file: File;
  relativePath: string;
};

export type LayerImportGroup = {
  layerName: string;
  files: File[];
};

const IMAGE_EXT = /\.(png|jpe?g|webp|gif)$/i;

export function isImageFile(file: File): boolean {
  if (file.type.startsWith("image/")) return true;
  return IMAGE_EXT.test(file.name);
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\/+/, "");
}

export function humanizeLayerName(name: string): string {
  return (
    name
      .replace(/[-_]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/\b\w/g, (c) => c.toUpperCase()) || name
  );
}

/** Read webkitRelativePath from folder picker input. */
export function filesFromFileList(fileList: FileList | File[]): FileWithPath[] {
  return Array.from(fileList).map((file) => {
    const relativePath =
      "webkitRelativePath" in file && file.webkitRelativePath
        ? normalizePath(String(file.webkitRelativePath))
        : file.name;
    return { file, relativePath };
  });
}

interface FileSystemEntryLike {
  isFile: boolean;
  isDirectory: boolean;
  name: string;
}

interface FileSystemFileEntryLike extends FileSystemEntryLike {
  file: (
    success: (file: File) => void,
    error?: (err: DOMException) => void,
  ) => void;
}

interface FileSystemDirectoryEntryLike extends FileSystemEntryLike {
  createReader: () => {
    readEntries: (
      success: (entries: FileSystemEntryLike[]) => void,
      error?: (err: DOMException) => void,
    ) => void;
  };
}

async function readAllDirectoryEntries(
  reader: ReturnType<FileSystemDirectoryEntryLike["createReader"]>,
): Promise<FileSystemEntryLike[]> {
  const entries: FileSystemEntryLike[] = [];
  while (true) {
    const batch = await new Promise<FileSystemEntryLike[]>((resolve, reject) => {
      reader.readEntries(resolve, reject);
    });
    if (batch.length === 0) break;
    entries.push(...batch);
  }
  return entries;
}

async function traverseEntry(
  entry: FileSystemEntryLike,
  basePath: string,
): Promise<FileWithPath[]> {
  if (entry.isFile) {
    const file = await new Promise<File>((resolve, reject) => {
      (entry as FileSystemFileEntryLike).file(resolve, reject);
    });
    const relativePath = basePath ? `${basePath}/${file.name}` : file.name;
    return [{ file, relativePath: normalizePath(relativePath) }];
  }

  if (entry.isDirectory) {
    const dir = entry as FileSystemDirectoryEntryLike;
    const reader = dir.createReader();
    const children = await readAllDirectoryEntries(reader);
    const nested: FileWithPath[] = [];
    for (const child of children) {
      const childPath = basePath ? `${basePath}/${child.name}` : child.name;
      nested.push(...(await traverseEntry(child, childPath)));
    }
    return nested;
  }

  return [];
}

/** Collect files from drag-and-drop (supports folders). */
export async function collectFilesFromDataTransfer(
  dataTransfer: DataTransfer,
): Promise<FileWithPath[]> {
  const items = Array.from(dataTransfer.items ?? []);
  const fromEntries: FileWithPath[] = [];

  for (const item of items) {
    if (item.kind !== "file") continue;
    const entry = item.webkitGetAsEntry?.() as FileSystemEntryLike | null;
    if (entry) {
      fromEntries.push(...(await traverseEntry(entry, entry.name)));
      continue;
    }
    const file = item.getAsFile();
    if (file) {
      fromEntries.push({ file, relativePath: file.name });
    }
  }

  if (fromEntries.length > 0) return fromEntries;

  return filesFromFileList(dataTransfer.files);
}

/**
 * Group dropped/picked files into layers.
 * - Single layer target: all images go to that layer.
 * - Auto mode: each subfolder becomes a layer (common root folder is stripped).
 */
export function groupFilesIntoLayers(
  files: FileWithPath[],
  options?: { targetLayerName?: string },
): LayerImportGroup[] {
  const images = files.filter((f) => isImageFile(f.file));
  if (images.length === 0) return [];

  if (options?.targetLayerName) {
    return [
      {
        layerName: options.targetLayerName,
        files: images.map((f) => f.file),
      },
    ];
  }

  const parsed = images.map((item) => {
    const parts = normalizePath(item.relativePath).split("/").filter(Boolean);
    return {
      file: item.file,
      dirs: parts.slice(0, -1),
    };
  });

  const withDirs = parsed.filter((p) => p.dirs.length > 0);
  if (withDirs.length === 0) {
    return [{ layerName: "Imported", files: images.map((f) => f.file) }];
  }

  const minDirLen = Math.min(...withDirs.map((p) => p.dirs.length));
  let commonPrefix = 0;
  for (let i = 0; i < minDirLen; i++) {
    const segment = withDirs[0].dirs[i];
    if (withDirs.every((p) => p.dirs[i] === segment)) {
      commonPrefix++;
    } else {
      break;
    }
  }

  const groups = new Map<string, File[]>();

  for (const item of parsed) {
    if (item.dirs.length === 0) {
      const bucket = groups.get("Imported") ?? [];
      bucket.push(item.file);
      groups.set("Imported", bucket);
      continue;
    }

    const layerSegment = item.dirs[commonPrefix] ?? item.dirs[item.dirs.length - 1];
    const bucket = groups.get(layerSegment) ?? [];
    bucket.push(item.file);
    groups.set(layerSegment, bucket);
  }

  return sortLayerGroupsByStack(
    Array.from(groups.entries())
      .filter(([, layerFiles]) => layerFiles.length > 0)
      .map(([layerName, layerFiles]) => ({
        layerName: humanizeLayerName(layerName),
        files: layerFiles,
      })),
  );
}
