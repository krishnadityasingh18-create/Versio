// @ts-nocheck
import Link from "next/link";
import { redirect } from "next/navigation";
import { getProject } from "@/app/actions/projects.js";
import { requireViewer } from "@/components/viewer.js";
import Editor from "@/components/Editor.jsx";
import { ErrorPage } from "@/components/ui.jsx";

export const metadata = { title: "Edit main version" };

export default async function EditProjectPage({ params }) {
  const { id } = await params;
  await requireViewer();
  const r = await getProject(id);
  if (!r.ok) return <ErrorPage result={r} />;
  const { project, isOwner, main } = r.data;
  if (!isOwner) redirect(`/p/${id}`);

  return (
    <div className="page-wide flex flex-col gap-6">
      <div>
        <Link href={`/p/${id}`} className="text-sm">← {project.title}</Link>
        <h1 className="h1 mt-2">Edit main version</h1>
        <p className="mt-1 text-sm text-ink-2">Saving creates a new version. Older versions stay in history.</p>
      </div>
      <Editor projectId={id} parentId={main?.id ?? null} type={project.type} doneHref={`/p/${id}`} />
    </div>
  );
}
