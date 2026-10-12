// @ts-nocheck
"use client";
// Small mutation buttons: call the action, show its message on failure, then refresh.
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { makeCopy } from "@/app/actions/copies.js";
import { restoreVersion } from "@/app/actions/projects.js";
import { promoteCopy } from "@/app/actions/requests.js";

function useAction() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  async function run(fn, onOk) {
    setBusy(true);
    setError(null);
    const r = await fn();
    setBusy(false);
    if (!r.ok) {
      setError(r.message);
      return r;
    }
    if (onOk) onOk(r, router);
    router.refresh();
    return r;
  }
  return { busy, error, run };
}

function Err({ error }) {
  return error ? <span role="alert" className="text-xs text-bad-text">{error}</span> : null;
}

export function MakeCopyButton({ projectId }) {
  const { busy, error, run } = useAction();
  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button type="button" className="btn" disabled={busy}
        onClick={() => run(() => makeCopy(projectId), (r, router) => router.push(`/c/${r.data.copyId}`))}>
        {busy ? "Making your copy…" : "Make my copy"}
      </button>
      <Err error={error} />
    </span>
  );
}

export function RestoreButton({ projectId, versionId }) {
  const { busy, error, run } = useAction();
  return (
    <span className="inline-flex items-center gap-2">
      <Err error={error} />
      <button type="button" className="btn-ghost btn-sm" disabled={busy}
        onClick={() => window.confirm("Make this old version the main version again? The current main stays in history.") &&
          run(() => restoreVersion({ projectId, versionId }))}>
        {busy ? "Restoring…" : "Restore"}
      </button>
    </span>
  );
}

/** "Make this the main version", with the stale-copy confirmation (STALE_COPY → retry acknowledged). */
export function PromoteButton({ copyId, small = false }) {
  const { busy, error, run } = useAction();
  const dialog = useRef(null);
  const [done, setDone] = useState(false);

  async function promote(acknowledgeStale) {
    const r = await run(() => promoteCopy({ copyId, acknowledgeStale }));
    if (r.ok) setDone(true);
    else if (r.code === "STALE_COPY" && !acknowledgeStale) dialog.current?.showModal();
  }

  if (done) return <span className="text-xs text-ok-text">This is now the main version.</span>;
  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button type="button" className={`btn-accent btn ${small ? "btn-sm" : ""}`} disabled={busy} onClick={() => promote(false)}>
        {busy ? "Working…" : "Make this the main version"}
      </button>
      {error && !dialog.current?.open && <Err error={error} />}
      <dialog ref={dialog} className="m-auto max-w-md rounded-card border border-line bg-surface p-6 text-ink shadow-raised">
        <h2 className="h2">This copy is based on an older version</h2>
        <p className="mt-2 text-sm text-ink-2">
          The main version has changed since this copy was made. If you continue, this copy replaces the current main
          as it is, and anything added to main since then won't be in it. The current main stays in history.
        </p>
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={() => dialog.current?.close()}>Cancel</button>
          <button type="button" className="btn-accent btn" disabled={busy}
            onClick={async () => {
              dialog.current?.close();
              await promote(true);
            }}>
            Make it the main version anyway
          </button>
        </div>
      </dialog>
    </span>
  );
}
