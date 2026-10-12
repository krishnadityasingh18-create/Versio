// @ts-nocheck
import { requireViewer } from "@/components/viewer.js";
import UsernameForm from "./UsernameForm.jsx";

export const metadata = { title: "Pick a username" };

export default async function OnboardingPage() {
  const viewer = await requireViewer({ username: false });
  return (
    <div className="mx-auto max-w-sm px-4 py-12">
      <h1 className="h1">Pick a username</h1>
      <p className="mt-2 mb-6 text-ink-2">This is how others will see and credit you.</p>
      <UsernameForm current={viewer.username} />
    </div>
  );
}
