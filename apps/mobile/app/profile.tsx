import { useRouter } from "expo-router";
import { ActivityIndicator, Text } from "react-native";
import { Button } from "../components/Button";
import { ProfileForm } from "../components/ProfileForm";
import { Screen } from "../components/Screen";
import { useProfile } from "../lib/profile";
import { useSession } from "../lib/session";
import { type, usePalette } from "../lib/theme";
export default function EditProfile() {
  const p = usePalette(), router = useRouter(), session = useSession();
  const profile = useProfile(session.status === "ready" ? session.userId : null);
  return <Screen><Text style={[type.title, { color: p.ink }]}>Edit profile</Text>
    {profile.isPending ? <ActivityIndicator color={p.accent} /> : profile.data ? <ProfileForm profile={profile.data} suggestedName="" onboarding={false} onSaved={() => router.back()} /> : <Button label="Retry loading profile" onPress={() => { void profile.refetch(); }} />}
    <Button label="Back to Settings" variant="secondary" onPress={() => router.back()} />
  </Screen>;
}
