// The visitor's answer to "may we measure?", remembered in this browser and told to both tags.
// Google hears it through its consent signals; Meta through its own grant/revoke. Nothing here
// runs on the server, and nothing throws when a tag is blocked or missing.
export type Consent = 'granted' | 'denied';
export const CONSENT_KEY = 'allkept-consent';
/** Fired on window when the stored choice is cleared, so the banner can show again. */
export const CONSENT_RESET_EVENT = 'allkept:consent-reset';

export function readConsent(): Consent | null {
  try {
    const v = window.localStorage.getItem(CONSENT_KEY);
    return v === 'granted' || v === 'denied' ? v : null;
  } catch {
    return null;
  }
}

/** Remembers the choice and applies it to the tags already on the page. */
export function setConsent(choice: Consent): void {
  try {
    window.localStorage.setItem(CONSENT_KEY, choice);
  } catch {
    /* private mode with storage off: the choice lasts for this page only */
  }
  applyConsent(choice);
}

/** Forgets the choice, so the banner asks again on this page. */
export function resetConsent(): void {
  try {
    window.localStorage.removeItem(CONSENT_KEY);
  } catch {
    /* nothing to forget */
  }
  window.dispatchEvent(new Event(CONSENT_RESET_EVENT));
}

export function applyConsent(choice: Consent): void {
  const state = choice === 'granted' ? 'granted' : 'denied';
  try {
    window.gtag?.('consent', 'update', {
      ad_storage: state,
      ad_user_data: state,
      ad_personalization: state,
      analytics_storage: state,
    });
    window.fbq?.('consent', choice === 'granted' ? 'grant' : 'revoke');
  } catch {
    /* a blocked tag is not our problem to surface */
  }
}
