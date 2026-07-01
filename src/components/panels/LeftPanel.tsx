"use client";

import React, { useCallback } from "react";
import {
  ChevronDown,
  ChevronUp,
  Equal,
  Filter,
  FolderOpen,
  Layers,
  Plus,
  Scale,
  Trash2,
  Upload,
} from "lucide-react";
import { FolderDropZone } from "@/components/FolderDropZone";
import { GlowButton, Panel, TierBadge } from "@/components/ui/primitives";
import { formatPercentage, traitPercentage } from "@/lib/rarity";
import {
  DEFAULT_REQUIRED_LAYER_COUNT,
  optionalLayerHint,
} from "@/lib/layer-presets";
import { useGeneratorStore } from "@/lib/store";
import { RARITY_TIERS, type RarityTier } from "@/lib/types";

function LayerSection({
  layerId,
  index,
  total,
}: {
  layerId: string;
  index: number;
  total: number;
}) {
  const layer = useGeneratorStore((s) => s.layers.find((l) => l.id === layerId)!);
  const tierFilter = useGeneratorStore((s) => s.tierFilter);
  const updateLayerName = useGeneratorStore((s) => s.updateLayerName);
  const updateTraitWeight = useGeneratorStore((s) => s.updateTraitWeight);
  const updateTraitPercentage = useGeneratorStore((s) => s.updateTraitPercentage);
  const updateTraitTier = useGeneratorStore((s) => s.updateTraitTier);
  const applyTierWeightsToLayer = useGeneratorStore((s) => s.applyTierWeightsToLayer);
  const removeTrait = useGeneratorStore((s) => s.removeTrait);
  const removeLayer = useGeneratorStore((s) => s.removeLayer);
  const moveLayer = useGeneratorStore((s) => s.moveLayer);
  const setLayerOptional = useGeneratorStore((s) => s.setLayerOptional);
  const equalizeLayer = useGeneratorStore((s) => s.equalizeLayer);
  const importFilesIntoLayer = useGeneratorStore((s) => s.importFilesIntoLayer);
  const fileRef = React.useRef<HTMLInputElement>(null);

  const handleLayerDrop = useCallback(
    (files: Parameters<typeof importFilesIntoLayer>[1]) =>
      importFilesIntoLayer(layer.id, files),
    [importFilesIntoLayer, layer.id],
  );

  const visibleTraits = layer.traits;

  const totalWeight = layer.traits.reduce((s, t) => s + t.weight, 0);
  const layerHint = optionalLayerHint(layer.optional);

  return (
    <FolderDropZone
      onDrop={handleLayerDrop}
      overlayText={`Drop folder into ${layer.name}`}
      className="rounded-lg"
    >
      <div className="rounded-lg border border-zinc-800/60 bg-[#0d0d12]">
      <div className="flex items-start gap-2 border-b border-zinc-800/60 px-3 py-2">
        <div className="flex flex-col gap-0.5">
          <button
            type="button"
            disabled={index === total - 1}
            onClick={() => moveLayer(layer.id, "front")}
            title="Bring forward (draw on top)"
            className="text-zinc-600 hover:text-emerald-400 disabled:opacity-25 disabled:hover:text-zinc-600"
          >
            <ChevronDown size={14} />
          </button>
          <button
            type="button"
            disabled={index === 0}
            onClick={() => moveLayer(layer.id, "back")}
            title="Send backward (draw behind)"
            className="text-zinc-600 hover:text-emerald-400 disabled:opacity-25 disabled:hover:text-zinc-600"
          >
            <ChevronUp size={14} />
          </button>
        </div>
        <div className="flex-1 min-w-0">
          <input
            value={layer.name}
            onChange={(e) => updateLayerName(layer.id, e.target.value)}
            className="w-full bg-transparent text-sm font-semibold text-zinc-200 outline-none"
          />
          <p className="text-[10px] text-zinc-600">
            {index === 0
              ? "Back layer"
              : index === total - 1
                ? "Front layer"
                : `Stack ${index + 1} of ${total}`}
            <span
              className={`ml-1.5 ${
                layer.optional ? "text-emerald-500" : "text-amber-500"
              }`}
            >
              · {layer.optional ? "Skippable" : "Required"}
            </span>
          </p>
          {layerHint && (
            <p className="text-[10px] leading-snug text-zinc-500 mt-0.5">
              {layerHint}
            </p>
          )}
          <label className="mt-1.5 flex items-center gap-2 text-[10px] text-zinc-400 cursor-pointer">
            <input
              type="checkbox"
              checked={layer.optional}
              disabled={index === 0}
              onChange={(e) => setLayerOptional(layer.id, e.target.checked)}
              className="rounded border-zinc-600 disabled:opacity-40"
            />
            {index === 0
              ? "Back layer is always required"
              : "Skippable layer (adds None — use any folder name)"}
          </label>
        </div>
        <span className="hidden shrink-0 text-xs text-zinc-500 sm:inline">{layer.traits.length} traits</span>
        <button
          type="button"
          onClick={() => removeLayer(layer.id)}
          className="text-zinc-600 hover:text-red-400"
        >
          <Trash2 size={14} />
        </button>
      </div>

      <div className="flex flex-wrap gap-2 px-3 py-2">
        <GlowButton
          variant="ghost"
          className="text-xs py-1"
          onClick={() => equalizeLayer(layer.id)}
        >
          <Equal size={12} /> Equalize
        </GlowButton>
        <GlowButton
          variant="ghost"
          className="text-xs py-1"
          onClick={() => setLayerOptional(layer.id, true)}
        >
          + Skippable
        </GlowButton>
        <GlowButton
          variant="ghost"
          className="text-xs py-1"
          onClick={() => applyTierWeightsToLayer(layer.id)}
        >
          <Scale size={12} /> Tier weights
        </GlowButton>
        <GlowButton
          variant="ghost"
          className="text-xs py-1"
          onClick={() => fileRef.current?.click()}
        >
          <Upload size={12} /> Upload
        </GlowButton>
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/webp,image/jpeg"
          multiple
          // @ts-expect-error webkitdirectory for folder pick
          webkitdirectory=""
          directory=""
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) {
              void importFilesIntoLayer(
                layer.id,
                Array.from(e.target.files).map((file) => ({
                  file,
                  relativePath:
                    "webkitRelativePath" in file && file.webkitRelativePath
                      ? String(file.webkitRelativePath)
                      : file.name,
                })),
              );
              e.target.value = "";
            }
          }}
        />
      </div>

      <div className="max-h-64 space-y-1.5 overflow-y-auto px-3 pb-3">
        {visibleTraits.length === 0 && (
          <p className="text-xs text-zinc-600 py-2 text-center">
            Drop a folder here or upload trait PNGs
          </p>
        )}
        {tierFilter !== "all" && visibleTraits.length > 0 && (
          <p className="text-[10px] text-zinc-500 pb-1">
            Showing all traits. Filter highlights {tierFilter} — odds use Weight
            / % below.
          </p>
        )}
        {visibleTraits.map((trait) => {
          const pct = traitPercentage(trait, layer);
          const dimmed = tierFilter !== "all" && trait.tier !== tierFilter;
          return (
            <div
              key={trait.id}
              className={`grid grid-cols-[auto_1fr_auto] items-center gap-2 rounded-md border border-zinc-800/40 bg-zinc-900/30 px-2 py-2 sm:flex sm:py-1.5 ${
                dimmed ? "opacity-45" : ""
              }`}
            >
              <img
                src={trait.imageUrl}
                alt={trait.name}
                className="h-8 w-8 rounded object-cover"
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-xs font-medium text-zinc-300">
                    {trait.name}
                  </span>
                  <TierBadge tier={trait.tier} />
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-2 sm:mt-0.5">
                  <label className="flex items-center gap-1 text-[10px] text-zinc-500">
                    W
                    <input
                      type="number"
                      min={0}
                      step={0.1}
                      value={trait.weight}
                      onChange={(e) =>
                        updateTraitWeight(
                          layer.id,
                          trait.id,
                          parseFloat(e.target.value) || 0,
                        )
                      }
                      className="w-14 rounded border border-zinc-700 bg-[#0d0d12] px-1.5 py-0.5 text-xs text-zinc-300"
                    />
                  </label>
                  <label className="flex items-center gap-1 text-[10px] text-zinc-500">
                    %
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step={0.1}
                      value={Number(formatPercentage(pct))}
                      onChange={(e) =>
                        updateTraitPercentage(
                          layer.id,
                          trait.id,
                          parseFloat(e.target.value) || 0,
                        )
                      }
                      className="w-14 rounded border border-zinc-700 bg-[#0d0d12] px-1.5 py-0.5 text-xs font-mono font-bold text-emerald-400"
                    />
                  </label>
                </div>
              </div>
              <select
                value={trait.tier}
                onChange={(e) =>
                  updateTraitTier(layer.id, trait.id, e.target.value as RarityTier)
                }
                className="col-span-2 rounded border border-zinc-700 bg-[#0d0d12] px-2 py-1 text-[10px] text-zinc-400 sm:col-span-1 sm:px-1 sm:py-0.5"
              >
                {RARITY_TIERS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => removeTrait(layer.id, trait.id)}
                className="justify-self-end text-zinc-600 hover:text-red-400"
              >
                <Trash2 size={12} />
              </button>
            </div>
          );
        })}
      </div>

      {layer.traits.length > 0 && (
        <div className="border-t border-zinc-800/60 px-3 py-1.5 text-[10px] text-zinc-500">
          Total weight: {totalWeight.toFixed(2)}
        </div>
      )}
      </div>
    </FolderDropZone>
  );
}

function RuleBuilder({
  layers,
  onAdd,
}: {
  layers: { id: string; name: string; traits: { id: string; name: string }[] }[];
  onAdd: (a: string, b: string, c: string, d: string) => void;
}) {
  const [layerA, setLayerA] = React.useState("");
  const [traitA, setTraitA] = React.useState("");
  const [layerB, setLayerB] = React.useState("");
  const [traitB, setTraitB] = React.useState("");

  const traitsA = layers.find((l) => l.id === layerA)?.traits ?? [];
  const traitsB = layers.find((l) => l.id === layerB)?.traits ?? [];

  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      <select
        value={layerA}
        onChange={(e) => {
          setLayerA(e.target.value);
          setTraitA("");
        }}
        className="rounded border border-zinc-700 bg-[#0d0d12] px-2 py-2 text-xs text-zinc-300 sm:py-1"
      >
        <option value="">Layer A</option>
        {layers.map((l) => (
          <option key={l.id} value={l.id}>
            {l.name}
          </option>
        ))}
      </select>
      <select
        value={layerB}
        onChange={(e) => {
          setLayerB(e.target.value);
          setTraitB("");
        }}
        className="rounded border border-zinc-700 bg-[#0d0d12] px-2 py-2 text-xs text-zinc-300 sm:py-1"
      >
        <option value="">Layer B</option>
        {layers.map((l) => (
          <option key={l.id} value={l.id}>
            {l.name}
          </option>
        ))}
      </select>
      <select
        value={traitA}
        onChange={(e) => setTraitA(e.target.value)}
        className="rounded border border-zinc-700 bg-[#0d0d12] px-2 py-2 text-xs text-zinc-300 sm:py-1"
      >
        <option value="">Trait A</option>
        {traitsA.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>
      <select
        value={traitB}
        onChange={(e) => setTraitB(e.target.value)}
        className="rounded border border-zinc-700 bg-[#0d0d12] px-2 py-2 text-xs text-zinc-300 sm:py-1"
      >
        <option value="">Trait B</option>
        {traitsB.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>
      <GlowButton
        variant="ghost"
        className="text-xs sm:col-span-2"
        disabled={!layerA || !traitA || !layerB || !traitB}
        onClick={() => {
          onAdd(layerA, traitA, layerB, traitB);
          setTraitA("");
          setTraitB("");
        }}
      >
        <Plus size={12} /> Add Rule
      </GlowButton>
    </div>
  );
}

export function LeftPanel() {
  const layers = useGeneratorStore((s) => s.layers);
  const tierFilter = useGeneratorStore((s) => s.tierFilter);
  const dependencies = useGeneratorStore((s) => s.dependencies);
  const addLayer = useGeneratorStore((s) => s.addLayer);
  const setTierFilter = useGeneratorStore((s) => s.setTierFilter);
  const addDependency = useGeneratorStore((s) => s.addDependency);
  const removeDependency = useGeneratorStore((s) => s.removeDependency);
  const importCollectionFromFiles = useGeneratorStore((s) => s.importCollectionFromFiles);

  return (
    <div className="flex h-full flex-col gap-4 lg:overflow-y-auto lg:pr-1">
      <Panel title="Layers & Rarity" icon={<Layers size={16} className="text-emerald-400" />}>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Filter size={14} className="text-zinc-500" />
          <span className="text-[10px] text-zinc-600">Highlight:</span>
          {(["all", ...RARITY_TIERS] as const).map((tier) => (
            <button
              key={tier}
              type="button"
              onClick={() => setTierFilter(tier)}
              className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider border transition-all ${
                tierFilter === tier
                  ? "border-emerald-500/60 bg-emerald-500/10 text-emerald-400"
                  : "border-zinc-700 text-zinc-500 hover:border-zinc-600"
              }`}
            >
              {tier === "all" ? "All" : tier}
            </button>
          ))}
        </div>

        <FolderDropZone
          onDrop={importCollectionFromFiles}
          pickFolderOnClick
          overlayText="Drop collection folder — each subfolder becomes a layer"
          className="mb-3 rounded-lg border border-dashed border-zinc-700/80 bg-zinc-900/20 px-3 py-4 cursor-pointer hover:border-emerald-500/40 hover:bg-emerald-500/5 transition-colors"
        >
          <div className="flex items-start gap-3 pointer-events-none">
            <FolderOpen size={18} className="mt-0.5 shrink-0 text-emerald-400" />
            <div>
              <p className="text-xs font-semibold text-zinc-200">
                Import collection folder
              </p>
              <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">
                Drop your main folder — each subfolder becomes a layer (any
                names work). First {DEFAULT_REQUIRED_LAYER_COUNT} layers are
                required; the rest are skippable with None. Toggle per layer
                below.
              </p>
            </div>
          </div>
        </FolderDropZone>

        <div className="space-y-3">
          {layers.map((layer, index) => (
            <LayerSection
              key={layer.id}
              layerId={layer.id}
              index={index}
              total={layers.length}
            />
          ))}
        </div>

        <GlowButton
          variant="secondary"
          className="mt-3 w-full"
          onClick={() => addLayer(`Layer ${layers.length + 1}`)}
        >
          <Plus size={14} /> Add Layer
        </GlowButton>
      </Panel>

      <Panel title="Dependency Rules" icon={<ChevronDown size={16} className="text-violet-400" />}>
        <p className="text-xs text-zinc-500 mb-3">
          If source trait is selected, force target trait in another layer.
        </p>

        {dependencies.map((rule) => {
          const srcLayer = layers.find((l) => l.id === rule.sourceLayerId);
          const tgtLayer = layers.find((l) => l.id === rule.targetLayerId);
          const srcTrait = srcLayer?.traits.find((t) => t.id === rule.sourceTraitId);
          const tgtTrait = tgtLayer?.traits.find((t) => t.id === rule.targetTraitId);
          return (
            <div
              key={rule.id}
              className="mb-2 flex items-center justify-between gap-2 rounded border border-violet-500/20 bg-violet-500/5 px-2 py-2 text-xs sm:py-1.5"
            >
              <span className="min-w-0 break-words text-zinc-300">
                {srcLayer?.name}/{srcTrait?.name} → {tgtLayer?.name}/{tgtTrait?.name}
              </span>
              <button
                type="button"
                onClick={() => removeDependency(rule.id)}
                className="text-zinc-600 hover:text-red-400"
              >
                <Trash2 size={12} />
              </button>
            </div>
          );
        })}

        <RuleBuilder
          layers={layers}
          onAdd={(srcLayer, srcTrait, tgtLayer, tgtTrait) =>
            addDependency({
              sourceLayerId: srcLayer,
              sourceTraitId: srcTrait,
              targetLayerId: tgtLayer,
              targetTraitId: tgtTrait,
            })
          }
        />
      </Panel>
    </div>
  );
}
