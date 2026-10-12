import { authorized, unauthorizedResponse } from "@/lib/api-auth";
import { isRater } from "@/data/raters";
import { readSubscriptions, writeSubscriptions, type StoredSubscription } from "@/lib/push";

type PushBody = {
  rater?: string;
  subscription?: {
    endpoint?: string;
    keys?: { p256dh?: string; auth?: string };
  };
};

function parseSubscription(body: PushBody): StoredSubscription | null {
  const sub = body.subscription;
  if (!sub?.endpoint || !sub.keys?.p256dh || !sub.keys.auth) return null;
  return { endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } };
}

export async function POST(request: Request) {
  if (!authorized(request)) return unauthorizedResponse();

  let body: PushBody;
  try {
    body = await request.json();
  } catch {
    return Response.json({ message: "Invalid JSON body" }, { status: 400 });
  }

  if (!isRater(body.rater)) {
    return Response.json({ message: "rater must be 'R' or 'M'" }, { status: 400 });
  }
  const subscription = parseSubscription(body);
  if (!subscription) {
    return Response.json({ message: "subscription is missing endpoint or keys" }, { status: 400 });
  }

  const store = await readSubscriptions();
  const existing = store[body.rater];
  if (existing?.endpoint === subscription.endpoint && existing.keys.auth === subscription.keys.auth) {
    return Response.json({ message: "Already subscribed" });
  }
  store[body.rater] = subscription;
  await writeSubscriptions(store);

  return Response.json({ message: "Subscribed" });
}

export async function DELETE(request: Request) {
  if (!authorized(request)) return unauthorizedResponse();

  const rater = new URL(request.url).searchParams.get("rater");
  if (!isRater(rater)) {
    return Response.json({ message: "rater must be 'R' or 'M'" }, { status: 400 });
  }

  const store = await readSubscriptions();
  if (store[rater]) {
    delete store[rater];
    await writeSubscriptions(store);
  }

  return Response.json({ message: "Unsubscribed" });
}
