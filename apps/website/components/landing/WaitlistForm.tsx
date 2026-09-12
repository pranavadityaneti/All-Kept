'use client';

import { useId, useState, type FormEvent } from 'react';

type Status = 'idle' | 'sending' | 'ok' | 'err';

// Posts to /api/interest — the D1-backed waitlist already in this app.
export function WaitlistForm() {
  const id = useId();
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [message, setMessage] = useState('');

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (status === 'sending') return;

    const form = e.currentTarget;
    const website = (form.elements.namedItem('website') as HTMLInputElement | null)?.value ?? '';

    setStatus('sending');
    setMessage('');
    try {
      const res = await fetch('/api/interest', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, website }),
      });
      const data = (await res.json().catch(() => null)) as { message?: string } | null;
      if (!res.ok) {
        setStatus('err');
        setMessage(data?.message ?? 'Something went wrong. Try again.');
        return;
      }
      setStatus('ok');
      setMessage(data?.message ?? 'You’re in.');
      setEmail('');
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
