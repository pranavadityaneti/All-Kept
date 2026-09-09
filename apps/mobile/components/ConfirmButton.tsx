import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, ActivityIndicator, Animated, Pressable, StyleSheet, View } from "react-native";
import * as Haptics from "expo-haptics";
import { Icon } from "./Icon";
import { usePalette } from "../lib/theme";
import { useReducedMotion } from "../lib/motion";

/** An accessible, reusable submit action. Success is shown only after confirmation. */
export function ConfirmButton({ label, disabled, onConfirm, onComplete, light = false }: {
  label: string; disabled?: boolean; onConfirm: () => Promise<boolean>; onComplete: () => void; light?: boolean;
}) {
  const p = usePalette(light ? "light" : undefined), reduced = useReducedMotion();
  const [state, setState] = useState<"idle" | "working" | "done">("idle");
  const scale = useRef(new Animated.Value(1)).current;
  const halo = useRef(new Animated.Value(0)).current;
  const active = useRef(false), mounted = useRef(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; if (timer.current) clearTimeout(timer.current); scale.stopAnimation(); halo.stopAnimation(); }; }, [scale, halo]);
  useEffect(() => {
    if (state !== "working" || reduced) { halo.setValue(0); return; }
    const animation = Animated.loop(Animated.sequence([
      Animated.timing(halo, { toValue: 1, duration: 700, useNativeDriver: true }),
      Animated.timing(halo, { toValue: 0, duration: 700, useNativeDriver: true }),
    ]));
    animation.start();
    return () => animation.stop();
  }, [state, reduced, halo]);
  const animatePress = (value: number) => { if (!reduced) Animated.spring(scale, { toValue: value, useNativeDriver: true, speed: 28, bounciness: 5 }).start(); };
  const confirm = async () => {
    if (disabled || active.current) return;
    active.current = true; setState("working");
    try {
      const saved = await onConfirm();
      if (!mounted.current) return;
      if (!saved) { active.current = false; setState("idle"); return; }
      setState("done");
      AccessibilityInfo.announceForAccessibility("Profile saved");
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      if (!reduced) {
        scale.setValue(0.85);
        Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 18, bounciness: 12 }).start();
      }
      timer.current = setTimeout(() => { if (mounted.current) onComplete(); }, reduced ? 150 : 450);
    } catch {
      if (mounted.current) { active.current = false; setState("idle"); }
    }
  };
  return <View style={styles.wrap}>
    <Animated.View pointerEvents="none" style={[styles.halo, { backgroundColor: p.accentSoft, opacity: halo.interpolate({ inputRange: [0, 1], outputRange: [0, 0.8] }), transform: [{ scale: halo.interpolate({ inputRange: [0, 1], outputRange: [1, 1.2] }) }] }]} />
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable accessibilityRole="button" accessibilityLabel={state === "done" ? "Profile saved" : label} accessibilityHint="Saves your profile details" accessibilityState={{ disabled: !!disabled || state !== "idle", busy: state === "working" }} disabled={disabled || state !== "idle"} onPress={() => { void confirm(); }} onPressIn={() => animatePress(0.93)} onPressOut={() => animatePress(1)} style={[styles.button, { backgroundColor: state === "done" ? p.good : p.accent, opacity: disabled && state === "idle" ? 0.4 : 1 }]}>
        {state === "working" ? <ActivityIndicator color={p.accentInk} /> : <Icon name="check" size={30} color={state === "done" ? p.bg : p.accentInk} />}
      </Pressable>
    </Animated.View>
  </View>;
}
const styles = StyleSheet.create({ wrap: { width: 88, height: 88, alignSelf: "center", alignItems: "center", justifyContent: "center" }, halo: { position: "absolute", width: 74, height: 74, borderRadius: 37 }, button: { width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center" } });
