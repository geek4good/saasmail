import { useEffect, useState } from "react";
import {
  isPushSupported,
  isPushSubscribed,
  enablePush,
  disablePush,
} from "@/lib/push";
import PageHeader, { PageContainer } from "@/components/PageHeader";

interface Subscription {
  id: string;
  userAgent: string | null;
  createdAt: number;
  lastUsedAt: number | null;
}

export default function NotificationsSettingsPage() {
  const [supported] = useState(isPushSupported);
  const [pushEnabled, setPushEnabled] = useState<boolean | null>(null);
  const [subscribedHere, setSubscribedHere] = useState(false);
  const [subs, setSubs] = useState<Subscription[]>([]);
  const [busy, setBusy] = useState(false);
  const [vapidPublicKey, setVapidPublicKey] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    const cfg = await fetch("/api/notifications/config", {
      credentials: "include",
    }).then((r) => r.json());
    setPushEnabled(cfg.pushEnabled);
    setVapidPublicKey(cfg.vapidPublicKey);
    setSubscribedHere(await isPushSubscribed());
    const list = await fetch("/api/notifications/subscriptions", {
      credentials: "include",
    }).then((r) => r.json());
    setSubs(list.subscriptions ?? []);
  }

  useEffect(() => {
    void refresh();
  }, []);

  function MessageState({ children }: { children: React.ReactNode }) {
    return (
      <PageContainer>
        <PageHeader title="Settings" />
        <p className="text-sm text-text-secondary">{children}</p>
      </PageContainer>
    );
  }

  if (!supported) {
    return (
      <MessageState>
        Your browser does not support push notifications.
      </MessageState>
    );
  }
  if (pushEnabled === null) {
    return <MessageState>Loading…</MessageState>;
  }
  if (pushEnabled === false) {
    return (
      <MessageState>
        Push notifications are not configured on this saasmail deployment.
      </MessageState>
    );
  }

  async function onEnable() {
    setError(null);
    setBusy(true);
    try {
      const result = await enablePush();
      if (!result.ok) {
        setError(result.reason);
        return;
      }
      await refresh();
    } finally {
      setBusy(false);
    }
  }
  async function onDisable() {
    setBusy(true);
    try {
      await disablePush();
      await refresh();
    } finally {
      setBusy(false);
    }
  }
  async function onRevoke(id: string) {
    setBusy(true);
    try {
      await fetch(`/api/notifications/subscriptions/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <PageContainer>
      <PageHeader
        title="Settings"
        subtitle="Manage push notifications and per-device subscriptions."
      />

      <div className="max-w-3xl space-y-5">
        <section className="rounded-[8px] bg-card p-5 ring-1 ring-border">
          <h2 className="text-sm font-semibold text-text-primary">
            This browser
          </h2>
          <p className="mt-1 text-xs font-light text-text-secondary">
            {subscribedHere
              ? "Push is on for this browser."
              : "Push is off for this browser."}
          </p>
          {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
          <div className="mt-3">
            {subscribedHere ? (
              <button
                className="rounded-[6px] border border-border px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-bg-muted hover:text-text-primary"
                disabled={busy || !vapidPublicKey}
                onClick={onDisable}
              >
                Disable
              </button>
            ) : (
              <button
                className="rounded-[6px] bg-text-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-text-primary/90"
                disabled={busy || !vapidPublicKey}
                onClick={onEnable}
              >
                Enable
              </button>
            )}
          </div>
        </section>

        <section className="overflow-hidden rounded-[8px] bg-card ring-1 ring-border">
          <div className="border-b border-border px-5 py-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-text-tertiary">
              All subscribed browsers
            </h2>
          </div>
          {subs.length === 0 ? (
            <p className="px-5 py-4 text-xs font-light text-text-tertiary">
              None yet.
            </p>
          ) : (
            <ul className="divide-y divide-border/60 text-xs">
              {subs.map((s) => (
                <li
                  key={s.id}
                  className="flex items-center justify-between gap-4 px-5 py-3"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-text-primary">
                      {s.userAgent ?? "Unknown browser"}
                    </div>
                    <div className="text-xs font-light text-text-tertiary">
                      added {new Date(s.createdAt * 1000).toLocaleString()}
                      {s.lastUsedAt
                        ? ` · last used ${new Date(s.lastUsedAt * 1000).toLocaleString()}`
                        : ""}
                    </div>
                  </div>
                  <button
                    className="rounded-[6px] border border-border px-2 py-1 text-xs font-medium text-text-secondary hover:bg-bg-muted hover:text-text-primary"
                    disabled={busy}
                    onClick={() => onRevoke(s.id)}
                  >
                    Revoke
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </PageContainer>
  );
}
