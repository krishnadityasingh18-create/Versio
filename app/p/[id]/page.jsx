// @ts-nocheck
import Link from "next/link";
import { getProject } from "@/app/actions/projects.js";
import { getViewer } from "@/components/viewer.js";
import VersionFiles from "@/components/VersionFiles.jsx";
import { MakeCopyButton, PromoteButton, RestoreButton, StarButton } from "@/components/Actions.jsx";
import { Badge, Empty, ErrorPage, LICENSE_LABEL, StarIcon, StatusBadge, TYPE_LABEL, Who, formatDate } from "@/components/ui.jsx";

export const metadata = { title: "Project" };

const TABS = [
  ["files", "Files"],
  ["history", "History"],
  ["others", "Versions by others"],
];

export default async function ProjectPage({ params, searchParams }) {
  const { id } = await params;
  const { tab = "files" } = await searchParams;
  const [r, viewer] = await Promise.all([getProject(id), getViewer()]);
  if (!r.ok) return <ErrorPage result={r} />;
  const { project, isOwner, main, history, othersCopies, myCopies } = r.data;
  const canCopy = !isOwner && project.license !== "all_rights_reserved" && main;

  return (
    <div className="page flex flex-col gap-8">
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="h1">{project.title}</h1>
            <p className="mt-1 text-sm text-ink-2">
              by <Who profile={project.owner} link />
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {viewer ? (
              <StarButton projectId={project.id} starred={project.starred ?? false} count={project.star_count ?? 0} />
            ) : (
              <Link href="/login" className="btn-ghost">
                <StarIcon />Star<span className="meta">{project.star_count ?? 0}<span className="sr-only"> stars, log in to star</span></span>
              </Link>
            )}
            {isOwner && <Link href={`/p/${project.id}/edit`} className="btn">Edit main version</Link>}
            {!isOwner && myCopies.length > 0 && <Link href={`/c/${myCopies[0].id}`} className="btn-ghost">Open my copy</Link>}
            {canCopy && (viewer ? <MakeCopyButton projectId={project.id} /> : <Link href="/login" className="btn">Log in to make a copy</Link>)}
          </div>
        </div>
        {project.description && <p className="prose-text text-ink">{project.description}</p>}
        <div className="flex flex-wrap gap-2">
          <Badge>{TYPE_LABEL[project.type]}</Badge>
          <Badge>{LICENSE_LABEL[project.license]}</Badge>
          {project.visibility === "private" && <Badge>Private</Badge>}
        </div>
        {!isOwner && project.license === "all_rights_reserved" && (
          <p className="text-sm text-ink-2">This project is "All rights reserved", so copies can't be made.</p>
        )}
      </header>

      <nav aria-label="Project sections" className="flex gap-6 border-b border-line">
        {TABS.map(([key, label]) => (
          <Link key={key} href={`/p/${project.id}?tab=${key}`} aria-current={tab === key ? "page" : undefined}
            className={`-mb-px border-b-2 pb-2 text-sm no-underline ${tab === key ? "border-accent font-medium text-accent-text" : "border-transparent text-ink-2 hover:text-ink"}`}>
            {label}
          </Link>
        ))}
      </nav>

      {tab === "history" ? (
        <section aria-label="History" className="card py-1">
          {history.length === 0 ? (
            <Empty>No versions yet.</Empty>
          ) : (
            <ul>
              {history.map((h) => (
                <li key={`${h.version.id}-${h.created_at}`} className="row flex-wrap">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm">{h.version.note || <span className="text-ink-2">No note</span>}</p>
                    <p className="meta">
                      v{h.version.number} · <Who profile={h.version.author} link />
                      {h.from_copy_id && <> · from a copy, made main by <Who profile={h.promoted_by} link /></>} · {formatDate(h.created_at)}
                    </p>
                  </div>
                  {h.version.id === project.main_version_id ? (
                    <Badge tone="accent">Main</Badge>
                  ) : (
                    isOwner && <RestoreButton projectId={project.id} versionId={h.version.id} />
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : tab === "others" ? (
        <section aria-label="Versions by others" className="card py-1">
          {othersCopies.length === 0 ? (
            <Empty>No one has published a copy yet.</Empty>
          ) : (
            <ul>
              {othersCopies.map((c) => (
                <li key={c.id} className="row flex-wrap">
                  <Link href={`/c/${c.id}`} className="min-w-0 flex-1 truncate">
                    Copy by <Who profile={c.author} />
                  </Link>
                  {c.is_stale && <Badge tone="warn">Based on an older main</Badge>}
                  <StatusBadge status={c.state} />
                  {isOwner && c.state === "published" && <PromoteButton copyId={c.id} small />}
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : (
        <section aria-label="Files">
          {main ? (
            <>
              <p className="meta mb-3">Main version v{main.number} · saved {formatDate(main.created_at)}{main.note ? ` · ${main.note}` : ""}</p>
              <VersionFiles versionId={main.id} type={project.type} />
            </>
          ) : (
            <Empty action={isOwner && <Link href={`/p/${project.id}/edit`} className="btn">Add files</Link>}>
              {isOwner ? "Nothing saved yet. Add your first files." : "The owner hasn't saved anything yet."}
            </Empty>
          )}
        </section>
      )}
    </div>
  );
}
