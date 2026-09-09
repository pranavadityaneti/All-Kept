import { ActivityIndicator, Text } from "react-native";
import { Button } from "../components/Button";
import { ProfileScreen } from "../components/ProfileScreen";
import { ProfileForm } from "../components/ProfileForm";
import { useProfile } from "../lib/profile";
import { useSession } from "../lib/session";
import { type, usePalette } from "../lib/theme";
export default function Onboarding() {
  const p = usePalette("light"), session = useSession();
  const profile = useProfile(session.status === "ready" ? session.userId : null);
  const suggested = session.status === "ready" ? session.user.user_metadata?.["full_name"] : "";
  return <ProfileScreen title="Your profile" light>
    {profile.isPending ? <ActivityIndicator color={p.accent} /> : profile.isError || !profile.data ? <><Text style={[type.body, { color: p.bad }]}>Could not load your profile.</Text><Button label="Try again" light onPress={() => { void profile.refetch(); }} /></> : <ProfileForm key={profile.data.user_id} profile={profile.data} suggestedName={typeof suggested === "string" ? suggested : ""} onboarding onSaved={() => { /* The root guard opens the library after the confirmed profile update. */ }} />}
  </ProfileScreen>;
}
