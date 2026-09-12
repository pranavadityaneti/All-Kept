import { CATEGORIES } from "@allkept/contracts";
import { Image } from "expo-image";
import { useState } from "react";
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from "react-native";
import { Button } from "./Button";
import { Chip } from "./Chip";
import { EmbedPlayer } from "./EmbedPlayer";
import { Icon } from "./Icon";
import { IconButton } from "./IconButton";
import { embedFit, embedUrl, fitBox, initialAspect, initialHeight } from "../lib/embed";
import { DuplicateLinkError, openableUrl, useAttachLink, useDeleteItem, useItem, useSetCategory, useSetNote, useRetrySorting } from "../lib/item";
import { categoryDisplayName } from "../lib/category-names";
import { track, useTrackOnce } from "../lib/metrics";
import { canRetrySorting, categoryLabel } from "../lib/sorting";
import { openLink } from "../lib/open";
import { hostLabel, platformIcon, platformLabel } from "../lib/platforms";
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
  const retrySorting = useRetrySorting(id);
  const remove = useDeleteItem(id, detail?.thumbnailPath ?? null);
  const attach = useAttachLink(id, detail?.status === "no_link" && detail.platform === "instagram" ? "instagram" : undefined, detail?.thumbnailPath ?? null);

  // The embed is given the whole width of the screen. The inset it used to sit in was ours, not the
  // platform's, and on a card whose content scales to its width every point of it was content lost.
  const playerWidth = width;
  /** The "nothing to play" card is a card of ours, so it keeps the page's margins. */
  const blankWidth = width - space.lg * 2;
  const [playerHeight, setPlayerHeight] = useState<number | null>(null);
  const [fullHeight, setFullHeight] = useState<number | null>(null);
  const [fullScreen, setFullScreen] = useState(false);
  // The provider itself said there is nothing here to play (a removed TikTok post): the picture stands in.
  const [unplayable, setUnplayable] = useState(false);
  const [zoomed, setZoomed] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [footerHeight, setFooterHeight] = useState(150);
  const [note, setNoteText] = useState<string | null>(null);
  const [link, setLink] = useState("");
  const [attachError, setAttachError] = useState<string | null>(null);

  if (item.isPending) return <Centered width={width} height={height} text="Loading…" />;
  if (!detail) return <Centered width={width} height={height} text="This item is no longer in your library." onBack={onBack} />;

  const url = openableUrl(detail);
  const embed = unplayable ? null : embedUrl(detail);
  // A link whose page we could not read has no title and no caption, and "Web" as a heading tells
  // you nothing about which link it was. The address always exists — it is the thing that was
  // saved — so it stands in before the platform's own name does.
  const heading = detail.title?.trim()
    || detail.text?.split("\n").find((l) => l.trim())
    || (detail.platform === "web" ? hostLabel(url) : null)
    || platformLabel(detail.platform);
  const noteValue = note ?? detail.note ?? "";
  const needsLink = detail.status === "no_link" || detail.status === "failed";
  // "No link yet" was shown for both, and for a failed save it is simply untrue: the link is there,
  // the button below opens it, we just could not read the page at the end of it. Sites like Amazon
  // and MakeMyTrip refuse automated readers outright, so that is the ordinary outcome for them
  // rather than a fault, and it should not read like one.
  const blankNote =
    detail.status === "no_link" ? "No link yet"
      : detail.status === "failed" ? "Could not read this page"
      : detail.status === "preview_unavailable" ? "This site gives no preview"
      : "Nothing to play";

  // Whatever the header and footer leave. The embed is capped to it rather than shrunk to fit:
  // an Instagram card carries its picture at the top and its own chrome underneath, so trimming
  // the bottom loses the chrome and keeps the thing you came to watch.
  const mediaMax = Math.max(160, height - footerHeight - 56 - space.md);
  // Only a card is asked how tall it is. A player fills its box, so a height reported back by one is
  // just the box read aloud — taking it as the new box is what made a playing video close up.
  const measured = embedFit(detail.platform) === "card";
  const cardHeight = playerHeight ?? initialHeight(detail.platform, playerWidth);
  // A card keeps the full width and is cut to the height it reported. A player is given a box of the
  // video's own shape instead: a Short gets a tall, narrow one rather than black bars either side of
  // a widescreen frame. Until enrichment has learned the shape, 16:9 is the assumption it always was.
  const aspect = detail.aspect ?? initialAspect(detail.platform, detail.kind);
  const box = measured
    ? { width: playerWidth, height: Math.min(cardHeight, mediaMax) }
    : fitBox(aspect, playerWidth, mediaMax);
  // Full screen has the whole window to fill, and the same rule applies to it.
  const fullBox = fitBox(aspect, width, screenHeight);

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
          {/* Beside share rather than down beside the buttons you tap often. Deleting still asks first. */}
          <IconButton name="trash" label="Delete this save" tone="danger" disabled={remove.isPending} onPress={confirmDelete} />
        </View>
      </View>

      <View style={styles.media}>
        {embed ? (
          // Touches belong to the embed. A carousel is turned by the arrows Instagram draws inside it,
          // and with the saves paged vertically nothing else wants the sideways swipe any more. It is
          // paused while the full-screen copy is up, so the two are never playing the same reel at once.
          <EmbedPlayer
            url={embed}
            width={box.width}
            height={box.height}
            {...(measured ? { onHeight: setPlayerHeight } : {})}
            interactive
            active={active && !fullScreen}
            onUnplayable={() => setUnplayable(true)}
          />
        ) : thumbnail ? (
          <Pressable accessibilityRole="imagebutton" accessibilityLabel="View picture full screen" onPress={() => setZoomed(true)}>
            {/* Contained, not cropped. This is the whole picture Instagram sent and there is no second
                copy of it anywhere, so cutting a square out of it loses the part that was cut. */}
            <Image source={{ uri: thumbnail }} style={[styles.hero, { width: playerWidth, height: mediaMax }]} contentFit="contain" transition={150} accessibilityIgnoresInvertColors />
          </Pressable>
        ) : (
          <View style={[styles.blank, { width: blankWidth, maxHeight: mediaMax, backgroundColor: p.surfaceAlt }]}>
            <Icon name={platformIcon(detail.platform)} size={36} color={p.inkMuted} />
            <Text style={[type.label, { color: p.inkMuted }]}>{blankNote}</Text>
            {url && (
              <>
                <Text numberOfLines={3} style={[type.body, styles.blankUrl, { color: p.ink }]}>{url}</Text>
                <Button label={`Open ${hostLabel(url) ?? "link"}`} variant="secondary" onPress={() => { track(userId, "open_original", { platform: detail.platform }); void openLink(url); }} />
              </>
            )}
          </View>
        )}
      </View>

      <View style={styles.footer} onLayout={(e) => setFooterHeight(Math.round(e.nativeEvent.layout.height))}>
        {/* The caption is one line here and the rest is a tap away, the way Instagram hides it. */}
        <Pressable accessibilityRole="button" accessibilityLabel="Details for this save" onPress={() => setSheet(true)}>
          <Text numberOfLines={2} style={[type.heading, { color: p.ink }]}>{heading}</Text>
          <Text style={[type.label, styles.meta, { color: p.inkMuted }]} numberOfLines={1}>
            {detail.authorName ?? detail.siteName ?? platformLabel(detail.platform)} · {savedOn(detail.lastSavedAt)} · more
          </Text>
        </Pressable>

        {detail.status === "no_link" && <Button label="Add original link" variant="secondary" onPress={() => setSheet(true)} />}
        <View style={styles.actions}>
          <Chip label={categoryLabel(detail)} selected={!!detail.category} boxed onPress={() => setSheet(true)} />
          {url && (
            <IconButton
              name={platformIcon(detail.platform)}
              label={`Open in ${platformLabel(detail.platform)}`}
              size={44}
              onPress={() => { track(userId, "open_original", { platform: detail.platform }); void openLink(url); }}
            />
          )}
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
                  {detail.status === "failed" ? "We could not read anything at that address. Paste the link again, in full." : "This share arrived without its original link. In Instagram, open this post, choose Copy link from the share menu, and paste it here."}
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

            {canRetrySorting(detail) && (
              <View style={[styles.block, { backgroundColor: p.surface, borderColor: p.border }]}>
                <Text style={[type.body, { color: p.inkMuted }]}>
                  {detail.classificationStatus === "retry_wait" ? "Sorting hit a temporary problem. We will retry automatically, or you can retry now." : "We could not finish sorting this save. Retry, or choose a category below."}
                </Text>
                <Button label="Retry sorting" busy={retrySorting.isPending} onPress={() => retrySorting.mutate()} />
                {retrySorting.error && <Text style={[type.label, { color: p.bad }]}>{retrySorting.error.message}</Text>}
              </View>
            )}

            <Text style={[type.label, { color: p.inkMuted }]}>Put this under</Text>
            <View style={styles.wrap}>
              {CATEGORIES.map((c) => (
                <Chip key={c} label={categoryDisplayName(c)} selected={detail.category === c} onPress={() => setCategory.mutate(c, { onSuccess: () => track(userId, "category_changed", { from: detail.modelCategory ?? "none", to: c }) })} />
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
              <EmbedPlayer
                url={embed}
                width={measured ? width : fullBox.width}
                height={measured ? (fullHeight ?? screenHeight) : fullBox.height}
                {...(measured ? { onHeight: setFullHeight } : {})}
                interactive
                active={active}
              />
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
  media: { flex: 1, alignItems: "center", justifyContent: "center" },
  hero: { borderRadius: radius.lg },
  // No fixed ratio any more: it now holds an address of unknown length and a button, and a box that
  // cannot grow either clips them or leaves them floating in the middle of nothing.
  blank: { minHeight: 180, borderRadius: radius.lg, alignItems: "center", justifyContent: "center", gap: space.sm, padding: space.lg },
  blankUrl: { textAlign: "center" },
  footer: { paddingHorizontal: space.lg, paddingTop: space.md, paddingBottom: space.lg, gap: space.md },
  meta: { marginTop: 2 },
  actions: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: space.sm },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  block: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.lg, padding: space.lg, gap: space.sm },
  input: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.md, paddingHorizontal: space.md, paddingVertical: space.md, minHeight: 48 },
  noteInput: { minHeight: 88, textAlignVertical: "top" },
  sheet: { flex: 1 },
  sheetBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: space.lg },
  sheetBody: { paddingHorizontal: space.lg, paddingBottom: space.xxl * 2, gap: space.md },
  full: { flex: 1 },
  fullBar: { position: "absolute", top: space.xxl + space.lg, right: space.lg, zIndex: 2 },
  fullScroll: { flexGrow: 1, justifyContent: "center", alignItems: "center" },
});
