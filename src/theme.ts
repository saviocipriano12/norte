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
    background: '#0B0B0B',
    backgroundElevated: '#111111',
    backgroundSoft: '#1B1B1B',
    surface: '#111111',
    surfaceSoft: '#191919',
    surfaceStrong: '#F2F2EF',
    border: 'rgba(255,255,255,0.08)',
    borderStrong: 'rgba(255,255,255,0.16)',
    text: '#F2F2EF',
    textMuted: '#A0A0A0',
    accent: '#F2F2EF',
    accentSoft: '#A0A0A0',
    accentGlow: 'rgba(255,255,255,0.16)',
    success: '#21C45A',
    warning: '#FF8A00',
    danger: '#EF4444',
    business: '#5B8CFF',
    personal: '#FFD84D',
    overlay: 'rgba(7,8,10,0.48)',
    shadow: '#040506',
    heroGradient: ['rgba(255,255,255,0.1)', 'rgba(255,255,255,0.03)'],
    drawerGradient: ['rgba(255,255,255,0.12)', 'rgba(255,255,255,0.03)'],
    avatarGradient: ['#F2F2EF', '#777777'],
  },
  light: {
    id: 'light',
    background: '#E8E8E5',
    backgroundElevated: '#F2F2EF',
    backgroundSoft: '#F2F2EF',
    surface: '#FFFFFF',
    surfaceSoft: '#F8F8F5',
    surfaceStrong: '#111111',
    border: '#D8D8D4',
    borderStrong: '#0B0B0B',
    text: '#0B0B0B',
    textMuted: '#777777',
    accent: '#111111',
    accentSoft: '#777777',
    accentGlow: 'rgba(11,11,11,0.08)',
    success: '#21C45A',
    warning: '#FF8A00',
    danger: '#EF4444',
    business: '#5B8CFF',
    personal: '#FFD84D',
    overlay: 'rgba(24,30,38,0.14)',
    shadow: '#9B9B96',
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
  sm: 10,
  md: 14,
  lg: 20,
  pill: 999,
};
