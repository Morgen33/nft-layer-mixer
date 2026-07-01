import { createPlaceholderDataUrl } from "./compositor";
import { defaultWeightForTier } from "./rarity";
import type { Layer, RarityTier, Trait } from "./types";

let idCounter = 0;
function uid(prefix: string): string {
  return `${prefix}-${++idCounter}-${Math.random().toString(36).slice(2, 7)}`;
}

function makeTrait(
  name: string,
  color: string,
  weight: number,
  tier: RarityTier,
): Trait {
  return {
    id: uid("trait"),
    name,
    weight,
    tier,
    imageUrl: createPlaceholderDataUrl(color, name),
  };
}

function makeLayer(
  name: string,
  order: number,
  traits: Trait[],
  optional = false,
): Layer {
  return { id: uid("layer"), name, order, optional, traits };
}

export function createDemoLayers(): Layer[] {
  return [
    makeLayer("Background", 0, [
      makeTrait("Void Black", "#0d0d12", 18, "common"),
      makeTrait("Neon Grid", "#1a1a2e", 16, "common"),
      makeTrait("Cyber Sunset", "#2d1b4e", 14, "common"),
      makeTrait("Deep Ocean", "#0c4a6e", 12, "common"),
      makeTrait("Quantum Field", "#4c1d95", 10, "uncommon"),
      makeTrait("Solar Flare", "#ea580c", 8, "rare"),
      makeTrait("Aurora Prime", "#7c3aed", 6, "legendary"),
    ], false),
    makeLayer("Body", 1, [
      makeTrait("Chrome Suit", "#374151", 18, "common"),
      makeTrait("Holo Skin", "#0891b2", 16, "common"),
      makeTrait("Mech Frame", "#64748b", 14, "common"),
      makeTrait("Carbon Shell", "#52525b", 12, "common"),
      makeTrait("Bio Mesh", "#059669", 10, "uncommon"),
      makeTrait("Plasma Core", "#7c3aed", 8, "rare"),
      makeTrait("Titan Alloy", "#eab308", 6, "legendary"),
    ], false),
    makeLayer("Headwear", 2, [
      makeTrait("None", "#1f2937", 20, "common"),
      makeTrait("Cap", "#44403c", 16, "common"),
      makeTrait("Cyber Hoodie", "#059669", 14, "common"),
      makeTrait("Visor Cap", "#0369a1", 12, "common"),
      makeTrait("Giant Top Hat", "#b45309", 10, "uncommon"),
      makeTrait("Halo Ring", "#06b6d4", 8, "rare"),
      makeTrait("Crown Protocol", "#eab308", 6, "legendary"),
    ], true),
    makeLayer("Eyewear", 3, [
      makeTrait("None", "#111827", 22, "common"),
      makeTrait("Shades", "#27272a", 16, "common"),
      makeTrait("Laser Visor", "#06b6d4", 14, "common"),
      makeTrait("Mono Lens", "#4b5563", 12, "common"),
      makeTrait("Future Visor", "#8b5cf6", 10, "uncommon"),
      makeTrait("Prism Eyes", "#ec4899", 8, "rare"),
      makeTrait("Void Lens", "#be123c", 6, "legendary"),
    ], true),
    makeLayer("Accessory", 4, [
      makeTrait("None", "#0f172a", 22, "common"),
      makeTrait("Badge", "#334155", 16, "common"),
      makeTrait("Data Chip", "#14b8a6", 14, "common"),
      makeTrait("Chain", "#78716c", 12, "common"),
      makeTrait("Neural Link", "#6366f1", 10, "uncommon"),
      makeTrait("Power Cell", "#f59e0b", 8, "rare"),
      makeTrait("Singularity Orb", "#f43f5e", 6, "legendary"),
    ], true),
  ];
}

export function createNoneTrait(): Trait {
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  const ctx = canvas.getContext("2d");
  if (ctx) ctx.clearRect(0, 0, 1, 1);

  return {
    id: uid("trait"),
    name: "None",
    weight: defaultWeightForTier("common"),
    tier: "common",
    imageUrl: canvas.toDataURL("image/png"),
  };
}

export function parseFilenameWeight(filename: string): number {
  const base = filename.replace(/\.[^.]+$/, "");
  const match = base.match(/#(\d+(?:\.\d+)?)$/);
  if (match) return Math.max(0, parseFloat(match[1]));
  return 1;
}

export function parseFilenameName(filename: string): string {
  const base = filename.replace(/\.[^.]+$/, "");
  return base.replace(/#\d+(?:\.\d+)?$/, "").replace(/[-_]/g, " ").trim() || base;
}

export async function loadTraitsFromFiles(
  files: FileList | File[],
): Promise<Trait[]> {
  const fileArray = Array.from(files).filter((f) =>
    f.type.startsWith("image/"),
  );
  const traits: Trait[] = [];

  for (const file of fileArray) {
    const url = URL.createObjectURL(file);
    traits.push({
      id: uid("trait"),
      name: parseFilenameName(file.name),
      weight: parseFilenameWeight(file.name),
      tier: "common",
      imageUrl: url,
    });
  }

  return traits;
}

export function revokeLayerUrls(layers: Layer[]) {
  for (const layer of layers) {
    for (const trait of layer.traits) {
      if (trait.imageUrl.startsWith("blob:")) {
        URL.revokeObjectURL(trait.imageUrl);
      }
    }
  }
}
