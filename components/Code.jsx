// @ts-nocheck
"use client";
// Read-only code with syntax colours. Shiki loads on first use only; unknown types stay plain text.
import { useEffect, useState } from "react";

const LANGS = {
  javascript: () => import("shiki/langs/javascript.mjs"),
  jsx: () => import("shiki/langs/jsx.mjs"),
  typescript: () => import("shiki/langs/typescript.mjs"),
  tsx: () => import("shiki/langs/tsx.mjs"),
  python: () => import("shiki/langs/python.mjs"),
  json: () => import("shiki/langs/json.mjs"),
  markdown: () => import("shiki/langs/markdown.mjs"),
  css: () => import("shiki/langs/css.mjs"),
  html: () => import("shiki/langs/html.mjs"),
  shellscript: () => import("shiki/langs/shellscript.mjs"),
  sql: () => import("shiki/langs/sql.mjs"),
  go: () => import("shiki/langs/go.mjs"),
  rust: () => import("shiki/langs/rust.mjs"),
  java: () => import("shiki/langs/java.mjs"),
  c: () => import("shiki/langs/c.mjs"),
  cpp: () => import("shiki/langs/cpp.mjs"),
};
const EXT = {
  js: "javascript", mjs: "javascript", cjs: "javascript", jsx: "jsx", ts: "typescript", tsx: "tsx", py: "python",
  json: "json", md: "markdown", markdown: "markdown", css: "css", html: "html", htm: "html", sh: "shellscript",
  bash: "shellscript", sql: "sql", go: "go", rs: "rust", java: "java", c: "c", h: "c", cpp: "cpp", cc: "cpp", hpp: "cpp",
};
const langFor = (path) => EXT[(path.split(".").pop() ?? "").toLowerCase()] ?? null;
const MAX = 300_000; // ponytail: bigger files stay plain; highlighting them blocks the main thread

let highlighter = null;
function getHighlighter() {
  highlighter ??= Promise.all([import("shiki/core"), import("shiki/engine/javascript")]).then(
    ([{ createHighlighterCore }, { createJavaScriptRegexEngine }]) =>
      createHighlighterCore({
        themes: [import("shiki/themes/github-light-default.mjs"), import("shiki/themes/github-dark-default.mjs")],
        langs: [],
        engine: createJavaScriptRegexEngine(),
      }),
  );
  return highlighter;
}

export default function CodeBlock({ path, text, className = "" }) {
  const [html, setHtml] = useState(null);
  useEffect(() => {
    setHtml(null);
    const lang = langFor(path);
    if (!lang || !text || text.length > MAX) return;
    let live = true;
    getHighlighter()
      .then(async (hl) => {
        await hl.loadLanguage(LANGS[lang]());
        const out = hl.codeToHtml(text, { lang, themes: { light: "github-light-default", dark: "github-dark-default" } });
        if (live) setHtml(out);
      })
      .catch(() => {}); // plain text is a fine fallback
    return () => {
      live = false;
    };
  }, [path, text]);

  // Shiki escapes the file contents; the HTML is spans only.
  if (html) return <div className={`code-hl ${className}`} dangerouslySetInnerHTML={{ __html: html }} />;
  return <pre className={`whitespace-pre-wrap ${className}`}>{text}</pre>;
}
