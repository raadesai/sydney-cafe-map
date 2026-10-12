"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useAccess } from "@/components/access-provider";
import { cn } from "@/lib/utils";

const MAX_DIMENSION = 1400;
const JPEG_QUALITY = 0.8;

type Photo = { url: string };

type UploadState =
  | { state: "idle" }
  | { state: "uploading"; done: number; total: number }
  | { state: "error"; message: string };

// Photos are drawn through a canvas before upload so multi-MB camera shots
// leave the phone as ~200-400KB JPEGs.
async function resizeToJpeg(file: File): Promise<Blob> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Couldn't read image"));
      el.src = objectUrl;
    });

    const scale = Math.min(1, MAX_DIMENSION / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas unavailable");
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY)
    );
    if (!blob) throw new Error("Couldn't convert image");
    return blob;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

// photosVersion is the place's photos_updated_at — it changes via realtime
// when the other person adds or deletes a photo, and triggers a refetch.
export function PlacePhotos({
  placeName,
  photosVersion,
}: {
  placeName: string;
  photosVersion?: string | null;
}) {
  const { canEdit, authHeaders } = useAccess();
  const [photos, setPhotos] = useState<Photo[] | null>(null);
  const [upload, setUpload] = useState<UploadState>({ state: "idle" });
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Swipe left/right in the viewer to move between photos. The image tracks
  // the finger; releasing past the threshold advances, otherwise it snaps back.
  const [dragX, setDragX] = useState(0);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const swiped = useRef(false);

  function onViewerTouchStart(e: React.TouchEvent) {
    if (e.touches.length !== 1) return;
    touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    swiped.current = false;
  }

  function onViewerTouchMove(e: React.TouchEvent) {
    if (!touchStart.current || !photos || photos.length < 2) return;
    const dx = e.touches[0].clientX - touchStart.current.x;
    const dy = e.touches[0].clientY - touchStart.current.y;
    if (!swiped.current && Math.abs(dx) < 10) return;
    if (swiped.current || Math.abs(dx) > Math.abs(dy)) {
      swiped.current = true;
      setDragX(dx);
    }
  }

  function onViewerTouchEnd() {
    if (swiped.current && viewerIndex !== null && photos && Math.abs(dragX) > 60) {
      setConfirmingDelete(false);
      setViewerIndex(
        dragX < 0 ? (viewerIndex + 1) % photos.length : (viewerIndex - 1 + photos.length) % photos.length,
      );
    }
    setDragX(0);
    touchStart.current = null;
  }

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/photos?place=${encodeURIComponent(placeName)}`, {
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error();
      const data: { photos: Photo[] } = await res.json();
      setPhotos(data.photos);
    } catch {
      setPhotos([]);
    }
  }, [placeName, authHeaders]);

  useEffect(() => {
    if (!canEdit) return;
    setPhotos(null);
    setViewerIndex(null);
    setUpload({ state: "idle" });
    refresh();
  }, [refresh, canEdit]);

  // Silently refetch when the version bumps (someone changed photos on
  // another device) — without resetting the viewer like the effect above.
  const lastVersion = useRef(photosVersion);
  useEffect(() => {
    if (photosVersion === lastVersion.current) return;
    lastVersion.current = photosVersion;
    if (canEdit) refresh();
  }, [photosVersion, canEdit, refresh]);

  async function onFilesPicked(fileList: FileList | null) {
    const files = Array.from(fileList ?? []).slice(0, 8);
    if (files.length === 0) return;

    setUpload({ state: "uploading", done: 0, total: files.length });
    try {
      for (let i = 0; i < files.length; i++) {
        const jpeg = await resizeToJpeg(files[i]);
        const res = await fetch(`/api/photos?place=${encodeURIComponent(placeName)}`, {
          method: "POST",
          headers: { "Content-Type": "image/jpeg", ...authHeaders() },
          body: jpeg,
        });
        if (!res.ok) throw new Error("Upload failed — try again");
        setUpload({ state: "uploading", done: i + 1, total: files.length });
      }
      setUpload({ state: "idle" });
      await refresh();
    } catch (err) {
      setUpload({
        state: "error",
        message: err instanceof Error ? err.message : "Upload failed — try again",
      });
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function deleteCurrent() {
    if (viewerIndex === null || !photos) return;
    const target = photos[viewerIndex];
    try {
      const res = await fetch(`/api/photos?url=${encodeURIComponent(target.url)}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      if (!res.ok) return;
      const remaining = photos.filter((p) => p.url !== target.url);
      setPhotos(remaining);
      setConfirmingDelete(false);
      setViewerIndex(remaining.length === 0 ? null : Math.min(viewerIndex, remaining.length - 1));
    } catch {
      // Leave the viewer open; user can retry.
    }
  }

  const uploading = upload.state === "uploading";

  // Photos are password-only: view-only devices see no strip and no button.
  if (!canEdit) return null;

  return (
    <div className="mt-2.5">
      {/* Thumbnail strip */}
      {photos && photos.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-0.5 px-0.5">
          {photos.map((photo, i) => (
            <button
              key={photo.url}
              type="button"
              onClick={() => {
                setConfirmingDelete(false);
                setViewerIndex(i);
              }}
              className={cn(
                "shrink-0 w-14 h-14 rounded-lg overflow-hidden",
                "border border-[#1C1512]/10",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B8834A]/60",
              )}
              aria-label={`Photo ${i + 1} of ${placeName}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photo.url} alt="" loading="lazy" className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      )}

      {/* Add button */}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => onFilesPicked(e.target.files)}
      />
      <button
        type="button"
        disabled={uploading}
        onClick={() => inputRef.current?.click()}
        className={cn(
          "mt-1.5 w-full py-1.5 rounded-lg text-[11.5px] font-semibold",
          "border border-dashed border-[#B8834A]/50 text-[#8a6237]",
          "hover:bg-[#B8834A]/10 active:bg-[#B8834A]/20",
          "disabled:opacity-50",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B8834A]/60",
        )}
      >
        {uploading
          ? `Uploading ${upload.done + 1} of ${upload.total}…`
          : photos && photos.length > 0
            ? "+ Add photos"
            : "📷 Add photos"}
      </button>
      {upload.state === "error" && (
        <p className="text-[10.5px] text-[#8b3d24] mt-1" role="alert">
          {upload.message}
        </p>
      )}

      {/* Fullscreen viewer — portaled to body because the map popup's CSS
          transform would otherwise trap position:fixed inside it. */}
      {viewerIndex !== null && photos && photos[viewerIndex] &&
        createPortal(
          <div
            className="fixed inset-0 z-[1000] bg-black/90 flex items-center justify-center touch-pan-y"
            onClick={() => {
              // A swipe that ends over the backdrop still fires a click; don't
              // let it close the viewer.
              if (swiped.current) {
                swiped.current = false;
                return;
              }
              setViewerIndex(null);
            }}
            onTouchStart={onViewerTouchStart}
            onTouchMove={onViewerTouchMove}
            onTouchEnd={onViewerTouchEnd}
            onTouchCancel={onViewerTouchEnd}
            role="dialog"
            aria-label={`Photos of ${placeName}`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photos[viewerIndex].url}
              alt={`Photo of ${placeName}`}
              className="max-w-[94vw] max-h-[82dvh] object-contain rounded-lg motion-safe:transition-transform motion-safe:duration-200"
              style={dragX !== 0 ? { transform: `translateX(${dragX}px)`, transition: "none" } : undefined}
              onClick={(e) => e.stopPropagation()}
            />

            <button
              type="button"
              aria-label="Close"
              onClick={() => setViewerIndex(null)}
              className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 text-white text-[20px] leading-none"
            >
              ✕
            </button>

            {photos.length > 1 && (
              <>
                <button
                  type="button"
                  aria-label="Previous photo"
                  onClick={(e) => {
                    e.stopPropagation();
                    setConfirmingDelete(false);
                    setViewerIndex((viewerIndex - 1 + photos.length) % photos.length);
                  }}
                  className="absolute left-2 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white/10 text-white text-[22px] leading-none"
                >
                  ‹
                </button>
                <button
                  type="button"
                  aria-label="Next photo"
                  onClick={(e) => {
                    e.stopPropagation();
                    setConfirmingDelete(false);
                    setViewerIndex((viewerIndex + 1) % photos.length);
                  }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white/10 text-white text-[22px] leading-none"
                >
                  ›
                </button>
              </>
            )}

            <div
              className="absolute bottom-5 inset-x-0 flex items-center justify-center gap-3"
              onClick={(e) => e.stopPropagation()}
            >
              {photos.length > 1 && (
                <span className="text-white/60 text-[12px]">
                  {viewerIndex + 1} / {photos.length}
                </span>
              )}
              {confirmingDelete ? (
                <button
                  type="button"
                  onClick={deleteCurrent}
                  className="px-4 py-1.5 rounded-full bg-[#C4735A] text-white text-[12.5px] font-bold"
                >
                  Delete this photo?
                </button>
              ) : (
                <button
                  type="button"
                  aria-label="Delete photo"
                  onClick={() => setConfirmingDelete(true)}
                  className="px-3 py-1.5 rounded-full bg-white/10 text-white/70 text-[12px]"
                >
                  Delete
                </button>
              )}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
