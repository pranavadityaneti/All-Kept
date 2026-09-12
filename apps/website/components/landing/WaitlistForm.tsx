'use client';

import { useId, useState, type FormEvent } from 'react';
import type { WaitlistConfig } from '@/lib/waitlist';

type Status = 'idle' | 'sending' | 'ok' | 'err';

type Props = {
  config: WaitlistConfig;
  /** Which pill this is — the server records it, so we learn which one converts. */
  source: 'site-hero' | 'site-footer';
};

// Posts to the `waitlist` edge function. The function owns validation, the duplicate check and
// the rate limit; this side only shows what it says.
export function WaitlistForm({ config, source }: Props) {
  const id = useId();
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [message, setMessage] = useState('');

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (status === 'sending') return;

    if (!config) {
      setStatus('err');
      setMessage('Sign-up isn’t set up on this build yet. Email hi@allkept.app instead.');
      return;
    }

    const form = e.currentTarget;
    const website = (form.elements.namedItem('website') as HTMLInputElement | null)?.value ?? '';

    setStatus('sending');
    setMessage('');
    try {
      const res = await fetch(config.endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          apikey: config.anonKey,
          authorization: `Bearer ${config.anonKey}`,
        },
        body: JSON.stringify({ email, website, source }),
      });
      const data = (await res.json().catch(() => null)) as
        | { joined?: boolean; message?: string; error?: string }
        | null;
      if (!res.ok) {
        setStatus('err');
        setMessage(data?.error ?? 'Something went wrong. Try again.');
        return;
      }
      setStatus('ok');
      setMessage(data?.message ?? 'You’re in.');
      if (data?.joined) setEmail('');
    } catch {
      setStatus('err');
      setMessage('Could not reach the server. Try again.');
    }
  }

  return (
    <div className="waitlist-wrap">
      <form className="waitlist" onSubmit={submit} noValidate>
        <svg
          width="19"
          height="19"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--color-neutral-500)"
          strokeWidth="1.6"
          aria-hidden="true"
        >
          <rect x="2.5" y="5" width="19" height="14" rx="3" />
          <path d="M3.5 7l8.5 6 8.5-6" />
        </svg>
        <input
          id={`${id}-email`}
          type="email"
          name="email"
          autoComplete="email"
          placeholder="you@example.com"
          aria-label="Email address"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        {/* Honeypot — real people never see or fill this. */}
        <input
          className="hp"
          type="text"
          name="website"
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
        />
        <button type="submit" disabled={status === 'sending'}>
          Join the waitlist
        </button>
      </form>
      <p
        className="waitlist-msg"
        data-tone={status === 'ok' ? 'ok' : status === 'err' ? 'err' : undefined}
        aria-live="polite"
      >
        {message}
      </p>
    </div>
  );
}
