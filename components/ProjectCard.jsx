// @ts-nocheck
import Link from "next/link";
import { Badge, Stars, TYPE_LABEL, Who, formatDate } from "./ui.jsx";

/** One project in a grid (Explore, profiles). */
export default function ProjectCard({ project, showOwner = true }) {
  return (
    <li className="card flex min-w-0 flex-col gap-2">
      <Link href={`/p/${project.id}`} className="truncate font-medium">{project.title}</Link>
      {showOwner && (
        <p className="text-sm text-ink-2">by <Who profile={project.owner} link /></p>
      )}
      {project.description && <p className="line-clamp-2 text-sm text-ink-2">{project.description}</p>}
      <div className="mt-auto flex flex-wrap items-center gap-3 pt-1">
        <Badge>{TYPE_LABEL[project.type]}</Badge>
        <Stars count={project.star_count} />
        <span className="meta">Updated {formatDate(project.updated_at)}</span>
      </div>
    </li>
  );
}
