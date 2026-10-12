// @ts-nocheck
"use client";
import { useState } from "react";
import { getExplore } from "@/app/actions/explore.js";
import ProjectCard from "@/components/ProjectCard.jsx";
import { ErrorNote } from "@/components/ui.jsx";

/** Result grid; "Load more" appends the next page via the cursor. */
export default function LoadMore({ query, initial, nextCursor }) {
  const [items, setItems] = useState(initial);
  const [cursor, setCursor] = useState(nextCursor);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function more() {
    setBusy(true);
    setError(null);
    const r = await getExplore({ ...query, cursor });
    setBusy(false);
    if (!r.ok) return setError(r.message);
    setItems((xs) => [...xs, ...r.data.projects.filter((p) => !xs.some((x) => x.id === p.id))]);
    setCursor(r.data.nextCursor);
  }

  return (
    <div className="flex flex-col gap-4">
      <p role="status" className="sr-only">{items.length} projects shown</p>
      <ul className="grid gap-4 sm:grid-cols-2">
        {items.map((p) => <ProjectCard key={p.id} project={p} />)}
      </ul>
      {error && <ErrorNote>{error}</ErrorNote>}
      {cursor && (
        <button type="button" className="btn-ghost self-center" onClick={more} disabled={busy}>
          {busy ? "Loading…" : "Load more"}
        </button>
      )}
    </div>
  );
}
