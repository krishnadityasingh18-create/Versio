// @ts-nocheck
import Link from "next/link";
import { getCopy } from "@/app/actions/copies.js";
import Editor from "@/components/Editor.jsx";
import VersionFiles from "@/components/VersionFiles.jsx";
import { PromoteButton } from "@/components/Actions.jsx";
import { ResubmitForm, SubmitRequestForm } from "@/components/RequestForms.jsx";
import { Badge, Banner, Empty, ErrorPage, StatusBadge, Who, formatDate } from "@/components/ui.jsx";

export const metadata = { title: "Copy" };

function StateBanner({ copy, project, openRequest, isAuthor }) {
  const changes = openRequest?.status === "changes_requested";
  if (copy.state === "published") {
    return (
      <Banner tone="ok" title="Published">
        Based on {project.title} by <Who profile={project.owner} />. Everyone who can see the project can see this copy.
      </Banner>
    );
  }
  if (copy.state === "in_review" && changes) {
    return (
      <Banner tone="warn" title="Changes requested">
        {isAuthor ? "The owner asked for changes. Edit your copy, save a version, then resubmit." : "Waiting for the contributor to make changes."}
      </Banner>
    );
  }
  if (copy.state === "in_review") {
    return (
      <Banner tone="accent" title="In review">
        {isAuthor ? "The owner is looking at your request. You can't save new versions until they respond." : "This copy is waiting for review."}
      </Banner>
    );
  }
  return (
    <Banner title="Private draft">
      {isAuthor ? "Only you can see this copy. When it's ready, send a request to publish." : "This copy is private."}
    </Banner>
  );
}

export default async function CopyPage({ params }) {
  const { id } = await params;
  const r = await getCopy(Number(id));
  if (!r.ok) return <ErrorPage result={r} />;
  const { copy, project, isAuthor, isOwner, head, versions, openRequest } = r.data;
  const changes = openRequest?.status === "changes_requested";
  const canEdit = isAuthor && (copy.state === "private" || (copy.state === "in_review" && changes));

  return (
    <div className={`${canEdit ? "page-wide" : "page"} flex flex-col gap-8`}>
      <header className="flex flex-col gap-3">
        <Link href={`/p/${project.id}`} className="text-sm">← {project.title}</Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="h1">{isAuthor ? "My copy" : <>Copy by <Who profile={copy.author} /></>}</h1>
          <StatusBadge status={copy.state} />
        </div>
        <p className="meta">Copy #{copy.id} · made {formatDate(copy.created_at)} · from main v{copy.base_version_id}</p>
        <StateBanner copy={copy} project={project} openRequest={openRequest} isAuthor={isAuthor} />
        {copy.is_stale && (
          <Banner tone="warn" title="The main version has changed">
            This copy was made from an older main version of {project.title}.
          </Banner>
        )}
        <div className="flex flex-wrap gap-2">
          {openRequest && (isAuthor || isOwner) && (
            <Link href={`/requests/${openRequest.id}`} className="btn-ghost">{isOwner ? "Review this request" : "Open request"}</Link>
          )}
          {isOwner && copy.state === "published" && <PromoteButton copyId={copy.id} />}
        </div>
      </header>

      {canEdit ? (
        <section aria-labelledby="edit-heading" className="flex flex-col gap-4">
          <h2 id="edit-heading" className="h2">Edit your copy</h2>
          <Editor projectId={project.id} copyId={copy.id} parentId={head.id} type={project.type} doneHref={`/c/${copy.id}`} />
        </section>
      ) : (
        <section aria-labelledby="files-heading" className="flex flex-col gap-3">
          <h2 id="files-heading" className="h2">Files</h2>
          <VersionFiles versionId={head.id} type={project.type} />
        </section>
      )}

      {isAuthor && copy.state === "private" && (
        <div className="max-w-[900px]"><SubmitRequestForm copyId={copy.id} /></div>
      )}
      {isAuthor && changes && (
        <div className="max-w-[900px]"><ResubmitForm requestId={openRequest.id} /></div>
      )}

      <section aria-labelledby="versions-heading" className="max-w-[900px]">
        <h2 id="versions-heading" className="h2 mb-2">Versions</h2>
        <div className="card py-1">
          {versions.length === 0 ? (
            <Empty>No versions saved in this copy yet.</Empty>
          ) : (
            <ul>
              {versions.map((v) => (
                <li key={v.id} className="row">
                  <span className="min-w-0 flex-1 text-sm">{v.note || <span className="text-ink-2">No note</span>}</span>
                  {v.id === head.id && <Badge tone="accent">Latest</Badge>}
                  <span className="meta">v{v.id} · {formatDate(v.created_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
