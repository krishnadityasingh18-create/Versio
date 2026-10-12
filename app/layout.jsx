// @ts-nocheck
import { Inter, EB_Garamond, JetBrains_Mono } from "next/font/google";
import Link from "next/link";
import { getViewer } from "@/components/viewer.js";
import Sidebar from "@/components/Sidebar.jsx";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-inter" });
const garamond = EB_Garamond({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-garamond" });
const mono = JetBrains_Mono({ subsets: ["latin"], weight: ["400"], variable: "--font-jetbrains" });

export const metadata = {
  title: { default: "Versio", template: "%s · Versio" },
  description: "Save versions of your work and collaborate safely, no Git needed.",
};

// Every page reads the session cookie.
export const dynamic = "force-dynamic";

export default async function RootLayout({ children }) {
  const viewer = await getViewer();
  return (
    <html lang="en" className={`${inter.variable} ${garamond.variable} ${mono.variable}`}>
      <body className="min-h-dvh bg-canvas text-ink antialiased">
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-ghost focus:bg-surface focus:px-3 focus:py-2">
          Skip to content
        </a>
        {viewer ? (
          <div className="md:flex">
            <Sidebar uid={viewer.uid} username={viewer.username} />
            <main id="main" className="min-w-0 flex-1">{children}</main>
          </div>
        ) : (
          <>
            <header className="flex items-center justify-between border-b border-line px-4 py-3 sm:px-8">
              <Link href="/" className="text-base font-medium text-ink no-underline">Versio</Link>
              <nav className="flex gap-2" aria-label="Account">
                <Link href="/login" className="btn-ghost">Log in</Link>
                <Link href="/signup" className="btn">Sign up</Link>
              </nav>
            </header>
            <main id="main">{children}</main>
          </>
        )}
      </body>
    </html>
  );
}
