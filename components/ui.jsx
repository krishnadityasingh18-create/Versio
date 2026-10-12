// @ts-nocheck
// Small presentational pieces shared by server and client components.
import Link from "next/link";

const TONES = {
  accent: "bg-accent/12 text-accent-text",
  ok: "bg-ok/12 text-ok-text",
  bad: "bg-bad/12 text-bad-text",
  warn: "bg-warn/12 text-warn-text",
  muted: "bg-line/40 text-ink-2",
};

export function Badge({ tone = "muted", children }) {
  return (
    <span className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium ${TONES[tone]}`}>
      {children}
    </span>
  );
}

/** Copy state / request status in plain words. */
const STATUS = {
  private: ["muted", "Private draft"],
  in_review: ["accent", "In review"],
  published: ["ok", "Published"],
  pending: ["accent", "Waiting for review"],
  changes_requested: ["warn", "Changes requested"],
  approved: ["ok", "Approved"],
  rejected: ["bad", "Rejected"],
};

export function StatusBadge({ status }) {
  const [tone, text] = STATUS[status] ?? ["muted", status];
  return <Badge tone={tone}>{text}</Badge>;
}

export function Banner({ tone = "muted", title, children }) {
  const border = { accent: "border-accent", ok: "border-ok", bad: "border-bad", warn: "border-warn", muted: "border-line" }[tone];
  return (
    <div role="status" className={`rounded-card border-l-4 ${border} ${TONES[tone].split(" ")[0]} px-4 py-3`}>
      {title && <p className="font-medium">{title}</p>}
      {children && <div className="text-sm text-ink-2">{children}</div>}
    </div>
  );
}

export function ErrorNote({ result, children }) {
  const message = children ?? result?.message ?? "Something went wrong. Try again.";
  return (
    <p role="alert" className="rounded-field bg-bad/12 px-3 py-2 text-sm text-bad-text">
      {message}
    </p>
  );
}

/** Full-page error for a failed read action. */
export function ErrorPage({ result }) {
  const notFound = result?.code === "NOT_FOUND";
  return (
    <div className="page">
      <h1 className="h1">{notFound ? "Not found" : "Something went wrong"}</h1>
      <p className="mt-2 text-ink-2">{result?.message ?? "Try again in a moment."}</p>
      <Link href="/dashboard" className="btn-ghost mt-6">Back to dashboard</Link>
    </div>
  );
}

export function Empty({ children, action }) {
  return (
    <div className="py-8 text-center">
      <p className="text-ink-2">{children}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Who({ profile }) {
  return <span>{profile?.display_name || profile?.username || "someone"}</span>;
}

export function formatBytes(n) {
  if (!n) return "0 B";
  const u = ["B", "KB", "MB", "GB"];
  const i = Math.min(Math.floor(Math.log(n) / Math.log(1024)), u.length - 1);
  return `${(n / 1024 ** i).toFixed(i ? 1 : 0)} ${u[i]}`;
}

export function formatDate(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export const TYPE_LABEL = { writing: "Writing", code: "Code", cad: "CAD" };
export const LICENSE_LABEL = {
  cc_by: "CC BY",
  cc_by_sa: "CC BY-SA",
  cc_by_nc: "CC BY-NC",
  mit: "MIT",
  all_rights_reserved: "All rights reserved",
};

const TEXT_EXT = new Set(
  "txt md markdown rst tex fountain csv tsv json yml yaml toml ini cfg conf log xml html htm css scss js jsx mjs cjs ts tsx py rb go rs java kt c h cpp hpp cs php sh bash sql swift lua r".split(" "),
);
/** Whether a file can be opened as text in the editor/viewer. */
export function isTextPath(path) {
  const name = path.split("/").pop() ?? "";
  if (!name.includes(".")) return true;
  return TEXT_EXT.has(name.split(".").pop().toLowerCase());
}
