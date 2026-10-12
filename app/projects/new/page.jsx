// @ts-nocheck
import { requireViewer } from "@/components/viewer.js";
import NewProjectForm from "./NewProjectForm.jsx";

export const metadata = { title: "New project" };

export default async function NewProjectPage() {
  await requireViewer();
  return (
    <div className="page">
      <h1 className="h1 mb-6">New project</h1>
      <NewProjectForm />
    </div>
  );
}
