import type { ReactNode } from 'react';

// Light-ground chrome for the policy pages: a small brand link home, the article, and a footer
// with the same links the landing page carries. Everything inside is scoped by .legal-site.
export function LegalShell({ children }: { children: ReactNode }) {
  return (
    <div className="legal-site">
      <div className="wrap">
        <nav className="site-nav" aria-label="Site">
          <a className="brand" href="/" aria-label="All Kept home">
            <img className="mark" src="/design/mark.png" alt="" width={256} height={256} />
            <img className="word" src="/design/wordmark-dark.png" alt="All Kept" width={519} height={150} />
          </a>
          <span className="links">
            <a href="/privacy">Privacy</a>
            <a href="/terms">Terms</a>
            <a href="/delete">Delete your data</a>
            <a href="/support">Support</a>
          </span>
        </nav>
        {children}
        <footer className="site-footer">
          <span>All Kept · MECA Engineering Solutions (OPC) Private Limited</span>
          <span className="l">
            <a href="/privacy">Privacy</a>
            <a href="/terms">Terms</a>
            <a href="/delete">Delete your data</a>
            <a href="/support">Support</a>
            <a href="mailto:hi@allkept.app">hi@allkept.app</a>
          </span>
        </footer>
      </div>
    </div>
  );
}
