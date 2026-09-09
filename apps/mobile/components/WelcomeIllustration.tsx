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
  return <Animated.View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ alignSelf: "center", width: size, height: size, opacity: reveal, transform: [{ translateY: reveal.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }] }}>
    <View collapsable={false} style={[StyleSheet.absoluteFill, { backgroundColor: "#0E0F14" }]} />
    <View collapsable={false} style={{ width: "100%", height: "100%", mixBlendMode: "lighten" }}><Image source={require("../assets/welcome/cinematic-fan.png")} style={{ width: "100%", height: "100%" }} contentFit="contain" /></View>
  </Animated.View>;
}
