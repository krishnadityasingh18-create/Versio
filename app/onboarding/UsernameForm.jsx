// @ts-nocheck
"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { setUsername } from "@/app/actions/auth.js";
import { ErrorNote } from "@/components/ui.jsx";

export default function UsernameForm({ current }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function onSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const r = await setUsername({ username: String(new FormData(e.currentTarget).get("username")) });
    setBusy(false);
    if (!r.ok) return setError(r.message);
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="card flex flex-col gap-4">
      <div>
        <label htmlFor="username" className="label">Username</label>
        <input
          id="username"
          name="username"
          required
          minLength={3}
          maxLength={30}
          pattern="[a-zA-Z0-9_]{3,30}"
          defaultValue={current ?? ""}
          autoComplete="username"
          aria-describedby="username-help"
          className="field font-mono"
        />
        <p id="username-help" className="mt-1 text-xs text-ink-2">3–30 characters: letters, digits and underscore.</p>
      </div>
      {error && <ErrorNote>{error}</ErrorNote>}
      <button type="submit" className="btn" disabled={busy}>{busy ? "Saving…" : "Continue"}</button>
    </form>
  );
}
