import Link from "next/link";

export const metadata = { title: "Sign-in link problem" };

export default function AuthError() {
  return (
    <div className="page">
      <h1 className="h1">That link didn't work</h1>
      <p className="mt-2 text-ink-2">The sign-in or confirmation link may have expired or already been used.</p>
      <Link href="/login" className="btn mt-6">Back to log in</Link>
    </div>
  );
}
