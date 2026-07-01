"use client";

import { useEffect, useState } from "react";
import { BookOpen, Hexagon, ShieldBan } from "lucide-react";
import { ChatAssistant } from "@/components/ChatAssistant";
import { ProjectSaveMenu } from "@/components/ProjectSaveMenu";
import { IncompatibilityRulesModal } from "@/components/IncompatibilityRulesModal";
import { LeftPanel } from "@/components/panels/LeftPanel";
import { CenterPanel } from "@/components/panels/CenterPanel";
import { RightPanel } from "@/components/panels/RightPanel";
import { GlowButton } from "@/components/ui/primitives";
import { bootstrapProjectPersistence } from "@/lib/project-persistence";
import { useGeneratorStore } from "@/lib/store";

export function AppShell() {
  const [rulesOpen, setRulesOpen] = useState(false);
  const exclusionCount = useGeneratorStore((s) => s.exclusions.length);

  useEffect(() => {
    void bootstrapProjectPersistence();
  }, []);

  return (
    <div className="min-h-dvh bg-[#0d0d12] text-zinc-100 lg:flex lg:h-dvh lg:flex-col lg:overflow-hidden">
      <header className="sticky top-0 z-30 flex flex-col gap-3 border-b border-zinc-800/80 bg-[#0d0d12]/95 px-4 py-3 backdrop-blur-md sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:static lg:flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-violet-500/40 bg-violet-500/20 shadow-[0_0_20px_rgba(139,92,246,0.2)] sm:h-9 sm:w-9 sm:rounded-lg">
            <Hexagon size={20} className="text-violet-400" />
          </div>
          <div>
            <h1 className="text-base font-bold tracking-tight sm:text-lg">
              NFT Layer Mixer
            </h1>
            <p className="text-[9px] uppercase tracking-[0.18em] text-zinc-500 sm:text-[10px]">
              Art Generator & Rarity Engine
            </p>
          </div>
        </div>
        <div className="flex items-center justify-between gap-3 sm:justify-end sm:gap-4">
          <ProjectSaveMenu />
          <GlowButton
            variant="ghost"
            className="flex flex-1 text-xs sm:flex-none"
            onClick={() => setRulesOpen(true)}
          >
            <ShieldBan size={14} className="text-red-400" />
            Rules
            {exclusionCount > 0 && (
              <span className="rounded-full bg-red-500/20 px-1.5 py-0.5 text-[10px] font-bold text-red-300">
                {exclusionCount}
              </span>
            )}
          </GlowButton>
          <a
            href="/USER_MANUAL.pdf"
            target="_blank"
            rel="noopener noreferrer"
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-violet-500/30 bg-violet-500/10 px-3 py-2 text-xs font-medium text-violet-300 transition-colors hover:border-violet-400/50 hover:bg-violet-500/20 hover:text-violet-200 sm:flex-none sm:py-1.5"
          >
            <BookOpen size={14} />
            User Guide (PDF)
          </a>
          <div className="hidden sm:flex items-center gap-2 text-xs text-zinc-500">
            <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)] animate-pulse" />
            In-Browser • Zero Server
          </div>
        </div>
      </header>

      <main className="grid flex-1 grid-cols-1 gap-4 p-3 pb-6 sm:p-4 lg:min-h-0 lg:grid-cols-[minmax(280px,1fr)_minmax(360px,1.2fr)_minmax(260px,1fr)] lg:overflow-hidden lg:pb-4">
        <aside className="min-h-0 lg:overflow-hidden">
          <LeftPanel />
        </aside>
        <section className="min-h-0 lg:overflow-y-auto">
          <CenterPanel />
        </section>
        <aside className="min-h-0 lg:overflow-hidden">
          <RightPanel />
        </aside>
      </main>

      <IncompatibilityRulesModal
        open={rulesOpen}
        onClose={() => setRulesOpen(false)}
      />

      <ChatAssistant onOpenRules={() => setRulesOpen(true)} />
    </div>
  );
}
