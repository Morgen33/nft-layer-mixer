"use client";

import { cn } from "@/lib/utils";
import type { RarityTier } from "@/lib/types";
import { RARITY_COLORS, RARITY_LABELS } from "@/lib/types";

export function TierBadge({
  tier,
  className,
}: {
  tier: RarityTier;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider",
        className,
      )}
      style={{
        color: RARITY_COLORS[tier],
        backgroundColor: `${RARITY_COLORS[tier]}20`,
        boxShadow: `0 0 8px ${RARITY_COLORS[tier]}40`,
      }}
    >
      {RARITY_LABELS[tier]}
    </span>
  );
}

export function GlowButton({
  children,
  variant = "primary",
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger" | "ghost";
}) {
  const variants = {
    primary:
      "bg-emerald-500/20 text-emerald-400 border-emerald-500/50 hover:bg-emerald-500/30 hover:shadow-[0_0_20px_rgba(16,185,129,0.3)]",
    secondary:
      "bg-violet-500/20 text-violet-400 border-violet-500/50 hover:bg-violet-500/30 hover:shadow-[0_0_20px_rgba(139,92,246,0.3)]",
    danger:
      "bg-red-500/20 text-red-400 border-red-500/50 hover:bg-red-500/30",
    ghost:
      "bg-transparent text-zinc-400 border-zinc-700 hover:bg-zinc-800/50 hover:text-zinc-200",
  };

  return (
    <button
      className={cn(
        "inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-all disabled:cursor-not-allowed disabled:opacity-40 sm:min-h-0 sm:py-1.5",
        variants[variant],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function Panel({
  title,
  icon,
  children,
  className,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "rounded-xl border border-zinc-800/80 bg-[#12121a]/80 backdrop-blur-sm",
        className,
      )}
    >
      <header className="flex items-center gap-2 border-b border-zinc-800/80 px-3 py-2.5 sm:px-4 sm:py-3">
        {icon}
        <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-300 sm:text-sm">
          {title}
        </h2>
      </header>
      <div className="p-3 sm:p-4">{children}</div>
    </section>
  );
}

export function StatPill({
  label,
  value,
  accent,
}: {
  label: string;
  value: string | number;
  accent?: string;
}) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-[#0d0d12] px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-zinc-500">
        {label}
      </div>
      <div
        className="text-base font-bold tabular-nums sm:text-lg"
        style={{ color: accent ?? "#e4e4e7" }}
      >
        {value}
      </div>
    </div>
  );
}
