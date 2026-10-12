// @ts-nocheck
"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createProject } from "@/app/actions/projects.js";
import { ErrorNote, LICENSE_LABEL } from "@/components/ui.jsx";

const TYPES = [
  ["writing", "Writing", "Poems, stories, scripts, essays"],
  ["code", "Code", "Programs and scripts"],
  ["cad", "CAD", "3D models and drawings"],
];

export default function NewProjectForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function onSubmit(e) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    const r = await createProject({
      title: String(f.get("title")),
      description: String(f.get("description") || "") || null,
      type: f.get("type"),
      visibility: f.get("visibility"),
      license: f.get("license"),
    });
    if (!r.ok) {
      setBusy(false);
      return setError(r.message);
    }
    router.push(`/p/${r.data.projectId}/edit`);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="card flex flex-col gap-6">
      <div>
        <label htmlFor="title" className="label">Title</label>
        <input id="title" name="title" required maxLength={120} className="field" />
      </div>
      <div>
        <label htmlFor="description" className="label">Description <span className="font-normal text-ink-2">(optional)</span></label>
        <textarea id="description" name="description" rows={3} maxLength={2000} className="field font-serif text-prose" />
      </div>
      <fieldset>
        <legend className="label">Type</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {TYPES.map(([value, label, help], i) => (
            <label key={value} className="flex cursor-pointer gap-2 rounded-field border border-line p-3 has-[:checked]:border-accent">
              <input type="radio" name="type" value={value} defaultChecked={i === 0} className="mt-1 accent-[var(--color-accent)]" />
              <span>
                <span className="block text-sm font-medium">{label}</span>
                <span className="block text-xs text-ink-2">{help}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="visibility" className="label">Who can see it</label>
          <select id="visibility" name="visibility" defaultValue="public" className="field">
            <option value="public">Everyone (public)</option>
            <option value="private">Only me (private)</option>
          </select>
        </div>
        <div>
          <label htmlFor="license" className="label">License</label>
          <select id="license" name="license" defaultValue="cc_by" className="field" aria-describedby="license-help">
            {Object.entries(LICENSE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <p id="license-help" className="mt-1 text-xs text-ink-2">"All rights reserved" means nobody can make a copy.</p>
        </div>
      </div>
      {error && <ErrorNote>{error}</ErrorNote>}
      <div>
        <button type="submit" className="btn" disabled={busy}>{busy ? "Creating…" : "Create project"}</button>
      </div>
    </form>
  );
}
