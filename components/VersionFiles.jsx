// @ts-nocheck
"use client";
import { useEffect, useState } from "react";
import { getDownloadUrls } from "@/app/actions/upload.js";
import { Empty, ErrorNote, formatBytes, isTextPath } from "./ui.jsx";

/** Files of one version with signed URLs: { loading, error, files }. versionId null = no files. */
export function useVersionFiles(versionId) {
  const [state, setState] = useState({ loading: versionId != null, error: null, files: [] });
  useEffect(() => {
    if (versionId == null) return setState({ loading: false, error: null, files: [] });
    let live = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    getDownloadUrls(versionId).then((r) => {
      if (!live) return;
      setState(r.ok ? { loading: false, error: null, files: r.data.files } : { loading: false, error: r.message, files: [] });
    });
    return () => {
      live = false;
    };
  }, [versionId]);
  return state;
}

/** Fetches a file's text from its signed URL. */
export async function fetchText(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error("Could not load this file.");
  return res.text();
}

export function textClass(type) {
  return type === "writing" ? "font-serif text-prose" : "font-mono text-[13px] leading-5";
}

/** Read-only file browser for a version. */
export default function VersionFiles({ versionId, type }) {
  const { loading, error, files } = useVersionFiles(versionId);
  const [open, setOpen] = useState(null); // { path, text?, error? }

  async function view(f) {
    setOpen({ path: f.path });
    try {
      setOpen({ path: f.path, text: await fetchText(f.url) });
    } catch (e) {
      setOpen({ path: f.path, error: e.message });
    }
  }

  if (versionId == null) return <Empty>Nothing has been saved here yet.</Empty>;
  if (loading) return <p className="py-4 text-sm text-ink-2">Loading files…</p>;
  if (error) return <ErrorNote>{error}</ErrorNote>;
  if (files.length === 0) return <Empty>This version has no files.</Empty>;

  const canRead = (f) => type !== "cad" && f.url && isTextPath(f.path);

  return (
    <div className="flex flex-col gap-4">
      <ul className="card py-1">
        {files.map((f) => (
          <li key={f.path} className="row">
            {canRead(f) ? (
              <button
                type="button"
                onClick={() => view(f)}
                aria-pressed={open?.path === f.path}
                className={`min-w-0 flex-1 truncate text-left font-mono text-[13px] ${open?.path === f.path ? "text-accent-text" : "text-ink"}`}
              >
                {f.path}
              </button>
            ) : (
              <span className="min-w-0 flex-1 truncate font-mono text-[13px]">{f.path}</span>
            )}
            <span className="meta">{formatBytes(f.size)}</span>
            {f.blocked ? (
              <span className="text-xs text-bad-text">Removed</span>
            ) : (
              f.url && <a href={f.url} className="btn-ghost btn-sm" download={f.path.split("/").pop()}>Download</a>
            )}
          </li>
        ))}
      </ul>
      {open && (
        <section aria-label={`Contents of ${open.path}`} className="card">
          <p className="meta mb-3">{open.path}</p>
          {open.error ? (
            <ErrorNote>{open.error}</ErrorNote>
          ) : open.text == null ? (
            <p className="text-sm text-ink-2">Loading…</p>
          ) : (
            <pre className={`overflow-x-auto whitespace-pre-wrap ${textClass(type)} ${type === "writing" ? "max-w-[70ch]" : ""}`}>{open.text}</pre>
          )}
        </section>
      )}
    </div>
  );
}
