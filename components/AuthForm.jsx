// @ts-nocheck
"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { signInWithEmail, signInWithOAuth, signUpWithEmail } from "@/app/actions/auth.js";
import { ErrorNote } from "./ui.jsx";

export default function AuthForm({ mode }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [sent, setSent] = useState(false);
  const isSignup = mode === "signup";

  async function onSubmit(e) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const input = { email: String(form.get("email")), password: String(form.get("password")) };
    setBusy(true);
    setError(null);
    const r = await (isSignup ? signUpWithEmail(input) : signInWithEmail(input));
    setBusy(false);
    if (!r.ok) return setError(r.message);
    if (isSignup) return setSent(true);
    router.push("/dashboard");
    router.refresh();
  }

  if (sent) {
    return (
      <div className="card">
        <h2 className="h2">Check your email</h2>
        <p className="mt-2 text-sm text-ink-2">We sent you a link to confirm your account. Open it, then log in.</p>
      </div>
    );
  }

  return (
    <div className="card">
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <div>
          <label htmlFor="email" className="label">Email</label>
          <input id="email" name="email" type="email" autoComplete="email" required className="field" />
        </div>
        <div>
          <label htmlFor="password" className="label">Password</label>
          <input
            id="password"
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete={isSignup ? "new-password" : "current-password"}
            aria-describedby={isSignup ? "pw-help" : undefined}
            className="field"
          />
          {isSignup && <p id="pw-help" className="mt-1 text-xs text-ink-2">At least 8 characters.</p>}
        </div>
        {error && <ErrorNote>{error}</ErrorNote>}
        <button type="submit" className="btn" disabled={busy}>
          {busy ? "Please wait…" : isSignup ? "Sign up" : "Log in"}
        </button>
      </form>
      <div className="mt-4 flex flex-col gap-2 border-t border-line pt-4">
        <button type="button" className="btn-ghost" disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError(null);
            // Redirects to GitHub on success; only returns on failure.
            const r = await signInWithOAuth("github");
            setBusy(false);
            if (r && !r.ok) setError(r.message);
          }}>
          Continue with GitHub
        </button>
        {/* Google is switched off until its OAuth app exists. */}
        <button type="button" className="btn-ghost" disabled>Continue with Google (coming soon)</button>
      </div>
      <p className="mt-4 text-sm text-ink-2">
        {isSignup ? (
          <>Already have an account? <Link href="/login">Log in</Link></>
        ) : (
          <>New here? <Link href="/signup">Sign up</Link></>
        )}
      </p>
    </div>
  );
}
