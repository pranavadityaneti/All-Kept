'use client';

import { ArrowRight, Bookmark, Check, Search, Sparkles } from 'lucide-react';
import Image from 'next/image';
import { type SyntheticEvent, useEffect, useState } from 'react';

const LAUNCH_DATE = new Date('2026-09-21T00:00:00+05:30');
const DEFAULT_GOAL = 500;
const productModes = [
  { id: 'save', label: 'Save' },
  { id: 'sort', label: 'Sort' },
  { id: 'find', label: 'Find' },
  { id: 'ask', label: 'Ask AI' },
] as const;

type ProductMode = (typeof productModes)[number]['id'];
type InterestResponse = {
  count: number;
  goal: number;
  joined?: boolean;
  message?: string;
};

type ModelContext = {
  registerTool: (
    tool: {
      name: string;
      title: string;
      description: string;
      inputSchema: object;
      annotations: { readOnlyHint: boolean; untrustedContentHint: boolean };
      execute: (input: unknown) => Promise<unknown>;
    },
    options?: { signal: AbortSignal },
  ) => void | Promise<void>;
};

async function requestInterest(email: string, website = '') {
  const response = await fetch('/api/interest', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, website }),
  });
  const data = (await response.json()) as InterestResponse;

  if (!response.ok) {
    throw new Error(data.message || 'Please check your email and try again.');
  }

  return data;
}

function daysUntilLaunch() {
  return Math.max(
    0,
    Math.ceil((LAUNCH_DATE.getTime() - Date.now()) / 86_400_000),
  );
}

function PlatformLogo({ name }: { name: string }) {
  return (
    <span className="platform-mark" aria-hidden="true">
      <Image src={`/platforms/${name}.png`} alt="" width={32} height={32} />
    </span>
  );
}

function PhoneScreen({ mode }: { mode: ProductMode }) {
  return (
    <div className="phone-screen">
      <div className="phone-status">
        <span>9:41</span>
        <span className="phone-island" />
        <span>●●●</span>
      </div>
      <div className="phone-appbar">
        <div className="mini-brand">
          <span className="mini-mark" />
          <span>Allkept</span>
        </div>
        <span className="avatar">P</span>
      </div>

      {mode === 'save' && (
        <div className="phone-view phone-library">
          <p className="phone-kicker">Today</p>
          <h2>Saved for you</h2>
          <div className="phone-search">
            <Search size={13} />
            <span>Search all your saves</span>
          </div>
          <div className="save-grid">
            <article className="save-tile tile-travel">
              <PlatformLogo name="instagram" />
              <strong>Slow days in Goa</strong>
              <span>Travel</span>
            </article>
            <article className="save-tile tile-food">
              <PlatformLogo name="youtube" />
              <strong>15-min pasta</strong>
              <span>Recipes</span>
            </article>
            <article className="save-tile tile-style">
              <PlatformLogo name="reddit" />
              <strong>Tokyo thrift map</strong>
              <span>Style</span>
            </article>
            <article className="save-tile tile-work">
              <PlatformLogo name="slack" />
              <strong>Launch notes</strong>
              <span>Work</span>
            </article>
          </div>
        </div>
      )}

      {mode === 'sort' && (
        <div className="phone-view">
          <p className="phone-kicker">Sorted automatically</p>
          <h2>Your saves, tidied up.</h2>
          <div className="collection-list">
            <article>
              <span className="collection-art travel-art">✦</span>
              <div>
                <strong>Goa trip</strong>
                <small>18 saves · 5 sources</small>
              </div>
              <span>›</span>
            </article>
            <article>
              <span className="collection-art food-art">◌</span>
              <div>
                <strong>Things to cook</strong>
                <small>31 saves · 4 sources</small>
              </div>
              <span>›</span>
            </article>
            <article>
              <span className="collection-art ideas-art">⌁</span>
              <div>
                <strong>Big ideas</strong>
                <small>12 saves · 6 sources</small>
              </div>
              <span>›</span>
            </article>
          </div>
          <div className="sorting-note">
            <Sparkles size={14} /> 4 new saves sorted
          </div>
        </div>
      )}

      {mode === 'find' && (
        <div className="phone-view">
          <p className="phone-kicker">Search everything</p>
          <h2>Find the thing.</h2>
          <div className="phone-search phone-search-active">
            <Search size={13} />
            <strong>quiet cafés in Goa</strong>
          </div>
          <p className="result-count">
            7 results across Instagram, Reddit + web
          </p>
          <div className="search-results">
            <article>
              <span className="result-thumb tile-travel" />
              <div>
                <strong>3 cafés worth the detour</strong>
                <small>Instagram · Fontainhas</small>
              </div>
            </article>
            <article>
              <span className="result-thumb tile-food" />
              <div>
                <strong>South Goa work-friendly cafés</strong>
                <small>Reddit · saved in Travel</small>
              </div>
            </article>
          </div>
        </div>
      )}

      {mode === 'ask' && (
        <div className="phone-view phone-ai">
          <div className="ai-orb">
            <Sparkles size={22} />
          </div>
          <p className="phone-kicker">Ask Allkept</p>
          <h2>Your saves have answers.</h2>
          <div className="chat-bubble user-bubble">
            What were those cafés I saved for Goa?
          </div>
          <div className="chat-bubble ai-bubble">
            You saved 7. Mojigao and Cafe Bodega match your quiet, outdoor brief
            best.
            <div className="source-row">
              <PlatformLogo name="instagram" />
              <PlatformLogo name="reddit" />
              <span>7 sources</span>
            </div>
          </div>
        </div>
      )}

      <div className="phone-tabs" aria-hidden="true">
        <span className={mode === 'save' ? 'active' : ''}>
          <Bookmark size={14} />
        </span>
        <span className={mode === 'sort' ? 'active' : ''}>▦</span>
        <span className={mode === 'find' ? 'active' : ''}>
          <Search size={14} />
        </span>
        <span className={mode === 'ask' ? 'active' : ''}>
          <Sparkles size={14} />
        </span>
      </div>
    </div>
  );
}

export default function Home() {
  const [mode, setMode] = useState<ProductMode>('save');
  const [email, setEmail] = useState('');
  const [website, setWebsite] = useState('');
  const [count, setCount] = useState(0);
  const [goal, setGoal] = useState(DEFAULT_GOAL);
  const [status, setStatus] = useState<
    'idle' | 'loading' | 'success' | 'error'
  >('idle');
  const [message, setMessage] = useState('');
  const [remainingDays] = useState(daysUntilLaunch);
  const progress = Math.min(100, Math.max(0, (count / goal) * 100));

  useEffect(() => {
    fetch('/api/interest')
      .then((response) => response.json() as Promise<InterestResponse>)
      .then((data) => {
        setCount(data.count);
        setGoal(data.goal);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setMode((current) => {
        const index = productModes.findIndex((item) => item.id === current);
        return productModes[(index + 1) % productModes.length].id;
      });
    }, 4200);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    const modelContext = (
      document as Document & { modelContext?: ModelContext }
    ).modelContext;
    if (!modelContext?.registerTool) return;

    const lifecycle = new AbortController();
    void Promise.resolve(
      modelContext.registerTool(
        {
          name: 'join_launch_interest',
          title: 'Join Allkept launch interest',
          description:
            'Add an email address to the Allkept September 21 launch list and update the visible interest meter.',
          inputSchema: {
            type: 'object',
            properties: {
              email: {
                type: 'string',
                format: 'email',
                maxLength: 254,
                description: 'Email address to notify when Allkept launches.',
              },
            },
            required: ['email'],
            additionalProperties: false,
          },
          annotations: { readOnlyHint: false, untrustedContentHint: false },
          async execute(input) {
            const emailValue =
              typeof input === 'object' &&
              input !== null &&
              'email' in input &&
              typeof input.email === 'string'
                ? input.email
                : '';

            if (!emailValue.trim())
              throw new Error('A valid email is required.');
            setStatus('loading');
            setMessage('');

            try {
              const data = await requestInterest(emailValue);
              setCount(data.count);
              setGoal(data.goal);
              setStatus('success');
              setMessage(
                data.message || 'You’re in. We’ll let you know first.',
              );
              return {
                joined: data.joined,
                message: data.message,
                interestedPeople: data.count,
                goal: data.goal,
              };
            } catch (error) {
              setStatus('error');
              setMessage(
                error instanceof Error
                  ? error.message
                  : 'Something went wrong.',
              );
              throw error;
            }
          },
        },
        { signal: lifecycle.signal },
      ),
    ).catch(() => undefined);

    return () => lifecycle.abort();
  }, []);

  async function submitInterest(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus('loading');
    setMessage('');
    try {
      const data = await requestInterest(email, website);
      setCount(data.count);
      setGoal(data.goal);
      setStatus('success');
      setMessage(data.message || 'You’re in. We’ll let you know first.');
      setEmail('');
    } catch (error) {
      setStatus('error');
      setMessage(
        error instanceof Error
          ? error.message
          : 'Something went wrong. Try again.',
      );
    }
  }

  return (
    <main>
      <nav className="site-nav" aria-label="Main navigation">
        <a className="brand" href="#top" aria-label="Allkept home">
          <Image
            src="/brand/allkept-horizontal.png"
            alt="Allkept"
            width={1538}
            height={610}
            priority
          />
        </a>
        <div className="nav-journey" aria-label="What Allkept does">
          {productModes.map((item, index) => (
            <span key={item.id}>
              <b>{index + 1}</b>
              {item.label}
            </span>
          ))}
        </div>
        <a className="nav-cta" href="#early-access">
          Join early access
        </a>
      </nav>

      <section className="hero" id="top">
        <div className="hero-copy">
          <div className="launch-pill">
            <span className="live-dot" />
            Launching September 21
            <span className="pill-divider" />
            {remainingDays} days
          </div>
          <h1>
            Everything you save.
            <br />
            <em>Ready when you need it.</em>
          </h1>
          <p className="hero-subcopy">
            Save from any app. Allkept sorts it, finds it and helps you use it.
          </p>

          <div className="interest-card" id="early-access">
            <form onSubmit={submitInterest} className="interest-form">
              <label htmlFor="interest-email">Get launch access</label>
              <div className="form-row">
                <input
                  id="interest-email"
                  type="email"
                  name="email"
                  placeholder="you@email.com"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                  maxLength={254}
                  disabled={status === 'loading'}
                />
                <input
                  className="honeypot"
                  name="website"
                  tabIndex={-1}
                  autoComplete="off"
                  aria-hidden="true"
                  value={website}
                  onChange={(event) => setWebsite(event.target.value)}
                />
                <button type="submit" disabled={status === 'loading'}>
                  {status === 'loading' ? 'Joining…' : 'I’m interested'}
                  {status === 'success' ? (
                    <Check size={17} />
                  ) : (
                    <ArrowRight size={17} />
                  )}
                </button>
              </div>
            </form>
            <div
              className="interest-meter"
              aria-label={`${count} of ${goal} early access spots claimed`}
            >
              <div className="meter-copy">
                <span>
                  <strong>{count.toLocaleString()}</strong> people are
                  interested
                </span>
                <span>{goal.toLocaleString()} launch circle</span>
              </div>
              <div className="meter-track">
                <span style={{ width: `${progress}%` }} />
              </div>
            </div>
            <p className={`form-message ${status}`} aria-live="polite">
              {message || 'One email on launch day. No noise.'}
            </p>
          </div>
        </div>

        <div className="product-story" aria-label="Allkept product preview">
          <div
            className="story-switcher"
            role="tablist"
            aria-label="Preview Allkept features"
          >
            {productModes.map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={mode === item.id}
                onClick={() => setMode(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
          <article className="float-card float-card-one">
            <span className="float-cover cover-goa" />
            <div>
              <PlatformLogo name="instagram" />
              <strong>Quiet cafés in Goa</strong>
              <small>saved to Travel</small>
            </div>
          </article>
          <article className="float-card float-card-two">
            <span className="float-cover cover-food" />
            <div>
              <PlatformLogo name="youtube" />
              <strong>The perfect 15-min pasta</strong>
              <small>sorted into Recipes</small>
            </div>
          </article>
          <article className="float-card float-card-three">
            <span className="float-cover cover-style" />
            <div>
              <PlatformLogo name="reddit" />
              <strong>Tokyo thrift map</strong>
              <small>found in 0.2 seconds</small>
            </div>
          </article>
          <article className="float-card float-card-four">
            <span className="float-cover cover-work" />
            <div>
              <PlatformLogo name="slack" />
              <strong>Launch research</strong>
              <small>ready to ask AI</small>
            </div>
          </article>
          <div className="phone-photo">
            <Image
              src="/hero-hand-phone.png"
              alt="A hand holding a phone showing the Allkept app"
              width={1024}
              height={1536}
              priority
            />
            <div className="screen-overlay">
              <PhoneScreen mode={mode} />
            </div>
          </div>
        </div>
      </section>

      <footer
        className="source-ribbon"
        aria-label="Save from supported platforms"
      >
        <span>Save from</span>
        {[
          'instagram',
          'youtube',
          'tiktok',
          'x',
          'reddit',
          'facebook',
          'slack',
          'whatsapp',
        ].map((name) => (
          <PlatformLogo key={name} name={name} />
        ))}
        <span>+ anywhere on the web</span>
      </footer>
    </main>
  );
}
