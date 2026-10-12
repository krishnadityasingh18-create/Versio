// @ts-nocheck
"use client";
// Plain side-by-side view of one file in two versions (no diff library yet).
import { useEffect, useRef, useState } from "react";
import { useVersionFiles, fetchText, textClass } from "./VersionFiles.jsx";
import { ErrorNote, formatBytes, isTextPath } from "./ui.jsx";

function Side({ title, file, text, type, paneRef, onScroll }) {
  return (
    <section aria-label={title} className="card flex min-w-0 flex-col gap-2">
      <h3 className="text-sm font-medium">{title}</h3>
      {!file ? (
        <p className="text-sm text-ink-2">Not in this version.</p>
      ) : type === "cad" || !isTextPath(file.path) ? (
        <p className="text-sm">
          <span className="meta">{formatBytes(file.size)}</span>{" "}
          {file.url ? <a href={file.url}>Download</a> : <span className="text-ink-2">Not available</span>}
        </p>
      ) : (
        <div ref={paneRef} onScroll={onScroll} className="max-h-[65vh] overflow-auto">
          {text == null ? (
            <p className="text-sm text-ink-2">Loading…</p>
          ) : (
            <pre className={`whitespace-pre-wrap ${textClass(type)}`}>{text}</pre>
          )}
        </div>
      )}
    </section>
  );
}

export default function Compare({ baseId, submittedId, type }) {
  const base = useVersionFiles(baseId);
  const sub = useVersionFiles(submittedId);
  const [path, setPath] = useState(null);
  const [texts, setTexts] = useState({ base: null, sub: null, error: null });
  const left = useRef(null);
  const right = useRef(null);
  const syncing = useRef(false);

  const baseMap = new Map(base.files.map((f) => [f.path, f]));
  const subMap = new Map(sub.files.map((f) => [f.path, f]));
  const paths = [...new Set([...baseMap.keys(), ...subMap.keys()])].sort();
  const status = (p) => (!baseMap.has(p) ? "added" : !subMap.has(p) ? "removed" : baseMap.get(p).hash !== subMap.get(p).hash ? "changed" : "same");
  const ready = !base.loading && !sub.loading;

  useEffect(() => {
    if (ready && path === null && paths.length) setPath(paths.find((p) => status(p) !== "same") ?? paths[0]);
  }, [ready, path, paths.length]);

  useEffect(() => {
    if (!path || type === "cad" || !isTextPath(path)) return;
    let live = true;
    setTexts({ base: null, sub: null, error: null });
    const load = (f) => (f?.url ? fetchText(f.url) : Promise.resolve(""));
    Promise.all([load(baseMap.get(path)), load(subMap.get(path))])
      .then(([b, s]) => live && setTexts({ base: b, sub: s, error: null }))
      .catch((e) => live && setTexts({ base: "", sub: "", error: e.message }));
    return () => {
      live = false;
    };
  }, [path, ready]);

  function sync(from, to) {
    return () => {
      if (syncing.current || !from.current || !to.current) return (syncing.current = false);
      const f = from.current;
      const ratio = f.scrollTop / Math.max(1, f.scrollHeight - f.clientHeight);
      syncing.current = true;
      to.current.scrollTop = ratio * (to.current.scrollHeight - to.current.clientHeight);
    };
  }

  if (!ready) return <p className="text-sm text-ink-2">Loading files…</p>;
  if (base.error || sub.error) return <ErrorNote>{base.error ?? sub.error}</ErrorNote>;
  if (paths.length === 0) return <p className="text-sm text-ink-2">Neither version has any files.</p>;

  const LABEL = { added: "new", removed: "deleted", changed: "changed", same: "" };
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="compare-file" className="text-sm text-ink-2">File</label>
        <select id="compare-file" value={path ?? ""} onChange={(e) => setPath(e.target.value)} className="field w-auto max-w-full font-mono text-[13px]">
          {paths.map((p) => (
            <option key={p} value={p}>{p}{LABEL[status(p)] ? ` (${LABEL[status(p)]})` : ""}</option>
          ))}
        </select>
        <span className="meta">{paths.filter((p) => status(p) !== "same").length} of {paths.length} files differ</span>
      </div>
      {texts.error && <ErrorNote>{texts.error}</ErrorNote>}
      {path && (
        <div className="grid gap-4 md:grid-cols-2">
          <Side title={`Main version v${baseId}`} file={baseMap.get(path)} text={texts.base} type={type} paneRef={left} onScroll={sync(left, right)} />
          <Side title={`Their copy v${submittedId}`} file={subMap.get(path)} text={texts.sub} type={type} paneRef={right} onScroll={sync(right, left)} />
        </div>
      )}
    </div>
  );
}
