"use client";

import { useEffect, useRef, useState } from "react";
import { MessageCircle, Send, Sparkles, X } from "lucide-react";
import { getWelcomeMessage, processAssistantMessage } from "@/lib/assistant/brain";
import { runAssistantAction } from "@/lib/assistant/actions";

interface ChatMessage {
  id: string;
  role: "assistant" | "user";
  content: string;
}

function renderMarkdownish(text: string) {
  return text.split("\n").map((line, index) => {
    const parts = line.split(/(\*\*[^*]+\*\*)/g);
    return (
      <p key={`${index}-${line}`} className={index > 0 ? "mt-2" : undefined}>
        {parts.map((part, partIndex) =>
          part.startsWith("**") && part.endsWith("**") ? (
            <strong key={partIndex} className="font-semibold text-zinc-100">
              {part.slice(2, -2)}
            </strong>
          ) : (
            <span key={partIndex}>{part}</span>
          ),
        )}
      </p>
    );
  });
}

export function ChatAssistant({
  onOpenRules,
}: {
  onOpenRules: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open || messages.length > 0) return;
    const welcome = getWelcomeMessage();
    setMessages([
      {
        id: "welcome",
        role: "assistant",
        content: welcome.message,
      },
    ]);
    setSuggestions(welcome.suggestions);
  }, [open, messages.length]);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, busy]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const appendMessage = (role: ChatMessage["role"], content: string) => {
    setMessages((current) => [
      ...current,
      { id: `${role}-${Date.now()}-${Math.random()}`, role, content },
    ]);
  };

  const handleSubmit = async (raw: string) => {
    const text = raw.trim();
    if (!text || busy) return;

    setInput("");
    appendMessage("user", text);
    setBusy(true);

    try {
      const result = processAssistantMessage(text);
      let assistantText = result.message;

      if (result.action.type !== "none") {
        const actionResult = await runAssistantAction(result.action, {
          onOpenRules,
        });
        if (actionResult) {
          assistantText = `${assistantText}\n\n${actionResult}`;
        }
      }

      appendMessage("assistant", assistantText);
      setSuggestions(result.suggestions);
    } catch (error) {
      appendMessage(
        "assistant",
        error instanceof Error
          ? error.message
          : "Something went wrong running that task.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-full border border-violet-500/40 bg-violet-600 px-4 py-3 text-sm font-semibold text-white shadow-[0_0_30px_rgba(139,92,246,0.35)] transition-transform hover:scale-105"
        >
          <MessageCircle size={18} />
          Assistant
        </button>
      )}

      {open && (
        <div className="fixed bottom-5 right-5 z-50 flex h-[min(640px,calc(100dvh-2.5rem))] w-[min(400px,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-[#12121a] shadow-2xl">
          <header className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-500/20">
                <Sparkles size={16} className="text-violet-300" />
              </div>
              <div>
                <p className="text-sm font-semibold text-zinc-100">
                  Build Assistant
                </p>
                <p className="text-[10px] text-zinc-500">
                  Does tasks & ban rules
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
              aria-label="Close assistant"
            >
              <X size={18} />
            </button>
          </header>

          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`max-w-[92%] rounded-2xl px-3 py-2.5 text-sm leading-relaxed ${
                  message.role === "assistant"
                    ? "bg-[#1a1a24] text-zinc-300"
                    : "ml-auto bg-violet-600/90 text-white"
                }`}
              >
                {message.role === "assistant"
                  ? renderMarkdownish(message.content)
                  : message.content}
              </div>
            ))}
            {busy && (
              <div className="max-w-[92%] rounded-2xl bg-[#1a1a24] px-3 py-2.5 text-sm text-zinc-500">
                Working…
              </div>
            )}
          </div>

          {suggestions.length > 0 && (
            <div className="flex flex-wrap gap-2 border-t border-zinc-800/80 px-3 py-2">
              {suggestions.slice(0, 4).map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  disabled={busy}
                  onClick={() => void handleSubmit(suggestion)}
                  className="rounded-full border border-zinc-700 bg-[#0f0f15] px-2.5 py-1 text-[11px] text-zinc-400 transition-colors hover:border-violet-500/40 hover:text-violet-200 disabled:opacity-40"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          )}

          <form
            className="border-t border-zinc-800 p-3"
            onSubmit={(event) => {
              event.preventDefault();
              void handleSubmit(input);
            }}
          >
            <div className="flex items-center gap-2">
              <input
                ref={inputRef}
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="e.g. Laser Visor can't go with Crown…"
                className="min-w-0 flex-1 rounded-xl border border-zinc-700 bg-[#0d0d12] px-3 py-2.5 text-sm text-zinc-100 outline-none focus:border-violet-500/50"
              />
              <button
                type="submit"
                disabled={busy || !input.trim()}
                className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-600 text-white transition-colors hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="Send message"
              >
                <Send size={16} />
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
