import { useRouter } from "expo-router";
import { ActivityIndicator } from "react-native";
import { Button } from "../components/Button";
import { ProfileForm } from "../components/ProfileForm";
import { ProfileScreen } from "../components/ProfileScreen";
import { useProfile } from "../lib/profile";
import { useSession } from "../lib/session";
import { usePalette } from "../lib/theme";
export default function EditProfile() {
  const p = usePalette(), router = useRouter(), session = useSession();
  const profile = useProfile(session.status === "ready" ? session.userId : null);
  return <ProfileScreen title="Edit profile" onBack={() => router.back()}>
    {profile.isPending ? <ActivityIndicator color={p.accent} /> : profile.data ? <ProfileForm profile={profile.data} suggestedName="" onboarding={false} onSaved={() => router.back()} /> : <Button label="Retry loading profile" onPress={() => { void profile.refetch(); }} />}
  </ProfileScreen>;
}
