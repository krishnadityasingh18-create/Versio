// @ts-nocheck
"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { signOut } from "@/app/actions/auth.js";
import Notifications from "./Notifications.jsx";

const NAV = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/requests", label: "Requests" },
];

export default function Sidebar({ uid, username }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  useEffect(() => setOpen(false), [pathname]);

  async function onSignOut() {
    await signOut();
    router.push("/");
    router.refresh();
  }

  const linkClass = (href) =>
    `block rounded-ghost px-3 py-2 text-sm no-underline ${
      pathname === href || pathname.startsWith(href + "/") ? "bg-accent/12 font-medium text-accent-text" : "text-ink-2 hover:text-ink"
    }`;

  return (
    <aside className="border-b border-line bg-canvas md:sticky md:top-0 md:h-screen md:w-[260px] md:shrink-0 md:border-r md:border-b-0">
      <div className="flex items-center justify-between px-4 py-3 md:px-5 md:py-5">
        <Link href="/dashboard" className="text-base font-medium text-ink no-underline">Versio</Link>
        <div className="flex items-center gap-2">
          <Notifications uid={uid} />
          <button
            type="button"
            className="btn-ghost btn-sm md:hidden"
            aria-expanded={open}
            aria-controls="app-nav"
            onClick={() => setOpen((v) => !v)}
          >
            Menu
          </button>
        </div>
      </div>
      <div id="app-nav" className={`${open ? "flex" : "hidden"} flex-col gap-6 px-4 pb-4 md:flex md:h-[calc(100vh-68px)] md:px-5`}>
        <nav aria-label="Main" className="flex flex-col gap-1">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className={linkClass(n.href)} aria-current={pathname === n.href ? "page" : undefined}>
              {n.label}
            </Link>
          ))}
          <Link href="/projects/new" className="btn mt-3">New project</Link>
        </nav>
        <div className="mt-auto flex items-center justify-between gap-2 border-t border-line pt-4">
          <span className="meta truncate">{username ? `@${username}` : "No username yet"}</span>
          <button type="button" className="btn-ghost btn-sm" onClick={onSignOut}>Sign out</button>
        </div>
      </div>
    </aside>
  );
}
