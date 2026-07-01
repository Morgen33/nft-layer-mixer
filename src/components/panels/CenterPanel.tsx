"use client";

import {
  Dices,
  Dna,
  Gauge,
  Pause,
  Play,
  Sparkles,
  Timer,
  Zap,
} from "lucide-react";
import { GlowButton, Panel, StatPill, TierBadge } from "@/components/ui/primitives";
import { formatPercentage } from "@/lib/rarity";
import { useGeneratorStore } from "@/lib/store";

function DistributionChart({
  distribution,
  total,
  layers,
}: {
  distribution: Record<string, Record<string, number>>;
  total: number;
  layers: { name: string; traits: { name: string; weight: number }[] }[];
}) {
  if (total === 0) return null;

  return (
    <div className="max-h-48 space-y-3 overflow-y-auto">
      {layers.map((layer) => {
        const layerCounts = distribution[layer.name] ?? {};
        const layerTotal = Object.values(layerCounts).reduce((a, b) => a + b, 0);
        if (layerTotal === 0) return null;

        return (
          <div key={layer.name}>
            <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1">
              {layer.name}
            </div>
            <div className="space-y-1">
              {layer.traits.map((trait) => {
                const count = layerCounts[trait.name] ?? 0;
                const actualPct = layerTotal > 0 ? (count / layerTotal) * 100 : 0;
                const expectedTotal = layer.traits.reduce((s, t) => s + t.weight, 0);
                const expectedPct =
                  expectedTotal > 0 ? (trait.weight / expectedTotal) * 100 : 0;
                const delta = actualPct - expectedPct;

                return (
                  <div key={trait.name} className="grid grid-cols-[minmax(64px,96px)_1fr_auto] items-center gap-2 text-[10px] sm:grid-cols-[6rem_1fr_auto_auto]">
                    <span className="truncate text-zinc-400">{trait.name}</span>
                    <div className="flex-1 h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-emerald-500/70 transition-all"
                        style={{ width: `${Math.min(actualPct, 100)}%` }}
                      />
                    </div>
                    <span className="w-10 text-right tabular-nums text-zinc-400">
                      {formatPercentage(actualPct)}%
                    </span>
                    <span
                      className={`hidden text-right tabular-nums sm:block ${
                        Math.abs(delta) > 5 ? "text-amber-400" : "text-zinc-600"
                      }`}
                    >
                      {delta >= 0 ? "+" : ""}
                      {delta.toFixed(1)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function CenterPanel() {
  const previewUrl = useGeneratorStore((s) => s.previewUrl);
  const previewDna = useGeneratorStore((s) => s.previewDna);
  const previewTraits = useGeneratorStore((s) => s.previewTraits);
  const rollDice = useGeneratorStore((s) => s.rollDice);
  const isGenerating = useGeneratorStore((s) => s.isGenerating);
  const generationProgress = useGeneratorStore((s) => s.generationProgress);
  const generationTotal = useGeneratorStore((s) => s.generationTotal);
  const generationSpeed = useGeneratorStore((s) => s.generationSpeed);
  const generationEta = useGeneratorStore((s) => s.generationEta);
  const recentPreviews = useGeneratorStore((s) => s.recentPreviews);
  const traitDistribution = useGeneratorStore((s) => s.traitDistribution);
  const generatedAssets = useGeneratorStore((s) => s.generatedAssets);
  const layers = useGeneratorStore((s) => s.layers);
  const editionSize = useGeneratorStore((s) => s.editionSize);
  const getMaxCombinations = useGeneratorStore((s) => s.getMaxCombinations);
  const getMaxCombinationsLabel = useGeneratorStore((s) => s.getMaxCombinationsLabel);
  const getCollectionSizeHint = useGeneratorStore((s) => s.getCollectionSizeHint);
  const startGeneration = useGeneratorStore((s) => s.startGeneration);
  const cancelGeneration = useGeneratorStore((s) => s.cancelGeneration);
  const generationError = useGeneratorStore((s) => s.generationError);

  const maxCombos = getMaxCombinations();
  const maxCombosLabel = getMaxCombinationsLabel();
  const blocked = editionSize > maxCombos;
  const progressPct =
    generationTotal > 0
      ? Math.round((generationProgress / generationTotal) * 100)
      : 0;

  return (
    <div className="flex h-full flex-col gap-4">
      <Panel
        title="Live Canvas Preview"
        icon={<Sparkles size={16} className="text-amber-400" />}
        className="flex-shrink-0"
      >
        <div className="flex flex-col items-center gap-3 sm:gap-4">
          <div className="relative flex aspect-square w-full max-w-[min(100%,22rem)] items-center justify-center overflow-hidden rounded-xl border-2 border-zinc-800 bg-[#0d0d12] shadow-[0_0_40px_rgba(139,92,246,0.1)] sm:max-w-md">
            {previewUrl ? (
              <img
                src={previewUrl}
                alt="Preview"
                className="w-full h-full object-contain"
              />
            ) : (
              <div className="text-center text-zinc-600">
                <Sparkles size={48} className="mx-auto mb-2 opacity-30" />
                <p className="text-sm">Roll the dice to preview</p>
              </div>
            )}
            {previewDna && (
              <div className="absolute bottom-2 left-2 right-2 flex items-center justify-center gap-1.5 rounded-lg bg-black/70 px-3 py-1.5 backdrop-blur-sm">
                <Dna size={12} className="text-violet-400" />
                <code className="truncate font-mono text-[10px] text-violet-300 sm:text-xs">{previewDna}</code>
              </div>
            )}
          </div>

          <GlowButton variant="primary" onClick={rollDice} className="w-full px-6 sm:w-auto">
            <Dices size={16} /> Roll the Dice
          </GlowButton>

          {previewTraits.length > 0 && (
            <div className="w-full rounded-lg border border-zinc-800 bg-[#0d0d12] p-3">
              <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-2">
                Trait Breakdown
              </div>
              <div className="space-y-2 sm:space-y-1.5">
                {previewTraits.map((t) => (
                  <div
                    key={t.traitId}
                    className="flex flex-col gap-1 rounded-md bg-zinc-900/30 px-2 py-1.5 text-xs sm:flex-row sm:items-center sm:justify-between sm:bg-transparent sm:px-0 sm:py-0"
                  >
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <span className="text-zinc-500">{t.layerName}:</span>
                      <span className="min-w-0 truncate text-zinc-200">{t.traitName}</span>
                      <TierBadge tier={t.tier} />
                    </div>
                    <span className="font-mono text-emerald-400 tabular-nums">
                      {formatPercentage(t.percentage)}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </Panel>

      <Panel
        title="Bulk Generator"
        icon={<Zap size={16} className="text-emerald-400" />}
        className="flex-1 min-h-0"
      >
        <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
          <StatPill label="Max Combos" value={maxCombosLabel} accent="#a855f7" />
          <StatPill label="Requested" value={editionSize.toLocaleString()} accent="#22c55e" />
          <StatPill
            label="Status"
            value={isGenerating ? "Running" : generatedAssets.length > 0 ? "Done" : "Ready"}
            accent={isGenerating ? "#eab308" : "#84cc16"}
          />
        </div>

        {blocked && (
          <div className="mb-3 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-400 space-y-1">
            <p>
              Edition size exceeds maximum unique combinations ({maxCombosLabel}).
              Generation will be blocked.
            </p>
            <p className="text-red-300/90">{getCollectionSizeHint(editionSize)}</p>
          </div>
        )}

        {!blocked && editionSize >= 10_000 && (
          <div className="mb-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
            Large run ({editionSize.toLocaleString()} NFTs). Keep this tab open until export
            finishes — it may take several minutes.
          </div>
        )}

        {generationError && (
          <div className="mb-3 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-400">
            {generationError}
          </div>
        )}

        <div className="mb-4 flex gap-2">
          {!isGenerating ? (
            <GlowButton
              variant="primary"
              onClick={startGeneration}
              className="flex-1"
              disabled={blocked}
            >
              <Play size={14} /> Generate {editionSize.toLocaleString()} NFTs
            </GlowButton>
          ) : (
            <GlowButton variant="danger" onClick={cancelGeneration} className="flex-1">
              <Pause size={14} /> Cancel
            </GlowButton>
          )}
        </div>

        {(isGenerating || generatedAssets.length > 0) && (
          <>
            <div className="mb-2 flex items-center justify-between text-xs text-zinc-400">
              <span>
                {generationProgress.toLocaleString()} / {generationTotal.toLocaleString()}
              </span>
              <span>{progressPct}%</span>
            </div>
            <div className="mb-4 h-2 rounded-full bg-zinc-800 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-violet-500 transition-all duration-300"
                style={{ width: `${progressPct}%` }}
              />
            </div>

            <div className="mb-4 grid grid-cols-2 gap-2">
              <StatPill
                label="Speed"
                value={`${generationSpeed} / sec`}
                accent="#06b6d4"
              />
              <StatPill
                label="ETA"
                value={generationEta > 0 ? `${generationEta}s` : "—"}
                accent="#f59e0b"
              />
            </div>

            {recentPreviews.length > 0 && (
              <div className="mb-4">
                <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-2 flex items-center gap-1">
                  <Gauge size={10} /> Live Stream (last 4)
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {recentPreviews.map((asset) => (
                    <div
                      key={asset.edition}
                      className="aspect-square rounded-lg border border-zinc-800 overflow-hidden"
                    >
                      <img
                        src={asset.previewUrl}
                        alt={`#${asset.edition}`}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {Object.keys(traitDistribution).length > 0 && (
              <div>
                <div className="text-[10px] uppercase tracking-wider text-zinc-500 mb-2 flex items-center gap-1">
                  <Timer size={10} /> Distribution Accuracy
                </div>
                <DistributionChart
                  distribution={traitDistribution}
                  total={generationProgress}
                  layers={layers}
                />
              </div>
            )}
          </>
        )}
      </Panel>
    </div>
  );
}
