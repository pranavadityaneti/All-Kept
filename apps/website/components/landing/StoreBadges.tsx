import { APP_STORE_URL, PLAY_STORE_URL } from '@/lib/site';

// Apple's and Google's own badge files, unmodified, as both companies' guidelines require.
// A badge is a link only once that store's URL exists: until the app is published, pointing
// people at an unlisted app means sending them to a 404.
const STORES = [
  {
    name: 'App Store',
    href: APP_STORE_URL,
    src: '/stores/app-store.svg',
    alt: 'Download on the App Store',
    mod: 'badge-apple',
  },
  {
    name: 'Google Play',
    href: PLAY_STORE_URL,
    src: '/stores/google-play.png',
    alt: 'Get it on Google Play',
    mod: 'badge-play',
  },
] as const;

export function StoreBadges() {
  return (
    <div className="stores">
      {STORES.map((s) =>
        s.href ? (
          <a key={s.name} className={`store ${s.mod}`} href={s.href}>
            <img src={s.src} alt={s.alt} />
          </a>
        ) : (
          <span key={s.name} className={`store ${s.mod} store-soon`}>
            <img src={s.src} alt={s.alt} />
          </span>
        ),
      )}
    </div>
  );
}
