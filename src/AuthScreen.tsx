import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';

import { radius, spacing, type ThemePalette } from './theme';

type AuthMode = 'signin' | 'signup';

type AuthScreenProps = {
  error: string | null;
  isLoading: boolean;
  theme: ThemePalette;
  onSubmit: (input: { email: string; password: string; fullName?: string; mode: AuthMode }) => Promise<void>;
};

export function AuthScreen({ error, isLoading, onSubmit, theme }: AuthScreenProps) {
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [mode, setMode] = useState<AuthMode>('signup');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const welcomeText = useMemo(
    () =>
      mode === 'signup'
        ? 'Crie sua conta e comece com uma area pessoal so sua, com seu historico, rascunhos e movimentos isolados.'
        : 'Entre na sua area do Norte e continue exatamente de onde parou.',
    [mode],
  );

  return (
    <View style={styles.wrap}>
      <LinearGradient colors={theme.heroGradient} style={styles.previewCard}>
        <View style={styles.previewTop}>
          <View style={styles.previewBadge}>
            <Text style={styles.previewBadgeText}>Norte Cloud</Text>
          </View>
          <LinearGradient colors={theme.avatarGradient} style={styles.previewAvatar}>
            <Ionicons name="navigate" size={15} color={theme.background} />
          </LinearGradient>
        </View>

        <Text style={styles.previewTitle}>Seu assistente financeiro, com conta real e dados separados por usuario.</Text>

        <View style={styles.previewPanel}>
          <Text style={styles.previewPanelLabel}>Workspace</Text>
          <Text style={styles.previewValue}>R$ 12.480</Text>
          <View style={styles.previewActions}>
            <View style={styles.previewActionPill}>
              <Ionicons name="sparkles-outline" size={14} color={theme.text} />
              <Text style={styles.previewActionText}>IA ativa</Text>
            </View>
            <View style={styles.previewActionPill}>
              <Ionicons name="shield-checkmark-outline" size={14} color={theme.text} />
              <Text style={styles.previewActionText}>Conta segura</Text>
            </View>
          </View>
        </View>
      </LinearGradient>

      <View style={styles.content}>
        <Text style={styles.eyebrow}>Conta Norte</Text>
        <Text style={styles.title}>{mode === 'signup' ? 'Criar sua area no Norte' : 'Entrar na sua area'}</Text>
        <Text style={styles.body}>{welcomeText}</Text>

        <View style={styles.modeRow}>
          <ModePill label="Criar conta" active={mode === 'signup'} onPress={() => setMode('signup')} styles={styles} />
          <ModePill label="Entrar" active={mode === 'signin'} onPress={() => setMode('signin')} styles={styles} />
        </View>

        <View style={styles.form}>
          {mode === 'signup' ? (
            <Field
              icon="person-outline"
              value={fullName}
              onChangeText={setFullName}
              placeholder="Seu nome"
              autoCapitalize="words"
              styles={styles}
              theme={theme}
            />
          ) : null}

          <Field
            icon="mail-outline"
            value={email}
            onChangeText={setEmail}
            placeholder="Seu e-mail"
            autoCapitalize="none"
            keyboardType="email-address"
            styles={styles}
            theme={theme}
          />

          <Field
            icon="lock-closed-outline"
            value={password}
            onChangeText={setPassword}
            placeholder="Sua senha"
            secureTextEntry
            autoCapitalize="none"
            styles={styles}
            theme={theme}
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Pressable
            style={[styles.primaryButton, isLoading && styles.primaryButtonDisabled]}
            disabled={isLoading}
            onPress={() =>
              onSubmit({
                email,
                password,
                fullName,
                mode,
              })
            }
          >
            <Text style={styles.primaryButtonText}>
              {isLoading ? 'Conectando...' : mode === 'signup' ? 'Criar conta e entrar' : 'Entrar agora'}
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function ModePill({
  label,
  active,
  onPress,
  styles,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.modePill, active && styles.modePillActive]}>
      <Text style={[styles.modePillText, active && styles.modePillTextActive]}>{label}</Text>
    </Pressable>
  );
}

function Field({
  icon,
  styles,
  theme,
  ...props
}: {
  icon: keyof typeof Ionicons.glyphMap;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  autoCapitalize?: 'none' | 'words' | 'sentences' | 'characters';
  keyboardType?: 'default' | 'email-address';
  secureTextEntry?: boolean;
  styles: ReturnType<typeof createStyles>;
  theme: ThemePalette;
}) {
  return (
    <View style={styles.fieldWrap}>
      <Ionicons name={icon} size={18} color={theme.textMuted} />
      <TextInput placeholderTextColor={theme.textMuted} style={styles.field} {...props} />
    </View>
  );
}

function createStyles(theme: ThemePalette) {
  return StyleSheet.create({
    wrap: {
      gap: spacing.xl,
    },
    previewCard: {
      borderRadius: radius.lg,
      padding: spacing.xl,
      borderWidth: 1,
      borderColor: theme.borderStrong,
      gap: spacing.lg,
    },
    previewTop: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    previewBadge: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: radius.pill,
      backgroundColor: theme.id === 'dark' ? 'rgba(255,255,255,0.08)' : theme.backgroundSoft,
    },
    previewBadgeText: {
      color: theme.text,
      fontSize: 12,
      fontWeight: '700',
    },
    previewAvatar: {
      width: 38,
      height: 38,
      borderRadius: 19,
      alignItems: 'center',
      justifyContent: 'center',
    },
    previewTitle: {
      color: theme.text,
      fontSize: 24,
      lineHeight: 30,
      fontWeight: '700',
      letterSpacing: -0.8,
    },
    previewPanel: {
      borderRadius: radius.lg,
      backgroundColor: theme.surfaceSoft,
      padding: spacing.lg,
      gap: spacing.sm,
    },
    previewPanelLabel: {
      color: theme.textMuted,
      fontSize: 12,
      textTransform: 'uppercase',
      letterSpacing: 1.5,
    },
    previewValue: {
      color: theme.text,
      fontSize: 34,
      fontWeight: '700',
      letterSpacing: -1.2,
    },
    previewActions: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
    },
    previewActionPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 9,
      borderRadius: radius.pill,
      backgroundColor: theme.id === 'dark' ? 'rgba(255,255,255,0.06)' : theme.backgroundSoft,
    },
    previewActionText: {
      color: theme.text,
      fontSize: 12,
      fontWeight: '700',
    },
    content: {
      gap: spacing.md,
    },
    eyebrow: {
      color: theme.textMuted,
      fontSize: 12,
      textTransform: 'uppercase',
      letterSpacing: 1.6,
    },
    title: {
      color: theme.text,
      fontSize: 30,
      fontWeight: '700',
      letterSpacing: -1,
    },
    body: {
      color: theme.textMuted,
      fontSize: 14,
      lineHeight: 22,
    },
    modeRow: {
      flexDirection: 'row',
      gap: spacing.sm,
      marginTop: spacing.sm,
    },
    modePill: {
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: radius.pill,
      backgroundColor: theme.backgroundSoft,
      borderWidth: 1,
      borderColor: theme.border,
    },
    modePillActive: {
      backgroundColor: theme.surfaceStrong,
      borderColor: theme.borderStrong,
    },
    modePillText: {
      color: theme.textMuted,
      fontSize: 13,
      fontWeight: '700',
    },
    modePillTextActive: {
      color: theme.id === 'dark' ? '#0B0B0B' : '#FFFFFF',
    },
    form: {
      gap: spacing.md,
      marginTop: spacing.sm,
    },
    fieldWrap: {
      minHeight: 56,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surface,
      paddingHorizontal: spacing.md,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    field: {
      flex: 1,
      color: theme.text,
      fontSize: 15,
    },
    error: {
      color: theme.warning,
      fontSize: 13,
      lineHeight: 18,
    },
    primaryButton: {
      minHeight: 56,
      borderRadius: radius.pill,
      backgroundColor: theme.text,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: spacing.xl,
      marginTop: spacing.xs,
    },
    primaryButtonDisabled: {
      opacity: 0.45,
    },
    primaryButtonText: {
      color: theme.background,
      fontSize: 15,
      fontWeight: '700',
    },
  });
}
