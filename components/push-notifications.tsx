"use client";

import { useCallback, useEffect, useState } from "react";
import { useAccess } from "@/components/access-provider";
import { RATER_NAMES, RATER_ORDER, type Rater } from "@/data/raters";
import { cn } from "@/lib/utils";

// Push opt-in for edit devices: once you've said who you are, a one-time
// banner offers notifications for when the other person adds a place. On iOS
// this only works from the Home Screen app, so the banner also nudges Safari
// users to install first.
const DISMISSED_KEY = "push-dismissed";

function otherRater(rater: Rater): Rater {
  return RATER_ORDER.find((person) => person !== rater) ?? rater;
}

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(new ArrayBuffer(rawData.length));
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

async function subscribe(registration: ServiceWorkerRegistration): Promise<PushSubscription> {
  return registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!),
  });
}

export function PushNotificationPrompt() {
  const { canEdit, rater, authHeaders } = useAccess();
  const [banner, setBanner] = useState<"enable" | "install" | null>(null);
  const [busy, setBusy] = useState(false);

  const save = useCallback(
    async (subscription: PushSubscription) => {
      await fetch("/api/push", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ rater, subscription: subscription.toJSON() }),
      });
    },
    [authHeaders, rater],
  );

  useEffect(() => {
    if (!canEdit || !rater) return;
    if (localStorage.getItem(DISMISSED_KEY)) return;

    const supported = "serviceWorker" in navigator && "PushManager" in window;
    if (!supported) {
      // iOS Safari outside the installed app: push can't work yet, so nudge
      // towards Add to Home Screen instead of a dead permission prompt.
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
      const standalone = window.matchMedia("(display-mode: standalone)").matches;
      if (isIOS && !standalone) setBanner("install");
      return;
    }

    let cancelled = false;
    (async () => {
      const registration = await navigator.serviceWorker.register("/sw.js", {
        scope: "/",
        updateViaCache: "none",
      });
      if (Notification.permission === "granted") {
        // Permission already given — keep the server's copy of the
        // subscription current (endpoints can rotate) without any UI.
        const subscription =
          (await registration.pushManager.getSubscription()) ?? (await subscribe(registration));
        await save(subscription);
      } else if (Notification.permission === "default" && !cancelled) {
        setBanner("enable");
      }
    })().catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [canEdit, rater, save]);

  const dismiss = useCallback(() => {
    localStorage.setItem(DISMISSED_KEY, "1");
    setBanner(null);
  }, []);

  const enable = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        dismiss();
        return;
      }
      const registration = await navigator.serviceWorker.ready;
      await save(await subscribe(registration));
      setBanner(null);
    } catch {
      setBanner(null);
    } finally {
      setBusy(false);
    }
  }, [busy, dismiss, save]);

  if (!banner || !rater) return null;

  return (
    <div
      className={cn(
        "fixed bottom-4 inset-x-4 z-[1500] mx-auto max-w-sm rounded-2xl p-4",
        "border border-[rgba(247,242,234,0.12)] bg-[#2A211B] shadow-[0_8px_24px_rgba(0,0,0,0.45)]",
      )}
      role="dialog"
      aria-label="Notifications"
    >
      {banner === "install" ? (
        <>
          <p className="text-[13.5px] font-semibold text-[#F7F2EA] m-0 mb-1">
            Want a ping when {RATER_NAMES[otherRater(rater)]} adds a spot?
          </p>
          <p className="text-[12.5px] text-[#F7F2EA]/55 m-0 mb-3">
            Add this app to your Home Screen first: tap the share button, then
            &ldquo;Add to Home Screen&rdquo;.
          </p>
          <button
            type="button"
            onClick={dismiss}
            className={cn(
              "w-full py-2 rounded-lg text-[12.5px] font-semibold",
              "border border-[rgba(247,242,234,0.2)] text-[#F7F2EA]/70",
              "hover:bg-[rgba(247,242,234,0.06)]",
            )}
          >
            Got it
          </button>
        </>
      ) : (
        <>
          <p className="text-[13.5px] font-semibold text-[#F7F2EA] m-0 mb-3">
            Get a ping when {RATER_NAMES[otherRater(rater)]} adds a spot?
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={enable}
              disabled={busy}
              className={cn(
                "flex-1 py-2 rounded-lg text-[12.5px] font-bold",
                "bg-[#B8834A] text-[#1C1512] hover:bg-[#c99458]",
                "disabled:opacity-40 disabled:pointer-events-none",
              )}
            >
              {busy ? "Turning on…" : "Turn on"}
            </button>
            <button
              type="button"
              onClick={dismiss}
              className={cn(
                "flex-1 py-2 rounded-lg text-[12.5px] font-semibold",
                "border border-[rgba(247,242,234,0.2)] text-[#F7F2EA]/70",
                "hover:bg-[rgba(247,242,234,0.06)]",
              )}
            >
              Not now
            </button>
          </div>
        </>
      )}
    </div>
  );
}
