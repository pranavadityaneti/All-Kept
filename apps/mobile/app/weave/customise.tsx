import { Redirect, useLocalSearchParams } from "expo-router";

/**
 * Customise was a separate form that read its profile from memory, so a restart left it a dead end
 * and its choices were lost on the way back. They now live on the trip screen, under More options,
 * kept with the trip; this address — still reachable from anything that saved it — goes there.
 */
export default function Customise() {
  const { weaveId } = useLocalSearchParams<{ weaveId?: string }>();
  return <Redirect href={{ pathname: "/weave", params: weaveId ? { weaveId, options: "1" } : {} }} />;
}
