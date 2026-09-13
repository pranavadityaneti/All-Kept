// The two things a visitor can do that are worth counting, told to whichever tags are on the page.
// Every call is guarded: a blocked script, a missing id, or a server render must never throw.
declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
    gtag?: (...args: unknown[]) => void;
  }
}

/** Someone joined the waitlist. `source` says which of the two forms. */
export function trackLead(source: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.fbq?.('track', 'Lead', { content_name: source });
    window.gtag?.('event', 'generate_lead', { source });
  } catch {
    /* counting must never break the form */
  }
}
