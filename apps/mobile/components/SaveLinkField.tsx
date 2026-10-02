import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Keyboard, LayoutAnimation, StyleSheet, Text, TextInput, View } from "react-native";
import * as Haptics from "expo-haptics";
import { LIMITS, type SaveLinkResponse } from "@allkept/contracts";
import { saveLink } from "@allkept/normalize";
import { IconButton } from "./IconButton";
import { invalidateLibrary } from "../lib/library";
import { isPaymentRequired } from "../lib/paywall";
import { pictureForSave } from "../lib/instagram-picture";
import { resolveForSave } from "../lib/resolve-link";
import { saveOutcome } from "../lib/save-outcome";
import { supabase } from "../lib/supabase";
import { radius, space, type, usePalette } from "../lib/theme";
import { useQueryClient } from "@tanstack/react-query";

type Said = { tone: "good" | "bad"; text: string } | null;

/**
 * How long an outcome stays on screen. It used to stay until the app was closed, which left "Saved."
 * sitting under the field long after the save it referred to. A failure is given longer because it
 * is the one the person still has to do something about.
 */
const CLEARS_AFTER_MS = { good: 3_000, bad: 6_000 } as const;

/** The note field sliding in or out as the field starts or stops holding a link. */
const slide = () => LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);

/**
 * Paste a link and keep it, without leaving the screen you are on — with a note, if you like. The
 * note field appears once the field holds a link, and the note travels with the save rather than
 * being patched on afterwards, so the sorter reads it when it files the link.
 */
export function SaveLinkField() {
  const p = usePalette();
  const router = useRouter();
  const queryClient = useQueryClient();
  // The link field is uncontrolled: what is typed lives in the native field and is only reported
  // here, never written back. Written back, it raced the heavier render that mounts the note field
  // the moment the text becomes a link, and fast typing lost every character after that point.
  const linkField = useRef<TextInput>(null);
  const [text, setText] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<Said>(null);
  const running = useRef(false);

  // Keyed on the message itself, so a second outcome restarts the clock instead of inheriting what
  // was left of the first one's. Cleared on unmount: the screen can be left while this is counting.
  useEffect(() => {
    if (!said) return;
    const t = setTimeout(() => setSaid(null), CLEARS_AFTER_MS[said.tone]);
    return () => clearTimeout(t);
  }, [said]);

  // Keyed on the link and the note together: an unchanged retry reuses its id and is still one
  // save; a retry with a different note is a new ask, and on an already-kept link that note is added.
  const attempt = useRef<{ key: string; id: string } | null>(null);
  const isLink = !!saveLink(text);

  /**
   * `from` is what a keyboard's Done reported for its own box: the text actually there, which can be
   * ahead of state by the last few keystrokes — Done arrives before they do, and a note saved from
   * state lost its last word. The tick, a separate deliberate tap, reads state.
   */
  const save = async (from: { link?: string; note?: string } = {}) => {
    const link = from.link ?? text;
    const noteNow = from.note ?? note;
    if (running.current) return;
    if (!saveLink(link)) {
      setSaid({ tone: "bad", text: "That doesn't look like a link." });
      return;
    }
    running.current = true;
    setBusy(true);
    setSaid(null);
    try {
      // Followed here rather than on the server: some sites refuse their own share links to a datacentre.
      const value = await resolveForSave(link);
      // Instagram walls a datacentre now and then, never a phone: the post's poster is read here and travels with the save.
      const pictureUrl = await pictureForSave(value);
      const typed = noteNow.trim();
      // The same id on a retry, so a save that already landed is not made twice.
      const key = `${value}\n${typed}`;
      if (attempt.current?.key !== key) attempt.current = { key, id: `${Date.now()}-${Math.random().toString(36).slice(2)}` };
      const { data, error } = await supabase.functions.invoke<SaveLinkResponse>("save-link", {
        body: { text: value, requestId: attempt.current.id, ...(pictureUrl ? { pictureUrl } : {}), ...(typed ? { note: typed } : {}) },
      });
      // The free saves are used: the link stays in the field, and the paywall opens over it.
      if (isPaymentRequired(error)) { router.push("/subscribe"); return; }
      if (error || !data?.itemId) throw new Error("Could not save that. Check your connection.");
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      slide();
      linkField.current?.clear();
      setText("");
      setNote("");
      attempt.current = null;
      setSaid({ tone: "good", text: saveOutcome(data, !!typed) });
      invalidateLibrary(queryClient);
    } catch (e) {
      setSaid({ tone: "bad", text: e instanceof Error ? e.message : "Could not save that." });
    } finally {
      running.current = false;
      setBusy(false);
    }
  };

  return (
    <View style={styles.wrap}>
      <View style={[styles.row, { backgroundColor: p.surface, borderColor: p.border }]}>
        <TextInput
          ref={linkField}
          accessibilityLabel="Paste a link to save"
          onChangeText={(v) => {
            if (!!saveLink(v) !== isLink) slide();
            // Clearing the field clears the note with it. Pasting a new link over the old one keeps the
            // note, which is what a person correcting a wrong paste wants.
            if (!v.trim()) setNote("");
            setText(v);
            setSaid(null);
          }}
          editable={!busy}
          autoCapitalize="none"
          autoCorrect={false}
          inputMode="url"
          returnKeyType="done"
          onSubmitEditing={(e) => { void save({ link: e.nativeEvent.text }); }}
          placeholder="Paste a link to save"
          placeholderTextColor={p.inkMuted}
          style={[styles.input, type.body, { color: p.ink }]}
        />
        {busy
          ? <View style={styles.spinner}><ActivityIndicator color={p.accent} /></View>
          // The keyboard goes as the save starts, as it does on Done, so the outcome isn't left behind it.
          : <IconButton name="check" label="Save this link" tone={text.trim() ? "accent" : "surface"} disabled={!text.trim()} onPress={() => { Keyboard.dismiss(); void save(); }} />}
      </View>
      {isLink && (
        <TextInput
          accessibilityLabel="A note to keep with this link"
          value={note}
          onChangeText={setNote}
          editable={!busy}
          multiline
          // Done saves, as it does in the link field, so a note can be finished from the keyboard. A long
          // note still wraps; it just can't add a line.
          returnKeyType="done"
          submitBehavior="blurAndSubmit"
          onSubmitEditing={(e) => { void save({ note: e.nativeEvent.text }); }}
          maxLength={LIMITS.noteMaxChars}
          placeholder="Add a note (optional)"
          placeholderTextColor={p.inkMuted}
          style={[styles.note, type.body, { color: p.ink, backgroundColor: p.surface, borderColor: p.border }]}
        />
      )}
      {said && (
        <Text accessibilityRole="alert" style={[type.label, { color: said.tone === "good" ? p.good : p.bad }]}>
          {said.text}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm },
  row: {
    flexDirection: "row", alignItems: "center", gap: space.sm,
    borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.lg,
    paddingLeft: space.lg, paddingRight: space.xs, paddingVertical: space.xs, minHeight: 52,
  },
  input: { flex: 1, paddingVertical: space.sm },
  // Up to about four lines, then it scrolls inside itself rather than pushing the screen down.
  note: {
    borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.lg,
    paddingHorizontal: space.lg, paddingTop: space.md, paddingBottom: space.md, minHeight: 52, maxHeight: 120,
    textAlignVertical: "top",
  },
  spinner: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
});
