// @ts-nocheck
"use client";
// Side-by-side view of one file in two versions. Writing: word differences, code: line differences,
// CAD: .stl models side by side with synced rotation, anything else name/size + download.
import { useEffect, useMemo, useRef, useState } from "react";
import { diffLines, diffWords } from "diff";
import { useVersionFiles, fetchText, textClass } from "./VersionFiles.jsx";
import CodeBlock from "./Code.jsx";
import StlViewer, { isStl } from "./StlViewer.jsx";
import { ErrorNote, formatBytes, isTextPath } from "./ui.jsx";

/** One side of the diff: base shows removals, copy shows additions. Colour + strike/underline + sr-only words. */
function DiffText({ parts, side }) {
  return parts.map((p, i) => {
    if (p.added) {
      return side === "sub" ? (
        <ins key={i} className="bg-ok/12 text-ink underline decoration-ok-text underline-offset-2">
          <span className="sr-only">added: </span>{p.value}
        </ins>
      ) : null;
    }
    if (p.removed) {
      return side === "base" ? (
        <del key={i} className="bg-bad/12 text-ink line-through decoration-bad-text">
          <span className="sr-only">removed: </span>{p.value}
        </del>
      ) : null;
    }
    return <span key={i}>{p.value}</span>;
  });
}

function Side({ title, side, path, file, text, parts, type, sync, paneRef, onScroll }) {
  const cad = type === "cad" || !isTextPath(path);
  return (
    <section aria-label={title} className="card flex min-w-0 flex-col gap-2">
      <h3 className="text-sm font-medium">{title}</h3>
      {!file ? (
        <p className="text-sm text-ink-2">Not in this version.</p>
      ) : cad ? (
        <>
          {type === "cad" && isStl(path) && file.url && <StlViewer url={file.url} name={`${path}, ${title}`} sync={sync} />}
          <p className="text-sm">
            <span className="meta">{formatBytes(file.size)}</span>{" "}
            {file.url ? <a href={file.url} download={path.split("/").pop()}>Download</a> : <span className="text-ink-2">Not available</span>}
          </p>
        </>
      ) : (
        <div ref={paneRef} onScroll={onScroll} className="max-h-[65vh] overflow-auto">
          {text == null ? (
            <p className="text-sm text-ink-2">Loading…</p>
          ) : parts ? (
            <pre className={`whitespace-pre-wrap ${textClass(type)}`}><DiffText parts={parts} side={side} /></pre>
          ) : type === "code" ? (
            <CodeBlock path={path} text={text} className={textClass(type)} />
          ) : (
            <pre className={`whitespace-pre-wrap ${textClass(type)}`}>{text}</pre>
          )}
        </div>
      )}
    </section>
  );
}

export default function Compare({ baseId, submittedId, baseNumber, submittedNumber, type }) {
  const base = useVersionFiles(baseId);
  const sub = useVersionFiles(submittedId);
  const [path, setPath] = useState(null);
  const [texts, setTexts] = useState({ base: null, sub: null, error: null });
  const [showDiff, setShowDiff] = useState(true);
  const left = useRef(null);
  const right = useRef(null);
  const syncing = useRef(false);
  const sync = useMemo(() => new EventTarget(), []);

  const baseMap = new Map(base.files.map((f) => [f.path, f]));
  const subMap = new Map(sub.files.map((f) => [f.path, f]));
  const paths = [...new Set([...baseMap.keys(), ...subMap.keys()])].sort();
  const status = (p) => (!baseMap.has(p) ? "added" : !subMap.has(p) ? "removed" : baseMap.get(p).hash !== subMap.get(p).hash ? "changed" : "same");
  const ready = !base.loading && !sub.loading;
  const isText = path != null && type !== "cad" && isTextPath(path);

  useEffect(() => {
    if (ready && path === null && paths.length) setPath(paths.find((p) => status(p) !== "same") ?? paths[0]);
  }, [ready, path, paths.length]);

  useEffect(() => {
    if (!isText) return;
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

  const parts = useMemo(() => {
    if (!showDiff || !isText || texts.base == null || texts.sub == null) return null;
    return (type === "writing" ? diffWords : diffLines)(texts.base, texts.sub);
  }, [showDiff, isText, texts, type]);

  function syncScroll(from, to) {
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

  const LABEL = { added: "new", removed: "deleted", changed: "changed", same: "unchanged" };
  const toggle = (on, label) => (
    <button type="button" aria-pressed={showDiff === on} onClick={() => setShowDiff(on)}
      className={`btn-ghost btn-sm ${showDiff === on ? "border-accent bg-accent/12 text-accent-text" : ""}`}>
      {label}
    </button>
  );
  const sides = { path, type, sync };
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="compare-file" className="text-sm text-ink-2">File</label>
        <select id="compare-file" value={path ?? ""} onChange={(e) => setPath(e.target.value)} className="field w-auto max-w-full font-mono text-base sm:text-[13px]">
          {paths.map((p) => (
            <option key={p} value={p}>{p} ({LABEL[status(p)]})</option>
          ))}
        </select>
        <span className="meta">{paths.filter((p) => status(p) !== "same").length} of {paths.length} files differ</span>
        {isText && (
          <div role="group" aria-label="Display" className="flex gap-1 sm:ml-auto">
            {toggle(true, "Show changes")}
            {toggle(false, "Show plain")}
          </div>
        )}
      </div>
      {texts.error && <ErrorNote>{texts.error}</ErrorNote>}
      {path && (
        <div className="grid gap-4 md:grid-cols-2">
          <Side {...sides} side="base" title={`Main version v${baseNumber ?? "?"}`} file={baseMap.get(path)} text={texts.base} parts={parts} paneRef={left} onScroll={syncScroll(left, right)} />
          <Side {...sides} side="sub" title={`Their copy v${submittedNumber ?? "?"}`} file={subMap.get(path)} text={texts.sub} parts={parts} paneRef={right} onScroll={syncScroll(right, left)} />
        </div>
      )}
    </div>
  );
}
