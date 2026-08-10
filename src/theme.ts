export type ThemeMode = 'dark' | 'light';

export type ThemePalette = {
  id: ThemeMode;
  background: string;
  backgroundElevated: string;
  backgroundSoft: string;
  surface: string;
  surfaceSoft: string;
  surfaceStrong: string;
  border: string;
  borderStrong: string;
  text: string;
  textMuted: string;
  accent: string;
  accentSoft: string;
  accentGlow: string;
  success: string;
  warning: string;
  danger: string;
  business: string;
  personal: string;
  overlay: string;
  shadow: string;
  heroGradient: [string, string];
  drawerGradient: [string, string];
  avatarGradient: [string, string];
};

export const appThemes: Record<ThemeMode, ThemePalette> = {
  dark: {
    id: 'dark',
    background: '#0E1013',
    backgroundElevated: '#15181C',
    backgroundSoft: '#1D2127',
    surface: '#171B20',
    surfaceSoft: '#20252C',
    surfaceStrong: '#2A3038',
    border: 'rgba(255,255,255,0.08)',
    borderStrong: 'rgba(255,255,255,0.14)',
    text: '#F5F7FA',
    textMuted: '#9BA6B5',
    accent: '#EAEFF8',
    accentSoft: '#B3C3DA',
    accentGlow: 'rgba(218,228,243,0.18)',
    success: '#70D7AF',
    warning: '#E9B56B',
    danger: '#F08A8A',
    business: '#8FBBDC',
    personal: '#E2CB8B',
    overlay: 'rgba(7,8,10,0.48)',
    shadow: '#040506',
    heroGradient: ['rgba(255,255,255,0.1)', 'rgba(255,255,255,0.03)'],
    drawerGradient: ['rgba(255,255,255,0.12)', 'rgba(255,255,255,0.03)'],
    avatarGradient: ['#F4F7FB', '#B2C4DB'],
  },
  light: {
    id: 'light',
    background: '#FAF9F6',
    backgroundElevated: '#FFFFFF',
    backgroundSoft: '#F2F0E8',
    surface: '#FFFFFF',
    surfaceSoft: '#F6F3EC',
    surfaceStrong: '#EEE9DE',
    border: 'rgba(24,30,38,0.08)',
    borderStrong: 'rgba(24,30,38,0.15)',
    text: '#181E26',
    textMuted: '#697485',
    accent: '#10151C',
    accentSoft: '#566274',
    accentGlow: 'rgba(24,30,38,0.08)',
    success: '#2E9A6D',
    warning: '#C58539',
    danger: '#CE6161',
    business: '#4F84A7',
    personal: '#B7862A',
    overlay: 'rgba(24,30,38,0.14)',
    shadow: '#BCC4D0',
    heroGradient: ['rgba(255,255,255,0.98)', 'rgba(240,236,228,0.88)'],
    drawerGradient: ['rgba(255,255,255,0.98)', 'rgba(242,239,232,0.92)'],
    avatarGradient: ['#10151C', '#5F6D7D'],
  },
};

export const spacing = {
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 28,
  xxl: 36,
};

export const radius = {
  sm: 14,
  md: 20,
  lg: 28,
  pill: 999,
};
