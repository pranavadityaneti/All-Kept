// Placeholder policy pages required by Meta before the app can be switched to Live.
// The Supabase functions gateway forces text/plain and a sandboxing CSP, so these are plain-text pages.
// Replace with real pages on allkept.app once the domain is hosted.

const FOOT = "\n\nAllkept - last updated 8 September 2026 - test-phase version of this page.\n";

const pages: Record<string, string> = {
  privacy: `ALLKEPT PRIVACY POLICY

Allkept is a personal library for things you save on social platforms. This policy describes what we collect during the current test phase.

WHAT WE COLLECT
- Messages you send to the Instagram account @allkeptapp: the text, any post or reel you share, the time, and your Instagram-scoped user id and username.
- Videos you add to a YouTube playlist you have connected to Allkept: the video id, title, channel and thumbnail.
- Your email address, used only to sign you in.

HOW WE USE IT
To build your private library: we fetch public preview details of the links you send, sort them into categories, and show them to you in the Allkept app. We never post on your behalf, never message anyone who has not messaged us first, and never sell or share your data.

RETENTION
Raw message events are deleted automatically after 30 days. Your library stays until you delete it.

DELETING YOUR DATA
See https://yurbmcqoqyehbpoqplcr.supabase.co/functions/v1/site/delete
Deletion removes everything we hold about you within 24 hours.

CONTACT
Message @allkeptapp on Instagram.` + FOOT,

  terms: `ALLKEPT TERMS OF SERVICE

Allkept is provided as a test-phase service, free of charge, to invited testers.

- You may use Allkept only to save content for your own personal use.
- Content you save stays the property of its original creators; Allkept stores links and previews and links back to the original post.
- The service may change or be withdrawn during the test phase without notice.
- Allkept is not affiliated with Meta, Instagram or YouTube.` + FOOT,

  delete: `DELETE YOUR ALLKEPT DATA

To delete everything Allkept holds about you, do either of the following:

1. Send the message "delete my data" to @allkeptapp on Instagram from the account you used, or
2. In the Allkept app, open Settings and tap "Delete everything".

All your saved items, previews, message events and your account are removed within 24 hours, and you receive a confirmation.` + FOOT,
};

Deno.serve((req) => {
  const last = new URL(req.url).pathname.replace(/\/+$/, "").split("/").pop() ?? "";
  const key = last === "site" || last === "" ? "privacy" : last;
  const body = pages[key];
  return new Response(body ?? "Not found. Pages: /privacy, /terms, /delete\n", {
    status: body ? 200 : 404,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=300" },
  });
});
