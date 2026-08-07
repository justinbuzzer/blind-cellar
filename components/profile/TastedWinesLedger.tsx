"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/Button";
import { TextField } from "@/components/TextField";
import { SelectField } from "@/components/SelectField";
import { EmptyState } from "@/components/EmptyState";
import {
  DEFAULT_LEDGER_FILTERS,
  DEFAULT_LEDGER_SORT,
  LedgerFilterOptions,
  LedgerFilters,
  LedgerRow,
  LedgerSort,
  TastingScope,
} from "@/lib/profile";
import { TASTING_MODE_LABELS, WINE_STYLE_LABELS } from "@/types/tasting";
import { compactWineLocationLabel } from "@/lib/appellations";

interface TastedWinesLedgerProps {
  scope: TastingScope;
}

interface LedgerResponse {
  rows: LedgerRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  filterOptions: LedgerFilterOptions;
}

type LoadState = "loading" | "ready" | "error";

const SORT_OPTIONS: { value: LedgerSort; label: string }[] = [
  { value: "recent", label: "Most recently tasted" },
  { value: "rating_desc", label: "Highest personal rating" },
  { value: "rating_asc", label: "Lowest personal rating" },
  { value: "wine_name", label: "Wine name" },
  { value: "country", label: "Country" },
  { value: "most_revisited", label: "Most revisited" },
];

const MIN_RATING_OPTIONS = [90, 80, 70, 60];
const SEARCH_DEBOUNCE_MS = 300;

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

function roleLabel(role: LedgerRow["role"]): string {
  if (role === "host_and_participant") return "Host and participant";
  return role === "host" ? "Host" : "Participant";
}

/**
 * The Tasted Wines Ledger (see README "Palate Profile"). Search/filter/sort
 * are all applied server-side via /api/profile/ledger — this component only
 * ever holds the current page it was sent, never the caller's whole history
 * (see README for why that's a deliberate scaling boundary, not an
 * oversight). One responsive stacked list serves both mobile and desktop,
 * matching how the rest of this app already renders result rows (see
 * components/archive/ArchiveEntryRow.tsx) — no dense literal table.
 */
export function TastedWinesLedger({ scope }: TastedWinesLedgerProps) {
  const [searchInput, setSearchInput] = useState("");
  const [filters, setFilters] = useState<LedgerFilters>(DEFAULT_LEDGER_FILTERS);
  const [sort, setSort] = useState<LedgerSort>(DEFAULT_LEDGER_SORT);
  const [page, setPage] = useState(1);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [data, setData] = useState<LedgerResponse | null>(null);
  const [resultsAnnouncement, setResultsAnnouncement] = useState("");

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Search is debounced client-side before it becomes part of `filters`;
  // every other filter/sort change applies immediately. Any change here
  // resets to page 1 so a stale page number never outlives its result set.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setFilters((prev) => (prev.search === searchInput ? prev : { ...prev, search: searchInput }));
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchInput]);

  useEffect(() => {
    setPage(1);
  }, [scope, filters, sort]);

  useEffect(() => {
    let cancelled = false;
    setLoadState("loading");

    const params = new URLSearchParams();
    params.set("scope", scope);
    params.set("sort", sort);
    params.set("page", String(page));
    if (filters.search) params.set("search", filters.search);
    if (filters.wineStyle !== "all") params.set("wineStyle", filters.wineStyle);
    if (filters.country !== "all") params.set("country", filters.country);
    if (filters.tastingMode !== "all") params.set("tastingMode", filters.tastingMode);
    if (filters.yearTasted !== "all") params.set("year", filters.yearTasted);
    if (filters.minRating !== "all") params.set("minRating", String(filters.minRating));
    if (filters.contributedByYou) params.set("contributedByYou", "true");

    (async () => {
      try {
        const response = await fetch(`/api/profile/ledger?${params.toString()}`);
        if (!response.ok) {
          if (!cancelled) setLoadState("error");
          return;
        }
        const json = (await response.json()) as LedgerResponse;
        if (!cancelled) {
          setData(json);
          setLoadState("ready");
          setResultsAnnouncement(`${json.total} ${json.total === 1 ? "wine" : "wines"} found`);
        }
      } catch {
        if (!cancelled) setLoadState("error");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [scope, filters, sort, page]);

  return (
    <section className="flex flex-col gap-5">
      <div>
        <h2 className="font-display text-2xl font-semibold text-cellar-maroon-dark">Wines you have tasted</h2>
        <p className="mt-2 text-sm text-cellar-muted">
          {scope === "blind_only"
            ? "Every recorded bottle from your included blind tasting sessions."
            : "Every recorded bottle from your included tastings."}
        </p>
      </div>

      <TextField
        label="Search your wines"
        value={searchInput}
        onChange={(e) => setSearchInput(e.target.value)}
        placeholder="Producer, wine, region, country, grape…"
      />

      {data && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <SelectField
            label="Wine style"
            value={filters.wineStyle}
            onChange={(e) =>
              setFilters((f) => ({ ...f, wineStyle: e.target.value as LedgerFilters["wineStyle"] }))
            }
            options={[
              { value: "all", label: "All styles" },
              ...data.filterOptions.wineStyles.map((s) => ({ value: s, label: WINE_STYLE_LABELS[s] })),
            ]}
          />
          <SelectField
            label="Country"
            value={filters.country}
            onChange={(e) => setFilters((f) => ({ ...f, country: e.target.value }))}
            options={[
              { value: "all", label: "All countries" },
              ...data.filterOptions.countries.map((c) => ({ value: c, label: c })),
            ]}
          />
          <SelectField
            label="Tasting format"
            value={filters.tastingMode}
            onChange={(e) =>
              setFilters((f) => ({ ...f, tastingMode: e.target.value as LedgerFilters["tastingMode"] }))
            }
            options={[
              { value: "all", label: "All formats" },
              ...data.filterOptions.tastingModes.map((m) => ({ value: m, label: TASTING_MODE_LABELS[m] })),
            ]}
          />
          <SelectField
            label="Year tasted"
            value={filters.yearTasted}
            onChange={(e) => setFilters((f) => ({ ...f, yearTasted: e.target.value }))}
            options={[
              { value: "all", label: "All years" },
              ...data.filterOptions.years.map((y) => ({ value: y, label: y })),
            ]}
          />
          <SelectField
            label="Minimum rating"
            value={filters.minRating === "all" ? "all" : String(filters.minRating)}
            onChange={(e) =>
              setFilters((f) => ({
                ...f,
                minRating: e.target.value === "all" ? "all" : Number(e.target.value),
              }))
            }
            options={[
              { value: "all", label: "Any rating" },
              ...MIN_RATING_OPTIONS.map((n) => ({ value: String(n), label: `${n}+` })),
            ]}
          />
          <SelectField label="Sort" value={sort} onChange={(e) => setSort(e.target.value as LedgerSort)} options={SORT_OPTIONS} />
          {data.filterOptions.hasContributedByYou && (
            <label className="flex min-h-[44px] items-center gap-2 text-sm text-cellar-text">
              <input
                type="checkbox"
                checked={filters.contributedByYou}
                onChange={(e) => setFilters((f) => ({ ...f, contributedByYou: e.target.checked }))}
                className="h-4 w-4 rounded-sm border-cellar-border text-cellar-maroon focus:ring-cellar-gold"
              />
              Contributed by you
            </label>
          )}
        </div>
      )}

      <p role="status" aria-live="polite" className="sr-only">
        {resultsAnnouncement}
      </p>

      {loadState === "loading" && <p className="text-sm text-cellar-muted">Gathering your wines…</p>}
      {loadState === "error" && (
        <p className="text-sm text-cellar-muted">
          We couldn&rsquo;t load your wine ledger just now. Please try again shortly.
        </p>
      )}

      {loadState === "ready" && data && data.rows.length === 0 && (
        <EmptyState
          title="Your wine ledger is waiting."
          message={
            scope === "blind_only"
              ? "Complete a blind tasting and your recorded wines will begin to appear here."
              : "Complete a tasting and your recorded wines will begin to appear here."
          }
          action={
            <Link href="/archive">
              <Button variant="secondary">View tasting archive</Button>
            </Link>
          }
        />
      )}

      {loadState === "ready" && data && data.rows.length > 0 && (
        <>
          <ul className="divide-y divide-cellar-border">
            {data.rows.map((row, index) => (
              <li key={`${row.publicId}-${row.identityKey}-${index}`} className="flex flex-col gap-2 py-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="font-display text-lg font-semibold leading-snug text-cellar-maroon-dark">
                    {row.producer} — {row.wineName} {row.vintage}
                  </h3>
                  <span className="text-xs uppercase tracking-[0.1em] text-cellar-muted">
                    {TASTING_MODE_LABELS[row.tastingMode]}
                  </span>
                </div>
                <p className="text-sm text-cellar-muted">
                  {compactWineLocationLabel(row)} · {WINE_STYLE_LABELS[row.wineStyle]} · {row.grapeBlend}
                </p>
                <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
                  <span className="text-cellar-text">
                    Your rating:{" "}
                    <span className="font-medium">{row.personalRating !== null ? row.personalRating : "No rating"}</span>
                  </span>
                  <span className="text-cellar-text">
                    Group rating:{" "}
                    <span className="font-medium">
                      {row.groupAverageRating !== null ? row.groupAverageRating.toFixed(1) : "No group rating"}
                    </span>
                  </span>
                </div>
                <p className="text-xs text-cellar-muted">
                  {formatDate(row.tastingDate)} · {row.sessionTitle} · {roleLabel(row.role)}
                  {row.contributedByYou ? " · Contributed by you" : ""}
                </p>
                <Link
                  href={`/results/${row.publicId}?from=account`}
                  className="inline-flex min-h-[44px] w-fit items-center text-sm font-medium text-cellar-maroon underline-offset-4 hover:text-cellar-maroon-dark hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-cellar-gold"
                >
                  View report <span aria-hidden="true">→</span>
                </Link>
              </li>
            ))}
          </ul>

          <div className="flex items-center justify-between gap-4">
            <Button
              type="button"
              variant="secondary"
              disabled={data.page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </Button>
            <p className="text-xs text-cellar-muted">
              Page {data.page} of {data.totalPages} · {data.total} {data.total === 1 ? "wine" : "wines"}
            </p>
            <Button
              type="button"
              variant="secondary"
              disabled={data.page >= data.totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
