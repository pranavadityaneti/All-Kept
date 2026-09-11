import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <span>Allkept · MECA Engineering Solutions (OPC) Private Limited</span>
      <span className="l">
        <Link href="/privacy">Privacy</Link>
        <Link href="/terms">Terms</Link>
        <Link href="/delete">Delete your data</Link>
        <Link href="/support">Support</Link>
        <a href="mailto:hi@allkept.app">hi@allkept.app</a>
      </span>
    </footer>
  );
}
