"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAccess } from "@/components/access-provider";
import { RATER_COLORS, RATER_NAMES, RATER_ORDER, type Rater } from "@/data/raters";
import { cn } from "@/lib/utils";

type Comment = { rater: Rater; body: string; updatedAt: string };

// One comment per person per place, mirroring ratings: you write yours in
// your own row, and the other person's stays hidden until both exist.
// Password-only, like photos: view-only devices see nothing.
export function PlaceComments({ placeId }: { placeId: number }) {
  const { canEdit, rater: viewer, authHeaders } = useAccess();
  const [comments, setComments] = useState<Partial<Record<Rater, Comment>>>({});
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(false);
  const typed = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/comments?placeId=${placeId}`, { headers: authHeaders() });
      if (!res.ok) throw new Error();
      const data: { comments: Comment[] } = await res.json();
      const byRater: Partial<Record<Rater, Comment>> = {};
      for (const comment of data.comments) byRater[comment.rater] = comment;
      setComments(byRater);
      // Prefill your own comment for editing — unless you've already typed.
      if (viewer && !typed.current) setDraft(byRater[viewer]?.body ?? "");
    } catch {
      // Leave whatever we have; the popup can be reopened.
    }
  }, [placeId, authHeaders, viewer]);

  useEffect(() => {
    if (canEdit) refresh();
  }, [refresh, canEdit]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!viewer || sending) return;
    const text = draft.trim();
    setSending(true);
    setError(false);
    try {
      const res = await fetch("/api/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ placeId, rater: viewer, body: text }),
      });
      if (!res.ok) throw new Error();
      const data: { comment: Comment | null } = await res.json();
      setComments((prev) => {
        const next = { ...prev };
        if (data.comment) next[viewer] = data.comment;
        else delete next[viewer];
        return next;
      });
      setDraft(data.comment?.body ?? "");
      typed.current = false;
    } catch {
      setError(true);
    } finally {
      setSending(false);
    }
  }

  if (!canEdit) return null;

  const mine = viewer ? comments[viewer] : undefined;
  const dirty = draft.trim() !== (mine?.body ?? "");

  return (
    <div className="mt-2.5 pt-2 border-t border-[#1C1512]/10 flex flex-col gap-1">
      {RATER_ORDER.map((person) => {
        const theirs = comments[person];
        return (
          <div key={person} className="flex items-start gap-2 min-h-[24px]">
            <span
              className="w-4 shrink-0 pt-1 text-[10.5px] font-bold"
              style={{ color: RATER_COLORS[person] }}
              title={RATER_NAMES[person]}
            >
              {person}
            </span>

            {viewer === person ? (
              <form onSubmit={submit} className="flex-1 flex items-center gap-1.5 min-w-0">
                <input
                  type="text"
                  value={draft}
                  onChange={(e) => {
                    typed.current = true;
                    setDraft(e.target.value);
                  }}
                  placeholder="Add a comment…"
                  disabled={sending}
                  enterKeyHint="send"
                  maxLength={500}
                  className={cn(
                    "flex-1 min-w-0 rounded-lg border border-[#1C1512]/10 bg-[#1C1512]/[0.03]",
                    "px-2.5 py-1 text-[12px] text-[#1C1512] placeholder:text-[#1C1512]/35",
                    "focus:outline-none focus:ring-1 focus:ring-[#B8834A]/50 focus:border-transparent",
                    "disabled:opacity-50",
                  )}
                />
                {dirty && (
                  <button
                    type="submit"
                    disabled={sending}
                    aria-label="Save comment"
                    className={cn(
                      "shrink-0 w-6 h-6 rounded-full bg-[#B8834A] text-[#F7F2EA] text-[13px] leading-none",
                      "hover:bg-[#c99458] active:bg-[#a57440] disabled:opacity-50",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B8834A]/60",
                    )}
                  >
                    ↑
                  </button>
                )}
              </form>
            ) : !theirs ? (
              <span className="text-[11px] pt-1 text-[#1C1512]/35">No comment yet</span>
            ) : !viewer || !mine ? (
              <span className="text-[11px] pt-1 italic text-[#1C1512]/45">
                {viewer ? "Commented — reveals once you comment" : "Hidden until both comment"}
              </span>
            ) : (
              <p className="flex-1 text-[11.5px] leading-snug text-[#1C1512]/80 m-0 pt-1">
                {theirs.body}
              </p>
            )}
          </div>
        );
      })}

      {error && (
        <p className="text-[10.5px] text-[#8b3d24] m-0" role="alert">
          Couldn&apos;t save — try again
        </p>
      )}
    </div>
  );
}
