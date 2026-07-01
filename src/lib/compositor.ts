import type { Trait } from "./types";
import { isRenderableTrait } from "./trait-utils";

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
    img.src = url;
  });
}

export async function compositeTraits(
  traits: Trait[],
  width: number,
  height: number,
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");

  ctx.clearRect(0, 0, width, height);

  for (const trait of traits) {
    if (!isRenderableTrait(trait)) continue;
    const img = await loadImage(trait.imageUrl);
    ctx.drawImage(img, 0, 0, width, height);
  }

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Failed to export canvas"));
      },
      "image/png",
    );
  });
}

export function createPlaceholderDataUrl(
  color: string,
  label: string,
  size = 512,
): string {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  ctx.fillStyle = color;
  ctx.fillRect(0, 0, size, size);

  ctx.fillStyle = "rgba(255,255,255,0.15)";
  ctx.fillRect(size * 0.1, size * 0.1, size * 0.8, size * 0.8);

  ctx.fillStyle = "#ffffff";
  ctx.font = `bold ${Math.floor(size / 14)}px system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, size / 2, size / 2);

  return canvas.toDataURL("image/png");
}
