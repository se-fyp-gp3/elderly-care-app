// components/PinterestSplash.tsx
import { Image } from 'expo-image';
import React, { useEffect } from 'react';
import { Dimensions, StyleSheet, View } from 'react-native';
import Animated, {
    runOnJS,
    useAnimatedStyle,
    useSharedValue,
    withSpring,
    withTiming,
} from 'react-native-reanimated';

const { width, height } = Dimensions.get('window');

interface PinterestSplashProps {
  onAnimationComplete: () => void;
  children: React.ReactNode;
}

export default function PinterestSplash({ onAnimationComplete, children }: PinterestSplashProps) {
  // 动画值
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
    // Pinterest 风格动画序列
    // 1. Logo 从中间弹出, Logo 弹出效果 - 调整阻尼和刚度改变弹跳效果
    logoScale.value = withSpring(1, {
      damping: 10,// 越小弹跳越多
      stiffness: 80,// 越大速度越快
    });

    // 2. Logo 上移并同时内容上滑, 上移动画 - 调整持续时间和距离
    setTimeout(() => {
      logoTranslateY.value = withTiming(-height * 0.15, { 
        duration: 700 // 持续时间
      });
      
      contentTranslateY.value = withTiming(0, { 
        duration: 600 
      });

      // 3. 淡出启动画面, 淡出时间
      setTimeout(() => {
        splashOpacity.value = withTiming(0, { 
          duration: 300 
        }, (finished) => {
          if (finished) {
            runOnJS(triggerAnimationComplete)();
          }
        });
      }, 400);// 延迟淡出
    }, 800);// 延迟开始上移
  }, []);

  return (
    <Animated.View style={[StyleSheet.absoluteFill, splashAnimatedStyle]}>
      {/* 白色背景 */}
      <View style={styles.background} />
      
      {/* Logo 容器 */}
      <Animated.View style={[styles.logoContainer, logoAnimatedStyle]}>
        <View style={styles.logo}>
            {/* 使用图片替代 */}
            <Image
            source={require('@/assets/images/logo.png')}
            style={styles.logoImage}
            contentFit="contain"
            />
        </View>
        </Animated.View>

      {/* 应用内容 - 初始在屏幕下方 */}
      <Animated.View style={[styles.contentContainer, contentAnimatedStyle]}>
        {children}
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  background: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'white',
  },
  logoContainer: {
    position: 'absolute',
    top: height / 2 - 40, // 居中
    left: width / 2 - 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
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
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoInner: {
    width: 24,
    height: 24,
    backgroundColor: 'white',
    borderRadius: 2,
  },
  contentContainer: {
    flex: 1,
  },
});