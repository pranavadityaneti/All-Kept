import type { Metadata } from 'next';
import { LegalShell } from '@/components/legal/LegalShell';

export const metadata: Metadata = { title: 'Support — All Kept' };

// Carried over from the website-pages branch; plain links, same text.
export default function SupportPage() {
  return (
    <LegalShell>
      <article className="legal">
        <h1>Support</h1>
        <p className="stamp">
          Allkept keeps the things you save on social platforms in one searchable library.
        </p>

        <h2 id="help">Get help</h2>
        <p>
          Email <a href="mailto:hi@allkept.app">hi@allkept.app</a>, or open{' '}
          <strong>Settings → Send feedback</strong> in the app.
        </p>

        <h2 id="save">How to save</h2>
        <ul>
          <li>
            Send any post to <strong>@allkeptapp</strong> in an Instagram message.
          </li>
          <li>Share a link to Allkept from any app.</li>
          <li>
            Tap <strong>+</strong> and paste a link.
          </li>
          <li>Connect a public YouTube playlist.</li>
          <li>Bring in older Instagram saves from your Meta data export.</li>
        </ul>

        <h2 id="data">Your account and data</h2>
        <p>
          Delete everything from <strong>Settings → Delete account and everything in it</strong>,
          or see <a href="/delete">Delete your data</a>. Read the{' '}
          <a href="/privacy">privacy policy</a> and the <a href="/terms">terms of service</a>.
        </p>

        <h2 id="company">Company</h2>
        <p>MECA Engineering Solutions (OPC) Private Limited, Bengaluru, India.</p>
      </article>
    </LegalShell>
  );
}
