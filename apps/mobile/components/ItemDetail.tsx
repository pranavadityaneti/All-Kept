import { CATEGORIES } from "@allkept/contracts";
import { Image } from "expo-image";
import { useState } from "react";
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from "react-native";
import { Button } from "./Button";
import { Card } from "./Card";
import { Chip } from "./Chip";
import { EmbedPlayer } from "./EmbedPlayer";
import { IconButton } from "./IconButton";
import { embedUrl, initialHeight } from "../lib/embed";
import { DuplicateLinkError, openableUrl, useAttachLink, useDeleteItem, useItem, useSetCategory, useSetNote } from "../lib/item";
import { track, useTrackOnce } from "../lib/metrics";
import { openLink } from "../lib/open";
import { platformLabel } from "../lib/platforms";
import { useSession } from "../lib/session";
import { shareItem } from "../lib/share";
import { useThumbnails } from "../lib/thumbnails";
import { radius, space, type, usePalette } from "../lib/theme";

const savedOn = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

/** One save, filling the width it is given. Several of these sit side by side when swiping. */
export function ItemDetail({ id, width, onBack }: { id: string; width: number; onBack: () => void }) {
  const p = usePalette();
  const session = useSession();
  const { height: screenHeight } = useWindowDimensions();
  const item = useItem(id);
  const detail = item.data;

  const thumbnails = useThumbnails([detail?.thumbnailPath ?? null]);
  const thumbnail = detail?.thumbnailPath ? thumbnails[detail.thumbnailPath] : undefined;

  const userId = session.status === "ready" ? session.userId : null;
  useTrackOnce(userId, "item_open");
  const setCategory = useSetCategory(id, userId);
  const setNote = useSetNote(id);
  const remove = useDeleteItem(id, detail?.thumbnailPath ?? null);
  const attach = useAttachLink(id, detail?.status === "no_link" && detail.platform === "instagram" ? "instagram" : undefined, detail?.thumbnailPath ?? null);

  const playerWidth = width - space.lg * 2;
  const [playerHeight, setPlayerHeight] = useState<number | null>(null);
  const [fullHeight, setFullHeight] = useState<number | null>(null);
  const [fullScreen, setFullScreen] = useState(false);
  const [zoomed, setZoomed] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [picking, setPicking] = useState(false);
  const [note, setNoteText] = useState<string | null>(null);
  const [link, setLink] = useState("");
  const [attachError, setAttachError] = useState<string | null>(null);

  if (item.isPending) return <Centered width={width} text="Loading…" />;
  if (!detail) return <Centered width={width} text="This item is no longer in your library." onBack={onBack} />;

  const url = openableUrl(detail);
  const embed = embedUrl(detail);
  const heading = detail.title?.trim() || detail.text?.split("\n").find((l) => l.trim()) || platformLabel(detail.platform);
  const noteValue = note ?? detail.note ?? "";
  const hasMore = Boolean(detail.summary || detail.tags.length > 0 || (detail.text && detail.text.trim() !== heading.trim()) || noteValue);

  const confirmDelete = () =>
    Alert.alert("Delete this save?", "It goes from your library for good. The original stays where it is.", [
      { text: "Keep", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => remove.mutate(undefined, { onSuccess: () => { track(userId, "item_deleted", { status: detail.status }); onBack(); } }) },
    ]);

  return (
    <View style={{ width }}>
      {/* Locked to vertical, so a sideways swipe belongs to the pager rather than this scroll view. */}
      <ScrollView contentContainerStyle={styles.page} showsVerticalScrollIndicator={false} directionalLockEnabled>
        <View style={styles.headerRow}>
          <IconButton name="chevron" label="Back" onPress={onBack} style={styles.back} />
          <View style={styles.headerActions}>
            {embed && <IconButton name="open" label="Full screen" onPress={() => setFullScreen(true)} />}
            <IconButton
              name="share"
              label="Share"
              onPress={() => { track(userId, "share_out", { hasLink: !!url }); void shareItem({ url, title: heading, ...(thumbnail ? { thumbnailUrl: thumbnail } : {}) }); }}
            />
          </View>
        </View>

        {embed ? (
          <EmbedPlayer url={embed} width={playerWidth} height={playerHeight ?? initialHeight(detail.platform, playerWidth)} onHeight={setPlayerHeight} />
        ) : thumbnail ? (
          <Pressable accessibilityRole="imagebutton" accessibilityLabel="View picture full screen" onPress={() => setZoomed(true)}>
            <Image source={{ uri: thumbnail }} style={[styles.hero, { backgroundColor: p.surfaceAlt }]} contentFit="cover" transition={150} accessibilityIgnoresInvertColors />
          </Pressable>
        ) : null}

        <Text numberOfLines={2} style={[type.heading, { color: p.ink }]}>{heading}</Text>

        <View style={styles.row}>
          <Chip label={detail.category ?? "Sorting"} selected={!!detail.category} onPress={() => setPicking((v) => !v)} />
          <Text style={[type.label, { color: p.inkMuted }]} numberOfLines={1}>
            {detail.authorName ?? platformLabel(detail.platform)} · {savedOn(detail.lastSavedAt)}
          </Text>
        </View>

        {picking && (
          <Card>
            <Text style={[type.heading, { color: p.ink }]}>Put this under</Text>
            <View style={styles.wrap}>
              {CATEGORIES.map((c) => (
                <Chip key={c} label={c} selected={detail.category === c} onPress={() => setCategory.mutate(c, { onSuccess: () => { setPicking(false); track(userId, "category_changed", { from: detail.modelCategory ?? "none", to: c }); } })} />
              ))}
            </View>
          </Card>
        )}

        {hasMore && (
          <Pressable accessibilityRole="button" onPress={() => setExpanded((v) => !v)} hitSlop={8}>
            <Text style={[type.label, { color: p.accent }]}>{expanded ? "Less" : "More"}</Text>
          </Pressable>
        )}

        {expanded && (
          <View style={styles.details}>
            {detail.summary && <Text style={[type.body, { color: p.inkMuted }]}>{detail.summary}</Text>}
            {detail.tags.length > 0 && <Text style={[type.label, { color: p.inkMuted }]}>{detail.tags.join(" · ")}</Text>}
            {detail.text && detail.text.trim() !== heading.trim() && <Text style={[type.body, { color: p.ink }]}>{detail.text}</Text>}
            <TextInput
              accessibilityLabel="Your note about this save"
              value={noteValue}
              onChangeText={setNoteText}
              onBlur={() => { if (note !== null && note !== (detail.note ?? "")) setNote.mutate(note, { onSuccess: () => track(userId, "note_saved", { length: note.trim().length }) }); }}
              placeholder="Your note…"
              placeholderTextColor={p.inkMuted}
              multiline
              style={[styles.input, styles.noteInput, type.body, { backgroundColor: p.surfaceAlt, borderColor: p.border, color: p.ink }]}
            />
          </View>
        )}

        {(detail.status === "no_link" || detail.status === "failed") && (
          <Card>
            <Text style={[type.heading, { color: p.ink }]}>{detail.status === "failed" ? "That link did not work" : "Add the post's link"}</Text>
            <Text style={[type.body, { color: p.inkMuted }]}>
              {detail.status === "failed" ? "We could not read anything at that address. Paste the link again, in full." : "Instagram does not send the link for a plain post. Paste it here and it plays in place."}
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
              onPress={() => attach.mutate(link, {
                onSuccess: (r) => { setLink(""); setAttachError(null); track(userId, "paste_link", { status: r.status }); },
                onError: (e) => setAttachError(e instanceof DuplicateLinkError ? "You have already saved that link. You can delete this card." : e instanceof Error ? e.message : "Could not attach that link."),
              })}
            />
            {attachError && <Text style={[type.label, { color: p.bad }]}>{attachError}</Text>}
          </Card>
        )}

        <View style={styles.actions}>
          {url && (
            <Button
              label={`Open in ${platformLabel(detail.platform)}`}
              variant={embed ? "secondary" : "primary"}
              onPress={() => { track(userId, "open_original", { platform: detail.platform }); void openLink(url); }}
            />
          )}
          <Button label="Delete this save" variant="secondary" busy={remove.isPending} onPress={confirmDelete} />
        </View>
      </ScrollView>

      <Modal visible={fullScreen} animationType="slide" onRequestClose={() => setFullScreen(false)} statusBarTranslucent>
        <View style={[styles.full, { backgroundColor: "#000" }]}>
          <View style={styles.fullBar}>
            <IconButton name="close" label="Close" tone="surface" onPress={() => setFullScreen(false)} />
          </View>
          {embed && (
            <ScrollView contentContainerStyle={styles.fullScroll} showsVerticalScrollIndicator={false}>
              <EmbedPlayer url={embed} width={width} height={fullHeight ?? screenHeight} onHeight={setFullHeight} interactive />
            </ScrollView>
          )}
        </View>
      </Modal>

      <Modal visible={zoomed} animationType="fade" onRequestClose={() => setZoomed(false)} statusBarTranslucent>
        <Pressable accessibilityRole="button" accessibilityLabel="Close picture" onPress={() => setZoomed(false)} style={[styles.full, { backgroundColor: "#000" }]}>
          {thumbnail && <Image source={{ uri: thumbnail }} style={StyleSheet.absoluteFill} contentFit="contain" accessibilityIgnoresInvertColors />}
        </Pressable>
      </Modal>
    </View>
  );
}

function Centered({ width, text, onBack }: { width: number; text: string; onBack?: () => void }) {
  const p = usePalette();
  return (
    <View style={[styles.centered, { width, backgroundColor: p.bg }]}>
      <Text style={[type.body, { color: p.inkMuted }]}>{text}</Text>
      {onBack && <Button label="Back" variant="secondary" onPress={onBack} />}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { padding: space.lg, gap: space.md, paddingBottom: space.xxl * 2 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", gap: space.lg, padding: space.lg },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  headerActions: { flexDirection: "row", gap: space.sm },
  back: { transform: [{ rotate: "180deg" }] },
  hero: { width: "100%", aspectRatio: 1, borderRadius: radius.lg },
  row: { flexDirection: "row", alignItems: "center", gap: space.sm, flexWrap: "wrap" },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  details: { gap: space.md },
  actions: { gap: space.md, paddingTop: space.sm },
  input: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.md, paddingHorizontal: space.md, paddingVertical: space.md, minHeight: 48 },
  noteInput: { minHeight: 88, textAlignVertical: "top" },
  full: { flex: 1 },
  fullBar: { position: "absolute", top: space.xxl + space.lg, right: space.lg, zIndex: 2 },
  fullScroll: { flexGrow: 1, justifyContent: "center" },
});
