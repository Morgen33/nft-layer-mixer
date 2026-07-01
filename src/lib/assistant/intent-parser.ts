import type { ResolvedTrait } from "./trait-resolver";
import {
  resolveTraitGroups,
  resolveTraitGroup,
  splitTraitList,
  summarizeTraitGroup,
} from "./trait-resolver";
import type { AssistantAction } from "./actions";
import {
  clearPendingBan,
  getAssistantSession,
  isFollowUpAffirmation,
  setPendingBan,
} from "./session";

export interface ParsedIntent {
  action: AssistantAction;
  preview: string;
  suggestions: string[];
}

const BAN_SPLIT_PATTERNS = [
  /\s+don't\s+go\s+with\s+/i,
  /\s+do\s+not\s+go\s+with\s+/i,
  /\s+shouldn't\s+go\s+with\s+/i,
  /\s+should\s+not\s+go\s+with\s+/i,
  /\s+can't\s+go\s+with\s+/i,
  /\s+cannot\s+go\s+with\s+/i,
  /\s+can't\s+mix\s+with\s+/i,
  /\s+cannot\s+mix\s+with\s+/i,
  /\s+can't\s+be\s+with\s+/i,
  /\s+cannot\s+combine\s+with\s+/i,
  /\s+don't\s+work\s+with\s+/i,
  /\s+do\s+not\s+work\s+with\s+/i,
  /\s+never\s+go\s+with\s+/i,
  /\s+never\s+with\s+/i,
  /\s+not\s+compatible\s+with\s+/i,
  /\s+incompatible\s+with\s+/i,
  /\s+banned?\s+from\s+/i,
  /\s+banned?\s+with\s+/i,
  /\s+exclude(?:d)?\s+from\s+/i,
  /\s+exclude(?:d)?\s+with\s+/i,
  /\s+shouldn't\s+mix\s+with\s+/i,
  /\s+should\s+not\s+mix\s+with\s+/i,
];

const BAN_TOGETHER_PATTERNS = [
  /\s+can't\s+be\s+together\b/i,
  /\s+cannot\s+be\s+together\b/i,
  /\s+don't\s+belong\s+together\b/i,
  /\s+shouldn't\s+appear\s+together\b/i,
  /\s+never\s+appear\s+together\b/i,
  /\s+don't\s+happen\s+together\b/i,
  /\s+shouldn't\s+happen\s+together\b/i,
  /\s+never\s+together\b/i,
];

function splitByFirstPattern(text: string, patterns: RegExp[]): [string, string] | null {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match.index !== undefined) {
      const left = text.slice(0, match.index).trim();
      const right = text.slice(match.index + match[0].length).trim();
      if (left && right) return [left, right];
    }
  }
  return null;
}

function stripBanPrefix(text: string): string {
  return text
    .replace(
      /^(?:please\s+)?(?:make\s+sure|ensure|ban|exclude|prevent|stop)\s+(?:that\s+)?/i,
      "",
    )
    .replace(/^(?:the\s+traits?\s+)?/i, "")
    .trim();
}

function formatAmbiguousHint(phrase: string, options: ResolvedTrait[]): string {
  const preview = options
    .slice(0, 4)
    .map((o) => `${o.traitName} (${o.layerName})`)
    .join(", ");
  const extra = options.length > 4 ? ` +${options.length - 4} more` : "";
  return `"${phrase}" matches ${options.length} traits: ${preview}${extra}. Say **all of those** to ban every match.`;
}

function buildBanResult(
  leftPhrases: string[],
  rightPhrases: string[],
): ParsedIntent | null {
  const left = resolveTraitGroups(leftPhrases);
  const right = resolveTraitGroups(rightPhrases);

  const problems: string[] = [
    ...left.missing.map((p) => `Could not find "${p}". Try a trait name or layer like "Jackets".`),
    ...right.missing.map((p) => `Could not find "${p}". Try "hoodies", "all jackets", or a trait name.`),
    ...left.ambiguous.map((a) => formatAmbiguousHint(a.phrase, a.options)),
    ...right.ambiguous.map((a) => formatAmbiguousHint(a.phrase, a.options)),
  ];

  if (problems.length > 0) {
    if (left.resolved.length > 0 && right.ambiguous.length > 0) {
      const targets = right.ambiguous.flatMap((a) => a.options);
      const uniqueTargets = targets.filter(
        (t, i, arr) => arr.findIndex((x) => x.traitId === t.traitId) === i,
      );
      setPendingBan({ sources: left.resolved, targets: uniqueTargets });
      return {
        action: { type: "none" },
        preview: `${problems.join("\n")}\n\nReady to ban ${summarizeTraitGroup(left.resolved, "traits")} from ${uniqueTargets.length} traits.`,
        suggestions: ["All of those", "List my traits"],
      };
    }

    return {
      action: { type: "none" },
      preview: problems.join("\n"),
      suggestions: ["List my traits", "Horns never go with hoodies"],
    };
  }

  if (left.resolved.length === 0 || right.resolved.length === 0) {
    return null;
  }

  clearPendingBan();

  return {
    action: {
      type: "add_bans",
      sources: left.resolved,
      targets: right.resolved,
    },
    preview: `Adding ban rules so ${summarizeTraitGroup(left.resolved, "traits")} never mixes with ${summarizeTraitGroup(right.resolved, "targets")}.`,
    suggestions: ["Roll the dice", "List ban rules", "What's my status?"],
  };
}

function buildCliqueBanResult(phrases: string[]): ParsedIntent | null {
  const resolved = resolveTraitGroups(phrases);
  const problems = [
    ...resolved.missing.map((p) => `Could not find "${p}".`),
    ...resolved.ambiguous.map((a) => formatAmbiguousHint(a.phrase, a.options)),
  ];

  if (problems.length > 0) {
    return {
      action: { type: "none" },
      preview: problems.join("\n"),
      suggestions: ["List my traits", "All of those"],
    };
  }

  if (resolved.resolved.length < 2) return null;

  clearPendingBan();

  return {
    action: { type: "add_bans_clique", traits: resolved.resolved },
    preview: `Banning all pairs among ${summarizeTraitGroup(resolved.resolved, "traits")}.`,
    suggestions: ["Roll the dice", "List ban rules"],
  };
}

function parseBanIntent(input: string): ParsedIntent | null {
  const text = stripBanPrefix(input.trim());
  const lower = text.toLowerCase();

  const hasBanCue =
    /don't|do not|can't|cannot|never|ban|exclude|incompatible|shouldn't|should not|mix|go with|work with|happen together|appear together|together/.test(
      lower,
    );

  if (!hasBanCue) return null;

  const pairSplit = splitByFirstPattern(text, BAN_SPLIT_PATTERNS);
  if (pairSplit) {
    const [leftText, rightText] = pairSplit;
    return buildBanResult(splitTraitList(leftText), splitTraitList(rightText));
  }

  for (const pattern of BAN_TOGETHER_PATTERNS) {
    const match = text.match(pattern);
    if (match && match.index !== undefined) {
      const listText = text.slice(0, match.index).trim();
      return buildCliqueBanResult(splitTraitList(listText));
    }
  }

  if (/^ban\s+/i.test(text)) {
    const rest = text.replace(/^ban\s+/i, "");
    const withSplit = rest.split(/\s+with\s+/i);
    if (withSplit.length === 2) {
      return buildBanResult(
        splitTraitList(withSplit[0]!),
        splitTraitList(withSplit[1]!),
      );
    }
  }

  return null;
}

function parseLayerOnlyBan(input: string): ParsedIntent | null {
  const text = input.trim();
  const match = text.match(
    /^(?:ban\s+)?(.+?)\s+(?:from|with|against)\s+(?:all\s+)?(?:traits?\s+)?(?:under|in)\s+(?:the\s+)?(.+)$/i,
  );
  if (!match) return null;

  return buildBanResult([match[1]!], [`all ${match[2]!}`]);
}

function parseFollowUpBan(): ParsedIntent | null {
  const pending = getAssistantSession().pendingBan;
  if (!pending) return null;

  clearPendingBan();

  return {
    action: {
      type: "add_bans",
      sources: pending.sources,
      targets: pending.targets,
    },
    preview: `Banning ${summarizeTraitGroup(pending.sources, "traits")} from ${summarizeTraitGroup(pending.targets, "traits")}.`,
    suggestions: ["Roll the dice", "List ban rules"],
  };
}

export function parseFollowUpIntent(input: string): ParsedIntent | null {
  if (!isFollowUpAffirmation(input)) return null;
  if (!getAssistantSession().pendingBan) return null;

  return parseFollowUpBan();
}

function parseDependencyIntent(input: string): ParsedIntent | null {
  const text = input.trim();
  const lower = text.toLowerCase();

  const hasDepCue =
    /when|if|always use|requires|must use|then always|dependency|force/.test(
      lower,
    );
  if (!hasDepCue) return null;

  let sourceText = "";
  let targetText = "";

  const ifThen = text.match(
    /(?:if|when)\s+(?:you\s+)?(?:pick|select|use|have)\s+(.+?)\s+(?:then\s+)?(?:always\s+)?(?:use|pick|select|show)\s+(.+)/i,
  );
  if (ifThen) {
    sourceText = ifThen[1]!.trim();
    targetText = ifThen[2]!.trim();
  }

  if (!sourceText) {
    const alwaysUse = text.match(/(.+?)\s+always\s+(?:uses?|needs?|requires?)\s+(.+)/i);
    if (alwaysUse) {
      sourceText = alwaysUse[1]!.trim();
      targetText = alwaysUse[2]!.trim();
    }
  }

  if (!sourceText || !targetText) return null;

  const source = resolveTraitGroup(sourceText);
  const target = resolveTraitGroup(targetText);

  const problems: string[] = [];
  if (source.kind === "missing" || source.traits.length === 0) {
    problems.push(`Could not find source trait "${sourceText}".`);
  } else if (source.kind === "ambiguous" || source.traits.length > 1) {
    problems.push(`Source "${sourceText}" matches multiple traits — be more specific.`);
  }
  if (target.kind === "missing" || target.traits.length === 0) {
    problems.push(`Could not find target trait "${targetText}".`);
  } else if (target.kind === "ambiguous" || target.traits.length > 1) {
    problems.push(`Target "${targetText}" matches multiple traits — be more specific.`);
  }

  if (problems.length > 0) {
    return {
      action: { type: "none" },
      preview: problems.join("\n"),
      suggestions: ["List my traits"],
    };
  }

  return {
    action: {
      type: "add_dependency",
      source: source.traits[0]!,
      target: target.traits[0]!,
    },
    preview: `When **${source.traits[0]!.traitName}** (${source.traits[0]!.layerName}) is picked, always use **${target.traits[0]!.traitName}** (${target.traits[0]!.layerName}).`,
    suggestions: ["Roll the dice", "What's my status?"],
  };
}

function parseClearBansIntent(input: string): ParsedIntent | null {
  if (/clear\s+(?:all\s+)?(?:ban|exclusion|incompatibility)\s*rules?/i.test(input)) {
    return {
      action: { type: "clear_bans" },
      preview: "Clearing all ban rules.",
      suggestions: ["What's my status?", "List my traits"],
    };
  }
  return null;
}

function parseListTraitsIntent(input: string): ParsedIntent | null {
  const text = input.trim().toLowerCase();
  if (
    text === "list" ||
    /^lists?\s+(?:my\s+)?traits?\b/.test(text) ||
    /^show\s+(?:my\s+)?traits?\b/.test(text) ||
    /^what\s+traits?\b/.test(text) ||
    /^list\s+(?:my\s+)?traits?\b/.test(text)
  ) {
    return {
      action: { type: "list_traits" },
      preview: "Listing traits in your project…",
      suggestions: ["Horns never go with hoodies", "List ban rules"],
    };
  }
  return null;
}

function parseListBansIntent(input: string): ParsedIntent | null {
  if (/list\s+(?:my\s+)?(?:ban|exclusion)\s*rules?/i.test(input)) {
    return {
      action: { type: "list_bans" },
      preview: "Listing your ban rules…",
      suggestions: ["Clear all ban rules", "Roll the dice"],
    };
  }
  return null;
}

function parseLayerBrowseIntent(input: string): ParsedIntent | null {
  const text = input.trim();
  const match = text.match(/^(?:under|in|show)\s+(?:the\s+)?(.+)$/i);
  if (!match) return null;

  const group = resolveTraitGroup(match[1]!);
  if (group.kind !== "layer" || group.traits.length === 0) return null;

  const names = group.traits.map((t) => t.traitName).join(", ");
  return {
    action: { type: "none" },
    preview: `**${group.traits[0]!.layerName}** (${group.traits.length} traits): ${names}`,
    suggestions: [
      `Ban Horns with all ${group.traits[0]!.layerName}`,
      "List my traits",
    ],
  };
}

export function parseActionIntent(input: string): ParsedIntent | null {
  return (
    parseFollowUpIntent(input) ??
    parseBanIntent(input) ??
    parseLayerOnlyBan(input) ??
    parseDependencyIntent(input) ??
    parseClearBansIntent(input) ??
    parseListBansIntent(input) ??
    parseListTraitsIntent(input) ??
    parseLayerBrowseIntent(input)
  );
}

export type { ResolvedTrait };
