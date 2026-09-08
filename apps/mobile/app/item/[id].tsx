import { CATEGORIES } from "@allkept/contracts";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Alert, Linking, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { Chip } from "../../components/Chip";
import { DuplicateLinkError, openableUrl, useAttachLink, useDeleteItem, useItem, useSetCategory, useSetNote } from "../../lib/item";
import { track, useTrackOnce } from "../../lib/metrics";
import { platformLabel } from "../../lib/platforms";
import { useSession } from "../../lib/session";
import { shareItem } from "../../lib/share";
import { useThumbnails } from "../../lib/thumbnails";
import { radius, space, type, usePalette } from "../../lib/theme";


const savedOn = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

export default function ItemScreen() {
  const p = usePalette();
  const router = useRouter();
  const session = useSession();
  const { id } = useLocalSearchParams<{ id: string }>();
  const item = useItem(id ?? "");
  const detail = item.data;

  const thumbnails = useThumbnails([detail?.thumbnailPath ?? null]);
  const thumbnail = detail?.thumbnailPath ? thumbnails[detail.thumbnailPath] : undefined;

  const userId = session.status === "ready" ? session.userId : null;
  useTrackOnce(userId, "item_open");
  const setCategory = useSetCategory(id ?? "", userId);
  const setNote = useSetNote(id ?? "");
  const remove = useDeleteItem(id ?? "", detail?.thumbnailPath ?? null);
  // A post Instagram sent without a link can only be fixed by an Instagram link.
  const attach = useAttachLink(id ?? "", detail?.status === "no_link" && detail.platform === "instagram" ? "instagram" : undefined, detail?.thumbnailPath ?? null);

  const [picking, setPicking] = useState(false);
  const [note, setNoteText] = useState<string | null>(null);
  const [link, setLink] = useState("");
  const [attachError, setAttachError] = useState<string | null>(null);

  if (item.isPending) return <Centered text="Loading…" />;
  if (!detail) return <Centered text="This item is no longer in your library." onBack={() => router.back()} />;

  const url = openableUrl(detail);
  const noteValue = note ?? detail.note ?? "";
  const heading = detail.title?.trim() || detail.text?.split("\n").find((l) => l.trim()) || platformLabel(detail.platform) || "Saved";

  const confirmDelete = () => {
    Alert.alert("Delete this save?", "It goes from your library for good. The original stays where it is.", [
      { text: "Keep", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => remove.mutate(undefined, { onSuccess: () => { track(userId, "item_deleted", { status: detail.status }); router.back(); } }) },
    ]);
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: p.bg }]} edges={["top", "left", "right"]}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.headerRow}>
          <Button label="Back" variant="secondary" onPress={() => router.back()} />
        </View>

        {thumbnail && (
          <Image source={{ uri: thumbnail }} style={[styles.hero, { backgroundColor: p.surfaceAlt }]} contentFit="cover" transition={150} accessibilityIgnoresInvertColors />
        )}

        <Text style={[type.title, { color: p.ink }]}>{heading}</Text>

        <View style={styles.row}>
          <Chip label={detail.category ?? "Sorting"} selected={!!detail.category} onPress={() => setPicking((v) => !v)} />
          <Chip label={platformLabel(detail.platform)} />
          <Text style={[type.label, { color: p.inkMuted }]}>{savedOn(detail.lastSavedAt)}</Text>
        </View>

        {picking && (
          <Card>
            <Text style={[type.heading, { color: p.ink }]}>Put this under</Text>
            <View style={styles.wrap}>
              {CATEGORIES.map((c) => (
                <Chip
                  key={c}
                  label={c}
                  selected={detail.category === c}
                  onPress={() => setCategory.mutate(c, { onSuccess: () => { setPicking(false); track(userId, "category_changed", { from: detail.modelCategory ?? "none", to: c }); } })}
                />
              ))}
            </View>
            {setCategory.isError && <Text style={[type.label, { color: p.bad }]}>Could not save that. Try again.</Text>}
          </Card>
        )}

        {detail.authorName && <Text style={[type.body, { color: p.inkMuted }]}>{detail.authorName}{detail.authorHandle ? ` · @${detail.authorHandle}` : ""}</Text>}

        {detail.summary && (
          <Card>
            <Text style={[type.body, { color: p.ink }]}>{detail.summary}</Text>
            {detail.tags.length > 0 && <Text style={[type.label, { color: p.inkMuted }]}>{detail.tags.join(" · ")}</Text>}
          </Card>
        )}

        {/* The heading is already the caption's first line; repeating a one-line caption below it says nothing. */}
        {detail.text && detail.text.trim() !== heading.trim() && (
          <Card>
            <Text style={[type.body, { color: p.ink }]}>{detail.text}</Text>
          </Card>
        )}

        <View style={styles.actions}>
          {url ? (
            <Button label={`Open in ${platformLabel(detail.platform)}`} onPress={() => { track(userId, "open_original", { platform: detail.platform }); void Linking.openURL(url); }} />
          ) : null}
          <Button
            label="Share"
            variant="secondary"
            onPress={() => { track(userId, "share_out", { hasLink: !!url }); void shareItem({ url, title: heading, ...(thumbnail ? { thumbnailUrl: thumbnail } : {}) }); }}
          />
        </View>

        {/* Also offered after a failed attempt, so a wrong link can be replaced instead of stranding the save. */}
        {(detail.status === "no_link" || detail.status === "failed") && (
          <Card>
            <Text style={[type.heading, { color: p.ink }]}>{detail.status === "failed" ? "That link did not work" : "Add the post's link"}</Text>
            <Text style={[type.body, { color: p.inkMuted }]}>
              {detail.status === "failed"
                ? "We could not read anything at that address. Paste the link again, in full."
                : "Instagram does not send the link for a plain post. Paste it here and the preview fills in."}
            </Text>
            <TextInput
              accessibilityLabel="Paste the post's link"
              value={link}
              onChangeText={(t) => { setLink(t); setAttachError(null); }}
              placeholder="https://www.instagram.com/p/…"
              placeholderTextColor={p.inkMuted}
              autoCapitalize="none"
              autoCorrect={false}
              inputMode="url"
              style={[styles.input, type.body, { backgroundColor: p.surfaceAlt, borderColor: p.border, color: p.ink }]}
            />
            <Button
              label="Attach link"
              busy={attach.isPending}
              disabled={link.trim().length === 0}
              onPress={() =>
                attach.mutate(link, {
                  onSuccess: (r) => { setLink(""); setAttachError(null); track(userId, "paste_link", { status: r.status }); },
                  onError: (e) => setAttachError(e instanceof DuplicateLinkError ? "You have already saved that link. You can delete this card." : e instanceof Error ? e.message : "Could not attach that link."),
                })
              }
            />
            {attachError && <Text style={[type.label, { color: p.bad }]}>{attachError}</Text>}
          </Card>
        )}

        <Card>
          <Text style={[type.heading, { color: p.ink }]}>Your note</Text>
          <TextInput
            accessibilityLabel="Your note about this save"
            value={noteValue}
            onChangeText={setNoteText}
            onBlur={() => { if (note !== null && note !== (detail.note ?? "")) setNote.mutate(note, { onSuccess: () => track(userId, "note_saved", { length: note.trim().length }) }); }}
            placeholder="Why you saved it…"
            placeholderTextColor={p.inkMuted}
            multiline
            style={[styles.input, styles.noteInput, type.body, { backgroundColor: p.surfaceAlt, borderColor: p.border, color: p.ink }]}
          />
          {setNote.isError && <Text style={[type.label, { color: p.bad }]}>Could not save your note.</Text>}
        </Card>

        <Button label="Delete this save" variant="secondary" busy={remove.isPending} onPress={confirmDelete} />
      </ScrollView>
    </SafeAreaView>
  );
}

function Centered({ text, onBack }: { text: string; onBack?: () => void }) {
  const p = usePalette();
  return (
    <SafeAreaView style={[styles.safe, styles.centered, { backgroundColor: p.bg }]}>
      <Text style={[type.body, { color: p.inkMuted }]}>{text}</Text>
      {onBack && <Button label="Back" variant="secondary" onPress={onBack} />}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  centered: { alignItems: "center", justifyContent: "center", gap: space.lg, padding: space.lg },
  scroll: { padding: space.lg, gap: space.lg },
  headerRow: { flexDirection: "row" },
  hero: { width: "100%", aspectRatio: 1, borderRadius: radius.lg },
  row: { flexDirection: "row", alignItems: "center", gap: space.sm, flexWrap: "wrap" },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  actions: { gap: space.md },
  input: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.md, paddingHorizontal: space.md, paddingVertical: space.md, minHeight: 48 },
  noteInput: { minHeight: 88, textAlignVertical: "top" },
});
