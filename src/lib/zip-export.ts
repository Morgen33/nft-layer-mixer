import JSZip from "jszip";
import type { GeneratedAsset, MetadataConfig, NftMetadata } from "./types";

export async function exportCollectionZip(
  assets: GeneratedAsset[],
  config: MetadataConfig,
  slug: string,
  onProgress?: (percent: number) => void,
): Promise<void> {
  const zip = new JSZip();
  const images = zip.folder("images");
  const metadataFolder = zip.folder("metadata");

  const allMetadata: NftMetadata[] = assets.map((a) => a.metadata);

  for (const asset of assets) {
    const index = asset.edition - 1;
    // PNGs are already compressed; storing them avoids slow, pointless re-compression.
    images?.file(`${index}.png`, asset.imageBlob, { compression: "STORE" });
    metadataFolder?.file(`${index}.json`, JSON.stringify(asset.metadata, null, 2));
  }

  zip.file(
    "metadata.json",
    JSON.stringify(
      {
        name: config.namePrefix,
        symbol: config.symbol,
        description: config.description,
        seller_fee_basis_points: config.sellerFeeBasisPoints,
        external_url: config.externalUrl,
        items: allMetadata,
      },
      null,
      2,
    ),
  );

  if (config.exportSolanaManifest) {
    zip.file(
      "solana.json",
      JSON.stringify(
        {
          name: config.namePrefix,
          symbol: config.symbol,
          description: config.description,
          seller_fee_basis_points: config.sellerFeeBasisPoints,
          external_url: config.externalUrl,
          creators: [],
          items: allMetadata.map((m) => ({
            name: m.name,
            uri: `metadata/${m.edition - 1}.json`,
          })),
        },
        null,
        2,
      ),
    );
  }

  const traitReport = buildTraitReport(assets);
  zip.file("rarity-report.json", JSON.stringify(traitReport, null, 2));

  const blob = await zip.generateAsync(
    { type: "blob", compression: "DEFLATE", compressionOptions: { level: 1 } },
    (meta) => onProgress?.(Math.round(meta.percent)),
  );

  triggerDownload(blob, `${slug || "collection"}-${Date.now()}.zip`);
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  // Defer revoke so the browser has time to start the download before the URL
  // is released; revoking synchronously can silently cancel large downloads.
  window.setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 10_000);
}

function buildTraitReport(assets: GeneratedAsset[]) {
  const total = assets.length;
  const counts: Record<string, Record<string, number>> = {};

  for (const asset of assets) {
    for (const attr of asset.metadata.attributes) {
      counts[attr.trait_type] ??= {};
      counts[attr.trait_type][attr.value] =
        (counts[attr.trait_type][attr.value] ?? 0) + 1;
    }
  }

  return Object.fromEntries(
    Object.entries(counts).map(([layer, traits]) => [
      layer,
      Object.fromEntries(
        Object.entries(traits).map(([name, count]) => [
          name,
          {
            count,
            percentage: total > 0 ? ((count / total) * 100).toFixed(2) + "%" : "0%",
          },
        ]),
      ),
    ]),
  );
}

export function revokeAssetUrls(assets: GeneratedAsset[]) {
  for (const asset of assets) {
    URL.revokeObjectURL(asset.previewUrl);
  }
}
