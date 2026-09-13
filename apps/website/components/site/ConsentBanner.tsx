'use client';

import { useEffect, useState } from 'react';
import { CONSENT_RESET_EVENT, readConsent, setConsent, type Consent } from '@/lib/consent';

/**
 * The one question the site asks: may it measure? Shown until answered, once per browser, and
 * again if the visitor asks for it from the footer. Until it is answered, both tags run with
 * consent denied, which is what the inline snippets set before they load.
 */
export function ConsentBanner() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    setOpen(readConsent() === null);
    const reopen = () => setOpen(true);
    window.addEventListener(CONSENT_RESET_EVENT, reopen);
    return () => window.removeEventListener(CONSENT_RESET_EVENT, reopen);
  }, []);
  if (!open) return null;
  const choose = (choice: Consent) => {
    setConsent(choice);
    setOpen(false);
  };
  return (
    <div className="consent" role="dialog" aria-label="Cookie choices" aria-live="polite">
      <p>
        We use the Meta Pixel and Google Analytics to count visits and sign-ups. Accept to allow
        them, or decline and we measure nothing. <a href="/privacy#analytics">Privacy policy</a>
      </p>
      <div className="consent-actions">
        <button type="button" className="consent-decline" onClick={() => choose('denied')}>
          Decline
        </button>
        <button type="button" className="consent-accept" onClick={() => choose('granted')}>
          Accept
        </button>
      </div>
    </div>
  );
}

/** The footer's way back to the question. */
export function ConsentChoiceLink() {
  return (
    <a
      href="#cookies"
      onClick={(e) => {
        e.preventDefault();
        void import('@/lib/consent').then((m) => m.resetConsent());
      }}
    >
      Cookie choices
    </a>
  );
}
