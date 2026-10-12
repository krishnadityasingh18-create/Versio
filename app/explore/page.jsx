// @ts-nocheck
import { getExplore } from "@/app/actions/explore.js";
import { Empty, ErrorNote } from "@/components/ui.jsx";
import LoadMore from "./LoadMore.jsx";

export const metadata = { title: "Explore" };

const TYPES = [["", "All"], ["writing", "Writing"], ["code", "Code"], ["cad", "CAD"]];
const SORTS = [["recent", "Recent"], ["stars", "Most starred"]];

export default async function ExplorePage({ searchParams }) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 200) : "";
  const type = TYPES.some(([v]) => v && v === sp.type) ? sp.type : "";
  const sort = sp.sort === "stars" ? "stars" : "recent";
  const query = { q: q || undefined, type: type || undefined, sort };
  const r = await getExplore({ ...query, cursor: null });

  return (
    <div className="page flex flex-col gap-6">
      <h1 className="h1">Explore</h1>
      {/* Plain GET form: filters live in the URL, so results are deep-linkable and work without JS. */}
      <form method="get" action="/explore" role="search" className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="min-w-0 flex-1">
          <label htmlFor="explore-q" className="label">Search projects</label>
          <input id="explore-q" name="q" type="search" defaultValue={q} placeholder="Title or description" className="field" />
        </div>
        <div>
          <label htmlFor="explore-type" className="label">Type</label>
          <select id="explore-type" name="type" defaultValue={type} className="field sm:w-36">
            {TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="explore-sort" className="label">Sort</label>
          <select id="explore-sort" name="sort" defaultValue={sort} className="field sm:w-40">
            {SORTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        <button type="submit" className="btn">Search</button>
      </form>

      {!r.ok ? (
        <ErrorNote result={r} />
      ) : r.data.projects.length === 0 ? (
        <Empty>{q || type ? "No public projects match. Try other words or another type." : "No public projects yet."}</Empty>
      ) : (
        <LoadMore key={`${q}|${type}|${sort}`} query={query} initial={r.data.projects} nextCursor={r.data.nextCursor} />
      )}
    </div>
  );
}
