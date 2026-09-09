import { useEffect, useRef, useState } from "react";
import { Image } from "expo-image";
import { useQueryClient } from "@tanstack/react-query";
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Button } from "./Button";
import { Chip } from "./Chip";
import { Icon } from "./Icon";
import { GENDERS, validateProfile, type Profile } from "../lib/profile-fields";
import { profileKey, useAvatar } from "../lib/profile";
import { photoBytes, pickProfilePhoto, removeDraftPhoto } from "../lib/profile-photo";
import { chunkedSecureStore } from "../lib/storage";
import { supabase } from "../lib/supabase";
import { radius, space, type, usePalette } from "../lib/theme";

interface Draft { name: string; gender: string; genderCustom: string; phone: string; photoUri: string | null; uploadedPath: string | null }
export const profileDraftKey = (userId: string) => `allkept.profile-draft.${userId}`;
export function ProfileForm({ profile, suggestedName, onboarding, onSaved }: { profile: Profile; suggestedName: string; onboarding: boolean; onSaved: () => void }) {
  const p = usePalette(), client = useQueryClient();
  const [form, setForm] = useState<Draft>({ name: profile.display_name ?? suggestedName, gender: profile.gender ?? "", genderCustom: profile.gender_custom ?? "", phone: profile.phone ?? "", photoUri: null, uploadedPath: null });
  const [loaded, setLoaded] = useState(!onboarding), [stage, setStage] = useState<"photo" | "uploading" | "saving" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const finished = useRef(false);
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
        if ([draft.name, draft.gender, draft.genderCustom, draft.phone].every((v) => typeof v === "string")) setForm(draft);
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
  const submit = async () => {
    if (running.current) return;
    setError(null);
    let patch: ReturnType<typeof validateProfile>;
    try { patch = validateProfile({ ...form, avatarPath: form.uploadedPath ?? (form.photoUri ? "upload-pending" : profile.avatar_path) }); }
    catch (e) { setError((e as Error).message); return; }
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
        .select("user_id,display_name,gender,gender_custom,phone,avatar_path,onboarding_completed_at").single();
      if (saveError || !data?.onboarding_completed_at) throw new Error("Could not save your profile. Your details are kept; please try again.");
      // A lost response can still mean the write committed. Never delete a new upload on failure.
      finished.current = true;
      await writes.current;
      if (onboarding) await chunkedSecureStore.removeItem(profileDraftKey(profile.user_id)).catch(() => undefined);
      if (profile.avatar_path && profile.avatar_path !== path) void supabase.storage.from("avatars").remove([profile.avatar_path]).catch(() => undefined);
      removeDraftPhoto(form.photoUri);
      client.setQueryData(profileKey(profile.user_id), data as Profile);
      onSaved();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save your profile."); }
    finally { running.current = false; setStage(null); }
  };
  const picture = form.photoUri ?? avatar.data;
  return <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.form}>
    {/* The photo comes first, above every profile field. */}
    <View style={styles.photoBlock}>
      <Pressable accessibilityRole="button" accessibilityLabel={picture ? "Change profile photo" : "Add profile photo"} disabled={busy || !loaded} onPress={() => { void choosePhoto(); }} style={[styles.photo, { backgroundColor: p.surfaceAlt, borderColor: p.border }]}>
        {picture ? <Image source={{ uri: picture }} style={StyleSheet.absoluteFill} contentFit="cover" /> : <Icon name="settings" size={38} color={p.inkMuted} />}
      </Pressable>
      <Button label={picture ? "Change photo" : "Add profile photo"} variant="secondary" busy={stage === "photo"} disabled={busy || !loaded} onPress={() => { void choosePhoto(); }} />
      <Text style={[type.label, { color: p.inkMuted }]}>Profile photo · required</Text>
    </View>
    <Text style={[type.label, { color: p.ink }]}>Name</Text>
    <TextInput accessibilityLabel="Name" autoComplete="name" textContentType="name" value={form.name} onChangeText={(name) => change({ name })} editable={!busy && loaded} maxLength={80} placeholder="Your name" placeholderTextColor={p.inkMuted} style={[styles.input, type.body, { color: p.ink, borderColor: p.border, backgroundColor: p.surface }]} />
    <Text style={[type.label, { color: p.ink }]}>Gender</Text>
    <View style={styles.choices} pointerEvents={busy || !loaded ? "none" : "auto"}>
      {GENDERS.map((gender) => <Chip key={gender.value} label={gender.label} selected={form.gender === gender.value} onPress={() => change({ gender: gender.value })} />)}
    </View>
    {form.gender === "self_describe" && <TextInput accessibilityLabel="Describe your gender" value={form.genderCustom} onChangeText={(genderCustom) => change({ genderCustom })} editable={!busy} maxLength={80} style={[styles.input, type.body, { color: p.ink, borderColor: p.border, backgroundColor: p.surface }]} />}
    <Text style={[type.label, { color: p.ink }]}>Phone number · optional</Text>
    <TextInput accessibilityLabel="Phone number with country code, optional" autoComplete="tel" keyboardType="phone-pad" value={form.phone} onChangeText={(phone) => change({ phone })} editable={!busy && loaded} maxLength={30} placeholder="+91 98765 43210" placeholderTextColor={p.inkMuted} style={[styles.input, type.body, { color: p.ink, borderColor: p.border, backgroundColor: p.surface }]} />
    <Text style={[type.label, { color: p.inkMuted }]}>Include your country code, or leave this blank.</Text>
    {(stage === "uploading" || stage === "saving") && <Text accessibilityLiveRegion="polite" style={[type.label, { color: p.inkMuted }]}>{stage === "uploading" ? "Uploading your photo…" : "Saving your profile…"}</Text>}
    {error && <Text accessibilityRole="alert" style={[type.body, { color: p.bad }]}>{error}</Text>}
    <Button label={stage === "uploading" ? "Uploading photo…" : stage === "saving" ? "Saving…" : onboarding ? "Save and continue" : "Save changes"} busy={stage === "uploading" || stage === "saving"} disabled={busy || !loaded} onPress={() => { void submit(); }} />
  </KeyboardAvoidingView>;
}
const styles = StyleSheet.create({ form: { gap: space.md }, photoBlock: { alignItems: "center", gap: space.sm, marginBottom: space.md }, photo: { width: 112, height: 112, borderRadius: 56, borderWidth: 1, overflow: "hidden", alignItems: "center", justifyContent: "center" }, choices: { flexDirection: "row", flexWrap: "wrap", gap: space.sm }, input: { borderWidth: 1, borderRadius: radius.md, padding: space.md, minHeight: 48 } });
