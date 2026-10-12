import { get, put } from "@vercel/blob";
import webpush from "web-push";
import { RATER_NAMES, RATER_ORDER, type Rater } from "@/data/raters";
import type { PlaceType } from "@/lib/places";

// One push subscription per person, stored in a private blob — the keys in a
// subscription let anyone send notifications to that device, and blob writes
// (unlike repo commits) don't trigger a redeploy.
const SUBSCRIPTIONS_PATH = "push/subscriptions.json";

export type StoredSubscription = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
};

export type SubscriptionStore = Partial<Record<Rater, StoredSubscription>>;

export async function readSubscriptions(): Promise<SubscriptionStore> {
  const result = await get(SUBSCRIPTIONS_PATH, { access: "private" });
  if (!result || result.statusCode !== 200) return {};
  try {
    return JSON.parse(await new Response(result.stream).text());
  } catch {
    return {};
  }
}

export async function writeSubscriptions(store: SubscriptionStore): Promise<void> {
  await put(SUBSCRIPTIONS_PATH, JSON.stringify(store), {
    access: "private",
    contentType: "application/json",
    allowOverwrite: true,
  });
}

function vapidConfigured(): boolean {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return false;
  webpush.setVapidDetails("mailto:you@example.com", publicKey, privateKey);
  return true;
}

/** Notifies everyone except the person who added the place. Never throws. */
export async function notifyNewPlace(options: {
  adder: Rater | null;
  type: PlaceType;
  name: string;
  suburb: string;
}): Promise<void> {
  try {
    if (!vapidConfigured()) return;
    const store = await readSubscriptions();
    const targets = RATER_ORDER.filter((person) => person !== options.adder && store[person]);
    if (targets.length === 0) return;

    const article = options.type === "experience" ? "an" : "a";
    const payload = JSON.stringify({
      title: options.adder
        ? `${RATER_NAMES[options.adder]} added ${article} ${options.type}`
        : `New ${options.type} on the map`,
      body: `${options.name} — ${options.suburb}`,
      url: "/",
    });

    let pruned = false;
    await Promise.all(
      targets.map(async (person) => {
        try {
          await webpush.sendNotification(store[person]!, payload);
        } catch (err) {
          // 404/410 means the subscription expired — drop it so the person
          // gets re-prompted next time they open the app.
          const status = (err as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410) {
            delete store[person];
            pruned = true;
          }
        }
      })
    );
    if (pruned) await writeSubscriptions(store);
  } catch {
    // Notifications are best-effort; never fail the add because of them.
  }
}
