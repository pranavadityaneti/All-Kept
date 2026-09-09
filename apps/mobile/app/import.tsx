import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { Icon } from "../components/Icon";
import { IconButton } from "../components/IconButton";
import { importProgress, looksLikeExport, MAX_IMPORT_BYTES, pickExport, removeUpload, startImport, uploadExport } from "../lib/import";
import { track, useTrackOnce } from "../lib/metrics";
import { openLink } from "../lib/open";
import { useSession } from "../lib/session";
import { radius, space, type, usePalette } from "../lib/theme";

/** Meta's own page for the copy of your information, inside Accounts Centre. */
const DOWNLOAD_URL = "https://accountscenter.instagram.com/info_and_permissions/dyi/";

const STEPS = [
  "On the page that opens, choose Download or transfer information, then your Instagram account.",
  "Choose Some of your information, and tick Saved. Leave everything else unticked, or the file will be enormous.",
  "Choose Download to device, set the date range to All time and the format to JSON, then request it.",
  "Meta emails you a link, usually within an hour. Download that file, come back here and pick it.",
];

type Stage =
  | { name: "idle" }
  | { name: "working"; note: string }
  | { name: "done"; importId: string; found: number; added: number; skipped: number }
  | { name: "error"; message: string };

export default function ImportSaves() {
  const p = usePalette();
  const router = useRouter();
  const session = useSession();
  const userId = session.status === "ready" ? session.userId : null;
  const [stage, setStage] = useState<Stage>({ name: "idle" });
  // The picker is modal, but a second tap can land before it opens.
  const running = useRef(false);
  useTrackOnce(userId, "import_opened");

  const importId = stage.name === "done" ? stage.importId : null;
  const progress = useQuery({
    queryKey: ["import-progress", importId],
    enabled: !!importId,
    queryFn: () => importProgress(importId as string),
    // Stops asking once the sweeper has been through everything this import brought in.
    refetchInterval: (query) => (query.state.data?.finished ? false : 4_000),
  });

  const run = useCallback(async () => {
    if (!userId || running.current) return;
    running.current = true;
    // Named rather than free text: a message can carry the name of the file they chose, and this
    // log records what someone did, never what they wrote.
    let step: "picking" | "sending" | "reading" = "picking";
    let uploaded: string | null = null;
    try {
      const picked = await pickExport();
      if (!picked) return; // they backed out of the picker
      if (!looksLikeExport(picked.name)) {
        setStage({ name: "error", message: "That is not the file Meta sends. Look for the .zip you downloaded, or the saved_posts.json inside it." });
        return;
      }
      if (picked.size > MAX_IMPORT_BYTES) {
        setStage({ name: "error", message: "That file is far bigger than a list of saved posts. Ask Meta for Saved on its own, with everything else unticked." });
        return;
      }

      setStage({ name: "working", note: "Sending your file…" });
      step = "sending";
      const path = await uploadExport(userId, picked);
      uploaded = path;
      setStage({ name: "working", note: "Reading your saves…" });
      step = "reading";
      track(userId, "import_started", { bytes: picked.size });

      const result = await startImport(path);
      track(userId, "import_finished", { found: result.found, added: result.added, skipped: result.skipped });
      setStage({ name: "done", ...result });
      uploaded = null; // the server removes it once it has been read
    } catch (e: unknown) {
      track(userId, "import_failed", { step });
      if (uploaded) await removeUpload(uploaded); // no reason to leave their file sitting there
      setStage({ name: "error", message: e instanceof Error ? e.message : String(e) });
    } finally {
      running.current = false;
    }
  }, [userId]);

  const filled = progress.data ? progress.data.ready : 0;
  const total = progress.data ? progress.data.ready + progress.data.waiting : 0;
  const pct = total > 0 ? Math.round((filled / total) * 100) : stage.name === "done" ? 100 : 0;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: p.bg }]} edges={["top", "left", "right"]}>
      <View style={styles.header}>
        <IconButton name="close" label="Close" onPress={() => router.back()} />
        <Text style={[type.section, { color: p.ink }]}>Your older saves</Text>
      </View>

      <ScrollView contentContainerStyle={styles.page}>
        <Text style={[type.body, { color: p.inkMuted }]}>
          Instagram does not let any app read what you have saved. It does have to give the list to you, though, so
          that is the way in: ask Meta for your saved posts, then hand the file to Allkept.
        </Text>

        {stage.name !== "done" && (
          <Card>
            {STEPS.map((step, i) => (
              <View key={step} style={styles.step}>
                <View style={[styles.number, { backgroundColor: p.accentSoft }]}>
                  <Text style={[type.label, { color: p.accent }]}>{i + 1}</Text>
                </View>
                <Text style={[type.body, styles.stepText, { color: p.ink }]}>{step}</Text>
              </View>
            ))}
          </Card>
        )}

        {stage.name === "idle" && (
          <View style={styles.actions}>
            <Button label="Open Instagram's download page" onPress={() => { void openLink(DOWNLOAD_URL); }} />
            <Button label="I have the file — pick it" variant="secondary" onPress={() => { void run(); }} />
          </View>
        )}

        {stage.name === "working" && (
          <Card>
            <View style={styles.busy}>
              <ActivityIndicator color={p.accent} />
              <Text style={[type.body, { color: p.ink }]}>{stage.note}</Text>
            </View>
            <Text style={[type.label, { color: p.inkMuted }]}>A long history can take a minute. Please keep this screen open.</Text>
          </Card>
        )}

        {stage.name === "error" && (
          <>
            <Card>
              <View style={styles.busy}>
                <Icon name="close" size={20} color={p.bad} />
                <Text style={[type.heading, { color: p.ink }]}>That did not work</Text>
              </View>
              <Text style={[type.body, { color: p.inkMuted }]}>{stage.message}</Text>
            </Card>
            <Button label="Try another file" onPress={() => { void run(); }} />
          </>
        )}

        {stage.name === "done" && (
          <>
            <Card>
              <View style={styles.busy}>
                <Icon name="check" size={20} color={p.good} />
                <Text style={[type.heading, { color: p.ink }]}>
                  {stage.added > 0 ? `${stage.added} saves brought in` : "Everything in that file was already here"}
                </Text>
              </View>
              <Text style={[type.body, { color: p.inkMuted }]}>
                {stage.skipped > 0
                  ? `${stage.found} in the file, ${stage.skipped} you already had. Those were left exactly as they were, notes and all.`
                  : `${stage.found} saved posts were in the file.`}
              </Text>
            </Card>

            {stage.added > 0 && (
              <Card>
                <Text style={[type.heading, { color: p.ink }]}>Filling them in</Text>
                <Text style={[type.body, { color: p.inkMuted }]}>
                  Covers, captions and categories arrive over the next few hours. You can close the app; it carries on without you.
                </Text>
                <View style={[styles.track, { backgroundColor: p.surfaceAlt }]}>
                  <View style={[styles.fill, { width: `${pct}%`, backgroundColor: p.accent }]} />
                </View>
                <Text style={[type.label, { color: p.inkMuted }]}>
                  {progress.data ? `${filled} of ${total} ready` : "Counting…"}
                </Text>
              </Card>
            )}

            <Button label="See my library" onPress={() => router.replace("/library")} />
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", gap: space.md, paddingHorizontal: space.lg, paddingTop: space.sm, paddingBottom: space.xs },
  page: { padding: space.lg, gap: space.lg, paddingBottom: space.xxl },
  step: { flexDirection: "row", alignItems: "flex-start", gap: space.md, paddingVertical: space.xs },
  number: { width: 24, height: 24, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
  stepText: { flex: 1 },
  actions: { gap: space.md },
  busy: { flexDirection: "row", alignItems: "center", gap: space.md },
  track: { height: 8, borderRadius: radius.pill, overflow: "hidden" },
  fill: { height: 8, borderRadius: radius.pill },
});
