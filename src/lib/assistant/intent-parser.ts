import type { ResolvedTrait } from "./trait-resolver";
import {
  formatTraitList,
  resolveTraitPhrases,
  resolveTraitPhrase,
  splitTraitList,
} from "./trait-resolver";
import type { AssistantAction } from "./actions";

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
  /\s+never\s+(?:go\s+)?with\s+/i,
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
  /\s+make\s+sure\s+.+\s+don't\s+happen\b/i,
];

const DEPENDENCY_PATTERNS = [
  /\s+when\s+(?:you\s+)?(?:pick|select|use|have)\s+/i,
  /\s+if\s+(?:you\s+)?(?:pick|select|use|have)\s+/i,
  /\s+whenever\s+/i,
  /\s+always\s+use\s+/i,
  /\s+requires\s+/i,
  /\s+must\s+use\s+/i,
  /\s+then\s+always\s+/i,
  /\s+,\s+always\s+/i,
  /\s+then\s+use\s+/i,
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

function buildBanResult(
  leftPhrases: string[],
  rightPhrases: string[],
): ParsedIntent | null {
  const left = resolveTraitPhrases(leftPhrases);
  const right = resolveTraitPhrases(rightPhrases);

  const problems = [
    ...left.missing.map((p) => `Could not find trait "${p}" on the left.`),
    ...right.missing.map((p) => `Could not find trait "${p}" on the right.`),
    ...left.ambiguous.map(
      (a) =>
        `"${a.phrase}" is ambiguous — try ${a.options.map((o) => `${o.traitName} (${o.layerName})`).join(" or ")}.`,
    ),
    ...right.ambiguous.map(
      (a) =>
        `"${a.phrase}" is ambiguous — try ${a.options.map((o) => `${o.traitName} (${o.layerName})`).join(" or ")}.`,
    ),
  ];

  if (problems.length > 0) {
    return {
      action: { type: "none" },
      preview: problems.join("\n"),
      suggestions: ["List my traits", "Ban Laser Visor with Crown Protocol"],
    };
  }

  if (left.resolved.length === 0 || right.resolved.length === 0) {
    return null;
  }

  return {
    action: {
      type: "add_bans",
      sources: left.resolved,
      targets: right.resolved,
    },
    preview: `Adding ban rules so ${formatTraitList(left.resolved)} never mixes with ${formatTraitList(right.resolved)}.`,
    suggestions: ["Roll the dice", "What's my status?", "List ban rules"],
  };
}

function buildCliqueBanResult(phrases: string[]): ParsedIntent | null {
  const resolved = resolveTraitPhrases(phrases);
  const problems = [
    ...resolved.missing.map((p) => `Could not find trait "${p}".`),
    ...resolved.ambiguous.map(
      (a) =>
        `"${a.phrase}" is ambiguous — try ${a.options.map((o) => `${o.traitName} (${o.layerName})`).join(" or ")}.`,
    ),
  ];

  if (problems.length > 0) {
    return {
      action: { type: "none" },
      preview: problems.join("\n"),
      suggestions: ["List my traits"],
    };
  }

  if (resolved.resolved.length < 2) return null;

  return {
    action: { type: "add_bans_clique", traits: resolved.resolved },
    preview: `Banning all pairs among ${formatTraitList(resolved.resolved)} so they never appear together.`,
    suggestions: ["Roll the dice", "What's my status?"],
  };
}

function parseBanIntent(input: string): ParsedIntent | null {
  const text = stripBanPrefix(input.trim());
  const lower = text.toLowerCase();

  const hasBanCue =
    /don't|do not|can't|cannot|never|ban|exclude|incompatible|shouldn't|should not|mix|go with|work with|happen together|appear together/.test(
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

  if (!sourceText) {
    const split = splitByFirstPattern(text, DEPENDENCY_PATTERNS);
    if (split) {
      sourceText = split[0]!.replace(/^(?:if|when)\s+/i, "").trim();
      targetText = split[1]!
        .replace(/^(?:always\s+)?(?:use|pick|select)\s+/i, "")
        .trim();
    }
  }

  if (!sourceText || !targetText) return null;

  const source = resolveTraitPhrase(sourceText);
  const target = resolveTraitPhrase(targetText);

  const problems: string[] = [];
  if (!source.best) {
    if (source.matches.length > 1) {
      problems.push(
        `Source "${sourceText}" is ambiguous — try a fuller trait name.`,
      );
    } else {
      problems.push(`Could not find source trait "${sourceText}".`);
    }
  }
  if (!target.best) {
    if (target.matches.length > 1) {
      problems.push(
        `Target "${targetText}" is ambiguous — try a fuller trait name.`,
      );
    } else {
      problems.push(`Could not find target trait "${targetText}".`);
    }
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
      source: source.best!,
      target: target.best!,
    },
    preview: `When **${source.best!.traitName}** (${source.best!.layerName}) is picked, always use **${target.best!.traitName}** (${target.best!.layerName}).`,
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
  if (/list\s+(?:my\s+)?traits?/i.test(input) || /^what traits/i.test(input)) {
    return {
      action: { type: "list_traits" },
      preview: "Listing traits in your project…",
      suggestions: ["Ban Laser Visor with Crown Protocol", "Roll the dice"],
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

export function parseActionIntent(input: string): ParsedIntent | null {
  return (
    parseBanIntent(input) ??
    parseDependencyIntent(input) ??
    parseClearBansIntent(input) ??
    parseListBansIntent(input) ??
    parseListTraitsIntent(input)
  );
}

export type { ResolvedTrait };
