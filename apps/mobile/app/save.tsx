import * as Clipboard from "expo-clipboard";
import { useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { Text, TextInput } from "react-native";
import type { SaveLinkResponse } from "@allkept/contracts";
import { saveLink } from "@allkept/normalize";
import { Button } from "../components/Button";
import { Screen } from "../components/Screen";
import { resolveForSave } from "../lib/resolve-link";
import { invalidateLibrary } from "../lib/library";
import { useSession } from "../lib/session";
import { supabase } from "../lib/supabase";
import { radius, space, type, usePalette } from "../lib/theme";

export default function SaveLink() {
  const p = usePalette();
  const router = useRouter();
  const session = useSession();
  const queryClient = useQueryClient();
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<SaveLinkResponse | null>(null);
  const running = useRef(false);
  const attempt = useRef<{ text: string; id: string } | null>(null);

  const save = async () => {
    if (running.current || session.status !== "ready") return;
    const link = saveLink(text);
    if (!link) { setError("That doesn't look like a link. Copy the address and paste it here."); return; }
    running.current = true;
    setBusy(true);
    setError(null);
    // Resolved here rather than on the server: a phone is an ordinary client, and some sites refuse
    // to follow their own share links for anything running in a datacentre.
    const value = await resolveForSave(text);
    if (attempt.current?.text !== value) attempt.current = { text: value, id: `${Date.now()}-${Math.random().toString(36).slice(2)}` };
    try {
      const { data, error: failure } = await supabase.functions.invoke<SaveLinkResponse>("save-link", {
        body: { text: value, requestId: attempt.current.id },
      });
      if (failure || !data?.itemId) throw new Error("Could not save the link. Check your connection and try again.");
      setSaved(data);
      invalidateLibrary(queryClient);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save the link."); }
    finally { running.current = false; setBusy(false); }
  };

  const close = async () => {
    router.replace("/");
  };

  return (
    <Screen>
      <Text style={[type.title, { color: p.ink }]}>{saved ? "Saved" : "Save a link"}</Text>
      {saved ? <>
        <Text style={[type.body, { color: p.inkMuted }]}>It is in your library. The preview and category fill in on their own.</Text>
        <Button label="View save" onPress={() => router.replace({ pathname: "/item/[id]", params: { id: saved.itemId } })} />
      </> : <>
        <Text style={[type.body, { color: p.inkMuted }]}>Paste any link. A post, a video, an article. It lands in your library, sorted with everything else.</Text>
        <TextInput accessibilityLabel="Link" value={text} onChangeText={(value) => { setText(value); setError(null); }}
          editable={!busy} autoCapitalize="none" autoCorrect={false} inputMode="url" placeholder="https://…"
          placeholderTextColor={p.inkMuted} style={[type.body, { color: p.ink, backgroundColor: p.surface, padding: space.md, borderRadius: radius.md }]} />
        <Button label="Paste link" variant="secondary" disabled={busy} onPress={() => {
          void Clipboard.getStringAsync().then((value) => { setText(value); setError(null); }).catch(() => setError("Could not read the clipboard. Paste into the field above."));
        }} />
        <Button label="Save link" busy={busy} disabled={session.status !== "ready" || !text.trim()} onPress={() => { void save(); }} />
        {session.status === "error" && <Button label="Reconnect" onPress={session.retry} />}
      </>}
      {error && <Text accessibilityRole="alert" style={[type.body, { color: p.bad }]}>{error}</Text>}
      <Button label={saved ? "Done" : "Cancel"} variant="secondary" disabled={busy} onPress={close} />
    </Screen>
  );
}
