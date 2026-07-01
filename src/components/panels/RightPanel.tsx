"use client";

import { Download, FileJson, Package, Settings2, Trash2 } from "lucide-react";
import { GlowButton, Panel, StatPill } from "@/components/ui/primitives";
import { useGeneratorStore } from "@/lib/store";

export function RightPanel() {
  const metadataConfig = useGeneratorStore((s) => s.metadataConfig);
  const setMetadataConfig = useGeneratorStore((s) => s.setMetadataConfig);
  const canvasSize = useGeneratorStore((s) => s.canvasSize);
  const setCanvasSize = useGeneratorStore((s) => s.setCanvasSize);
  const editionSize = useGeneratorStore((s) => s.editionSize);
  const setEditionSize = useGeneratorStore((s) => s.setEditionSize);
  const generatedAssets = useGeneratorStore((s) => s.generatedAssets);
  const isGenerating = useGeneratorStore((s) => s.isGenerating);
  const exportZip = useGeneratorStore((s) => s.exportZip);
  const clearGeneration = useGeneratorStore((s) => s.clearGeneration);
  const getMaxCombinationsLabel = useGeneratorStore((s) => s.getMaxCombinationsLabel);
  const getCollectionSizeHint = useGeneratorStore((s) => s.getCollectionSizeHint);
  const getMaxCombinations = useGeneratorStore((s) => s.getMaxCombinations);
  const layers = useGeneratorStore((s) => s.layers);

  const maxCombos = getMaxCombinations();
  const blocked = editionSize > maxCombos;

  const inputClass =
    "w-full rounded-lg border border-zinc-700 bg-[#0d0d12] px-3 py-2.5 text-sm text-zinc-200 outline-none focus:border-violet-500/50 sm:py-2";

  return (
    <div className="flex h-full flex-col gap-4 lg:overflow-y-auto lg:pl-1">
      <Panel title="Metadata Config" icon={<FileJson size={16} className="text-cyan-400" />}>
        <div className="space-y-3">
          <label className="block">
            <span className="text-xs text-zinc-500">Collection Name</span>
            <input
              className={inputClass}
              value={metadataConfig.namePrefix}
              onChange={(e) => setMetadataConfig({ namePrefix: e.target.value })}
            />
          </label>
          <label className="block">
            <span className="text-xs text-zinc-500">Description</span>
            <textarea
              className={`${inputClass} min-h-[72px] resize-y`}
              value={metadataConfig.description}
              onChange={(e) => setMetadataConfig({ description: e.target.value })}
            />
          </label>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <label className="block">
              <span className="text-xs text-zinc-500">Symbol</span>
              <input
                className={inputClass}
                value={metadataConfig.symbol}
                onChange={(e) => setMetadataConfig({ symbol: e.target.value })}
              />
            </label>
            <label className="block">
              <span className="text-xs text-zinc-500">Royalties (bps)</span>
              <input
                type="number"
                className={inputClass}
                value={metadataConfig.sellerFeeBasisPoints}
                onChange={(e) =>
                  setMetadataConfig({
                    sellerFeeBasisPoints: parseInt(e.target.value) || 0,
                  })
                }
              />
            </label>
          </div>
          <label className="block">
            <span className="text-xs text-zinc-500">External URL</span>
            <input
              className={inputClass}
              value={metadataConfig.externalUrl}
              onChange={(e) => setMetadataConfig({ externalUrl: e.target.value })}
              placeholder="https://..."
            />
          </label>
          <label className="flex items-center gap-2 text-xs text-zinc-400">
            <input
              type="checkbox"
              checked={metadataConfig.exportSolanaManifest}
              onChange={(e) =>
                setMetadataConfig({ exportSolanaManifest: e.target.checked })
              }
              className="rounded border-zinc-600"
            />
            Include solana.json manifest
          </label>
        </div>
      </Panel>

      <Panel title="Generation Settings" icon={<Settings2 size={16} className="text-amber-400" />}>
        <div className="space-y-3">
          <label className="block">
            <span className="text-xs text-zinc-500">Edition Size</span>
            <input
              type="number"
              min={1}
              step={1}
              className={inputClass}
              value={editionSize}
              onChange={(e) => setEditionSize(parseInt(e.target.value) || 1)}
            />
          </label>
          <div className="flex flex-wrap gap-2">
            {[100, 1000, 10_000].map((size) => (
              <button
                key={size}
                type="button"
                onClick={() => setEditionSize(size)}
                className={`rounded-md border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide transition-colors ${
                  editionSize === size
                    ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-400"
                    : "border-zinc-700 text-zinc-500 hover:border-zinc-600 hover:text-zinc-300"
                }`}
              >
                {size.toLocaleString()}
              </button>
            ))}
          </div>
          {blocked && layers.length > 0 && (
            <p className="text-[11px] leading-relaxed text-red-400/90">
              {getCollectionSizeHint(editionSize)}
            </p>
          )}
          <label className="block">
            <span className="text-xs text-zinc-500">Canvas Size (px)</span>
            <select
              className={inputClass}
              value={canvasSize}
              onChange={(e) => setCanvasSize(parseInt(e.target.value))}
            >
              <option value={512}>512 × 512</option>
              <option value={1024}>1024 × 1024</option>
              <option value={2048}>2048 × 2048</option>
            </select>
          </label>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <StatPill
            label="Max Unique"
            value={getMaxCombinationsLabel()}
            accent="#a855f7"
          />
          <StatPill
            label="Generated"
            value={generatedAssets.length.toLocaleString()}
            accent="#22c55e"
          />
        </div>
      </Panel>

      <Panel title="Export" icon={<Package size={16} className="text-emerald-400" />}>
        <p className="text-xs text-zinc-500 mb-3">
          Downloads a ZIP with /images (0.png…), /metadata (ERC-721 JSON per token),
          metadata.json master manifest, and optional solana.json.
        </p>

        <GlowButton
          variant="primary"
          className="w-full mb-2"
          disabled={generatedAssets.length === 0 || isGenerating}
          onClick={exportZip}
        >
          <Download size={14} /> Export Collection ZIP
        </GlowButton>

        {generatedAssets.length > 0 && (
          <GlowButton
            variant="ghost"
            className="w-full"
            onClick={clearGeneration}
          >
            <Trash2 size={14} /> Clear Generated Assets
          </GlowButton>
        )}

        {generatedAssets.length > 0 && (
          <div className="mt-3 rounded-lg border border-zinc-800 bg-[#0d0d12] p-3">
            <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-2">
              Generation Queue
            </div>
            <div className="max-h-40 overflow-y-auto space-y-1">
              {generatedAssets.slice(-20).reverse().map((asset) => (
                <div
                  key={asset.edition}
                  className="flex min-w-0 items-center gap-2 text-xs text-zinc-400"
                >
                  <img
                    src={asset.previewUrl}
                    alt=""
                    className="h-6 w-6 rounded object-cover"
                  />
                  <span className="text-zinc-300">#{asset.edition}</span>
                  <code className="min-w-0 flex-1 truncate font-mono text-[10px] text-violet-400">
                    {asset.dna}
                  </code>
                </div>
              ))}
              {generatedAssets.length > 20 && (
                <p className="text-[10px] text-zinc-600 pt-1">
                  + {generatedAssets.length - 20} more…
                </p>
              )}
            </div>
          </div>
        )}
      </Panel>
    </div>
  );
}
