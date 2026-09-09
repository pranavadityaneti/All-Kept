import { useEffect, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ActivityIndicator, Text } from "react-native";
import { AUTH_REDIRECT, completeGoogleCallback, signInGoogle } from "../lib/google";
import { Button } from "../components/Button";
import { Screen } from "../components/Screen";
import { type, usePalette } from "../lib/theme";
export default function AuthCallback() {
  const params = useLocalSearchParams<{ code?: string; error?: string; error_description?: string }>();
  const router = useRouter(), p = usePalette();
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false), [busy, setBusy] = useState(false);
  const query = new URLSearchParams(Object.entries(params).filter((e): e is [string,string] => typeof e[1] === "string")).toString();
  useEffect(() => {
    let live = true;
    void completeGoogleCallback(`${AUTH_REDIRECT}?${query}`).then((result) => {
      if (!live) return;
      if (result.ok) router.replace("/"); else { setError(result.message); setConflict(result.reason === "already_linked"); }
    });
    return () => { live = false; };
  }, [query, router]);
  return <Screen>{error ? <>
    <Text style={[type.body, { color: p.bad }]}>{error}</Text>
    {conflict && <>
      <Text style={[type.body, { color: p.inkMuted }]}>This Google account already has a library. You can open it and keep this phone’s previous library available to restore, or go back and choose another Google account.</Text>
      <Button label="Use existing library" busy={busy} onPress={() => {
        setBusy(true);
        void signInGoogle(true).then((result) => {
          if (result.ok) router.replace("/"); else if (result.reason !== "cancelled") setError(result.message);
        }).finally(() => setBusy(false));
      }} />
    </>}
    <Button label="Back to sign in" disabled={busy} onPress={() => router.replace("/welcome")} />
  </> : <><ActivityIndicator color={p.accent} /><Text style={[type.body, { color: p.ink }]}>Finishing sign-in…</Text></>}</Screen>;
}
