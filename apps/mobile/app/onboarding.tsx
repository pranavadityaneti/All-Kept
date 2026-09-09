import { ActivityIndicator, Text } from "react-native";
import { Button } from "../components/Button";
import { Screen } from "../components/Screen";
import { ProfileForm } from "../components/ProfileForm";
import { useProfile } from "../lib/profile";
import { useSession } from "../lib/session";
import { supabase } from "../lib/supabase";
import { type, usePalette } from "../lib/theme";
import { useState } from "react";
export default function Onboarding() {
  const p = usePalette(), session = useSession();
  const profile = useProfile(session.status === "ready" ? session.userId : null);
  const [error, setError] = useState<string | null>(null);
  const suggested = session.status === "ready" ? session.user.user_metadata?.["full_name"] : "";
  return <Screen>
    <Text style={[type.title, { color: p.ink }]}>Make yourself at home</Text>
    <Text style={[type.body, { color: p.inkMuted }]}>Add a photo and a few details to finish setting up your account.</Text>
    {profile.isPending ? <ActivityIndicator color={p.accent} /> : profile.isError || !profile.data ? <><Text style={[type.body, { color: p.bad }]}>Could not load your profile.</Text><Button label="Try again" onPress={() => { void profile.refetch(); }} /></> : <ProfileForm key={profile.data.user_id} profile={profile.data} suggestedName={typeof suggested === "string" ? suggested : ""} onboarding onSaved={() => { /* The root guard opens the library after the confirmed profile update. */ }} />}
    <Button label="Sign out" variant="secondary" onPress={() => { void supabase.auth.signOut({ scope: "local" }).then(({ error }) => { if (error) setError("Could not sign out. Please try again."); }); }} />
    {error && <Text style={[type.body, { color: p.bad }]}>{error}</Text>}
  </Screen>;
}
