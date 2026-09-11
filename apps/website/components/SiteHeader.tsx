import Link from "next/link";

export function SiteHeader() {
  return (
    <nav className="site-nav" aria-label="Site">
      <Link className="mark" href="/">Allkept</Link>
      <span className="links">
        <Link href="/privacy">Privacy</Link>
        <Link href="/terms">Terms</Link>
        <Link href="/delete">Delete your data</Link>
        <Link href="/support">Support</Link>
      </span>
    </nav>
  );
}
