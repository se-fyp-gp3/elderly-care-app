// components/SplashScreen.tsx
import { useAssets } from "expo-asset";
import { Image } from "expo-image";
import React, { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Dimensions, StyleSheet, View } from "react-native";
import { Text, useTheme } from "react-native-paper";
import Animated, {
    runOnJS,
    useAnimatedStyle,
    useSharedValue,
    withDelay,
    withSequence,
    withTiming,
} from "react-native-reanimated";

const { width, height } = Dimensions.get("window");

interface SplashScreenProps {
  onAnimationComplete: () => void;
}

export default function SplashScreen({
  onAnimationComplete,
}: SplashScreenProps) {
  const theme = useTheme();
  const { t } = useTranslation();
  const [assets] = useAssets([require("@/assets/images/logo.png")]);

  // 动画值
  const logoScale = useSharedValue(0);
  const logoPosition = useSharedValue(0);
  const logoOpacity = useSharedValue(0);
  const contentTranslateY = useSharedValue(100);
  const contentOpacity = useSharedValue(0);

  const logoAnimatedStyle = useAnimatedStyle(() => {
    return {
      transform: [
        { scale: logoScale.value },
        { translateY: logoPosition.value },
      ],
      opacity: logoOpacity.value,
    };
  });

  const contentAnimatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ translateY: contentTranslateY.value }],
      opacity: contentOpacity.value,
    };
  });

  const triggerAnimationComplete = () => {
    onAnimationComplete();
  };

  useEffect(() => {
    // 启动动画序列
    logoOpacity.value = withTiming(1, { duration: 500 });

    logoScale.value = withSequence(
      withTiming(1.2, { duration: 600 }),
      withTiming(1, { duration: 400 }),
    );

    // logo 移动到顶部
    logoPosition.value = withDelay(
      1000,
      withTiming(-height * 0.3, { duration: 800 }, (finished) => {
        if (finished) {
          // logo 移动完成后，开始内容动画
          contentOpacity.value = withTiming(1, { duration: 500 });
          contentTranslateY.value = withTiming(
            0,
            { duration: 600 },
            (contentFinished) => {
              if (contentFinished) {
                runOnJS(triggerAnimationComplete)();
              }
            },
          );
        }
      }),
    );
  }, []);

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.primary }]}>
      {/* Logo */}
      <Animated.View style={[styles.logoContainer, logoAnimatedStyle]}>
        <View style={styles.logo}>
          {assets ? (
            <Image
              source={assets[0]}
              style={styles.logoImage}
              contentFit="contain"
            />
          ) : (
            <Text style={styles.logoText} variant="displayMedium">
              👵
            </Text>
          )}
          <Text
            style={[styles.logoText, styles.logoTitle]}
            variant="headlineMedium"
          >
            Elderly Care
          </Text>
        </View>
      </Animated.View>

      {/* 应用内容 - 初始时隐藏，动画时显示 */}
      <Animated.View style={[styles.content, contentAnimatedStyle]}>
        <Text style={styles.welcomeText} variant="titleLarge">
          {t('common.welcomeToElderlyCare')}
        </Text>
        <Text style={styles.subtitle} variant="bodyMedium">
          {t('common.provideServices')}
        </Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  logoImage: {
    width: 120,
    height: 120,
  },
  logoContainer: {
    position: "absolute",
    alignItems: "center",
  },
  logo: {
    alignItems: "center",
  },
  logoText: {
    color: "white",
    textAlign: "center",
  },
  logoTitle: {
    marginTop: 8,
    fontWeight: "bold",
  },
  content: {
    position: "absolute",
    bottom: height * 0.2,
    alignItems: "center",
    width: "100%",
    paddingHorizontal: 32,
  },
  welcomeText: {
    color: "white",
    textAlign: "center",
    marginBottom: 8,
    fontWeight: "bold",
  },
  subtitle: {
    color: "rgba(255, 255, 255, 0.8)",
    textAlign: "center",
  },
});
