import { Tabs } from "expo-router";
import { FloatingTabBar } from "../../components/FloatingTabBar";
import { usePalette } from "../../lib/theme";

export default function TabsLayout() {
  const p = usePalette();
  return (
    <Tabs
      tabBar={(props) => <FloatingTabBar {...props} />}
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: p.bg } }}
    >
      <Tabs.Screen name="index" options={{ title: "Home" }} />
      <Tabs.Screen name="library" options={{ title: "Library" }} />
      <Tabs.Screen name="settings" options={{ title: "Settings" }} />
    </Tabs>
  );
}
