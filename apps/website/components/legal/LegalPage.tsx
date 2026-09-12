import { readFileSync } from 'node:fs';
import path from 'node:path';
import { LegalShell } from './LegalShell';

export type LegalName = 'privacy' | 'terms' | 'delete';

// The fragments in content/ are our own static files, extracted from the approved docs/ pages and
// proved verbatim by scripts/verify-content.mjs. Read here at build time (the site is a static
// export, so this never runs on a request) and rendered as HTML so the text stays exactly what
// Pranav approved; nothing user-supplied ever reaches this component.
export function LegalPage({ name }: { name: LegalName }) {
  const html = readFileSync(path.join(process.cwd(), 'content', `${name}.html`), 'utf8');
  return (
    <LegalShell>
      <article className="legal" dangerouslySetInnerHTML={{ __html: html }} />
    </LegalShell>
  );
}
