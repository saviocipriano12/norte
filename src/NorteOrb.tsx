import { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import type { OrbMode } from './mockData';
import type { ThemePalette } from './theme';

type NorteOrbProps = {
  mode: OrbMode;
  theme: ThemePalette;
  size?: number;
  amplitude?: number;
};

const modeMotion: Record<OrbMode, { scale: number; duration: number; glow: number }> = {
  idle: { scale: 1, duration: 9000, glow: 0.58 },
  listening: { scale: 1.08, duration: 4700, glow: 0.9 },
  thinking: { scale: 0.94, duration: 2600, glow: 0.78 },
  responding: { scale: 1.12, duration: 3800, glow: 1 },
};

function makeParticles(count: number) {
  return Array.from({ length: count }, (_, index) => {
    const angle = (index / count) * Math.PI * 2;
    const ring = 0.22 + ((index * 17) % 61) / 100;
    const depth = 0.35 + ((index * 29) % 65) / 100;

    return {
      id: `particle-${index}`,
      left: 50 + Math.cos(angle) * ring * 42,
      top: 50 + Math.sin(angle) * ring * 42,
      size: 1.2 + depth * 1.4,
      opacity: 0.22 + depth * 0.7,
    };
  });
}

export function NorteOrb({ mode, theme, size = 280, amplitude = 0 }: NorteOrbProps) {
  const rotation = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(1)).current;
  const glow = useRef(new Animated.Value(modeMotion[mode].glow)).current;
  const particles = useMemo(() => makeParticles(72), []);
  const motion = modeMotion[mode];
  const audioScale = 1 + Math.max(0, Math.min(1, amplitude)) * 0.1;
  const particleColor = theme.id === 'dark' ? '#F5F7FA' : '#181E26';

  useEffect(() => {
    rotation.stopAnimation();
    rotation.setValue(0);
    const loop = Animated.loop(
      Animated.timing(rotation, {
        toValue: 1,
        duration: motion.duration,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();

    Animated.parallel([
      Animated.timing(scale, {
        toValue: motion.scale * audioScale,
        duration: 500,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(glow, {
        toValue: motion.glow,
        duration: 500,
        useNativeDriver: false,
      }),
    ]).start();

    return () => loop.stop();
  }, [audioScale, glow, mode, motion.duration, motion.glow, motion.scale, rotation, scale]);

  const rotate = rotation.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const haloOpacity = glow.interpolate({ inputRange: [0, 1], outputRange: [0.12, 0.42] });

  return (
    <View style={[styles.shell, { width: size, height: size }]}>
      <Animated.View
        style={[
          styles.halo,
          {
            width: size * 0.82,
            height: size * 0.82,
            borderRadius: size,
            backgroundColor: theme.accentGlow,
            opacity: haloOpacity,
            transform: [{ scale }],
          },
        ]}
      />

      <Animated.View style={[styles.particleField, { transform: [{ rotate }, { scale }] }]}> 
        {particles.map((particle) => (
          <View
            key={particle.id}
            style={{
              position: 'absolute',
              left: `${particle.left}%`,
              top: `${particle.top}%`,
              width: particle.size,
              height: particle.size,
              borderRadius: particle.size,
              backgroundColor: particleColor,
              opacity: particle.opacity,
            }}
          />
        ))}
      </Animated.View>

      <Animated.View style={[styles.core, { transform: [{ scale }] }]}>
        <LinearGradient
          colors={[theme.accent, theme.accentSoft, 'transparent']}
          start={{ x: 0.25, y: 0.18 }}
          end={{ x: 0.86, y: 0.9 }}
          style={[styles.coreGradient, { width: size * 0.35, height: size * 0.35, borderRadius: size }]} 
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  halo: {
    position: 'absolute',
  },
  particleField: {
    position: 'absolute',
    width: '100%',
    height: '100%',
  },
  core: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  coreGradient: {
    shadowColor: '#FFFFFF',
    shadowOpacity: 0.24,
    shadowRadius: 22,
    elevation: 8,
  },
});
