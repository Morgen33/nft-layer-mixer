import type { ResolvedTrait } from "./trait-resolver";

export interface PendingBan {
  sources: ResolvedTrait[];
  targets: ResolvedTrait[];
}

export interface AssistantSession {
  pendingBan: PendingBan | null;
}

let session: AssistantSession = { pendingBan: null };

export function getAssistantSession(): AssistantSession {
  return session;
}

export function setPendingBan(pending: PendingBan | null): void {
  session = { pendingBan: pending };
}

export function clearPendingBan(): void {
  session = { pendingBan: null };
}

export function isFollowUpAffirmation(input: string): boolean {
  const text = input.trim().toLowerCase();
  return (
    /^(?:yes|yep|yeah|ok|okay|sure|do it|go ahead)\b/.test(text) ||
    /^all of (?:those|them)\b/.test(text) ||
    /^ban (?:all of )?(?:those|them)\b/.test(text) ||
    /^every(?:one)?\b/.test(text) ||
    /^all (?:of )?(?:the )?(?:hoodies|jackets|hats|traits)\b/.test(text)
  );
}
