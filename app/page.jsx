// @ts-nocheck
import Link from "next/link";
import { getViewer } from "@/components/viewer.js";

const STEPS = [
  ["Publish", "Upload your writing, code or CAD files. Your main version is locked: nobody else can change it."],
  ["Make my copy", "Anyone can make their own copy of a public project and work on it in private, saving versions as they go."],
  ["Request to publish", "When their copy is ready, they send you a request with a short note about what changed."],
  ["Make it the main version", "You review the changes side by side, then approve, ask for changes, or say no. Credit stays with everyone."],
];

const AUDIENCE = [
  ["Writers", "Drafts, chapters and scripts, with every word that changed shown side by side."],
  ["Coders", "Small projects and scripts, without learning Git or a terminal."],
  ["CAD artists", "Models and drawings with every version kept, and 3D previews of STL files."],
  ["Everyone else", "Anything made of files that more than one person wants to improve."],
];

export default async function Landing() {
  const viewer = await getViewer();
  return (
    <div className="page flex flex-col gap-16 py-16">
      <section aria-labelledby="hero" className="flex flex-col gap-6">
        <h1 id="hero" className="text-2xl leading-8 font-medium sm:text-[34px] sm:leading-10">
          Save every version of your work. Let others improve it without fear.
        </h1>
        <p className="prose-text text-ink-2">
          Versio keeps the history of your files in the browser and lets people suggest changes on their own copy, so your main version only changes when you say so.
        </p>
        <div className="flex flex-wrap gap-2">
          {viewer ? (
            <Link href="/dashboard" className="btn">Go to your dashboard</Link>
          ) : (
            <Link href="/signup" className="btn">Sign up</Link>
          )}
          <Link href="/explore" className="btn-ghost">Explore projects</Link>
        </div>
      </section>

      <section aria-labelledby="how" className="flex flex-col gap-4">
        <h2 id="how" className="text-xl font-medium">How it works</h2>
        <ol className="grid gap-4 sm:grid-cols-2">
          {STEPS.map(([title, text], i) => (
            <li key={title} className="card flex flex-col gap-1">
              <p className="meta">Step {i + 1}</p>
              <h3 className="font-medium">{title}</h3>
              <p className="text-sm text-ink-2">{text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="demo" className="flex flex-col gap-4">
        <h2 id="demo" className="text-xl font-medium">See every change before you accept it</h2>
        <p className="text-ink-2">A request to publish shows the main version and the copy side by side, with what was removed and what was added.</p>
        {/* Static example, no data. */}
        <div className="grid gap-4 md:grid-cols-2">
          <figure className="card flex flex-col gap-2">
            <figcaption className="text-sm font-medium">Main version v3</figcaption>
            <p className="font-serif text-prose">
              The lighthouse stood at the edge of the{" "}
              <del className="bg-bad/12 text-ink line-through decoration-bad-text"><span className="sr-only">removed: </span>grey</del>{" "}
              cliff, and its keeper had not spoken to anyone in{" "}
              <del className="bg-bad/12 text-ink line-through decoration-bad-text"><span className="sr-only">removed: </span>years</del>.
            </p>
          </figure>
          <figure className="card flex flex-col gap-2">
            <figcaption className="text-sm font-medium">Their copy v5</figcaption>
            <p className="font-serif text-prose">
              The lighthouse stood at the edge of the{" "}
              <ins className="bg-ok/12 text-ink underline decoration-ok-text underline-offset-2"><span className="sr-only">added: </span>crumbling</ins>{" "}
              cliff, and its keeper had not spoken to anyone in{" "}
              <ins className="bg-ok/12 text-ink underline decoration-ok-text underline-offset-2"><span className="sr-only">added: </span>eleven winters</ins>.
            </p>
          </figure>
        </div>
      </section>

      <section aria-labelledby="who" className="flex flex-col gap-4">
        <h2 id="who" className="text-xl font-medium">Who it's for</h2>
        <ul className="grid gap-4 sm:grid-cols-2">
          {AUDIENCE.map(([title, text]) => (
            <li key={title} className="flex flex-col gap-1 border-t border-line pt-3">
              <h3 className="font-medium">{title}</h3>
              <p className="text-sm text-ink-2">{text}</p>
            </li>
          ))}
        </ul>
      </section>

      {!viewer && (
        <section aria-labelledby="start" className="flex flex-col items-start gap-4 border-t border-line pt-8">
          <h2 id="start" className="text-xl font-medium">Start with one file</h2>
          <div className="flex flex-wrap gap-2">
            <Link href="/signup" className="btn">Sign up</Link>
            <Link href="/login" className="btn-ghost">Log in</Link>
          </div>
        </section>
      )}
    </div>
  );
}
