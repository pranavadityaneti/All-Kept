import { useEffect, useRef, useState } from "react";
import { Image } from "expo-image";
import { useQueryClient } from "@tanstack/react-query";
import { ActivityIndicator, Keyboard, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { ConfirmButton } from "./ConfirmButton";
import { Icon } from "./Icon";
import { validateProfile, type Profile } from "../lib/profile-fields";
import { profileKey, useAvatar } from "../lib/profile";
import { photoBytes, pickProfilePhoto, removeDraftPhoto } from "../lib/profile-photo";
import { chunkedSecureStore } from "../lib/storage";
import { supabase } from "../lib/supabase";
import { type, usePalette } from "../lib/theme";

interface Draft { name: string; phone: string; photoUri: string | null; uploadedPath: string | null }
export const profileDraftKey = (userId: string) => `allkept.profile-draft.${userId}`;
export function ProfileForm({ profile, suggestedName, onboarding, onSaved }: { profile: Profile; suggestedName: string; onboarding: boolean; onSaved: () => void }) {
  const p = usePalette(onboarding ? "light" : undefined), client = useQueryClient();
  const [form, setForm] = useState<Draft>({ name: profile.display_name ?? suggestedName, phone: profile.phone ?? "", photoUri: null, uploadedPath: null });
  const [loaded, setLoaded] = useState(!onboarding), [stage, setStage] = useState<"photo" | "uploading" | "saving" | "done" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const finished = useRef(false);
  const savedProfile = useRef<Profile | null>(null);
  const running = useRef(false), writes = useRef(Promise.resolve());
  const avatar = useAvatar(profile.avatar_path);
  const busy = stage !== null;
  useEffect(() => {
    if (!onboarding) return;
    let live = true;
    void chunkedSecureStore.getItem(profileDraftKey(profile.user_id)).then((saved) => {
      if (!live || !saved) return;
      try {
        const draft = JSON.parse(saved) as Draft;
        if ([draft.name, draft.phone].every((v) => typeof v === "string")) setForm(draft);
      } catch { /* Ignore an obsolete draft. */ }
    }).catch(() => undefined).finally(() => { if (live) setLoaded(true); });
    return () => { live = false; };
  }, [profile.user_id, onboarding]);
  useEffect(() => {
    if (!loaded || !onboarding || finished.current) return;
    writes.current = writes.current.then(() => chunkedSecureStore.setItem(profileDraftKey(profile.user_id), JSON.stringify(form))).catch(() => undefined);
  }, [form, loaded, onboarding, profile.user_id]);
  const change = (patch: Partial<Draft>) => { setForm((current) => ({ ...current, ...patch })); setError(null); };
  const choosePhoto = async () => {
    if (running.current) return;
    running.current = true; setStage("photo"); setError(null);
    try { const uri = await pickProfilePhoto(profile.user_id); if (uri) change({ photoUri: uri, uploadedPath: null }); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not open your photos. Please try again."); }
    finally { running.current = false; setStage(null); }
  };
  const submit = async (): Promise<boolean> => {
    if (running.current || finished.current) return false;
    Keyboard.dismiss();
    setError(null);
    let patch: ReturnType<typeof validateProfile>;
    try { patch = validateProfile({ ...form, avatarPath: form.uploadedPath ?? (form.photoUri ? "upload-pending" : profile.avatar_path) }); }
    catch (e) { setError((e as Error).message); return false; }
    running.current = true;
    try {
      let path = form.uploadedPath ?? profile.avatar_path;
      if (form.photoUri && !form.uploadedPath) {
        setStage("uploading");
        const bytes = await photoBytes(form.photoUri);
        path = `${profile.user_id}/${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;
        const { error: uploadError } = await supabase.storage.from("avatars").upload(path, bytes, { contentType: "image/jpeg", upsert: false });
        if (uploadError) throw new Error("Photo upload failed. Your details are kept; please try again.");
        change({ uploadedPath: path });
      }
      setStage("saving");
      const { data, error: saveError } = await supabase.from("profiles").update({ ...patch, avatar_path: path }).eq("user_id", profile.user_id)
        .select("user_id,display_name,phone,avatar_path,onboarding_completed_at").single();
      if (saveError || !data?.onboarding_completed_at) throw new Error("Could not save your profile. Your details are kept; please try again.");
      // A lost response can still mean the write committed. Never delete a new upload on failure.
      finished.current = true;
      await writes.current;
      if (onboarding) await chunkedSecureStore.removeItem(profileDraftKey(profile.user_id)).catch(() => undefined);
      if (profile.avatar_path && profile.avatar_path !== path) void supabase.storage.from("avatars").remove([profile.avatar_path]).catch(() => undefined);
      savedProfile.current = data as Profile;
      setStage("done");
      return true;
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save your profile."); return false; }
    finally { running.current = false; if (!finished.current) setStage(null); }
  };
  const complete = () => {
    if (!savedProfile.current) return;
    removeDraftPhoto(form.photoUri);
    client.setQueryData(profileKey(profile.user_id), savedProfile.current);
    onSaved();
  };
  const picture = form.photoUri ?? avatar.data;
  const inputStyle = [styles.input, { color: p.ink, borderColor: p.border, backgroundColor: p.surface }];
  return <View style={styles.form}>
    <View style={styles.photoBlock}>
      <Pressable accessibilityRole="button" accessibilityLabel={picture ? "Change profile photo" : "Add profile photo"} accessibilityHint="A profile photo is required" accessibilityState={{ disabled: busy || !loaded, busy: stage === "photo" }} disabled={busy || !loaded} onPress={() => { void choosePhoto(); }} style={({ pressed }) => [styles.photoAction, { opacity: pressed ? 0.75 : 1 }]}>
        <View style={[styles.photo, { backgroundColor: p.surfaceAlt, borderColor: p.border }]}>
          {stage === "photo" ? <ActivityIndicator color={p.accent} /> : picture ? <Image source={{ uri: picture }} style={StyleSheet.absoluteFill} contentFit="cover" /> : <Icon name="camera" size={30} color={p.inkMuted} />}
        </View>
        <View style={[styles.addBadge, { backgroundColor: p.accent, borderColor: p.bg }]}><Icon name="add" size={17} color={p.accentInk} /></View>
      </Pressable>
      <Text style={[styles.photoLabel, { color: p.inkMuted }]}>{picture ? "Change photo" : "Add photo"}</Text>
    </View>
    <View style={styles.fields}>
      <View style={styles.field}>
        <Text style={[styles.label, { color: p.inkMuted }]}>Name</Text>
        <TextInput accessibilityLabel="Name" autoComplete="name" textContentType="name" value={form.name} onChangeText={(name) => change({ name })} editable={!busy && loaded} maxLength={80} placeholder="Your name" placeholderTextColor={p.inkMuted} selectionColor={p.accent} returnKeyType="done" style={inputStyle} />
      </View>
      <View style={styles.field}>
      </View>
      <View style={styles.field}>
        <View style={styles.labelRow}><Text style={[styles.label, { color: p.inkMuted }]}>Phone</Text><Text style={[styles.optional, { color: p.inkMuted }]}>Optional</Text></View>
        <TextInput accessibilityLabel="Phone number with country code, optional" autoComplete="tel" keyboardType="phone-pad" value={form.phone} onChangeText={(phone) => change({ phone })} editable={!busy && loaded} maxLength={30} placeholder="+91 98765 43210" placeholderTextColor={p.inkMuted} selectionColor={p.accent} style={inputStyle} />
      </View>
    </View>
    <View style={styles.submit}>
      {error && <Text accessibilityRole="alert" style={[type.body, styles.message, { color: p.bad }]}>{error}</Text>}
      {(stage === "uploading" || stage === "saving") && <Text accessibilityLiveRegion="polite" style={[styles.photoLabel, styles.message, { color: p.inkMuted }]}>{stage === "uploading" ? "Uploading photo…" : "Saving…"}</Text>}
      <ConfirmButton label={onboarding ? "Save and continue" : "Save changes"} disabled={busy || !loaded} onConfirm={submit} onComplete={complete} light={onboarding} />
    </View>
  </View>;
}
const styles = StyleSheet.create({
  form: { flex: 1, gap: 34 },
  photoBlock: { alignItems: "center", gap: 12, paddingTop: 4, paddingBottom: 6 },
  photoAction: { width: 104, height: 104 },
  photo: { width: 104, height: 104, borderRadius: 52, borderWidth: StyleSheet.hairlineWidth, overflow: "hidden", alignItems: "center", justifyContent: "center" },
  addBadge: { position: "absolute", bottom: 0, right: 0, borderRadius: 17, width: 32, height: 32, borderWidth: 3, alignItems: "center", justifyContent: "center" },
  photoLabel: { fontSize: 13 },
  fields: { gap: 30 },
  field: { gap: 12 },
  label: { fontSize: 13, fontWeight: "500" },
  labelRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  optional: { fontSize: 11 },
  input: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 17, paddingHorizontal: 18, paddingVertical: 17, minHeight: 58, fontSize: 16 },
  submit: { marginTop: "auto", paddingTop: 8, gap: 8 },
  message: { textAlign: "center", lineHeight: 21 },
});
