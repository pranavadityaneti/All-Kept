import { CATEGORIES } from "@allkept/contracts";
import { Image } from "expo-image";
import { useState } from "react";
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from "react-native";
import { Button } from "./Button";
import { Chip } from "./Chip";
import { EmbedPlayer } from "./EmbedPlayer";
import { Icon } from "./Icon";
import { IconButton } from "./IconButton";
import { embedUrl, initialHeight } from "../lib/embed";
import { DuplicateLinkError, openableUrl, useAttachLink, useDeleteItem, useItem, useSetCategory, useSetNote } from "../lib/item";
import { track, useTrackOnce } from "../lib/metrics";
import { openLink } from "../lib/open";
import { platformIcon, platformLabel } from "../lib/platforms";
import { useSession } from "../lib/session";
import { shareItem } from "../lib/share";
import { useThumbnails } from "../lib/thumbnails";
import { radius, space, type, usePalette } from "../lib/theme";

const savedOn = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

/**
 * One save, filling the screen it is given.
 *
 * The page itself does not scroll. Saves are paged through vertically, the way reels are, and a
 * scrolling page would spend the whole gesture arguing with the pager about who owns a drag. So the
 * caption, tags, note and category live in a sheet instead, one tap away.
 */
export function ItemDetail({ id, width, height, active, onBack }: { id: string; width: number; height: number; active: boolean; onBack: () => void }) {
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
  const [sheet, setSheet] = useState(false);
  const [footerHeight, setFooterHeight] = useState(150);
  const [note, setNoteText] = useState<string | null>(null);
  const [link, setLink] = useState("");
  const [attachError, setAttachError] = useState<string | null>(null);

  if (item.isPending) return <Centered width={width} height={height} text="Loading…" />;
  if (!detail) return <Centered width={width} height={height} text="This item is no longer in your library." onBack={onBack} />;

  const url = openableUrl(detail);
  const embed = embedUrl(detail);
  const heading = detail.title?.trim() || detail.text?.split("\n").find((l) => l.trim()) || platformLabel(detail.platform);
  const noteValue = note ?? detail.note ?? "";
  const needsLink = detail.status === "no_link" || detail.status === "failed";

  // Whatever the header and footer leave. The embed is capped to it rather than shrunk to fit:
  // an Instagram card carries its picture at the top and its own chrome underneath, so trimming
  // the bottom loses the chrome and keeps the thing you came to watch.
  const mediaMax = Math.max(160, height - footerHeight - 56 - space.lg * 2);
  const naturalHeight = playerHeight ?? initialHeight(detail.platform, playerWidth);

  const confirmDelete = () =>
    Alert.alert("Delete this save?", "It goes from your library for good. The original stays where it is.", [
      { text: "Keep", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => remove.mutate(undefined, { onSuccess: () => { track(userId, "item_deleted", { status: detail.status }); onBack(); } }) },
    ]);

  const saveNote = () => {
    if (note !== null && note !== (detail.note ?? "")) setNote.mutate(note, { onSuccess: () => track(userId, "note_saved", { length: note.trim().length }) });
  };

  return (
    <View style={{ width, height }}>
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

      <View style={styles.media}>
        {embed ? (
          // Touches belong to the embed. A carousel is turned by the arrows Instagram draws inside it,
          // and with the saves paged vertically nothing else wants the sideways swipe any more. It is
          // paused while the full-screen copy is up, so the two are never playing the same reel at once.
          <EmbedPlayer url={embed} width={playerWidth} height={Math.min(naturalHeight, mediaMax)} onHeight={setPlayerHeight} interactive active={active && !fullScreen} />
        ) : thumbnail ? (
          <Pressable accessibilityRole="imagebutton" accessibilityLabel="View picture full screen" onPress={() => setZoomed(true)}>
            {/* Contained, not cropped. This is the whole picture Instagram sent and there is no second
                copy of it anywhere, so cutting a square out of it loses the part that was cut. */}
            <Image source={{ uri: thumbnail }} style={[styles.hero, { width: playerWidth, height: mediaMax }]} contentFit="contain" transition={150} accessibilityIgnoresInvertColors />
          </Pressable>
        ) : (
          <View style={[styles.blank, { width: playerWidth, maxHeight: mediaMax, backgroundColor: p.surfaceAlt }]}>
            <Icon name={platformIcon(detail.platform)} size={36} color={p.inkMuted} />
            <Text style={[type.label, { color: p.inkMuted }]}>{needsLink ? "No link yet" : "Nothing to play"}</Text>
          </View>
        )}
      </View>

      <View style={styles.footer} onLayout={(e) => setFooterHeight(Math.round(e.nativeEvent.layout.height))}>
        {/* The caption is one line here and the rest is a tap away, the way Instagram hides it. */}
        <Pressable accessibilityRole="button" accessibilityLabel="Details for this save" onPress={() => setSheet(true)}>
          <Text numberOfLines={2} style={[type.heading, { color: p.ink }]}>{heading}</Text>
          <Text style={[type.label, styles.meta, { color: p.inkMuted }]} numberOfLines={1}>
            {detail.authorName ?? platformLabel(detail.platform)} · {savedOn(detail.lastSavedAt)} · more
          </Text>
        </Pressable>

        <View style={styles.actions}>
          <View style={styles.actionsLeft}>
            <Chip label={detail.category ?? "Sorting"} selected={!!detail.category} onPress={() => setSheet(true)} />
            {url && (
              <IconButton
                name={platformIcon(detail.platform)}
                label={`Open in ${platformLabel(detail.platform)}`}
                size={44}
                onPress={() => { track(userId, "open_original", { platform: detail.platform }); void openLink(url); }}
              />
            )}
          </View>
          {/* At the far side, because next to the button you tap often it is one mis-tap away. */}
          <IconButton name="trash" label="Delete this save" size={44} tone="danger" disabled={remove.isPending} onPress={confirmDelete} />
        </View>
      </View>

      <Modal visible={sheet} animationType="slide" onRequestClose={() => { saveNote(); setSheet(false); }} presentationStyle="pageSheet">
        <View style={[styles.sheet, { backgroundColor: p.bg }]}>
          <View style={styles.sheetBar}>
            <Text style={[type.section, { color: p.ink }]}>Details</Text>
            <IconButton name="close" label="Close" onPress={() => { saveNote(); setSheet(false); }} />
          </View>
          <ScrollView contentContainerStyle={styles.sheetBody} keyboardShouldPersistTaps="handled">
            <Text style={[type.heading, { color: p.ink }]}>{heading}</Text>

            {needsLink && (
              <View style={[styles.block, { backgroundColor: p.surface, borderColor: p.border }]}>
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
                    onSuccess: (r) => { setLink(""); setAttachError(null); setSheet(false); track(userId, "paste_link", { status: r.status }); },
                    onError: (e) => setAttachError(e instanceof DuplicateLinkError ? "You have already saved that link. You can delete this card." : e instanceof Error ? e.message : "Could not attach that link."),
                  })}
                />
                {attachError && <Text style={[type.label, { color: p.bad }]}>{attachError}</Text>}
              </View>
            )}

            <Text style={[type.label, { color: p.inkMuted }]}>Put this under</Text>
            <View style={styles.wrap}>
              {CATEGORIES.map((c) => (
                <Chip key={c} label={c} selected={detail.category === c} onPress={() => setCategory.mutate(c, { onSuccess: () => track(userId, "category_changed", { from: detail.modelCategory ?? "none", to: c }) })} />
              ))}
            </View>

            {detail.summary && <Text style={[type.body, { color: p.inkMuted }]}>{detail.summary}</Text>}
            {detail.tags.length > 0 && <Text style={[type.label, { color: p.inkMuted }]}>{detail.tags.join(" · ")}</Text>}
            {detail.text && detail.text.trim() !== heading.trim() && <Text style={[type.body, { color: p.ink }]}>{detail.text}</Text>}

            <Text style={[type.label, { color: p.inkMuted }]}>Your note</Text>
            <TextInput
              accessibilityLabel="Your note about this save"
              value={noteValue}
              onChangeText={setNoteText}
              onBlur={saveNote}
              placeholder="Your note…"
              placeholderTextColor={p.inkMuted}
              multiline
              style={[styles.input, styles.noteInput, type.body, { backgroundColor: p.surfaceAlt, borderColor: p.border, color: p.ink }]}
            />
          </ScrollView>
        </View>
      </Modal>

      <Modal visible={fullScreen} animationType="slide" onRequestClose={() => setFullScreen(false)} statusBarTranslucent>
        <View style={[styles.full, { backgroundColor: "#000" }]}>
          <View style={styles.fullBar}>
            <IconButton name="close" label="Close" tone="surface" onPress={() => setFullScreen(false)} />
          </View>
          {embed && (
            <ScrollView contentContainerStyle={styles.fullScroll} showsVerticalScrollIndicator={false}>
              <EmbedPlayer url={embed} width={width} height={fullHeight ?? screenHeight} onHeight={setFullHeight} interactive active={active} />
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

function Centered({ width, height, text, onBack }: { width: number; height: number; text: string; onBack?: () => void }) {
  const p = usePalette();
  return (
    <View style={[styles.centered, { width, height, backgroundColor: p.bg }]}>
      <Text style={[type.body, { color: p.inkMuted }]}>{text}</Text>
      {onBack && <Button label="Back" variant="secondary" onPress={onBack} />}
    </View>
  );
}

const styles = StyleSheet.create({
  centered: { alignItems: "center", justifyContent: "center", gap: space.lg, padding: space.lg },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: space.lg, height: 56 },
  headerActions: { flexDirection: "row", gap: space.sm },
  back: { transform: [{ rotate: "180deg" }] },
  media: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: space.lg },
  hero: { borderRadius: radius.lg },
  blank: { aspectRatio: 1.6, borderRadius: radius.lg, alignItems: "center", justifyContent: "center", gap: space.sm },
  footer: { paddingHorizontal: space.lg, paddingTop: space.md, paddingBottom: space.lg, gap: space.md },
  meta: { marginTop: 2 },
  actions: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  actionsLeft: { flexDirection: "row", alignItems: "center", gap: space.sm, flexShrink: 1 },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  block: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.lg, padding: space.lg, gap: space.sm },
  input: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.md, paddingHorizontal: space.md, paddingVertical: space.md, minHeight: 48 },
  noteInput: { minHeight: 88, textAlignVertical: "top" },
  sheet: { flex: 1 },
  sheetBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: space.lg },
  sheetBody: { paddingHorizontal: space.lg, paddingBottom: space.xxl * 2, gap: space.md },
  full: { flex: 1 },
  fullBar: { position: "absolute", top: space.xxl + space.lg, right: space.lg, zIndex: 2 },
  fullScroll: { flexGrow: 1, justifyContent: "center" },
});
