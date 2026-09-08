import * as Clipboard from "expo-clipboard";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Linking, StyleSheet, Text, View } from "react-native";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { Screen } from "../../components/Screen";
import { startInstagramLink } from "../../lib/api";
import { formatCountdown, secondsLeft } from "../../lib/countdown";
import { useSession } from "../../lib/session";
import { useLinkedSource } from "../../lib/sources";
import { space, type, usePalette } from "../../lib/theme";

const HANDLE = "allkeptapp";
/** Meta's own "message me" link opens the thread with @allkeptapp; the profile is the fallback. */
const MESSAGE_URL = `https://ig.me/m/${HANDLE}`;
const PROFILE_URL = `https://www.instagram.com/${HANDLE}/`;

type CodeState = { status: "loading" } | { status: "ready"; code: string; expiresAt: string } | { status: "error"; message: string };

export default function ConnectInstagram() {
  const p = usePalette();
  const router = useRouter();
  const session = useSession();
  const ready = session.status === "ready";
  const linked = useLinkedSource(ready);
  const [code, setCode] = useState<CodeState>({ status: "loading" });
  const [copied, setCopied] = useState(false);
  const [left, setLeft] = useState(0);

  const requestCode = useCallback(() => {
    setCode({ status: "loading" });
    setCopied(false);
    startInstagramLink()
      .then((r) => { setCode({ status: "ready", code: r.code, expiresAt: r.expiresAt }); setLeft(secondsLeft(r.expiresAt)); })
      .catch((e: unknown) => setCode({ status: "error", message: e instanceof Error ? e.message : String(e) }));
  }, []);

  const requested = useRef(false);
  useEffect(() => {
    // Once per visit. The linked query settles from undefined to null, and a second request would
    // replace the code on the server while the person is holding the first one.
    if (!ready || linked.data || requested.current) return;
    requested.current = true;
    requestCode();
  }, [ready, linked.data, requestCode]);

  useEffect(() => {
    if (code.status !== "ready") return;
    const tick = setInterval(() => setLeft(secondsLeft(code.expiresAt)), 1000);
    return () => clearInterval(tick);
  }, [code]);

  const copy = async () => {
    if (code.status !== "ready") return;
    await Clipboard.setStringAsync(code.code);
    setCopied(true);
  };

  const openInstagram = async () => {
    const ok = await Linking.canOpenURL(MESSAGE_URL).catch(() => false);
    await Linking.openURL(ok ? MESSAGE_URL : PROFILE_URL);
  };

  if (linked.data) {
    return (
      <Screen>
        <Text style={[type.title, { color: p.ink }]}>Instagram connected</Text>
        <Card>
          <Text style={[type.heading, { color: p.good }]}>Linked as @{linked.data.handle ?? "your account"}</Text>
          <Text style={[type.body, { color: p.inkMuted }]}>Send any reel or post to @{HANDLE} and it lands in your library. You will get a reply in the same thread.</Text>
        </Card>
        <Button label="Done" onPress={() => router.replace("/")} />
      </Screen>
    );
  }

  const expired = code.status === "ready" && left === 0;

  return (
    <Screen>
      <Text style={[type.title, { color: p.ink }]}>Connect Instagram</Text>
      <Text style={[type.body, { color: p.inkMuted }]}>Send this code to @{HANDLE} in a direct message. That tells us which library is yours.</Text>

      <Card>
        {!ready && (
          <View style={styles.stack}>
            <Text style={[type.heading, { color: session.status === "error" ? p.bad : p.ink }]}>
              {session.status === "error" ? "Your library has not started" : "Starting your account…"}
            </Text>
            {session.status === "error" && (
              <>
                <Text style={[type.body, { color: p.inkMuted }]}>
                  {session.anonymousDisabled
                    ? "Anonymous sign-ins are switched off for this project. Turn them on in the Supabase dashboard under Authentication."
                    : session.message}
                </Text>
                <Button label="Try again" onPress={session.retry} />
              </>
            )}
          </View>
        )}

        {ready && code.status === "loading" && <Text style={[type.body, { color: p.inkMuted }]}>Getting your code…</Text>}

        {ready && code.status === "error" && (
          <View style={styles.stack}>
            <Text style={[type.heading, { color: p.bad }]}>Could not get a code</Text>
            <Text style={[type.body, { color: p.inkMuted }]}>{code.message}</Text>
            <Button label="Try again" onPress={requestCode} />
          </View>
        )}

        {ready && code.status === "ready" && (
          <View style={styles.stack}>
            <Text accessibilityLabel={`Your code is ${code.code.split("").join(" ")}`} style={[type.mono, styles.code, { color: expired ? p.inkMuted : p.ink }]}>{code.code}</Text>
            <Text style={[type.label, { color: expired ? p.bad : p.inkMuted }]}>{expired ? "This code has expired." : `Expires in ${formatCountdown(left)}`}</Text>
            {expired ? (
              <Button label="Get a new code" onPress={requestCode} />
            ) : (
              <View style={styles.stack}>
                <Button label={copied ? "Copied" : "Copy code"} onPress={copy} variant="secondary" />
                <Button label="Open Instagram" onPress={openInstagram} />
              </View>
            )}
          </View>
        )}
      </Card>

      <Card>
        <Text style={[type.heading, { color: p.ink }]}>What happens next</Text>
        <Text style={[type.body, { color: p.inkMuted }]}>1. Paste the code into a message to @{HANDLE}.</Text>
        <Text style={[type.body, { color: p.inkMuted }]}>2. We reply “Linked as @you”, and this screen moves on by itself.</Text>
        <Text style={[type.body, { color: p.inkMuted }]}>3. Then send any reel or post the same way, using the paper plane and Send in a message.</Text>
      </Card>

    </Screen>
  );
}

const styles = StyleSheet.create({
  stack: { gap: space.md },
  code: { textAlign: "center", paddingVertical: space.sm },
});
