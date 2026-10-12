// @ts-nocheck
"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { resubmitRequest, reviewRequest, submitRequest } from "@/app/actions/requests.js";
import { ErrorNote } from "./ui.jsx";

function useSubmit() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  async function go(fn) {
    setBusy(true);
    setError(null);
    const r = await fn();
    setBusy(false);
    if (!r.ok) return setError(r.message), false;
    router.refresh();
    return true;
  }
  return { busy, error, go };
}

function NoteForm({ id, label, help, button, busyText, onSend }) {
  const [note, setNote] = useState("");
  const { busy, error, go } = useSubmit();
  return (
    <form className="card flex flex-col gap-3"
      onSubmit={async (e) => {
        e.preventDefault();
        if (await go(() => onSend(note))) setNote("");
      }}>
      <div>
        <label htmlFor={id} className="label">{label}</label>
        <textarea id={id} rows={3} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} aria-describedby={`${id}-help`} className="field" />
        <p id={`${id}-help`} className="mt-1 text-xs text-ink-2">{help}</p>
      </div>
      {error && <ErrorNote>{error}</ErrorNote>}
      <div><button type="submit" className="btn" disabled={busy}>{busy ? busyText : button}</button></div>
    </form>
  );
}

export function SubmitRequestForm({ copyId }) {
  return (
    <NoteForm id="request-note" label="Request to publish" button="Request to publish" busyText="Sending…"
      help="Tell the owner what you changed. You can't save while they review it."
      onSend={(note) => submitRequest({ copyId, note: note || null })} />
  );
}

export function ResubmitForm({ requestId }) {
  return (
    <NoteForm id="resubmit-note" label="Resubmit" button="Resubmit" busyText="Sending…"
      help="Save your changes first, then resubmit with a short note."
      onSend={(note) => resubmitRequest({ requestId, note: note || null })} />
  );
}

/** Owner's decision bar on the review screen. */
export function ReviewBar({ requestId }) {
  const [comment, setComment] = useState("");
  const { busy, error, go } = useSubmit();
  const [hint, setHint] = useState(null);
  const decide = (decision) => go(() => reviewRequest({ requestId, decision, comment: comment || null }));
  return (
    <div className="sticky bottom-0 z-10 border-t border-line bg-canvas px-4 py-4 sm:px-8">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
        <div className="flex-1">
          <label htmlFor="review-comment" className="label">Comment <span className="font-normal text-ink-2">(sent with your decision)</span></label>
          <textarea id="review-comment" rows={2} maxLength={4000} value={comment} onChange={(e) => setComment(e.target.value)} className="field" />
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn bg-ok" disabled={busy} onClick={() => decide("approve")}>Approve</button>
          <button type="button" className="btn bg-warn text-[#27251e]" disabled={busy}
            onClick={() => {
              if (comment.trim()) return setHint(null), decide("request_changes");
              setHint("Write a comment saying what to change.");
              document.getElementById("review-comment")?.focus();
            }}>
            Ask for changes
          </button>
          <button type="button" className="btn-ghost btn-danger" disabled={busy} onClick={() => window.confirm("Reject this request? The copy goes back to a private draft, and this request can't be reopened.") && decide("reject")}>Reject</button>
        </div>
      </div>
      {(error || hint) && <div className="mt-2"><ErrorNote>{error ?? hint}</ErrorNote></div>}
    </div>
  );
}
