// @ts-nocheck
import Link from "next/link";
import { getInbox } from "@/app/actions/requests.js";
import { requireViewer } from "@/components/viewer.js";
import { Empty, ErrorPage, StatusBadge, Who, formatDate } from "@/components/ui.jsx";

export const metadata = { title: "Requests" };

export default async function RequestsPage({ searchParams }) {
  await requireViewer();
  const { tab = "incoming" } = await searchParams;
  const r = await getInbox();
  if (!r.ok) return <ErrorPage result={r} />;
  const incoming = tab !== "outgoing";
  const items = incoming ? r.data.incoming : r.data.outgoing;
  const tabs = [
    ["incoming", `For my projects (${r.data.incoming.length})`],
    ["outgoing", `Sent by me (${r.data.outgoing.length})`],
  ];

  return (
    <div className="page flex flex-col gap-6">
      <h1 className="h1">Requests</h1>
      <nav aria-label="Request lists" className="flex gap-6 border-b border-line">
        {tabs.map(([key, label]) => {
          const active = (key === "incoming") === incoming;
          return (
            <Link key={key} href={`/requests?tab=${key}`} aria-current={active ? "page" : undefined}
              className={`-mb-px border-b-2 pb-2 text-sm no-underline ${active ? "border-accent font-medium text-accent-text" : "border-transparent text-ink-2 hover:text-ink"}`}>
              {label}
            </Link>
          );
        })}
      </nav>
      <div className="card py-1">
        {items.length === 0 ? (
          <Empty action={!incoming && <Link href="/dashboard" className="btn-ghost">Go to my copies</Link>}>
            {incoming ? "No one has asked to publish a copy of your projects yet." : "You haven't sent any requests to publish."}
          </Empty>
        ) : (
          <ul>
            {items.map((q) => (
              <li key={q.id} className="row flex-wrap">
                <Link href={`/requests/${q.id}`} className="min-w-0 flex-1 truncate">
                  <span className="font-medium">{q.project_title}</span>
                  <span className="text-ink-2"> · {incoming ? <>from <Who profile={q.contributor} /></> : <>to <Who profile={q.owner} /></>}</span>
                </Link>
                <StatusBadge status={q.status} />
                <span className="meta">{formatDate(q.updated_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
