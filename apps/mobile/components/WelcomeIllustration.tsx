import { PlatformLogo } from "./PlatformLogo";
import { useEffect, useRef } from "react";
import { Animated, StyleSheet, View, useWindowDimensions } from "react-native";
import { Image } from "expo-image";
import { useReducedMotion } from "../lib/motion";

/** Approved cinematic fan artwork, separate from the live text and sign-in control. */
export function WelcomeIllustration() {
  const { width, height } = useWindowDimensions(), reduced = useReducedMotion();
  const reveal = useRef(new Animated.Value(1)).current;
  const size = Math.min(width - 24, Math.max(250, height * 0.44), 430);
  useEffect(() => {
    if (reduced) { reveal.setValue(1); return; }
    reveal.setValue(0);
    const animation = Animated.timing(reveal, { toValue: 1, duration: 550, useNativeDriver: true });
    animation.start();
    return () => animation.stop();
  }, [reduced, reveal]);
  return <Animated.View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.frame, { width: size, height: size, opacity: reveal, transform: [{ translateY: reveal.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }] }]}>
    <View collapsable={false} style={[StyleSheet.absoluteFill, styles.artwork]}><Image source={require("../assets/welcome/cinematic-fan-clean.png")} style={StyleSheet.absoluteFill} contentFit="contain" /></View>
    <View style={{ position: "absolute", left: size * 0.073, top: size * 0.211, transform: [{ rotate: "-10deg" }] }}><PlatformLogo platform="instagram" size={size * 0.06} appearance="dark" /></View>
    <View style={{ position: "absolute", left: size * 0.862, top: size * 0.209, transform: [{ rotate: "10deg" }] }}><PlatformLogo platform="youtube" size={size * 0.065} appearance="dark" /></View>
  </Animated.View>;
}
const styles = StyleSheet.create({ frame: { alignSelf: "center", backgroundColor: "#0E0F14", borderRadius: 30, overflow: "hidden", shadowColor: "#30256A", shadowOffset: { width: 0, height: 14 }, shadowOpacity: 0.16, shadowRadius: 24, elevation: 8 }, artwork: { backgroundColor: "#0E0F14" } });
