// @ts-nocheck
import Link from "next/link";
import { redirect } from "next/navigation";
import { getDashboard } from "@/app/actions/projects.js";
import { requireViewer } from "@/components/viewer.js";
import { Badge, Empty, ErrorPage, Stars, StatusBadge, TYPE_LABEL, formatBytes, formatDate } from "@/components/ui.jsx";
import { USER_QUOTA_BYTES } from "@/lib/limits.js";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  await requireViewer();
  const r = await getDashboard();
  if (!r.ok) {
    if (r.code === "UNAUTHENTICATED") redirect("/login");
    return <ErrorPage result={r} />;
  }
  const { me, projects, copies } = r.data;
  if (!me.username) redirect("/onboarding");
  const usedPct = Math.min(100, (me.storage_used / USER_QUOTA_BYTES) * 100);

  return (
    <div className="page flex flex-col gap-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="h1">Dashboard</h1>
          <p className="meta mt-1">@{me.username}</p>
        </div>
        <div className="w-56">
          <p className="text-xs text-ink-2">Storage: {formatBytes(me.storage_used)} of {formatBytes(USER_QUOTA_BYTES)}</p>
          <div className="mt-1 h-1.5 rounded-full bg-line/60" role="progressbar" aria-label="Storage used" aria-valuenow={Math.round(usedPct)} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full rounded-full bg-accent" style={{ width: `${usedPct}%` }} />
          </div>
        </div>
      </div>

      <section aria-labelledby="my-projects">
        <div className="mb-2 flex items-center justify-between">
          <h2 id="my-projects" className="h2">My projects</h2>
          <Link href="/projects/new" className="btn-ghost btn-sm md:hidden">New project</Link>
        </div>
        <div className="card py-1">
          {projects.length === 0 ? (
            <Empty action={<Link href="/projects/new" className="btn">Create a project</Link>}>You don't have any projects yet.</Empty>
          ) : (
            <ul>
              {projects.map((p) => (
                <li key={p.id} className="row">
                  <Link href={`/p/${p.id}`} className="min-w-0 flex-1 truncate font-medium">{p.title}</Link>
                  <Badge>{TYPE_LABEL[p.type]}</Badge>
                  {p.visibility === "private" && <Badge>Private</Badge>}
                  <Stars count={p.star_count} />
                  <span className="meta hidden sm:inline">{formatDate(p.updated_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section aria-labelledby="my-copies">
        <h2 id="my-copies" className="h2 mb-2">My copies</h2>
        <div className="card py-1">
          {copies.length === 0 ? (
            <Empty>You haven't made a copy of anyone's project yet. Open a project and click "Make my copy".</Empty>
          ) : (
            <ul>
              {copies.map((c) => (
                <li key={c.id} className="row">
                  <Link href={`/c/${c.id}`} className="min-w-0 flex-1 truncate">
                    My copy of <span className="font-medium">{c.project_title}</span>
                  </Link>
                  {c.is_stale && <Badge tone="warn">Main has changed</Badge>}
                  <StatusBadge status={c.state} />
                  <span className="meta hidden sm:inline">#{c.id}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
