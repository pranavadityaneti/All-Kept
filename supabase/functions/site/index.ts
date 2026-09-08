// Static placeholder pages required by Meta before the app can be switched to Live: privacy, terms, data deletion.
// Replace with the real pages on allkept.app once the domain is hosted.

const shell = (title: string, body: string) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} · Allkept</title><style>body{font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:720px;margin:40px auto;padding:0 20px;line-height:1.55;color:#1b2229}h1{font-size:28px}h2{font-size:20px;margin-top:28px}small{color:#5f6b75}</style></head><body><h1>${title}</h1>${body}<p><small>Allkept · last updated 8 September 2026 · This is the test-phase version of this page.</small></p></body></html>`;

const pages: Record<string, string> = {
  "/privacy": shell("Privacy Policy", `
<p>Allkept is a personal library for things you save on social platforms. This policy describes what we collect during the current test phase.</p>
<h2>What we collect</h2>
<ul>
<li>Messages you send to the Instagram account <strong>@allkeptapp</strong>: the text, any post or reel you share, the time, and your Instagram-scoped user id and username.</li>
<li>Videos you add to a YouTube playlist you have connected to Allkept: the video id, title, channel and thumbnail.</li>
<li>Your email address, used only to sign you in.</li>
</ul>
<h2>How we use it</h2>
<p>To build your private library: we fetch public preview details of the links you send, sort them into categories, and show them to you in the Allkept app. We never post on your behalf, never message anyone you have not messaged first, and never sell or share your data.</p>
<h2>Retention</h2>
<p>Raw message events are deleted automatically after 30 days. Your library stays until you delete it.</p>
<h2>Deleting your data</h2>
<p>See the <a href="/functions/v1/site/delete">data deletion page</a>. Deletion removes everything we hold about you within 24 hours.</p>
<h2>Contact</h2>
<p>Message <strong>@allkeptapp</strong> on Instagram.</p>`),
  "/terms": shell("Terms of Service", `
<p>Allkept is provided as a test-phase service, free of charge, to invited testers.</p>
<ul>
<li>You may use Allkept only to save content for your own personal use.</li>
<li>Content you save stays the property of its original creators; Allkept stores links and previews and links back to the original post.</li>
<li>The service may change or be withdrawn during the test phase without notice.</li>
<li>Allkept is not affiliated with Meta, Instagram or YouTube.</li>
</ul>`),
  "/delete": shell("Delete Your Data", `
<p>To delete everything Allkept holds about you, do either of the following:</p>
<ol>
<li>Send the message <strong>delete my data</strong> to <strong>@allkeptapp</strong> on Instagram from the account you used, or</li>
<li>In the Allkept app, open Settings and tap <strong>Delete everything</strong>.</li>
</ol>
<p>All your saved items, previews, message events and your account are removed within 24 hours, and you receive a confirmation.</p>`),
};

Deno.serve((req) => {
  const last = new URL(req.url).pathname.replace(/\/+$/, "").split("/").pop() ?? "";
  const path = last === "site" || last === "" ? "/privacy" : `/${last}`; // the runtime may strip the /functions/v1 prefix; only the last segment matters
  const html = pages[path] ?? pages["/privacy"];
  return new Response(html, { status: pages[path] ? 200 : 404, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300" } });
});
