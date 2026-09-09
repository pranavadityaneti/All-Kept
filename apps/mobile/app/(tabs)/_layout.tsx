import { Tabs } from "expo-router";
import { Icon } from "../../components/Icon";
import { space, type, usePalette } from "../../lib/theme";

export default function TabsLayout() {
  const p = usePalette();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: p.accent,
        tabBarInactiveTintColor: p.inkMuted,
        tabBarStyle: { backgroundColor: p.surface, borderTopColor: p.border, borderTopWidth: 1 },
        tabBarLabelStyle: { fontSize: type.label.fontSize, fontWeight: type.label.fontWeight, marginTop: space.xs / 2 },
        sceneStyle: { backgroundColor: p.bg },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Home", tabBarIcon: ({ color }) => <Icon name="home" color={color} /> }} />
      <Tabs.Screen name="library" options={{ title: "Library", tabBarIcon: ({ color }) => <Icon name="library" color={color} /> }} />
      <Tabs.Screen name="settings" options={{ title: "Settings", tabBarIcon: ({ color }) => <Icon name="settings" color={color} /> }} />
    </Tabs>
  );
}
