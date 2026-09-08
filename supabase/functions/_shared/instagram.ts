// Thin client for the Instagram API with Instagram Login, acting as @allkeptapp.
const GRAPH = "https://graph.instagram.com/v23.0";

export interface InstagramClient {
  sendText(igsid: string, text: string): Promise<{ ok: true; messageId: string | null } | { ok: false; error: string }>;
  profile(igsid: string): Promise<{ username: string | null; name: string | null }>;
}

export function instagramClient(accessToken: string, fetchImpl: typeof fetch = fetch): InstagramClient {
  return {
    async sendText(igsid, text) {
      const res = await fetchImpl(`${GRAPH}/me/messages`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ recipient: { id: igsid }, message: { text } }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) return { ok: false, error: `${res.status} ${JSON.stringify(body).slice(0, 300)}` };
      return { ok: true, messageId: typeof body?.message_id === "string" ? body.message_id : null };
    },
    async profile(igsid) {
      const res = await fetchImpl(`${GRAPH}/${igsid}?fields=name,username`, { headers: { authorization: `Bearer ${accessToken}` } });
      if (!res.ok) return { username: null, name: null };
      const body = await res.json().catch(() => ({}));
      return { username: typeof body?.username === "string" ? body.username : null, name: typeof body?.name === "string" ? body.name : null };
    },
  };
}
