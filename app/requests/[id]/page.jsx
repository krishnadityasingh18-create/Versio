// @ts-nocheck
import Link from "next/link";
import { getProject } from "@/app/actions/projects.js";
import { getRequest } from "@/app/actions/requests.js";
import { requireViewer } from "@/components/viewer.js";
import Compare from "@/components/Compare.jsx";
import { PromoteButton } from "@/components/Actions.jsx";
import { ResubmitForm, ReviewBar } from "@/components/RequestForms.jsx";
import { Banner, ErrorPage, StatusBadge, Who, formatDate } from "@/components/ui.jsx";

export const metadata = { title: "Request to publish" };

const KIND = {
  submitted: "asked to publish",
  resubmitted: "resubmitted",
  changes_requested: "asked for changes",
  approved: "approved",
  rejected: "rejected",
};

export default async function RequestPage({ params }) {
  const { id } = await params;
  await requireViewer();
  const r = await getRequest(Number(id));
  if (!r.ok) return <ErrorPage result={r} />;
  const { request, events, isOwner, submitted, base } = r.data;
  const p = await getProject(request.project_id);
  const type = p.ok ? p.data.project.type : "code";
  const isContributor = !isOwner;

  return (
    <div className="flex min-h-screen flex-col">
      <div className="page-wide flex flex-1 flex-col gap-8">
        <header className="flex flex-col gap-2">
          <Link href="/requests" className="text-sm">← Requests</Link>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="h1">Request to publish: {request.project_title}</h1>
            <StatusBadge status={request.status} />
          </div>
          <p className="text-sm text-ink-2">
            From <Who profile={request.contributor} /> to <Who profile={request.owner} /> · <Link href={`/c/${request.copy_id}`}>open the copy</Link>
          </p>
        </header>

        {request.status === "changes_requested" && (
          <Banner tone="warn" title="Changes requested">
            {isContributor ? "Edit your copy, save a version, then resubmit below." : "Waiting for the contributor to resubmit."}
          </Banner>
        )}
        {request.status === "approved" && (
          <Banner tone="ok" title="Approved">
            The copy is published{isOwner ? ". You can make it the main version." : "."}
          </Banner>
        )}
        {request.status === "rejected" && <Banner tone="bad" title="Rejected">The copy is back to a private draft.</Banner>}

        <section aria-labelledby="timeline" className="max-w-[900px]">
          <h2 id="timeline" className="h2 mb-2">What happened</h2>
          <ol className="card py-1">
            {events.map((e) => (
              <li key={e.id} className="border-b border-line py-3 last:border-b-0">
                <p className="text-sm">
                  <span className="font-medium"><Who profile={e.actor} /></span> {KIND[e.kind] ?? e.kind}
                  <span className="meta"> · {formatDate(e.created_at)}{e.version_id ? ` · v${e.version_id}` : ""}</span>
                </p>
                {e.comment && <p className="prose-text mt-1 whitespace-pre-wrap text-ink">{e.comment}</p>}
              </li>
            ))}
          </ol>
        </section>

        {isContributor && request.status === "changes_requested" && (
          <div className="flex max-w-[900px] flex-col gap-3">
            <Link href={`/c/${request.copy_id}`} className="btn-ghost self-start">Edit my copy</Link>
            <ResubmitForm requestId={request.id} />
          </div>
        )}
        {isOwner && request.status === "approved" && <PromoteButton copyId={request.copy_id} />}

        <section aria-labelledby="compare" className="flex flex-col gap-3">
          <h2 id="compare" className="h2">Side by side</h2>
          {submitted && base ? (
            <Compare baseId={base.id} submittedId={submitted.id} type={type} />
          ) : (
            <Banner title="This copy is no longer visible">
              Its versions are private again, so they can't be shown here.
            </Banner>
          )}
        </section>
      </div>
      {isOwner && request.status === "pending" && <ReviewBar requestId={request.id} />}
    </div>
  );
}
