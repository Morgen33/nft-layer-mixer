"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Ban, X } from "lucide-react";
import { GlowButton } from "@/components/ui/primitives";
import { analyzeExclusions } from "@/lib/rules-engine";
import { useGeneratorStore } from "@/lib/store";

function formatBanLabel(
  sourceLayerName: string,
  sourceTraitName: string,
  targetLayerName: string,
  targetTraitName: string,
): string {
  return `(${sourceLayerName}) ${sourceTraitName} <-> (${targetLayerName}) ${targetTraitName}`;
}

export function IncompatibilityRulesModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const layers = useGeneratorStore((s) => s.layers);
  const dependencies = useGeneratorStore((s) => s.dependencies);
  const exclusions = useGeneratorStore((s) => s.exclusions);
  const addExclusionBatch = useGeneratorStore((s) => s.addExclusionBatch);
  const removeExclusion = useGeneratorStore((s) => s.removeExclusion);
  const clearExclusions = useGeneratorStore((s) => s.clearExclusions);

  const [sourceLayerId, setSourceLayerId] = useState("");
  const [sourceTraitId, setSourceTraitId] = useState("");
  const [targetLayerId, setTargetLayerId] = useState("");
  const [targetTraitIds, setTargetTraitIds] = useState<Set<string>>(new Set());
  const [analysis, setAnalysis] = useState<string[] | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const sourceLayer = layers.find((l) => l.id === sourceLayerId);
  const targetLayer = layers.find((l) => l.id === targetLayerId);

  useEffect(() => {
    if (!open) return;
    if (layers.length === 0) return;

    setSourceLayerId((current) => current || layers[0].id);
    setTargetLayerId((current) => current || layers[0].id);
  }, [open, layers]);

  useEffect(() => {
    if (!sourceLayer?.traits.some((t) => t.id === sourceTraitId)) {
      setSourceTraitId(sourceLayer?.traits[0]?.id ?? "");
    }
  }, [sourceLayer, sourceTraitId]);

  useEffect(() => {
    setTargetTraitIds(new Set());
  }, [targetLayerId]);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  const sortedRules = useMemo(
    () =>
      exclusions.map((rule) => {
        const layerA = layers.find((l) => l.id === rule.layerAId);
        const layerB = layers.find((l) => l.id === rule.layerBId);
        const traitA = layerA?.traits.find((t) => t.id === rule.traitAId);
        const traitB = layerB?.traits.find((t) => t.id === rule.traitBId);
        return {
          id: rule.id,
          label: formatBanLabel(
            layerA?.name ?? "?",
            traitA?.name ?? "?",
            layerB?.name ?? "?",
            traitB?.name ?? "?",
          ),
        };
      }),
    [exclusions, layers],
  );

  if (!open) return null;

  const selectClass =
    "w-full rounded-lg border border-zinc-700 bg-[#0d0d12] px-3 py-2 text-sm text-zinc-200 outline-none focus:border-emerald-500/50";

  const toggleTargetTrait = (traitId: string) => {
    setTargetTraitIds((current) => {
      const next = new Set(current);
      if (next.has(traitId)) next.delete(traitId);
      else next.add(traitId);
      return next;
    });
  };

  const selectAllTargets = () => {
    setTargetTraitIds(new Set(targetLayer?.traits.map((t) => t.id) ?? []));
  };

  const clearTargetSelection = () => {
    setTargetTraitIds(new Set());
  };

  const handleAddRule = () => {
    if (!sourceLayerId || !sourceTraitId || !targetLayerId) {
      setFeedback("Pick a source trait and at least one target trait.");
      return;
    }

    const targets = Array.from(targetTraitIds)
      .filter((traitId) => traitId !== sourceTraitId || targetLayerId !== sourceLayerId)
      .map((traitId) => ({ layerId: targetLayerId, traitId }));

    if (targets.length === 0) {
      setFeedback("Select at least one target trait to ban.");
      return;
    }

    const added = addExclusionBatch(sourceLayerId, sourceTraitId, targets);
    if (added === 0) {
      setFeedback("Those bans already exist.");
      return;
    }

    setFeedback(`Added ${added} ban${added === 1 ? "" : "s"}.`);
    setAnalysis(null);
    clearTargetSelection();
  };

  const handleAnalyze = () => {
    setAnalysis(analyzeExclusions(layers, dependencies, exclusions));
  };

  const handleClearAll = () => {
    if (exclusions.length === 0) return;
    const confirmed = window.confirm(
      `Remove all ${exclusions.length} incompatibility rules?`,
    );
    if (!confirmed) return;
    clearExclusions();
    setAnalysis(null);
    setFeedback("All bans cleared.");
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="incompatibility-rules-title"
      onClick={onClose}
    >
      <div
        className="flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl border border-zinc-800 bg-[#12121a] shadow-2xl sm:rounded-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-center justify-between gap-3 border-b border-zinc-800 px-4 py-3 sm:px-5">
          <div className="flex items-center gap-2">
            <Ban size={18} className="text-red-400" />
            <h2
              id="incompatibility-rules-title"
              className="text-base font-semibold text-zinc-100"
            >
              Incompatibility Rules
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <GlowButton
              variant="ghost"
              className="text-xs"
              onClick={handleAnalyze}
            >
              <AlertTriangle size={14} className="text-amber-400" />
              Analyze Logic
            </GlowButton>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-2 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
              aria-label="Close"
            >
              <X size={18} />
            </button>
          </div>
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-5">
          <section className="rounded-xl border border-zinc-800 bg-[#0d0d12] p-4">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-400">
              Create New Rule
            </h3>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-[11px] text-zinc-500">
                  Source layer
                </label>
                <select
                  className={selectClass}
                  value={sourceLayerId}
                  onChange={(e) => {
                    setSourceLayerId(e.target.value);
                    setSourceTraitId("");
                  }}
                >
                  {layers.map((layer) => (
                    <option key={layer.id} value={layer.id}>
                      {layer.name}
                    </option>
                  ))}
                </select>

                <div className="mt-3 max-h-40 space-y-1 overflow-y-auto rounded-lg border border-zinc-800 p-2">
                  {sourceLayer?.traits.map((trait) => (
                    <label
                      key={trait.id}
                      className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-zinc-300 hover:bg-zinc-900"
                    >
                      <input
                        type="radio"
                        name="source-trait"
                        checked={sourceTraitId === trait.id}
                        onChange={() => setSourceTraitId(trait.id)}
                        className="accent-emerald-500"
                      />
                      <span className="truncate">{trait.name}</span>
                    </label>
                  ))}
                  {sourceLayer?.traits.length === 0 && (
                    <p className="px-2 py-3 text-center text-xs text-zinc-600">
                      No traits in this layer
                    </p>
                  )}
                </div>
              </div>

              <div>
                <div className="mb-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-center text-xs font-semibold uppercase tracking-wide text-red-300">
                  Cannot mix with (Bans)
                </div>

                <label className="mb-1.5 block text-[11px] text-zinc-500">
                  Target layer
                </label>
                <select
                  className={selectClass}
                  value={targetLayerId}
                  onChange={(e) => setTargetLayerId(e.target.value)}
                >
                  {layers.map((layer) => (
                    <option key={layer.id} value={layer.id}>
                      {layer.name}
                    </option>
                  ))}
                </select>

                <div className="mt-2 flex items-center justify-between">
                  <span className="text-[11px] text-zinc-500">
                    Target layer items
                  </span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={selectAllTargets}
                      className="text-[10px] font-semibold uppercase tracking-wide text-emerald-400 hover:text-emerald-300"
                    >
                      All
                    </button>
                    <button
                      type="button"
                      onClick={clearTargetSelection}
                      className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500 hover:text-zinc-300"
                    >
                      None
                    </button>
                  </div>
                </div>

                <div className="mt-2 max-h-40 space-y-1 overflow-y-auto rounded-lg border border-zinc-800 p-2">
                  {targetLayer?.traits.map((trait) => (
                    <label
                      key={trait.id}
                      className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-zinc-300 hover:bg-zinc-900"
                    >
                      <input
                        type="checkbox"
                        checked={targetTraitIds.has(trait.id)}
                        onChange={() => toggleTargetTrait(trait.id)}
                        className="accent-emerald-500"
                      />
                      <span className="truncate">{trait.name}</span>
                    </label>
                  ))}
                  {targetLayer?.traits.length === 0 && (
                    <p className="px-2 py-3 text-center text-xs text-zinc-600">
                      No traits in this layer
                    </p>
                  )}
                </div>
              </div>
            </div>

            {feedback && (
              <p className="mt-3 text-xs text-amber-400/90">{feedback}</p>
            )}

            <GlowButton
              variant="primary"
              className="mt-4 w-full"
              onClick={handleAddRule}
              disabled={layers.length === 0}
            >
              Add Rule
            </GlowButton>

            <GlowButton
              variant="danger"
              className="mt-2 w-full"
              onClick={handleClearAll}
              disabled={exclusions.length === 0}
            >
              Clear All Rules
            </GlowButton>
          </section>

          {analysis && (
            <section className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
              <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-amber-300">
                <AlertTriangle size={14} />
                Logic analysis
              </h3>
              <ul className="space-y-1.5 text-xs leading-relaxed text-amber-100/90">
                {analysis.map((line) => (
                  <li key={line}>• {line}</li>
                ))}
              </ul>
            </section>
          )}

          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Active bans ({exclusions.length})
            </h3>
            <div className="max-h-56 space-y-2 overflow-y-auto rounded-xl border border-zinc-800 bg-[#0d0d12] p-2">
              {sortedRules.length === 0 && (
                <p className="px-2 py-6 text-center text-xs text-zinc-600">
                  No bans yet. Pick a source trait and target traits above.
                </p>
              )}
              {sortedRules.map((rule) => (
                <div
                  key={rule.id}
                  className="flex items-start justify-between gap-3 rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2"
                >
                  <div className="min-w-0 text-xs leading-relaxed text-zinc-300">
                    <span className="font-bold text-red-400">✕ BAN:</span>{" "}
                    {rule.label}
                  </div>
                  <button
                    type="button"
                    onClick={() => removeExclusion(rule.id)}
                    className="shrink-0 rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-red-400"
                    aria-label="Remove rule"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
