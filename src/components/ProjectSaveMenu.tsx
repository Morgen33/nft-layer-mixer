"use client";

import { useEffect, useRef, useState } from "react";
import { FolderOpen, Save, Trash2 } from "lucide-react";
import { GlowButton } from "@/components/ui/primitives";
import {
  fetchSavedProjects,
  loadSavedProject,
  removeSavedProject,
  saveNamedProject,
} from "@/lib/project-persistence";
import type { ProjectListItem } from "@/lib/project-storage";
import { useGeneratorStore } from "@/lib/store";

function formatSavedAt(timestamp: number | null): string {
  if (!timestamp) return "Not saved yet";
  const delta = Date.now() - timestamp;
  if (delta < 60_000) return "Saved just now";
  if (delta < 3_600_000) {
    return `Saved ${Math.max(1, Math.round(delta / 60_000))}m ago`;
  }
  return `Saved ${new Date(timestamp).toLocaleString()}`;
}

export function ProjectSaveMenu() {
  const [open, setOpen] = useState(false);
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const menuRef = useRef<HTMLDivElement>(null);
  const isSaving = useGeneratorStore((s) => s.isSaving);
  const lastSavedAt = useGeneratorStore((s) => s.lastSavedAt);
  const activeProjectName = useGeneratorStore((s) => s.activeProjectName);
  const persistenceError = useGeneratorStore((s) => s.persistenceError);
  const persistenceReady = useGeneratorStore((s) => s.persistenceReady);

  useEffect(() => {
    if (!open) return;
    void fetchSavedProjects().then(setProjects);
  }, [open, lastSavedAt]);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    const onPointerDown = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("mousedown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("mousedown", onPointerDown);
    };
  }, [open]);

  const handleSave = async () => {
    const defaultName = useGeneratorStore.getState().metadataConfig.namePrefix;
    const name = window.prompt("Save project as:", defaultName || activeProjectName);
    if (!name) return;
    try {
      await saveNamedProject(name);
      setOpen(false);
    } catch {
      // persistenceError is set in store
    }
  };

  const handleLoad = async (id: string) => {
    try {
      await loadSavedProject(id);
      setOpen(false);
    } catch {
      // persistenceError is set in store
    }
  };

  const handleDelete = async (id: string, name: string) => {
    const confirmed = window.confirm(`Delete saved project "${name}"?`);
    if (!confirmed) return;
    await removeSavedProject(id);
    setProjects(await fetchSavedProjects());
  };

  return (
    <div ref={menuRef} className="relative">
      <div className="flex items-center gap-2">
        <span className="hidden text-[10px] text-zinc-500 xl:inline">
          {isSaving ? "Saving…" : formatSavedAt(lastSavedAt)}
        </span>
        <GlowButton
          variant="ghost"
          className="text-xs"
          disabled={!persistenceReady || isSaving}
          onClick={() => void handleSave()}
        >
          <Save size={14} />
          Save
        </GlowButton>
        <GlowButton
          variant="ghost"
          className="text-xs"
          disabled={!persistenceReady}
          onClick={() => setOpen((value) => !value)}
        >
          <FolderOpen size={14} />
          Open
        </GlowButton>
      </div>

      {persistenceError && (
        <p className="absolute right-0 top-full z-40 mt-1 max-w-xs rounded-lg border border-red-500/30 bg-[#14141c] px-2 py-1 text-[10px] text-red-400">
          {persistenceError}
        </p>
      )}

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-72 overflow-hidden rounded-xl border border-zinc-800 bg-[#14141c] shadow-2xl">
          <div className="border-b border-zinc-800 px-3 py-2">
            <p className="text-xs font-semibold text-zinc-200">Saved Projects</p>
            <p className="text-[10px] text-zinc-500">
              Auto-saves on change. Refresh brings your last session back.
            </p>
          </div>
          <div className="max-h-64 overflow-y-auto p-2">
            {projects.length === 0 && (
              <p className="px-2 py-4 text-center text-xs text-zinc-600">
                No named saves yet. Click Save to keep a snapshot.
              </p>
            )}
            {projects.map((project) => (
              <div
                key={project.id}
                className="mb-1 flex items-center gap-2 rounded-lg border border-zinc-800 bg-[#0f0f15] px-2 py-2"
              >
                <button
                  type="button"
                  className="min-w-0 flex-1 text-left"
                  onClick={() => void handleLoad(project.id)}
                >
                  <div className="truncate text-xs font-medium text-zinc-200">
                    {project.name}
                  </div>
                  <div className="text-[10px] text-zinc-500">
                    {project.layerCount} layers · {project.traitCount} traits ·{" "}
                    {new Date(project.updatedAt).toLocaleDateString()}
                  </div>
                </button>
                <button
                  type="button"
                  className="rounded p-1 text-zinc-500 hover:text-red-400"
                  onClick={() => void handleDelete(project.id, project.name)}
                  aria-label={`Delete ${project.name}`}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
