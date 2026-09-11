import { readFileSync } from "node:fs";
import path from "node:path";

export type LegalName = "privacy" | "terms" | "delete";

// The fragments in content/ are our own static files extracted from the approved docs/ pages and
// verified verbatim by scripts/verify-content.mjs. Rendering them as HTML is what keeps the text
// byte-identical to what Pranav approved; nothing user-supplied ever reaches this component.
export function LegalPage({ name }: { name: LegalName }) {
  const html = readFileSync(path.join(process.cwd(), "content", `${name}.html`), "utf8");
  return <article className="legal" dangerouslySetInnerHTML={{ __html: html }} />;
}
