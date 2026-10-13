// @ts-nocheck
"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client.js";
import { listNotifications, markNotificationsRead } from "@/app/actions/notifications.js";
import { formatDate } from "./ui.jsx";
import { Skeleton, Loading } from "./Skeleton.jsx";

/** Plain-language text and link for each notification type the RPCs send. */
function describe(n) {
  const req = `/requests/${n.ref_id}`;
  switch (n.type) {
    case "request_submitted": return ["New request to publish a copy", req];
    case "request_resubmitted": return ["A request to publish was resubmitted", req];
    case "request_approved": return ["Your request to publish was approved", req];
    case "request_changes_requested": return ["Changes were asked for on your request", req];
    case "request_rejected": return ["Your request to publish was rejected", req];
    case "copy_promoted": return ["Your copy became the main version", `/c/${n.ref_id}`];
    default: return ["Something happened", "/requests"];
  }
}

export default function Notifications({ uid }) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState({ loading: true, items: [], unread: 0, error: null });
  const wrap = useRef(null);

  const load = useCallback(async () => {
    const r = await listNotifications();
    setState(r.ok ? { loading: false, items: r.data.items, unread: r.data.unread, error: null } : (s) => ({ ...s, loading: false, error: r.message }));
  }, []);

  useEffect(() => {
    load();
    const supabase = createClient();
    let channel;
    let cancelled = false;
    (async () => {
      await supabase.realtime.setAuth();
      if (cancelled) return;
      channel = supabase
        .channel(`user:${uid}`, { config: { private: true } })
        .on("broadcast", { event: "*" }, () => load())
        .subscribe();
    })();
    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [uid, load]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    const onClick = (e) => wrap.current && !wrap.current.contains(e.target) && setOpen(false);
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  async function toggle() {
    const next = !open;
    setOpen(next);
    const unreadIds = state.items.filter((n) => !n.read).map((n) => n.id);
    if (next && unreadIds.length) {
      const r = await markNotificationsRead(unreadIds);
      if (r.ok) load();
    }
  }

  return (
    <div className="relative" ref={wrap}>
      <button type="button" className="btn-ghost btn-sm" aria-expanded={open} aria-haspopup="true" onClick={toggle}>
        Notifications
        {state.unread > 0 && (
          <span className="rounded-full bg-accent px-1.5 text-2xs font-medium text-canvas" aria-label={`${state.unread} unread`}>
            {state.unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 z-40 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-card border border-line bg-surface p-2 shadow-raised md:left-0 md:right-auto">
          {state.loading ? (
            <Loading className="flex flex-col gap-2 p-3">
              {[0, 1, 2].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
            </Loading>
          ) : state.error ? (
            <p role="alert" className="p-3 text-sm text-bad-text">{state.error}</p>
          ) : state.items.length === 0 ? (
            <p className="p-3 text-sm text-ink-2">Nothing new yet.</p>
          ) : (
            <ul className="max-h-96 overflow-y-auto">
              {state.items.map((n) => {
                const [text, href] = describe(n);
                return (
                  <li key={n.id}>
                    <Link href={href} onClick={() => setOpen(false)} className="block rounded-ghost px-3 py-2 text-sm text-ink no-underline hover:bg-canvas">
                      <span className={n.read ? "" : "font-medium"}>{text}</span>
                      <span className="meta block">{formatDate(n.created_at)}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
