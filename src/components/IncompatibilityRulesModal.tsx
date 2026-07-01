"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ChevronDown, X } from "lucide-react";
import { analyzeExclusions } from "@/lib/rules-engine";
import { useGeneratorStore } from "@/lib/store";
import type { Trait } from "@/lib/types";

function formatBanLabel(
  sourceLayerName: string,
  sourceTraitName: string,
  targetLayerName: string,
  targetTraitName: string,
): string {
  return `[${sourceLayerName}] ${sourceTraitName} <-> [${targetLayerName}] ${targetTraitName}`;
}

function LayerTraitRow({
  layerId,
  layers,
  onLayerChange,
  children,
}: {
  layerId: string;
  layers: { id: string; name: string }[];
  onLayerChange: (id: string) => void;
  children: React.ReactNode;
}) {
  const selectClass =
    "w-full appearance-none rounded-lg border border-zinc-700 bg-[#1a1a24] px-3 py-2.5 pr-9 text-sm font-medium text-zinc-100 outline-none focus:border-zinc-500";

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
      <div className="relative shrink-0 sm:w-44">
        <select
          className={selectClass}
          value={layerId}
          onChange={(e) => onLayerChange(e.target.value)}
        >
          {layers.map((layer) => (
            <option key={layer.id} value={layer.id}>
              {layer.name}
            </option>
          ))}
        </select>
        <ChevronDown
          size={16}
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500"
        />
      </div>
      <div className="min-h-[7.5rem] flex-1 rounded-lg border border-zinc-800 bg-[#1a1a24] p-2">
        {children}
      </div>
    </div>
  );
}

function TraitCheckboxList({
  label,
  traits,
  selectedIds,
  onToggle,
  onSelectAll,
  onClear,
}: {
  label: string;
  traits: Trait[];
  selectedIds: Set<string>;
  onToggle: (traitId: string) => void;
  onSelectAll: () => void;
  onClear: () => void;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between border-b border-zinc-800/80 px-1 pb-2">
        <span className="text-xs font-medium text-zinc-400">{label}</span>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onSelectAll}
            className="text-[11px] font-semibold text-zinc-400 hover:text-zinc-200"
          >
            All
          </button>
          <button
            type="button"
            onClick={onClear}
            className="text-[11px] font-semibold text-zinc-400 hover:text-zinc-200"
          >
            None
          </button>
        </div>
      </div>
      <div className="max-h-32 space-y-0.5 overflow-y-auto">
        {traits.map((trait) => (
          <label
            key={trait.id}
            className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-sm text-zinc-200 hover:bg-zinc-800/60"
          >
            <input
              type="checkbox"
              checked={selectedIds.has(trait.id)}
              onChange={() => onToggle(trait.id)}
              className="h-4 w-4 rounded accent-blue-500"
            />
            <span className="truncate">{trait.name}</span>
          </label>
        ))}
        {traits.length === 0 && (
          <p className="px-2 py-4 text-center text-xs text-zinc-600">
            No traits in this layer
          </p>
        )}
      </div>
    </div>
  );
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
  const addExclusionMatrix = useGeneratorStore((s) => s.addExclusionMatrix);
  const removeExclusion = useGeneratorStore((s) => s.removeExclusion);
  const clearExclusions = useGeneratorStore((s) => s.clearExclusions);

  const [sourceLayerId, setSourceLayerId] = useState("");
  const [sourceTraitIds, setSourceTraitIds] = useState<Set<string>>(new Set());
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
    setSourceTraitIds(new Set());
  }, [sourceLayerId]);

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

  const toggleTrait = (
    traitId: string,
    setter: React.Dispatch<React.SetStateAction<Set<string>>>,
  ) => {
    setter((current) => {
      const next = new Set(current);
      if (next.has(traitId)) next.delete(traitId);
      else next.add(traitId);
      return next;
    });
    setFeedback(null);
  };

  const handleAddRule = () => {
    if (!sourceLayerId || !targetLayerId) {
      setFeedback("Pick traits on both sides.");
      return;
    }

    const sources = Array.from(sourceTraitIds).map((traitId) => ({
      layerId: sourceLayerId,
      traitId,
    }));
    const targets = Array.from(targetTraitIds).map((traitId) => ({
      layerId: targetLayerId,
      traitId,
    }));

    if (sources.length === 0) {
      setFeedback("Select at least one trait on top.");
      return;
    }

    if (targets.length === 0) {
      setFeedback("Select at least one trait on the bottom.");
      return;
    }

    const added = addExclusionMatrix(sources, targets);
    if (added === 0) {
      setFeedback("Those bans already exist.");
      return;
    }

    setFeedback(`Added ${added} ban${added === 1 ? "" : "s"}.`);
    setAnalysis(null);
    setSourceTraitIds(new Set());
    setTargetTraitIds(new Set());
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
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 p-0 backdrop-blur-sm sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="incompatibility-rules-title"
      onClick={onClose}
    >
      <div
        className="flex max-h-[94dvh] w-full max-w-xl flex-col overflow-hidden rounded-t-2xl border border-zinc-800 bg-[#14141c] shadow-2xl sm:rounded-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-center justify-between gap-3 border-b border-zinc-800 px-5 py-4">
          <h2
            id="incompatibility-rules-title"
            className="text-lg font-semibold text-zinc-100"
          >
            Incompatibility Rules
          </h2>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleAnalyze}
              className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-[#1a1a24] px-3 py-1.5 text-xs font-medium text-zinc-300 transition-colors hover:border-zinc-600 hover:text-zinc-100"
            >
              <AlertTriangle size={14} className="text-amber-400" />
              Analyze Logic
            </button>
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

        <div className="flex-1 overflow-y-auto px-5 py-5">
          <section className="rounded-xl border border-zinc-800 bg-[#0f0f15] p-4">
            <h3 className="mb-4 text-sm font-medium text-zinc-300">
              Create New Rule
            </h3>

            <div className="space-y-3">
              <LayerTraitRow
                layerId={sourceLayerId}
                layers={layers}
                onLayerChange={(id) => {
                  setSourceLayerId(id);
                  setFeedback(null);
                }}
              >
                <TraitCheckboxList
                  label="Source Layer Items"
                  traits={sourceLayer?.traits ?? []}
                  selectedIds={sourceTraitIds}
                  onToggle={(id) => toggleTrait(id, setSourceTraitIds)}
                  onSelectAll={() =>
                    setSourceTraitIds(
                      new Set(sourceLayer?.traits.map((t) => t.id) ?? []),
                    )
                  }
                  onClear={() => setSourceTraitIds(new Set())}
                />
              </LayerTraitRow>

              <div className="rounded-lg border border-blue-500/30 bg-blue-950/40 px-4 py-2.5 text-center text-xs font-bold uppercase tracking-wide text-blue-200">
                Cannot mix with (Bans)
              </div>

              <LayerTraitRow
                layerId={targetLayerId}
                layers={layers}
                onLayerChange={(id) => {
                  setTargetLayerId(id);
                  setFeedback(null);
                }}
              >
                <TraitCheckboxList
                  label="Target Layer Items"
                  traits={targetLayer?.traits ?? []}
                  selectedIds={targetTraitIds}
                  onToggle={(id) => toggleTrait(id, setTargetTraitIds)}
                  onSelectAll={() =>
                    setTargetTraitIds(
                      new Set(targetLayer?.traits.map((t) => t.id) ?? []),
                    )
                  }
                  onClear={() => setTargetTraitIds(new Set())}
                />
              </LayerTraitRow>
            </div>

            {feedback && (
              <p className="mt-3 text-center text-xs text-amber-400/90">
                {feedback}
              </p>
            )}

            <button
              type="button"
              onClick={handleAddRule}
              disabled={layers.length === 0}
              className="mt-4 w-full rounded-lg bg-emerald-600 py-3 text-sm font-semibold text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Add Rule
            </button>

            <button
              type="button"
              onClick={handleClearAll}
              disabled={exclusions.length === 0}
              className="mt-2 w-full rounded-lg bg-red-600/90 py-3 text-sm font-semibold text-white transition-colors hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Clear All Rules
            </button>
          </section>

          {analysis && (
            <section className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
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

          <section className="mt-4">
            <div className="max-h-52 space-y-1 overflow-y-auto rounded-xl border border-zinc-800 bg-[#0f0f15] p-2">
              {sortedRules.length === 0 && (
                <p className="px-2 py-8 text-center text-xs text-zinc-600">
                  No bans yet. Pick traits on top and bottom, then add rules.
                </p>
              )}
              {sortedRules.map((rule) => (
                <div
                  key={rule.id}
                  className="flex items-center justify-between gap-3 rounded-lg bg-[#1a1a24] px-3 py-2.5"
                >
                  <div className="min-w-0 text-xs leading-relaxed text-zinc-300">
                    <span className="font-bold text-red-400">✕ BAN:</span>{" "}
                    {rule.label}
                  </div>
                  <button
                    type="button"
                    onClick={() => removeExclusion(rule.id)}
                    className="shrink-0 text-zinc-500 hover:text-red-400"
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
