import { getAssistantSnapshot } from "./context";
import { parseActionIntent } from "./intent-parser";
import type { AssistantAction } from "./actions";

export interface AssistantReply {
  message: string;
  suggestions: string[];
  action: AssistantAction;
}

const DEFAULT_SUGGESTIONS = [
  "Horns never go with hoodies",
  "Roll the dice",
  "List my traits",
  "What's my status?",
];

function reply(
  message: string,
  suggestions = DEFAULT_SUGGESTIONS,
  action: AssistantAction = { type: "none" },
): AssistantReply {
  return { message, suggestions, action };
}

export function processAssistantMessage(input: string): AssistantReply {
  const text = input.trim().toLowerCase();
  const snap = getAssistantSnapshot();

  if (!text) {
    return reply(
      "Tell me what to ban, generate, or change — e.g. *Laser Visor and Crown Protocol don't go together*.",
    );
  }

  const actionIntent = parseActionIntent(input);
  if (actionIntent) {
    return reply(actionIntent.preview, actionIntent.suggestions, actionIntent.action);
  }

  if (/^(hi|hello|hey)\b/.test(text)) {
    return reply(
      `Hey! Tell me traits that shouldn't mix and I'll add the ban rules for you.\n\nExample: **"Laser Visor can't go with Crown Protocol"**\n\nYou have ${snap.layerCount} layers, ${snap.traitCount} traits, ${snap.exclusionCount} bans.`,
      [
        "Laser Visor can't go with Crown Protocol",
        "List my traits",
        "Roll the dice",
        "List ban rules",
      ],
    );
  }

  if (/^help\b/.test(text)) {
    return reply(
      `I can **do things** for you:\n\n• **Ban traits:** "Laser Visor can't mix with Crown Protocol"\n• **Ban a group:** "Crown, Laser Visor and Halo can't be together"\n• **Dependencies:** "When Mech Frame then always Cyber Hoodie"\n• **Roll / generate / save / edition size**\n\nUse exact trait names when you can — say **list my traits** to see them.`,
      DEFAULT_SUGGESTIONS,
    );
  }

  if (/roll|dice|preview|random/.test(text)) {
    return reply(
      "Rolling a random preview using your weights and ban rules…",
      ["Roll again", "List ban rules", "What's my status?"],
      { type: "roll_dice" },
    );
  }

  if (/open rules|show rules/.test(text)) {
    return reply(
      "Opening the Rules panel…",
      ["List ban rules", "Roll the dice"],
      { type: "open_rules" },
    );
  }

  if (/^generate\b|start generation|generate collection/.test(text)) {
    return reply(
      `Starting generation for ${snap.editionSize.toLocaleString()} NFTs…`,
      ["What's my status?", "Export tips"],
      { type: "generate" },
    );
  }

  if (/save/.test(text) && !/auto.?save/.test(text)) {
    const nameMatch = input.match(/save(?: project)?(?: as)?["']?\s*([^"']+?)["']?\s*$/i);
    return reply(
      nameMatch
        ? `Saving as "${nameMatch[1].trim()}"…`
        : `Saving as "${snap.collectionName}"…`,
      ["What's my status?"],
      {
        type: "save_project",
        name: nameMatch?.[1]?.trim(),
      },
    );
  }

  const editionMatch =
    text.match(/edition(?: size)?(?: to)?\s*(\d[\d,]*)/) ||
    text.match(/set(?: edition)?\s*(\d[\d,]*)/);
  if (editionMatch) {
    const size = parseInt(editionMatch[1].replace(/,/g, ""), 10);
    if (size > 0) {
      return reply(
        `Setting edition size to ${size.toLocaleString()}. Max unique: ${snap.maxCombos}.`,
        ["Generate collection", "Roll the dice"],
        { type: "set_edition", size },
      );
    }
  }

  const canvasMatch = text.match(/\b(512|1024|2048)\b/);
  if (/canvas|output size|pixel/.test(text) && canvasMatch) {
    const size = parseInt(canvasMatch[1], 10) as 512 | 1024 | 2048;
    return reply(
      `Setting output canvas to ${size}×${size}px.`,
      ["What's my status?"],
      { type: "set_canvas", size },
    );
  }

  if (/status|project|how many|max unique|combo/.test(text)) {
    return reply(
      `**Project status**\n\n• ${snap.layerCount} layers, ${snap.traitCount} traits\n• ${snap.exclusionCount} ban rules, ${snap.dependencyCount} dependencies\n• Edition: ${snap.editionSize.toLocaleString()} · Max unique: ${snap.maxCombos}\n• Canvas: ${snap.canvasSize}px`,
      ["List ban rules", "Roll the dice", "List my traits"],
    );
  }

  if (/upload|import|background|png|jpg|format|image/.test(text)) {
    return reply(
      `Upload from the left column with **Images** (PNG/JPG/WebP) or **Folder**. Backgrounds can be JPG; other layers should be PNG with transparency.`,
      ["List my traits", "Roll the dice"],
    );
  }

  if (/rarity|weight|percent/.test(text)) {
    return reply(
      `Rarity = **Weight** per trait. Name files like \`Blue Sky#40.png\` on import.`,
      ["Roll the dice"],
    );
  }

  if (/export|zip|mint|metadata/.test(text)) {
    return reply(
      `Generate in the center, then **Export Collection ZIP** on the right.`,
      ["Generate collection", "Set edition to 100"],
    );
  }

  if (/refresh|auto.?save|persist|restore/.test(text)) {
    return reply(
      `Work **auto-saves in your browser**. Use **Save** / **Open** in the header for named projects.`,
      ["Save project"],
    );
  }

  return reply(
    `I didn't catch an action there. Try:\n\n• "Big Eyes thrice don't go with front snap hats including biz cap"\n• "Pills pack can only go with trans skins"\n• "Horns never go with hoodies"\n\nSay **list** to see trait names.`,
    DEFAULT_SUGGESTIONS,
  );
}

export function getWelcomeMessage(): AssistantReply {
  const snap = getAssistantSnapshot();
  return reply(
    `I'm your build assistant — tell me what shouldn't mix and I'll add the ban rules.\n\nTry: **"Big Eyes thrice never go with front snap hats"** or **"Pills pack can only go with trans skins"**\n\n${snap.traitCount} traits loaded · ${snap.exclusionCount} bans active.`,
    [
      "Big Eyes thrice never go with front snap hats",
      "Pills pack can only go with trans skins",
      "List my traits",
      "List ban rules",
    ],
  );
}
