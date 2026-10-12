// @ts-nocheck
import { redirect } from "next/navigation";
import AuthForm from "@/components/AuthForm.jsx";
import { getViewer } from "@/components/viewer.js";

export const metadata = { title: "Sign up" };

export default async function SignupPage() {
  if (await getViewer()) redirect("/dashboard");
  return (
    <div className="mx-auto max-w-sm px-4 py-12">
      <h1 className="h1 mb-6">Create your account</h1>
      <AuthForm mode="signup" />
    </div>
  );
}
