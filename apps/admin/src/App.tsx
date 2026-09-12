import { PlatformLogo, useColorScheme } from "./PlatformLogo";
import { platformName } from "../../../packages/platform-assets/catalog";
import lockupLight from "../../mobile/assets/Home_All Kept_Logo.png";
import lockupDark from "../../mobile/assets/Dark Home_All Kept_Logo.png";
import React, { useEffect, useRef, useState } from "react";
import {
  ApiError,
  configured,
  demoEnabled,
  formatDate,
  formatNumber,
  readable,
  request,
  supabase,
  type ListData,
  type Overview,
  type Page,
  type Params,
  type Role,
  type Row,
  type Waitlist,
} from "./api";
import { demoRequest } from "./demo";

type IconName =
  | "overview"
  | "users"
  | "processing"
  | "sources"
  | "activity"
  | "feedback"
  | "waitlist"
  | "download"
  | "search"
  | "arrow"
  | "refresh"
  | "logout"
  | "check"
  | "close";
const paths: Record<IconName, string> = {
  overview: "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
  users:
    "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M16 3a4 4 0 0 1 0 8 M22 21v-2a4 4 0 0 0-3-3.87 M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0",
  processing:
    "M12 3v3 M12 18v3 M3 12h3 M18 12h3 M5.6 5.6l2.1 2.1 M16.3 16.3l2.1 2.1 M5.6 18.4l2.1-2.1 M16.3 7.7l2.1-2.1",
  sources:
    "M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-2 2 M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l2-2",
  activity: "M3 12h4l3-8 4 16 3-8h4",
  feedback:
    "M21 11.5a8.4 8.4 0 0 1-9 8.4 9.9 9.9 0 0 1-3.2-.5L3 21l1.7-5a8.2 8.2 0 0 1-.7-3.4 8.4 8.4 0 0 1 8.4-8.5h.6a8.4 8.4 0 0 1 8 8Z",
  waitlist: "M3 6h18v12H3z M3 7l9 6 9-6",
  download: "M12 3v12 M7 10l5 5 5-5 M4 21h16",
  search: "M21 21l-5-5 M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0",
  arrow: "M5 12h14 M13 6l6 6-6 6",
  refresh: "M20 7v5h-5 M4 17v-5h5 M6 6a8 8 0 0 1 13 2 M18 18A8 8 0 0 1 5 16",
  logout: "M9 3H4v18h5 M10 12h11 M16 7l5 5-5 5",
  check: "M5 12l4 4L19 6",
  close: "M6 6l12 12 M18 6L6 18",
};
function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  );
}
function Brand() {
  const dark = useColorScheme() === "dark";
  return (
    <div className="brand">
      <img
        className="brand-lockup"
        src={dark ? lockupDark : lockupLight}
        alt="Allkept Admin"
        draggable={false}
      />
      {/* The lockup already reads "All Kept", and the alt text carries "Admin", so this label is decoration. */}
      <small aria-hidden="true">ADMIN</small>
    </div>
  );
}
function Badge({ value }: { value: unknown }) {
  const text = String(value ?? "unknown");
  return (
    <span
      className={`badge ${["failed", "unreadable", "needs attention"].includes(text) ? "danger" : ["ready", "active", "complete", "Admin"].includes(text) ? "success" : ["pending", "queued", "processing", "retry_wait", "incomplete"].includes(text) ? "warning" : "neutral"}`}
    >
      <i />
      {readable(text)}
    </span>
  );
}
function App() {
  const [demo, setDemo] = useState(demoEnabled);
  const [identity, setIdentity] = useState<{
    email: string;
    role: Role;
  } | null>(null);
  const [loading, setLoading] = useState(configured && !demoEnabled);
  const [error, setError] = useState("");
  const [signedIn, setSignedIn] = useState(false);
  const [loginBusy, setLoginBusy] = useState(false);
  useEffect(() => {
    if (!supabase || demo) return;
    let generation = 0;
    let mounted = true;
    const check = async (email?: string) => {
      const current = ++generation;
      setIdentity(null);
      setSignedIn(Boolean(email));
      setError("");
      setLoading(Boolean(email));
      if (!email) {
        setLoading(false);
        return;
      }
      try {
        const access = await request<{ role: Role }>("access");
        if (mounted && current === generation)
          setIdentity({ email, role: access.role });
      } catch (e) {
        if (mounted && current === generation)
          setError(e instanceof Error ? e.message : "Unable to verify access.");
      } finally {
        if (mounted && current === generation) setLoading(false);
      }
    };
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event !== "TOKEN_REFRESHED") void check(session?.user.email);
    });
    return () => {
      mounted = false;
      generation++;
      subscription.unsubscribe();
    };
  }, [demo]);
  const signOut = async () => {
    if (demo) {
      setDemo(false);
      return;
    }
    const result = await supabase?.auth.signOut({ scope: "local" });
    if (result?.error) {
      setIdentity(null);
      setError(result.error.message);
    }
  };
  const signIn = async () => {
    setError("");
    setLoginBusy(true);
    try {
      const result = await supabase?.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${window.location.origin}/auth/callback` },
      });
      if (result?.error) throw result.error;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to sign in.");
      setLoginBusy(false);
    }
  };
  if (demo || identity)
    return (
      <Dashboard
        demo={demo}
        email={identity?.email ?? "preview@example.com"}
        role={identity?.role ?? "viewer"}
        onSignOut={() => void signOut()}
        onDenied={(message) => {
          setIdentity(null);
          setError(message);
        }}
      />
    );
  return (
    <div className="login">
      <Brand />
      <main className="login-card">
        <div className="eyebrow">THE OTHER SIDE OF ALLKEPT</div>
        <h1>
          A little clarity.
          <br />
          For everything kept.
        </h1>
        <p>
          Your people, their saves, and the systems that keep everything moving.
        </p>
        {loading ? (
          <div role="status" className="loading">
            <Icon name="processing" /> Checking access…
          </div>
        ) : (
          <>
            {error && (
              <div role="alert" className="error-box">
                {error}
              </div>
            )}
            {!configured && (
              <div className="setup-note">
                Connect Supabase to enable admin sign-in. You can explore the
                interface with sample data below.
              </div>
            )}
            {signedIn ? (
              <>
                <button
                  className="primary"
                  onClick={() => window.location.reload()}
                >
                  Check access again
                </button>
                <button className="text-button" onClick={() => void signOut()}>
                  Use another account
                </button>
              </>
            ) : (
              <button
                className="primary google"
                disabled={!configured || loginBusy}
                onClick={() => void signIn()}
              >
                <PlatformLogo platform="google" size={18} />
                {loginBusy ? "Opening Google…" : "Continue with Google"}
              </button>
            )}
            <button className="text-button" onClick={() => setDemo(true)}>
              Explore demo <Icon name="arrow" size={16} />
            </button>
            <small>Access is limited to approved team members.</small>
          </>
        )}
      </main>
      <footer>All your saves. One place.</footer>
    </div>
  );
}
const navigation: { id: Page; title: string; icon: IconName }[] = [
  { id: "overview", title: "Overview", icon: "overview" },
  { id: "users", title: "Users", icon: "users" },
  { id: "processing", title: "Processing", icon: "processing" },
  { id: "sources", title: "Sources & imports", icon: "sources" },
  { id: "activity", title: "Activity", icon: "activity" },
  { id: "feedback", title: "Feedback", icon: "feedback" },
  { id: "waitlist", title: "Waitlist", icon: "waitlist" },
];
const copy: Record<Page, { title: string; description: string }> = {
  overview: {
    title: "The bigger picture.",
    description: "A little perspective on everything people are keeping.",
  },
  users: {
    title: "The people behind the saves.",
    description:
      "Find an account and check its profile and onboarding progress.",
  },
  processing: {
    title: "Keep things moving.",
    description:
      "Monitor preview and sorting jobs. Retry saves that need attention.",
  },
  sources: {
    title: "Every way in.",
    description: "Connection health and import progress, in one place.",
  },
  imports: {
    title: "Every way in.",
    description: "Connection health and import progress, in one place.",
  },
  activity: {
    title: "A pulse on Allkept.",
    description: "App events and admin actions, in chronological order.",
  },
  feedback: {
    title: "What people are telling you.",
    description:
      "Sent from inside the app, newest first, with the build it came from.",
  },
  waitlist: {
    title: "Who’s waiting for launch.",
    description:
      "Every address given on allkept.app, newest first. One email when it opens.",
  },
};
function Dashboard({
  demo,
  email,
  role,
  onSignOut,
  onDenied,
}: {
  demo: boolean;
  email: string;
  role: Role;
  onSignOut: () => void;
  onDenied: (message: string) => void;
}) {
  const [page, setPage] = useState<Page>("overview");
  const [days, setDays] = useState(30);
  const [draft, setDraft] = useState("");
  const [q, setQ] = useState("");
  const [index, setIndex] = useState(1);
  const [status, setStatus] = useState("all");
  const [revision, setRevision] = useState(0);
  const [data, setData] = useState<ListData | Overview | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [updated, setUpdated] = useState<Date | null>(null);
  const [selected, setSelected] = useState<Row | null>(null);
  const [retry, setRetry] = useState<Row | null>(null);
  const [notice, setNotice] = useState("");
  const api = <T,>(action: string, params: Params = {}) =>
    demo ? demoRequest<T>(action, params) : request<T>(action, params);
  useEffect(() => {
    const timer = setTimeout(() => {
      setQ(draft.trim());
      setIndex(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [draft]);
  useEffect(() => {
    let cancelled = false;
    setBusy(true);
    setError("");
    setData(null);
    void api<ListData | Overview>(page, { days, q, page: index, status })
      .then((result) => {
        if (!cancelled) {
          setData(result);
          setUpdated(new Date());
        }
      })
      .catch((e) => {
        if (!cancelled) {
          if (e instanceof ApiError && (e.status === 403 || e.status === 401)) {
            onDenied(e.message);
            return;
          }
          setError(e instanceof Error ? e.message : "Unable to load data.");
        }
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
    };
    // Callback identity is intentionally excluded; each request is tied to these query inputs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, days, q, index, status, revision, demo]);
  const navigate = (next: Page) => {
    setRevision((v) => v + 1);
    setData(null);
    setBusy(true);
    setError("");
    setPage(next);
    setDraft("");
    setQ("");
    setIndex(1);
    setStatus("all");
    setNotice("");
  };
  const active = page === "imports" ? "sources" : page;
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <aside className="sidebar">
        <Brand />
        <div className="workspace-label">WORKSPACE</div>
        <nav aria-label="Main navigation">
          {navigation.map((n) => (
            <button
              key={n.id}
              onClick={() => navigate(n.id)}
              className={active === n.id ? "nav-item active" : "nav-item"}
              aria-current={active === n.id ? "page" : undefined}
            >
              <Icon name={n.icon} />
              <span>{n.title}</span>
              {n.id === "processing" && <span className="nav-dot" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="environment">
            <i />
            {demo ? "Demo workspace" : "Live workspace"}
          </div>
          <div className="account">
            <div className="avatar">{email[0]?.toUpperCase()}</div>
            <div>
              <strong>{email.split("@")[0]}</strong>
              <small>{demo ? "Read-only preview" : `${role} access`}</small>
            </div>
            <button
              className="icon-button"
              aria-label={demo ? "Exit demo" : "Sign out"}
              title={demo ? "Exit demo" : "Sign out"}
              onClick={onSignOut}
            >
              <Icon name="logout" size={18} />
            </button>
          </div>
        </div>
      </aside>
      <div className="main-wrap">
        <header className="topbar">
          <div>
            Workspace <span>/</span>{" "}
            <strong>{navigation.find((n) => n.id === active)?.title}</strong>
          </div>
          <div className="topbar-right">
            {demo && <span className="demo-label">SAMPLE DATA</span>}
            <span className="date-today">
              {formatDate(new Date().toISOString())}
            </span>
          </div>
        </header>
        <main id="main" className="content">
          <div className="page-heading">
            <div>
              <div className="eyebrow">ALLKEPT AT A GLANCE</div>
              <h1>{copy[page].title}</h1>
              <p>{copy[page].description}</p>
            </div>
            <div className="heading-actions">
              {(page === "overview" || page === "activity") && (
                <select
                  aria-label="Date range"
                  value={days}
                  onChange={(e) => {
                    setDays(Number(e.target.value));
                    setIndex(1);
                  }}
                >
                  <option value={7}>Last 7 days</option>
                  <option value={30}>Last 30 days</option>
                  <option value={90}>Last 90 days</option>
                </select>
              )}
              <button
                className="icon-button bordered"
                aria-label="Refresh data"
                title="Refresh data"
                disabled={busy}
                onClick={() => setRevision((v) => v + 1)}
              >
                <Icon name="refresh" />
              </button>
            </div>
          </div>
          {demo && (
            <div className="demo-banner">
              <span>
                <strong>Take a look around.</strong> This preview uses fictional
                data. Admin actions are disabled.
              </span>
              <span>DEMO MODE</span>
            </div>
          )}
          {notice && (
            <div role="status" className="notice">
              <Icon name="check" size={18} />
              {notice}
              <button
                className="icon-button"
                aria-label="Dismiss notification"
                onClick={() => setNotice("")}
              >
                <Icon name="close" size={16} />
              </button>
            </div>
          )}
          {page !== "overview" && (
            <div className="toolbar">
              <label className="search">
                <Icon name="search" size={18} />
                <input
                  aria-label={`Search ${page}`}
                  placeholder={
                    page === "users"
                      ? "Search name, email or user ID…"
                      : page === "processing"
                        ? "Search title, email or item ID…"
                        : page === "waitlist"
                          ? "Search email…"
                          : "Search email or details…"
                  }
                  maxLength={120}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                />
                {draft && (
                  <button
                    className="icon-button"
                    aria-label="Clear search"
                    onClick={() => setDraft("")}
                  >
                    <Icon name="close" size={15} />
                  </button>
                )}
              </label>
              {page === "processing" && (
                <select
                  aria-label="Processing status"
                  value={status}
                  onChange={(e) => {
                    setStatus(e.target.value);
                    setIndex(1);
                  }}
                >
                  <option value="all">All unfinished</option>
                  <option value="failed">Failed</option>
                  <option value="stale">Unchanged for 10+ min</option>
                </select>
              )}
              {(page === "sources" || page === "imports") && (
                <div className="segmented">
                  <button
                    className={page === "sources" ? "selected" : ""}
                    onClick={() => navigate("sources")}
                  >
                    Connections
                  </button>
                  <button
                    className={page === "imports" ? "selected" : ""}
                    onClick={() => navigate("imports")}
                  >
                    Imports
                  </button>
                </div>
              )}
            </div>
          )}
          {error ? (
            <div className="empty error-box" role="alert">
              <h2>Something didn’t load.</h2>
              <p>{error}</p>
              <button
                className="secondary"
                onClick={() => setRevision((v) => v + 1)}
              >
                Try again
              </button>
            </div>
          ) : busy ? (
            <div className="loading-panel" role="status">
              <Icon name="processing" />
              <span>Getting the latest…</span>
              <div className="skeleton-grid">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} />
                ))}
              </div>
            </div>
          ) : data && page === "overview" ? (
            <OverviewPanel
              data={data as Overview}
              days={days}
              onProcessing={() => navigate("processing")}
            />
          ) : (
            data && (
              <>
                {page === "waitlist" && (
                  <WaitlistSummary
                    data={data as Waitlist}
                    q={q}
                    demo={demo}
                    fetchAll={() => api<Waitlist>("waitlist", { q, export: true })}
                    onNotice={setNotice}
                    onError={setError}
                  />
                )}
                <DataTable
                  page={page}
                  data={data as ListData}
                  role={role}
                  demo={demo}
                  onUser={setSelected}
                  onRetry={setRetry}
                />
                <div className="pagination">
                  <span>
                    {formatNumber(listCount(page, data as ListData))} results
                    {listCount(page, data as ListData) > 0 &&
                      ` · ${(index - 1) * 25 + 1}–${Math.min(index * 25, listCount(page, data as ListData))}`}
                  </span>
                  <div>
                    <button
                      disabled={index === 1}
                      onClick={() => setIndex((i) => i - 1)}
                    >
                      Previous
                    </button>
                    <span>Page {index}</span>
                    <button
                      disabled={index * 25 >= listCount(page, data as ListData)}
                      onClick={() => setIndex((i) => i + 1)}
                    >
                      Next
                    </button>
                  </div>
                </div>
              </>
            )
          )}
          <footer className="content-footer">
            <span>
              Allkept Admin <span>·</span> A home for everything kept.
            </span>
            <span>
              {updated
                ? `Updated ${updated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                : "Connecting…"}
              {page === "overview" || page === "activity"
                ? " · Date range uses UTC"
                : ""}
            </span>
          </footer>
        </main>
      </div>
      {selected && (
        <UserDialog
          user={selected}
          api={api}
          onClose={() => setSelected(null)}
        />
      )}
      {retry && (
        <RetryDialog
          item={retry}
          api={api}
          onClose={() => setRetry(null)}
          onSuccess={() => {
            setRetry(null);
            setNotice(
              "Retry queued. The worker will pick this save up on its next run.",
            );
            setRevision((v) => v + 1);
          }}
        />
      )}
    </div>
  );
}
/** The waitlist page paginates over rows matching the search; every other list over its total. */
function listCount(page: Page, data: ListData): number {
  return page === "waitlist" ? ((data as Waitlist).matched ?? data.total) : data.total;
}
const sourceName = (source: string) =>
  ({ "site-hero": "hero", "site-footer": "footer", site: "site" })[source] ?? source;
/** One CSV cell: quoted when it holds a comma, quote or newline; a leading formula character is
 *  neutralised so an address like =HYPERLINK(...) opens as text in a spreadsheet. */
export function csvCell(value: unknown): string {
  let v = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(v)) v = "'" + v;
  return /[",\n\r]/.test(v) ? `"${v.replaceAll('"', '""')}"` : v;
}
export function waitlistCsv(rows: Row[]): string {
  const head = ["email", "source", "signed_up", "notified"];
  const lines = rows.map((r) =>
    [r.email, r.source, r.created_at, r.notified_at ?? ""].map(csvCell).join(","),
  );
  return [head.join(","), ...lines].join("\r\n") + "\r\n";
}
function WaitlistSummary({
  data,
  q,
  demo,
  fetchAll,
  onNotice,
  onError,
}: {
  data: Waitlist;
  q: string;
  demo: boolean;
  fetchAll: () => Promise<Waitlist>;
  onNotice: (message: string) => void;
  onError: (message: string) => void;
}) {
  const [exporting, setExporting] = useState(false);
  const metrics = [
    { title: "On the waitlist", value: data.total, detail: `${formatNumber(data.today)} joined today` },
    { title: "This week", value: data.week, detail: "Signed up in the last 7 days" },
    {
      title: "Launch email sent",
      value: data.notified,
      detail: `${formatNumber(data.total - data.notified)} still waiting`,
    },
    {
      title: "Which pill converts",
      value: data.sources.find((s) => s.source === "site-hero")?.count ?? 0,
      detail: `hero · ${formatNumber(data.sources.find((s) => s.source === "site-footer")?.count ?? 0)} from the footer`,
    },
  ];
  const max = Math.max(1, ...data.series.map((s) => s.signups));
  const points = data.series
    .map(
      (s, i) =>
        `${(i / Math.max(1, data.series.length - 1)) * 800},${180 - (s.signups / max) * 155}`,
    )
    .join(" ");
  const exportCsv = async () => {
    setExporting(true);
    try {
      const all = await fetchAll();
      const blob = new Blob([waitlistCsv(all.rows)], { type: "text/csv;charset=utf-8" });
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href;
      a.download = `allkept-waitlist-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(href);
      onNotice(`Exported ${formatNumber(all.rows.length)} addresses${q ? ` matching “${q}”` : ""}.`);
    } catch (e) {
      onError(e instanceof Error ? e.message : "Export did not complete.");
    } finally {
      setExporting(false);
    }
  };
  return (
    <>
      <div className="metrics">
        {metrics.map((m) => (
          <article key={m.title} className="metric">
            <div className="metric-label">
              {m.title}
              <Icon name="waitlist" size={18} />
            </div>
            <strong>{formatNumber(m.value)}</strong>
            <p>{m.detail}</p>
          </article>
        ))}
      </div>
      <section className="panel chart-panel">
        <div className="panel-heading">
          <div>
            <h2>Sign-ups, day by day.</h2>
            <p>The last 30 days</p>
          </div>
          <button
            className="secondary"
            disabled={exporting || demo}
            title={demo ? "Export is disabled in demo mode" : undefined}
            onClick={exportCsv}
          >
            <Icon name="download" size={16} />
            {exporting ? "Exporting…" : q ? "Export matches as CSV" : "Export all as CSV"}
          </button>
        </div>
        <div
          className="chart"
          role="img"
          aria-label={`Waitlist sign-ups per day for the last 30 days. Peak ${formatNumber(max)} in a day.`}
        >
          <div className="chart-scale">
            <span>{formatNumber(max)}</span>
            <span>{formatNumber(Math.round(max / 2))}</span>
            <span>0</span>
          </div>
          <svg viewBox="0 0 800 200" preserveAspectRatio="none">
            <defs>
              <linearGradient id="waitlist-fill" x1="0" y1="0" x2="0" y2="1">
                <stop stopOpacity=".25" />
                <stop offset="1" stopOpacity="0" />
              </linearGradient>
            </defs>
            {[25, 102, 180].map((y) => (
              <line key={y} x1="0" y1={y} x2="800" y2={y} strokeDasharray="4 6" />
            ))}
            {data.series.length > 0 && (
              <>
                <polygon points={`0,180 ${points} 800,180`} fill="url(#waitlist-fill)" />
                <polyline points={points} fill="none" strokeWidth="2.5" />
              </>
            )}
          </svg>
        </div>
      </section>
    </>
  );
}
function OverviewPanel({
  data,
  days,
  onProcessing,
}: {
  data: Overview;
  days: number;
  onProcessing: () => void;
}) {
  const metrics = [
    {
      title: "Total users",
      value: data.users,
      detail: `${formatNumber(data.new_users)} joined in ${days} days`,
      icon: "users" as const,
    },
    {
      title: "Saved items",
      value: data.saves,
      detail: `${formatNumber(data.new_saves)} new items in ${days} days`,
      icon: "sources" as const,
    },
    {
      title: "Active users",
      value: data.active_users,
      detail: `Accounts with app events in ${days} days`,
      icon: "activity" as const,
    },
    {
      title: "Need attention",
      value: data.attention,
      detail: "Failed or sorting unchanged for 10+ min",
      icon: "processing" as const,
    },
  ];
  const total = data.platforms.reduce((sum, p) => sum + p.count, 0);
  const max = Math.max(1, ...data.series.map((s) => s.saves));
  const points = data.series
    .map(
      (s, i) =>
        `${(i / Math.max(1, data.series.length - 1)) * 800},${180 - (s.saves / max) * 155}`,
    )
    .join(" ");
  return (
    <>
      <div className="metrics">
        {metrics.map((m, i) => (
          <article
            key={m.title}
            className={`metric ${i === 3 ? "attention" : ""}`}
          >
            <div className="metric-label">
              {m.title}
              <Icon name={m.icon} size={18} />
            </div>
            <strong>{formatNumber(m.value)}</strong>
            <p>
              {i === 3 ? (
                <button onClick={onProcessing}>
                  {m.detail}
                  <Icon name="arrow" size={14} />
                </button>
              ) : (
                m.detail
              )}
            </p>
          </article>
        ))}
      </div>
      <div className="overview-grid">
        <section className="panel chart-panel">
          <div className="panel-heading">
            <div>
              <h2>Good things, kept daily.</h2>
              <p>New library items over the last {days} days</p>
            </div>
            <span className="chart-legend">
              <i /> Saved items
            </span>
          </div>
          <div
            className="chart"
            role="img"
            aria-label={`Daily saves. ${formatNumber(data.new_saves)} new items in ${days} days. Peak ${max} in a day.`}
          >
            <div className="chart-scale">
              <span>{formatNumber(max)}</span>
              <span>{formatNumber(Math.round(max / 2))}</span>
              <span>0</span>
            </div>
            <svg viewBox="0 0 800 200" preserveAspectRatio="none">
              <defs>
                <linearGradient id="chart-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop stopOpacity=".25" />
                  <stop offset="1" stopOpacity="0" />
                </linearGradient>
              </defs>
              {[25, 102, 180].map((y) => (
                <line
                  key={y}
                  x1="0"
                  y1={y}
                  x2="800"
                  y2={y}
                  strokeDasharray="4 6"
                />
              ))}
              {data.series.length > 0 && (
                <>
                  <polygon
                    points={`0,180 ${points} 800,180`}
                    fill="url(#chart-fill)"
                  />
                  <polyline
                    points={points}
                    fill="none"
                    strokeWidth="2.5"
                    vectorEffect="non-scaling-stroke"
                  />
                  {data.series.map((s, i) => (
                    <circle
                      key={s.day}
                      cx={(i / Math.max(1, data.series.length - 1)) * 800}
                      cy={180 - (s.saves / max) * 155}
                      r="5"
                      fill="transparent"
                    >
                      <title>
                        {s.day}: {s.saves} saves
                      </title>
                    </circle>
                  ))}
                </>
              )}
            </svg>
          </div>
          <div className="chart-dates">
            <span>{formatDate(data.series[0]?.day)}</span>
            <span>
              {formatDate(data.series[Math.floor(data.series.length / 2)]?.day)}
            </span>
            <span>{formatDate(data.series.at(-1)?.day)}</span>
          </div>
        </section>
        <section className="panel platforms">
          <div className="panel-heading">
            <div>
              <h2>Where it all starts.</h2>
              <p>Saves by platform · {days} days</p>
            </div>
          </div>
          {!total ? (
            <div className="empty">
              <p>No saves in this period yet.</p>
            </div>
          ) : (
            data.platforms.map((p) => (
              <div className="platform-row" key={p.platform}>
                <span className="platform-icon">
                  <PlatformLogo platform={p.platform} size={24} />
                </span>
                <div>
                  <div className="platform-name">
                    <strong>{platformName(p.platform)}</strong>
                    <span>
                      {formatNumber(p.count)}{" "}
                      <small>{Math.round((p.count / total) * 100)}%</small>
                    </span>
                  </div>
                  <div className="progress-track">
                    <div style={{ width: `${(p.count / total) * 100}%` }} />
                  </div>
                </div>
              </div>
            ))
          )}
        </section>
      </div>
      <section className="attention-strip">
        <div className="attention-symbol">
          <Icon name={data.attention ? "processing" : "check"} size={24} />
        </div>
        <div>
          <h2>
            {data.attention
              ? `${formatNumber(data.attention)} saves could use a hand.`
              : "Nothing needs attention right now."}
          </h2>
          <p>
            {data.attention
              ? "Check failed previews and sorting jobs that haven’t moved recently."
              : "Check the processing queue to see work still in progress."}
          </p>
        </div>
        <button className="secondary" onClick={onProcessing}>
          View processing <Icon name="arrow" size={16} />
        </button>
      </section>
    </>
  );
}
const cell = (r: Row, key: string) => readable(r[key]);
function DataTable({
  page,
  data,
  role,
  demo,
  onUser,
  onRetry,
}: {
  page: Page;
  data: ListData;
  role: Role;
  demo: boolean;
  onUser: (r: Row) => void;
  onRetry: (r: Row) => void;
}) {
  if (!data.rows.length)
    return (
      <div className="panel empty">
        <Icon name={page === "processing" ? "check" : "search"} size={30} />
        <h2>
          {page === "processing" ? "All clear here." : "No results found."}
        </h2>
        <p>
          {page === "processing"
            ? "No unfinished saves match these filters."
            : "Try a different search or date range."}
        </p>
      </div>
    );
  const headers: Record<string, string[]> = {
    users: ["User", "Profile", "Saved items", "Joined", "Last sign-in", ""],
    processing: [
      "Saved item",
      "Preview / sorting",
      "Attempts",
      "Last update",
      "",
    ],
    sources: ["Connection", "Account", "Status", "Last seen", "Last polled"],
    imports: [
      "Import / account",
      "Found / added / skipped",
      "Progress",
      "Started",
    ],
    activity: ["Event", "Account", "Origin", "Time"],
    feedback: ["Message", "From", "Build", "Sent"],
    waitlist: ["Email", "Came from", "Signed up", "Launch email"],
  };
  return (
    <div className="panel table-wrap">
      <table>
        <thead>
          <tr>
            {headers[page]?.map((h, i) => (
              <th key={i} scope="col">
                {h || <span className="sr-only">Actions</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.rows.map((r) => (
            <tr key={r.id}>
              {page === "users" ? (
                <>
                  <td>
                    <div className="user-cell">
                      <div className="avatar">
                        {String(r.name ?? r.email ?? "?")[0]?.toUpperCase()}
                      </div>
                      <div>
                        <strong>
                          {cell(r, "name") === "—"
                            ? "Unnamed account"
                            : cell(r, "name")}
                        </strong>
                        <small>
                          {r.email ? cell(r, "email") : "Guest account"}
                        </small>
                      </div>
                    </div>
                  </td>
                  <td>
                    <Badge
                      value={
                        r.onboarding_completed_at ? "complete" : "incomplete"
                      }
                    />
                  </td>
                  <td className="number">{formatNumber(r.saves)}</td>
                  <td>{formatDate(r.created_at)}</td>
                  <td>{formatDate(r.last_sign_in_at)}</td>
                  <td>
                    <button
                      className="row-action"
                      onClick={() => onUser(r)}
                      aria-label={`View ${r.name ?? r.email ?? "user"}`}
                    >
                      View <Icon name="arrow" size={14} />
                    </button>
                  </td>
                </>
              ) : page === "processing" ? (
                <>
                  <td className="item-cell">
                    <strong>
                      {r.title ? cell(r, "title") : "Untitled save"}
                    </strong>
                    <small>
                      <span className="platform-inline">
                        <PlatformLogo platform={String(r.platform)} size={18} />
                        {platformName(String(r.platform))}
                      </span>{" "}
                      · {cell(r, "email")}
                    </small>
                    <code title={r.id}>{r.id.slice(0, 8)}</code>
                    {r.error && (
                      <details>
                        <summary>See error</summary>
                        <p>{cell(r, "error")}</p>
                      </details>
                    )}
                  </td>
                  <td>
                    <div className="stacked-badges">
                      <Badge value={r.status} />
                      <Badge value={r.classification_status} />
                    </div>
                  </td>
                  <td>
                    <span>{cell(r, "enrich_attempts")} preview</span>
                    <small>{cell(r, "classification_attempts")} sorting</small>
                  </td>
                  <td>{formatDate(r.updated_at, true)}</td>
                  <td>
                    <button
                      className="row-action"
                      disabled={demo || role !== "operator" || !r.can_retry}
                      title={
                        demo
                          ? "Unavailable in demo"
                          : role !== "operator"
                            ? "Operator access required"
                            : !r.can_retry
                              ? "Currently processing or recently queued"
                              : "Queue another attempt"
                      }
                      onClick={() => onRetry(r)}
                    >
                      <Icon name="refresh" size={14} />
                      Retry
                    </button>
                  </td>
                </>
              ) : page === "sources" ? (
                <>
                  <td>
                    <strong className="platform-inline">
                      <PlatformLogo platform={String(r.kind)} size={22} />
                      {r.kind === "instagram_dm"
                        ? "Instagram DM"
                        : r.kind === "youtube_playlist"
                          ? "YouTube playlist"
                          : platformName(String(r.kind))}
                    </strong>
                    <small>{cell(r, "handle")}</small>
                  </td>
                  <td>{cell(r, "email")}</td>
                  <td>
                    <Badge value={r.status} />
                  </td>
                  <td>{formatDate(r.last_seen_at, true)}</td>
                  <td>{formatDate(r.last_polled_at, true)}</td>
                </>
              ) : page === "imports" ? (
                <>
                  <td>
                    <strong className="platform-inline">
                      <PlatformLogo platform={String(r.source)} size={22} />
                      {platformName(String(r.source))} export
                    </strong>
                    <small>{cell(r, "email")}</small>
                  </td>
                  <td className="number">
                    {cell(r, "found")} / {cell(r, "added")} /{" "}
                    {cell(r, "skipped")}
                  </td>
                  <td>
                    <Badge
                      value={
                        r.error || Number(r.failed) > 0
                          ? "failed"
                          : !r.finished_at || Number(r.unfinished) > 0
                            ? "processing"
                            : "complete"
                      }
                    />
                    <small>
                      {Number(r.unfinished) > 0
                        ? `${r.unfinished} unfinished saves`
                        : r.finished_at
                          ? "Ingestion finished"
                          : "Ingesting export"}
                    </small>
                    {r.error && (
                      <small className="error-text">{cell(r, "error")}</small>
                    )}
                  </td>
                  <td>{formatDate(r.created_at, true)}</td>
                </>
              ) : page === "waitlist" ? (
                <>
                  <td>
                    <strong>{cell(r, "email")}</strong>
                  </td>
                  <td>
                    <Badge value={sourceName(String(r.source))} />
                  </td>
                  <td>{formatDate(r.created_at, true)}</td>
                  <td>
                    {r.notified_at ? (
                      formatDate(r.notified_at, true)
                    ) : (
                      <em>waiting</em>
                    )}
                  </td>
                </>
              ) : page === "feedback" ? (
                <>
                  <td>
                    {/* The whole message, wrapped. Truncating the one thing a person actually
                        wrote is how feedback stops being read. */}
                    <p className="feedback-message">{cell(r, "message")}</p>
                  </td>
                  <td>
                    {/* Null once the account is deleted — the message is kept, the person is not. */}
                    {r.email ? cell(r, "email") : <em>account deleted</em>}
                  </td>
                  <td>
                    <code>{cell(r, "app_version")}</code>
                    <small>{cell(r, "platform")}</small>
                  </td>
                  <td>{formatDate(r.created_at, true)}</td>
                </>
              ) : (
                <>
                  <td>
                    <strong className="capitalize">{cell(r, "action")}</strong>
                    {r.target && <code>{cell(r, "target")}</code>}
                  </td>
                  <td>{cell(r, "email")}</td>
                  <td>
                    <Badge value={r.origin} />
                  </td>
                  <td>{formatDate(r.created_at, true)}</td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function Dialog({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const dialog = ref.current;
    dialog?.showModal();
    return () => {
      dialog?.close();
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      aria-labelledby="dialog-title"
    >
      <div className="dialog-content">
        <div className="dialog-heading">
          <h2 id="dialog-title">{title}</h2>
          <button
            className="icon-button"
            onClick={onClose}
            aria-label="Close dialog"
          >
            <Icon name="close" />
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}
function UserDialog({
  user,
  api,
  onClose,
}: {
  user: Row;
  api: <T>(action: string, params: Params) => Promise<T>;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<Row | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void api<Row>("user", { id: user.id })
      .then((d) => {
        if (active) setDetail(d);
      })
      .catch((e) => {
        if (active)
          setError(e instanceof Error ? e.message : "Unable to load profile.");
      });
    return () => {
      active = false;
    };
  }, [user.id]);
  return (
    <Dialog title="User profile" onClose={onClose}>
      {error ? (
        <p role="alert" className="error-box">
          {error}
        </p>
      ) : !detail ? (
        <p role="status">Loading profile…</p>
      ) : (
        <>
          <div className="profile-header">
            <div className="avatar large">
              {String(detail.name ?? detail.email ?? "?")[0]?.toUpperCase()}
            </div>
            <h3>{cell(detail, "name")}</h3>
            <p>{cell(detail, "email")}</p>
            <Badge
              value={detail.onboarding_completed_at ? "complete" : "incomplete"}
            />
          </div>
          <dl>
            {[
              ["User ID", detail.id],
              ["Phone", detail.phone],
              ["Joined", formatDate(detail.created_at)],
              ["Last sign-in", formatDate(detail.last_sign_in_at, true)],
              ["Saved items", detail.saves],
              ["Connected sources", detail.sources],
            ].map(([label, value]) => (
              <div key={String(label)}>
                <dt>{label}</dt>
                <dd>{readable(value)}</dd>
              </div>
            ))}
          </dl>
        </>
      )}
    </Dialog>
  );
}
function RetryDialog({
  item,
  api,
  onClose,
  onSuccess,
}: {
  item: Row;
  api: <T>(action: string, params: Params) => Promise<T>;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [requestId] = useState(() => crypto.randomUUID());
  const run = async () => {
    setBusy(true);
    setError("");
    try {
      await api("retry", { id: item.id, request_id: requestId });
      onSuccess();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to queue retry.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      title="Give this save another try?"
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <p className="dialog-description">
        The existing worker will try processing this save again. Your admin
        account and this action will be recorded in the activity log.
      </p>
      <div className="retry-item">
        <strong>{item.title ?? "Untitled save"}</strong>
        <small>{item.email}</small>
        <code>{item.id}</code>
      </div>
      {error && (
        <p role="alert" className="error-box">
          {error}
        </p>
      )}
      <div className="dialog-actions">
        <button className="secondary" disabled={busy} onClick={onClose}>
          Cancel
        </button>
        <button className="primary" disabled={busy} onClick={() => void run()}>
          <Icon name="refresh" size={16} />
          {busy ? "Queuing…" : "Queue retry"}
        </button>
      </div>
    </Dialog>
  );
}

export default App;
