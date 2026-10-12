// @ts-nocheck
import Link from "next/link";
import { getProfile } from "@/app/actions/profiles.js";
import ProjectCard from "@/components/ProjectCard.jsx";
import { Badge, Empty, ErrorPage, formatDate } from "@/components/ui.jsx";

export async function generateMetadata({ params }) {
  const { username } = await params;
  return { title: `@${decodeURIComponent(username)}` };
}

export default async function ProfilePage({ params }) {
  const { username } = await params;
  const r = await getProfile(decodeURIComponent(username));
  if (!r.ok) return <ErrorPage result={r} />;
  const { profile, projects, publishedCopies } = r.data;
  const joined = profile.created_at ? new Date(profile.created_at).toLocaleDateString("en-GB", { month: "long", year: "numeric" }) : null;

  return (
    <div className="page flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <h1 className="h1">{profile.display_name || `@${profile.username}`}</h1>
        <p className="meta">@{profile.username}{joined ? ` · joined ${joined}` : ""}</p>
        {profile.tags?.length > 0 && (
          <ul aria-label="Tags" className="flex flex-wrap gap-2">
            {profile.tags.map((t) => <li key={t}><Badge>{t}</Badge></li>)}
          </ul>
        )}
      </header>

      <section aria-labelledby="profile-projects">
        <h2 id="profile-projects" className="h2 mb-3">Projects</h2>
        {projects.length === 0 ? (
          <div className="card py-1"><Empty>No public projects yet.</Empty></div>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2">
            {projects.map((p) => <ProjectCard key={p.id} project={p} showOwner={false} />)}
          </ul>
        )}
      </section>

      <section aria-labelledby="profile-copies">
        <h2 id="profile-copies" className="h2 mb-3">Published copies</h2>
        <div className="card py-1">
          {publishedCopies.length === 0 ? (
            <Empty>No published copies yet.</Empty>
          ) : (
            <ul>
              {publishedCopies.map((c) => (
                <li key={c.id} className="row">
                  <Link href={`/c/${c.id}`} className="min-w-0 flex-1 truncate">
                    Copy of <span className="font-medium">{c.project_title}</span>
                  </Link>
                  <span className="meta">{formatDate(c.published_at ?? c.created_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
