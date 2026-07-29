import { useMemo, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useProspects } from "@/hooks/useProspects";
import { classifyLink } from "@/lib/prospects/linkBadge";
import { ProspectRow } from "./ProspectRow";

type SortKey = "recent" | "followers_desc" | "followers_asc";

export function ProspectsTab() {
  const { prospects, loading, searching, search, setStage, toggleFollow } = useProspects();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("recent");
  const [minFollowers, setMinFollowers] = useState(0);
  const [maxFollowers, setMaxFollowers] = useState(0); // 0 = no ceiling
  const [linkOnly, setLinkOnly] = useState(false);
  const [hideWorked, setHideWorked] = useState(false);

  const rows = useMemo(() => {
    let out = prospects;
    if (minFollowers > 0) out = out.filter((p) => (p.follower_count ?? 0) >= minFollowers);
    if (maxFollowers > 0) out = out.filter((p) => (p.follower_count ?? 0) <= maxFollowers);
    if (linkOnly) out = out.filter((p) => classifyLink(p.external_url) !== "none");
    if (hideWorked) out = out.filter((p) => p.stage_reached === 0);
    const sorted = [...out];
    if (sort === "followers_desc") sorted.sort((a, b) => (b.follower_count ?? 0) - (a.follower_count ?? 0));
    else if (sort === "followers_asc") sorted.sort((a, b) => (a.follower_count ?? 0) - (b.follower_count ?? 0));
    return sorted;
  }, [prospects, sort, minFollowers, maxFollowers, linkOnly, hideWorked]);

  return (
    <div className="space-y-4">
      <form
        onSubmit={(e) => { e.preventDefault(); search(query); }}
        className="flex items-center gap-2"
      >
        <div className="flex-1 relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="chiropractor austin"
            className="w-full h-10 pl-9 pr-3 rounded-xl border border-border/60 bg-background text-sm text-foreground focus:outline-none focus:border-primary/50"
          />
        </div>
        <Button type="submit" variant="cta" size="sm" className="h-10 px-4" disabled={searching || !query.trim()}>
          {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : "Search"}
        </Button>
      </form>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          className="h-8 px-2 rounded-lg border border-border/60 bg-card/60 text-foreground"
        >
          <option value="recent">Newest</option>
          <option value="followers_desc">Most followers</option>
          <option value="followers_asc">Fewest followers</option>
        </select>
        <input
          type="number" inputMode="numeric" placeholder="min followers"
          value={minFollowers || ""} onChange={(e) => setMinFollowers(Number(e.target.value) || 0)}
          className="h-8 w-28 px-2 rounded-lg border border-border/60 bg-card/60 text-foreground"
        />
        <input
          type="number" inputMode="numeric" placeholder="max followers"
          value={maxFollowers || ""} onChange={(e) => setMaxFollowers(Number(e.target.value) || 0)}
          className="h-8 w-28 px-2 rounded-lg border border-border/60 bg-card/60 text-foreground"
        />
        <Button variant={linkOnly ? "cta" : "ghost"} size="sm" className="h-8 px-2 text-xs" onClick={() => setLinkOnly((v) => !v)}>
          Has link
        </Button>
        <Button variant={hideWorked ? "cta" : "ghost"} size="sm" className="h-8 px-2 text-xs" onClick={() => setHideWorked((v) => !v)}>
          Untouched only
        </Button>
        <span className="ml-auto text-muted-foreground">{rows.length} shown</span>
      </div>

      {loading ? (
        <div className="py-12 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : rows.length === 0 ? (
        <div className="py-12 text-center text-sm text-muted-foreground">
          No prospects yet. Search a niche and city above.
        </div>
      ) : (
        <div className="rounded-2xl border border-border bg-card/60 divide-y divide-border/40">
          {rows.map((p) => (
            <ProspectRow key={p.id} prospect={p} onStage={setStage} onFollow={toggleFollow} />
          ))}
        </div>
      )}
    </div>
  );
}
