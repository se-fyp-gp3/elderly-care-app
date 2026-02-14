// components/PinterestSplash.tsx
import { Image } from "expo-image";
import React, { useEffect } from "react";
import { Dimensions, StyleSheet, View } from "react-native";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";

const { width, height } = Dimensions.get("window");

interface PinterestSplashProps {
  onAnimationComplete: () => void;
  children: React.ReactNode;
}

export default function PinterestSplash({
  onAnimationComplete,
  children,
}: PinterestSplashProps) {
  // Animation values
  const logoScale = useSharedValue(0);
  const logoTranslateY = useSharedValue(0);
  const contentTranslateY = useSharedValue(height);
  const splashOpacity = useSharedValue(1);

  const logoAnimatedStyle = useAnimatedStyle(() => {
    return {
      transform: [
        { scale: logoScale.value },
        { translateY: logoTranslateY.value },
      ],
    };
  });

  const contentAnimatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ translateY: contentTranslateY.value }],
    };
  });

  const splashAnimatedStyle = useAnimatedStyle(() => {
    return {
      opacity: splashOpacity.value,
    };
  });

  const triggerAnimationComplete = () => {
    onAnimationComplete();
  };

  useEffect(() => {
    // Pinterest-style animation sequence
    // 1. Logo pops from center - adjust damping/stiffness to control bounce
    logoScale.value = withSpring(1, {
      damping: 10, // smaller = more bounce
      stiffness: 80, // larger = faster
    });

    // 2. Logo moves up while content slides in
    setTimeout(() => {
      logoTranslateY.value = withTiming(-height * 0.15, {
        duration: 700, // duration
      });

      contentTranslateY.value = withTiming(0, {
        duration: 600,
      });

      // 3. Fade out splash screen
      setTimeout(() => {
        splashOpacity.value = withTiming(
          0,
          {
            duration: 300,
          },
          (finished) => {
            if (finished) {
              runOnJS(triggerAnimationComplete)();
            }
          },
        );
      }, 400); // delay before fade out
    }, 800); // delay before moving up
  }, []);

  return (
    <Animated.View style={[StyleSheet.absoluteFill, splashAnimatedStyle]}>
      {/* White background */}
      <View style={styles.background} />

      {/* Logo container */}
      <Animated.View style={[styles.logoContainer, logoAnimatedStyle]}>
        <View style={styles.logo}>
          {/* Use image instead */}
          <Image
            source={require("@/assets/images/logo.png")}
            style={styles.logoImage}
            contentFit="contain"
          />
        </View>
      </Animated.View>

      {/* App content - initially below the screen */}
      <Animated.View style={[styles.contentContainer, contentAnimatedStyle]}>
        {children}
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  background: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "white",
  },
  logoContainer: {
    position: "absolute",
    top: height / 2 - 40, // centered
    left: width / 2 - 40,
    alignItems: "center",
    justifyContent: "center",
  },
  logo: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  logoImage: {
    width: 50,
    height: 50,
  },
  logoIcon: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  logoInner: {
    width: 24,
    height: 24,
    backgroundColor: "white",
    borderRadius: 2,
  },
  contentContainer: {
    flex: 1,
  },
});
