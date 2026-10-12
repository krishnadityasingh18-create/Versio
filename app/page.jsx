// @ts-nocheck
import Link from "next/link";
import { getViewer } from "@/components/viewer.js";

export default async function Landing() {
  const viewer = await getViewer();
  return (
    <div className="page py-16">
      <h1 className="text-2xl leading-7 font-medium sm:text-[28px] sm:leading-9">Save versions of your work. Collaborate without fear.</h1>
      <p className="prose-text mt-6 text-ink">
        Versio keeps every version of your writing, code or CAD files, right in the browser. Your main version is locked:
        nobody else can change it. Others click <em>Make my copy</em>, work on their own draft, and send you a{" "}
        <em>Request to publish</em> with a note. You approve it, ask for changes, or say no, and you can make any
        published copy the new main version, with credit kept for everyone.
      </p>
      <div className="mt-8 flex gap-2">
        {viewer ? (
          <Link href="/dashboard" className="btn">Go to your dashboard</Link>
        ) : (
          <>
            <Link href="/signup" className="btn">Sign up</Link>
            <Link href="/login" className="btn-ghost">Log in</Link>
          </>
        )}
      </div>
    </div>
  );
}
