// @ts-nocheck
"use client";
// Shared editor for the owner's main (/p/[id]/edit) and a contributor's copy (/c/[id]).
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { saveVersion } from "@/lib/upload-client.js";
import { MAX_FILE_BYTES, MAX_FILES_PER_VERSION } from "@/lib/limits.js";
import { useVersionFiles, fetchText, textClass } from "./VersionFiles.jsx";
import { ErrorNote, formatBytes, isTextPath } from "./ui.jsx";
import { Skeleton, SkeletonText, Loading } from "./Skeleton.jsx";

export default function Editor({ projectId, copyId = null, parentId = null, type, doneHref }) {
  const router = useRouter();
  const parent = useVersionFiles(parentId);
  // entry: { path, size, url?, fromParent, file?, text?, edited }
  const [entries, setEntries] = useState(null);
  const [deletes, setDeletes] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loadingText, setLoadingText] = useState(false);
  const [note, setNote] = useState("");
  const [newName, setNewName] = useState("");
  const [problems, setProblems] = useState([]);
  const [saving, setSaving] = useState(null); // { done, total } while saving
  const [error, setError] = useState(null);
  const [dragging, setDragging] = useState(false);
  const picker = useRef(null);

  useEffect(() => {
    if (!parent.loading && !parent.error && entries === null) {
      setEntries(parent.files.map((f) => ({ path: f.path, size: f.size, url: f.url, fromParent: true, edited: false })));
    }
  }, [parent, entries]);

  const textEditable = type !== "cad";
  const list = entries ?? [];
  const current = list.find((e) => e.path === selected) ?? null;

  function update(path, patch) {
    setEntries((es) => es.map((e) => (e.path === path ? { ...e, ...patch } : e)));
  }

  function upsert(entry) {
    setEntries((es) => {
      const i = es.findIndex((e) => e.path === entry.path);
      if (i === -1) return [...es, entry].sort((a, b) => a.path.localeCompare(b.path));
      const copy = [...es];
      copy[i] = { ...copy[i], ...entry, fromParent: copy[i].fromParent };
      return copy;
    });
    setDeletes((d) => d.filter((p) => p !== entry.path));
  }

  function addFiles(fileList) {
    const issues = [];
    let count = list.length;
    for (const file of Array.from(fileList)) {
      const path = file.webkitRelativePath || file.name;
      if (file.size > MAX_FILE_BYTES) {
        issues.push(`${path} is ${formatBytes(file.size)}; the limit is ${formatBytes(MAX_FILE_BYTES)} per file.`);
        continue;
      }
      if (!list.some((e) => e.path === path) && ++count > MAX_FILES_PER_VERSION) {
        issues.push(`A version can have at most ${MAX_FILES_PER_VERSION} files.`);
        break;
      }
      upsert({ path, size: file.size, file, text: undefined, edited: true });
      if (path === selected) setSelected(null);
    }
    setProblems(issues);
  }

  function addTextFile(e) {
    e.preventDefault();
    const path = newName.trim();
    if (!path) return;
    if (list.some((x) => x.path === path)) return setProblems([`A file called ${path} already exists.`]);
    upsert({ path, size: 0, text: "", edited: true });
    setNewName("");
    setSelected(path);
  }

  function remove(path) {
    const entry = list.find((e) => e.path === path);
    setEntries((es) => es.filter((e) => e.path !== path));
    if (entry?.fromParent) setDeletes((d) => [...d, path]);
    if (selected === path) setSelected(null);
  }

  async function open(entry) {
    setSelected(entry.path);
    if (!textEditable || !isTextPath(entry.path) || entry.text != null) return;
    setLoadingText(true);
    try {
      const text = entry.file ? await entry.file.text() : await fetchText(entry.url);
      update(entry.path, { text });
    } catch (e) {
      setProblems([e.message]);
      setSelected(null);
    } finally {
      setLoadingText(false);
    }
  }

  async function save(e) {
    e.preventDefault();
    setError(null);
    const changes = list
      .filter((x) => x.edited)
      .map((x) => (x.file && x.text == null ? { path: x.path, file: x.file } : { path: x.path, text: x.text ?? "" }));
    setSaving({ done: 0, total: 0 });
    const r = await saveVersion({
      projectId,
      copyId,
      parentId,
      note,
      parentFiles: parent.files.map((f) => ({ path: f.path, hash: f.hash })),
      changes,
      deletes,
      onProgress: (done, total) => setSaving({ done, total }),
    });
    if (!r.ok) {
      setSaving(null);
      return setError(r.message);
    }
    router.push(doneHref);
    router.refresh();
  }

  const dirty = list.some((x) => x.edited) || deletes.length > 0;
  // Warn before leaving with unsaved edits (tab close, reload, typed URL).
  useEffect(() => {
    if (!dirty || saving) return;
    const warn = (e) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, saving]);

  if (parent.loading) return (
    <Loading label="Loading files…" className="flex flex-col gap-2">
      {[0, 1, 2].map((i) => <Skeleton key={i} className="h-11 w-full" />)}
    </Loading>
  );
  if (parent.error) return <ErrorNote>{parent.error}</ErrorNote>;

  const changedCount = list.filter((x) => x.edited).length + deletes.length;
  const pct = saving?.total ? Math.round((saving.done / saving.total) * 100) : 0;

  return (
    <form onSubmit={save} className="flex flex-col gap-6">
      <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
        <div className="flex flex-col gap-4">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              addFiles(e.dataTransfer.files);
            }}
            className={`rounded-card border border-dashed p-4 text-center ${dragging ? "border-accent bg-accent/12" : "border-line"}`}
          >
            <p className="text-sm text-ink-2">Drag files here, or</p>
            <button type="button" className="btn-ghost btn-sm mt-2" onClick={() => picker.current?.click()}>Choose files</button>
            <input ref={picker} type="file" multiple className="sr-only" tabIndex={-1} aria-hidden="true"
              onChange={(e) => {
                addFiles(e.target.files);
                e.target.value = "";
              }}
            />
            <p className="mt-2 text-2xs text-ink-2">Up to {formatBytes(MAX_FILE_BYTES)} per file.</p>
          </div>

          {textEditable && (
            <div className="flex gap-2">
              <label htmlFor="new-file" className="sr-only">New text file name</label>
              <input id="new-file" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder={type === "code" ? "main.py" : "chapter-1.md"}
                className="field py-1.5 font-mono text-base sm:text-[13px]"
                onKeyDown={(e) => e.key === "Enter" && addTextFile(e)} />
              <button type="button" className="btn-ghost shrink-0" onClick={addTextFile}>Add file</button>
            </div>
          )}

          {problems.length > 0 && <ErrorNote>{problems.join(" ")}</ErrorNote>}

          <ul className="card py-1" aria-label="Files">
            {list.length === 0 ? (
              <li className="py-4 text-center text-sm text-ink-2">No files yet. Add one to get started.</li>
            ) : (
              list.map((x) => {
                const openable = textEditable && isTextPath(x.path);
                return (
                  <li key={x.path} className="row">
                    {openable ? (
                      <button type="button" onClick={() => open(x)} aria-pressed={selected === x.path} title={x.path}
                        className={`min-w-0 flex-1 self-stretch truncate text-left font-mono underline-offset-2 hover:underline focus-visible:underline text-[13px] ${selected === x.path ? "text-accent-text" : "text-ink"}`}>
                        {x.path}
                      </button>
                    ) : (
                      <span className="min-w-0 flex-1 truncate font-mono text-[13px]">
                        {x.path}
                        <span className="meta block">{formatBytes(x.file?.size ?? x.size)}</span>
                      </span>
                    )}
                    {x.edited && <span className="text-2xs text-accent-text">{x.fromParent ? "changed" : "new"}</span>}
                    {!openable && x.url && !x.edited && <a href={x.url} className="text-xs">Download</a>}
                    <button type="button" className="btn-ghost btn-sm btn-danger" onClick={() => remove(x.path)} aria-label={`Delete ${x.path}`}>Delete</button>
                  </li>
                );
              })
            )}
          </ul>
          {deletes.length > 0 && <p className="text-xs text-ink-2">{deletes.length} file{deletes.length > 1 ? "s" : ""} will be deleted in this version.</p>}
        </div>

        <div className="min-w-0">
          {current && textEditable && isTextPath(current.path) ? (
            <div className="flex h-full flex-col gap-2">
              <label htmlFor="file-text" className="meta">{current.path}</label>
              {loadingText || current.text == null ? (
                <Loading><SkeletonText lines={8} /></Loading>
              ) : (
                <textarea id="file-text" value={current.text} spellCheck={type === "writing"}
                  onChange={(e) => update(current.path, { text: e.target.value, file: undefined, edited: true })}
                  className={`field min-h-[60vh] ${textClass(type)}`} />
              )}
            </div>
          ) : (
            <div className="flex h-full min-h-40 items-center justify-center rounded-card border border-line p-8 text-center text-sm text-ink-2">
              {textEditable ? "Pick a text file on the left to edit it here, or add a new one." : "Upload new or changed files on the left. CAD files can't be edited in the browser."}
            </div>
          )}
        </div>
      </div>

      <div className="card flex flex-col gap-3">
        <div>
          <label htmlFor="note" className="label">Note for this version</label>
          <input id="note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} placeholder="What did you change?" className="field" />
        </div>
        {saving && (
          <div>
            <div className="h-1.5 rounded-full bg-line/60" role="progressbar" aria-label="Uploading" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
              <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${saving.total ? pct : 5}%` }} />
            </div>
            <p className="meta mt-1">{saving.total ? `Uploading ${saving.done} of ${saving.total}` : "Preparing…"}</p>
          </div>
        )}
        {error && <ErrorNote>{error}</ErrorNote>}
        <div className="flex items-center gap-3">
          <button type="submit" className="btn" disabled={!!saving || changedCount === 0}>{saving ? "Saving…" : "Save version"}</button>
          <span className="text-xs text-ink-2">{changedCount === 0 ? "No changes yet" : `${changedCount} change${changedCount > 1 ? "s" : ""}`}</span>
        </div>
      </div>
    </form>
  );
}
