import { useGeneratorStore } from "@/lib/store";

export function getAssistantContext(): string {
  const state = useGeneratorStore.getState();
  const traitCount = state.layers.reduce(
    (sum, layer) => sum + layer.traits.length,
    0,
  );

  return [
    `Layers: ${state.layers.length}`,
    `Traits: ${traitCount}`,
    `Ban rules: ${state.exclusions.length}`,
    `Dependency rules: ${state.dependencies.length}`,
    `Edition size: ${state.editionSize}`,
    `Canvas: ${state.canvasSize}px`,
    `Max unique combos: ${state.getMaxCombinationsLabel()}`,
    `Collection: ${state.metadataConfig.namePrefix}`,
    `Saved: ${state.lastSavedAt ? new Date(state.lastSavedAt).toLocaleString() : "auto-save pending"}`,
  ].join("\n");
}

export function getAssistantSnapshot() {
  const state = useGeneratorStore.getState();
  return {
    layerCount: state.layers.length,
    traitCount: state.layers.reduce((sum, layer) => sum + layer.traits.length, 0),
    exclusionCount: state.exclusions.length,
    dependencyCount: state.dependencies.length,
    editionSize: state.editionSize,
    canvasSize: state.canvasSize,
    maxCombos: state.getMaxCombinationsLabel(),
    collectionName: state.metadataConfig.namePrefix,
  };
}
