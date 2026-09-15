/**
 * The post's caption as the sheet shows it: without the line the sheet already carries as its
 * title, so the same words are not read twice, and nothing at all when that line was all there was.
 */
export function captionBody(text: string | null, heading: string): string | null {
  if (!text) return null;
  const lines = text.split("\n");
  const first = lines.findIndex((l) => l.trim().length > 0);
  const rest = first >= 0 && lines[first]!.trim() === heading.trim() ? lines.slice(first + 1) : lines;
  const body = rest.join("\n").trim();
  return body.length > 0 ? body : null;
}
