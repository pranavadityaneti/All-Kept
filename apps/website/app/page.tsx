import { Countdown } from '@/components/landing/Countdown';
import { SlotImage } from '@/components/landing/SlotImage';
import { WaitlistForm } from '@/components/landing/WaitlistForm';

// ── Hero tile field ──────────────────────────────────────────────────────
// Positions are artboard pixels on a 1280×980 canvas; `--u` scales them.
type Platform = 'ig' | 'yt' | 'tt' | 'pi' | 'x' | 'rd';

const PLATFORM = {
  ig: { icon: '/design/platforms/instagram.png', name: 'Instagram', ph: 'Instagram reel' },
  yt: { icon: '/design/platforms/youtube.png', name: 'YouTube', ph: 'YouTube video' },
  tt: { icon: '/design/platforms/tiktok.png', name: 'TikTok', ph: 'TikTok' },
  pi: { icon: '/design/platforms/pinterest.png', name: 'Pinterest', ph: 'Pin' },
  x: { icon: '/design/platforms/x.png', name: 'X', ph: 'X post' },
  rd: { icon: '/design/platforms/reddit.png', name: 'Reddit', ph: 'Reddit post' },
} satisfies Record<Platform, { icon: string; name: string; ph: string }>;

type Tile = {
  x: number;
  y: number;
  w: number;
  h: number;
  p: Platform;
  o: number;
  cat: string;
  /** image basename under /design/saves, or 'post' for a text card */
  img: string;
  /** a picture dropped into this slot inside Claude Design — wins over `img` */
  slot?: string;
};

const TILES: Tile[] = [
  { x: 90, y: 350, w: 160, h: 270, p: 'ig', o: 0.95, cat: 'Food', img: 'acai' },
  { x: 280, y: 430, w: 150, h: 250, p: 'tt', o: 0.8, cat: 'Travel', img: 'alpine' },
  { x: 860, y: 420, w: 150, h: 250, p: 'ig', o: 0.8, cat: 'Places', img: 'coast', slot: 'c-2' },
  { x: 1020, y: 330, w: 210, h: 278, p: 'x', o: 0.8, cat: 'News', img: 'news-x' },
  { x: 60, y: 670, w: 250, h: 150, p: 'yt', o: 0.75, cat: 'Tech', img: 'desk', slot: 'c-4' },
  { x: 340, y: 730, w: 150, h: 200, p: 'ig', o: 0.85, cat: 'Food', img: 'pasta' },
  { x: 810, y: 720, w: 160, h: 200, p: 'rd', o: 0.85, cat: 'Tech', img: 'post' },
  { x: 1010, y: 650, w: 230, h: 150, p: 'pi', o: 0.75, cat: 'Travel', img: 'alpine' },
];

function RedditCard() {
  return (
    <div className="reddit-card">
      <div className="reddit-head">
        <span className="reddit-avatar" />
        <span className="reddit-sub">r/technology</span>
        <span>· 5h</span>
      </div>
      <p className="reddit-body">
        My saved posts are a graveyard. What do you use to actually search them?
      </p>
      <div className="reddit-foot">2.1k upvotes · 348 comments</div>
    </div>
  );
}

function TileField() {
  return (
    <div className="tiles" aria-hidden="true">
      {TILES.map((t, i) => {
        const platform = PLATFORM[t.p];
        return (
          <div
            key={i}
            className="tile"
            style={{
              left: `calc(${t.x} * var(--u))`,
              top: `calc(${t.y} * var(--u))`,
              width: `calc(${t.w} * var(--u))`,
              height: `calc(${t.h} * var(--u))`,
              opacity: t.o,
            }}
          >
            <div className="tile-card">
              {t.img === 'post' ? (
                <RedditCard />
              ) : (
                <SlotImage
                  src={t.slot ? `/design/slots/${t.slot}.png` : `/design/saves/${t.img}.png`}
                  alt=""
                  placeholder={platform.ph}
                />
              )}
              <div className="tile-badge">
                <SlotImage src={platform.icon} alt="" placeholder="" />
              </div>
            </div>
            <span className="tile-tag">{t.cat}</span>
          </div>
        );
      })}
      <div className="tiles-fade" />
    </div>
  );
}

function Phone({
  className,
  screen,
}: {
  className: string;
  screen: React.ReactNode;
}) {
  return (
    <div className={`phone ${className}`}>
      <div className="phone-shadow" />
      <div className="phone-screen">{screen}</div>
      <img
        className="phone-frame"
        src="/design/iphone-16-pro.png"
        alt=""
        width={872}
        height={1804}
      />
    </div>
  );
}

// The string-and-button closure that ties the library panel to the footer.
function StringAndButtons() {
  return (
    <svg
      className="string"
      width="240"
      height="320"
      viewBox="0 0 240 320"
      aria-hidden="true"
    >
      <defs>
        <filter id="discShadow" x="-40%" y="-40%" width="180%" height="180%">
          <feDropShadow dx="0" dy="4" stdDeviation="5" floodColor="#14162a" floodOpacity="0.22" />
        </filter>
        <filter id="threadShadow" x="-40%" y="-40%" width="180%" height="180%">
          <feDropShadow dx="0" dy="2" stdDeviation="1.6" floodColor="#14162a" floodOpacity="0.3" />
        </filter>
        <filter id="grainNoise" x="0%" y="0%" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="3" stitchTiles="stitch" />
          <feColorMatrix type="saturate" values="0" />
          <feComponentTransfer>
            <feFuncA type="discrete" tableValues="0 0.35 0 0.5 0 0.2 0.45 0" />
          </feComponentTransfer>
        </filter>
        <pattern id="discGrain" width="120" height="120" patternUnits="userSpaceOnUse">
          <rect width="120" height="120" fill="transparent" />
          <rect width="120" height="120" filter="url(#grainNoise)" opacity="0.55" />
        </pattern>
        <radialGradient id="discSheen" cx="34%" cy="24%" r="80%">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.34" />
          <stop offset="0.5" stopColor="#ffffff" stopOpacity="0.05" />
          <stop offset="1" stopColor="#2b2741" stopOpacity="0.2" />
        </radialGradient>
      </defs>
      <g filter="url(#threadShadow)">
        <path d="M118 70 C136 120 96 170 104 244" fill="none" stroke="var(--color-accent-700)" strokeWidth="3" strokeLinecap="round" />
        <path d="M104 70 C64 116 158 168 122 244" fill="none" stroke="var(--color-accent-700)" strokeWidth="3.4" strokeLinecap="round" />
        <path d="M112 68 C168 118 58 172 100 246" fill="none" stroke="var(--color-accent-600)" strokeWidth="3.4" strokeLinecap="round" />
        <path d="M115 72 C160 120 66 170 104 242" fill="none" stroke="var(--color-accent-500)" strokeWidth="1.3" strokeLinecap="round" opacity=".8" />
        <path d="M107 72 C70 118 152 168 118 242" fill="none" stroke="var(--color-accent-500)" strokeWidth="1.3" strokeLinecap="round" opacity=".8" />
      </g>
      {[70, 244].map((cy) => (
        <g key={cy} filter="url(#discShadow)">
          <circle cx="110" cy={cy} r="46" fill="var(--color-accent-500)" />
          <circle cx="110" cy={cy} r="46" fill="url(#discGrain)" />
          <circle cx="110" cy={cy} r="46" fill="url(#discSheen)" />
          <circle cx="110" cy={cy} r="46" fill="none" stroke="var(--color-accent-700)" strokeWidth="1" opacity=".55" />
          <circle cx="110" cy={cy} r="13.5" fill="var(--color-neutral-900)" />
          <circle cx="110" cy={cy} r="13.5" fill="none" stroke="var(--color-accent-200)" strokeWidth="3" />
          <circle cx="110" cy={cy} r="10" fill="none" stroke="#000000" strokeWidth="1" opacity=".35" />
        </g>
      ))}
      <g filter="url(#threadShadow)">
        <path d="M110 70 C116 82 114 98 118 112" fill="none" stroke="var(--color-accent-700)" strokeWidth="3" strokeLinecap="round" />
        <path d="M110 70 C104 84 106 96 104 112" fill="none" stroke="var(--color-accent-600)" strokeWidth="3.2" strokeLinecap="round" />
        <path d="M110 244 C104 232 106 216 104 202" fill="none" stroke="var(--color-accent-700)" strokeWidth="3" strokeLinecap="round" />
        <path d="M110 244 C118 230 116 216 120 202" fill="none" stroke="var(--color-accent-600)" strokeWidth="3.2" strokeLinecap="round" />
        <path d="M110 244 C126 250 138 246 140 236" fill="none" stroke="var(--color-accent-700)" strokeWidth="2.6" strokeLinecap="round" />
      </g>
    </svg>
  );
}

export default function Home() {
  return (
    <main className="page">
      {/* ── Hero ── */}
      <div className="stage">
        <section className="hero" id="top">
          <TileField />

          <nav className="nav" aria-label="Main navigation">
            <a className="brand" href="#top" aria-label="All Kept home">
              <img className="brand-mark" src="/design/mark.png" alt="" width={256} height={256} />
              <img className="brand-word" src="/design/wordmark-light.png" alt="All Kept" width={519} height={150} />
            </a>
            <div className="launch">
              <span className="launch-label">Launching 21 September 2026</span>
              <Countdown />
            </div>
          </nav>

          <div className="hero-copy">
            <h1>Your saves, sorted.</h1>
            <p className="hero-sub">
              One library for everything you save across Instagram, YouTube and the web. AI files
              it under food, travel, places and more. You just search.
            </p>
            <WaitlistForm />
            <p className="hero-note">Coming to iOS and Android</p>
          </div>

          <Phone
            className="phone-hero"
            screen={
              <SlotImage
                src="/design/slots/c-screen.png"
                alt=""
                placeholder="Instagram reel screenshot"
              />
            }
          />
        </section>
      </div>

      {/* ── Library — the light band runs edge to edge; its contents stay in the stage ── */}
      <section className="library" aria-labelledby="library-title">
        <div className="stage library-stage">
          <div className="library-head">
            <span className="kicker">Your library</span>
            <h2 id="library-title">
              <img src="/design/wordmark-dark.png" alt="All Kept" width={519} height={150} /> turns
              saves into a library.
            </h2>
            <p className="library-sub">
              Filter the whole library in a tap:{' '}
              <span className="hl">
                <span className="hl-ink" aria-hidden="true" />
                <span className="hl-text">by platform, type, category and status</span>
              </span>
              .
            </p>
          </div>

          <Phone
            className="phone-library"
            screen={
              <SlotImage
                src="/design/app-library-shot.png"
                alt="All Kept library screen"
                placeholder="All Kept library screen"
              />
            }
          />
        </div>
      </section>

      {/* ── Footer ── */}
      <div className="stage">
        <footer className="footer">
          <StringAndButtons />

          <div className="footer-main">
            <div className="footer-brand">
              <span className="footer-lockup">
                <img className="mark" src="/design/mark.png" alt="" width={256} height={256} />
                <img className="word" src="/design/wordmark-light.png" alt="All Kept" width={519} height={150} />
              </span>
              <p>
                Everything you save, in one place you can actually search. Captured automatically,
                sorted by AI, found in seconds.
              </p>
            </div>

            <div className="footer-join">
              <h3>Join the waitlist</h3>
              <p>One email when it opens. Nothing else.</p>
              <WaitlistForm />
            </div>
          </div>

          <div className="footer-rule" />

          <div className="footer-bar">
            <span>© 2026 All Kept</span>
            <div className="footer-links">
              <a href="/privacy">Privacy</a>
              <a href="/terms">Terms</a>
              <a href="mailto:hi@allkept.app">hi@allkept.app</a>
            </div>
          </div>
        </footer>
      </div>
    </main>
  );
}
