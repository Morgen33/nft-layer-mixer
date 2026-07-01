"use client";

import React, { useCallback, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import {
  collectFilesFromDataTransfer,
  filesFromFileList,
  type FileWithPath,
} from "@/lib/folder-import";

type FolderDropZoneProps = {
  children: React.ReactNode;
  onDrop: (files: FileWithPath[]) => void | Promise<void>;
  className?: string;
  overlayText?: string;
  disabled?: boolean;
  /** Enable hidden folder picker on click */
  pickFolderOnClick?: boolean;
};

export function FolderDropZone({
  children,
  onDrop,
  className,
  overlayText = "Drop folder or images here",
  disabled = false,
  pickFolderOnClick = false,
}: FolderDropZoneProps) {
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback(
    async (files: FileWithPath[]) => {
      if (disabled || files.length === 0) return;
      setBusy(true);
      try {
        await onDrop(files);
      } finally {
        setBusy(false);
        setDragOver(false);
      }
    },
    [disabled, onDrop],
  );

  return (
    <div
      className={cn("relative", className)}
      onDragEnter={(e) => {
        if (disabled) return;
        e.preventDefault();
        e.stopPropagation();
        setDragOver(true);
      }}
      onDragOver={(e) => {
        if (disabled) return;
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = "copy";
        setDragOver(true);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.currentTarget.contains(e.relatedTarget as Node)) return;
        setDragOver(false);
      }}
      onDrop={async (e) => {
        if (disabled) return;
        e.preventDefault();
        e.stopPropagation();
        setDragOver(false);
        const files = await collectFilesFromDataTransfer(e.dataTransfer);
        await handleFiles(files);
      }}
      onClick={
        pickFolderOnClick && !disabled
          ? () => inputRef.current?.click()
          : undefined
      }
    >
      {children}

      {(dragOver || busy) && !disabled && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center rounded-lg border-2 border-dashed border-emerald-400/70 bg-emerald-500/10 backdrop-blur-[1px]">
          <p className="px-3 text-center text-xs font-semibold text-emerald-300">
            {busy ? "Importing…" : overlayText}
          </p>
        </div>
      )}

      {pickFolderOnClick && (
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          multiple
          // @ts-expect-error webkitdirectory is supported in Chromium/Safari
          webkitdirectory=""
          directory=""
          onChange={(e) => {
            if (e.target.files?.length) {
              void handleFiles(filesFromFileList(e.target.files));
              e.target.value = "";
            }
          }}
        />
      )}
    </div>
  );
}
