import { saveNamedProject, resumeAutosave, suspendAutosave } from "@/lib/project-persistence";
import { useGeneratorStore } from "@/lib/store";
import {
  formatTraitRef,
  listAllTraits,
  type ResolvedTrait,
} from "./trait-resolver";

export type AssistantAction =
  | { type: "roll_dice" }
  | { type: "open_rules" }
  | { type: "set_edition"; size: number }
  | { type: "set_canvas"; size: number }
  | { type: "save_project"; name?: string }
  | { type: "add_bans"; sources: ResolvedTrait[]; targets: ResolvedTrait[] }
  | { type: "add_bans_clique"; traits: ResolvedTrait[] }
  | { type: "add_dependency"; source: ResolvedTrait; target: ResolvedTrait }
  | { type: "clear_bans" }
  | { type: "list_traits" }
  | { type: "list_bans" }
  | { type: "generate" }
  | { type: "none" };

function toRefs(traits: ResolvedTrait[]) {
  return traits.map((t) => ({ layerId: t.layerId, traitId: t.traitId }));
}

function describeBanRule(
  layerAId: string,
  traitAId: string,
  layerBId: string,
  traitBId: string,
): string {
  const { layers } = useGeneratorStore.getState();
  const layerA = layers.find((l) => l.id === layerAId);
  const layerB = layers.find((l) => l.id === layerBId);
  const traitA = layerA?.traits.find((t) => t.id === traitAId);
  const traitB = layerB?.traits.find((t) => t.id === traitBId);
  if (!traitA || !traitB || !layerA || !layerB) return "Unknown rule";
  return `${traitA.name} (${layerA.name}) ↔ ${traitB.name} (${layerB.name})`;
}

export async function runAssistantAction(
  action: AssistantAction,
  callbacks: { onOpenRules: () => void },
): Promise<string | null> {
  const store = useGeneratorStore.getState();

  switch (action.type) {
    case "roll_dice":
      await store.rollDice();
      return store.generationError
        ? `Roll failed: ${store.generationError}`
        : "Rolled a new preview in the center panel.";

    case "open_rules":
      callbacks.onOpenRules();
      return "Opened the Rules panel.";

    case "set_edition":
      store.setEditionSize(action.size);
      return `Edition size set to ${action.size.toLocaleString()}.`;

    case "set_canvas":
      store.setCanvasSize(action.size);
      return `Canvas size set to ${action.size}×${action.size}px.`;

    case "save_project": {
      const name =
        action.name?.trim() ||
        store.metadataConfig.namePrefix.trim() ||
        "My Collection";
      await saveNamedProject(name);
      return `Saved project as "${name}". Find it under Open anytime.`;
    }

    case "add_bans": {
      suspendAutosave();
      try {
        const added = store.addExclusionMatrix(
          toRefs(action.sources),
          toRefs(action.targets),
        );
        if (added === 0) {
          return "Those bans were already in place — no new rules added.";
        }
        return `Added **${added}** ban rule${added === 1 ? "" : "s"}. Roll the Dice and Generate will respect them automatically.`;
      } finally {
        resumeAutosave();
      }
    }

    case "add_bans_clique": {
      suspendAutosave();
      try {
        let total = 0;
        const traits = action.traits;
        for (let i = 0; i < traits.length; i++) {
          for (let j = i + 1; j < traits.length; j++) {
            total += store.addExclusionMatrix(
              toRefs([traits[i]!]),
              toRefs([traits[j]!]),
            );
          }
        }
        if (total === 0) {
          return "Those pairwise bans already exist.";
        }
        return `Added **${total}** ban rule${total === 1 ? "" : "s"} so those traits never appear together.`;
      } finally {
        resumeAutosave();
      }
    }

    case "add_dependency": {
      store.addDependency({
        sourceLayerId: action.source.layerId,
        sourceTraitId: action.source.traitId,
        targetLayerId: action.target.layerId,
        targetTraitId: action.target.traitId,
      });
      return `Dependency added: when ${formatTraitRef(action.source)} is picked, always ${formatTraitRef(action.target)}.`;
    }

    case "clear_bans": {
      const count = store.exclusions.length;
      store.clearExclusions();
      return count === 0
        ? "There were no ban rules to clear."
        : `Cleared **${count}** ban rule${count === 1 ? "" : "s"}.`;
    }

    case "list_traits": {
      const traits = listAllTraits().filter((t) => t.traitName !== "None");
      if (traits.length === 0) {
        return "No traits loaded yet — upload art on the left or wait for demo layers.";
      }
      const byLayer = new Map<string, ResolvedTrait[]>();
      for (const trait of traits) {
        const list = byLayer.get(trait.layerName) ?? [];
        list.push(trait);
        byLayer.set(trait.layerName, list);
      }
      const lines = [...byLayer.entries()].map(
        ([layer, layerTraits]) =>
          `**${layer}:** ${layerTraits.map((t) => t.traitName).join(", ")}`,
      );
      return lines.join("\n");
    }

    case "list_bans": {
      const { exclusions } = useGeneratorStore.getState();
      if (exclusions.length === 0) {
        return "No ban rules yet. Tell me something like: *Laser Visor can't go with Crown Protocol*";
      }
      const seen = new Set<string>();
      const lines: string[] = [];
      for (const rule of exclusions) {
        const key = [rule.traitAId, rule.traitBId].sort().join("|");
        if (seen.has(key)) continue;
        seen.add(key);
        lines.push(`• ${describeBanRule(rule.layerAId, rule.traitAId, rule.layerBId, rule.traitBId)}`);
      }
      return `**${lines.length}** active ban${lines.length === 1 ? "" : "s"}:\n${lines.join("\n")}`;
    }

    case "generate":
      await store.startGeneration();
      return store.generationError
        ? `Generation issue: ${store.generationError}`
        : store.isGenerating
          ? `Started generating ${store.editionSize.toLocaleString()} NFTs — watch the progress bar.`
          : "Generation finished or is ready.";

    default:
      return null;
  }
}
