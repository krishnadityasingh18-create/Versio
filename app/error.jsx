// @ts-nocheck
"use client";

export default function Error({ reset }) {
  return (
    <div className="page">
      <h1 className="h1">Something went wrong</h1>
      <p className="mt-2 text-ink-2">This page couldn't load. Try again in a moment.</p>
      <button type="button" className="btn-ghost mt-6" onClick={() => reset()}>Try again</button>
    </div>
  );
}
