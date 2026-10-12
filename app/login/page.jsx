// @ts-nocheck
import { redirect } from "next/navigation";
import AuthForm from "@/components/AuthForm.jsx";
import { getViewer } from "@/components/viewer.js";

export const metadata = { title: "Log in" };

export default async function LoginPage() {
  if (await getViewer()) redirect("/dashboard");
  return (
    <div className="mx-auto max-w-sm px-4 py-12">
      <h1 className="h1 mb-6">Log in</h1>
      <AuthForm mode="login" />
    </div>
  );
}
