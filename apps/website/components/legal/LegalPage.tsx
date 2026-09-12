import { LegalShell } from './LegalShell';

// The fragments in content/ are our own static files, copied byte-for-byte from the website-pages
// branch where scripts/verify-content.mjs proved them verbatim against the approved docs/ pages.
// They are imported at build time (no filesystem on the Workers runtime) and rendered as HTML so
// the text stays exactly what Pranav approved; nothing user-supplied ever reaches this component.
export function LegalPage({ html }: { html: string }) {
  return (
    <LegalShell>
      <article className="legal" dangerouslySetInnerHTML={{ __html: html }} />
    </LegalShell>
  );
}
