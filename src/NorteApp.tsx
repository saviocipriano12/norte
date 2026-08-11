import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import {
  Alert,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';

import type { AssistantTurnResponse } from './assistantTypes';
import { AuthScreen } from './AuthScreen';
import {
  applyMovementToAccounts,
  buildCashForecast,
  buildMovementFromDraft,
  formatMovementDate,
  movementBusinessWeight,
  parseCurrencyInput,
  parseDraftCorrectionAmount,
  parseDraftCorrectionDate,
  parseFinanceMessage,
} from './financeEngine';
import { NorteOrb } from './NorteOrb';
import { getMerchantPresentation, getSuggestedMerchantCategory } from './merchantCatalog';
import { previewStatementCsv, type StatementPreviewItem } from './statementImport';
import { createRealtimeTransport, isRealtimeVoiceSupported, type RealtimeTransport } from './realtimeTransport';
import {
  askNorteAssistant,
  createNorteRealtimeSession,
  getNorteApiBaseUrl,
  getNorteAssistantHealth,
  speakNorteText,
  syncNorteAssistantTurn,
  transcribeNorteAudio,
  type NorteAssistantHealth,
} from './norteApi';
import {
  goals,
  initialAccounts,
  initialCategories,
  initialCards,
  initialAssistantInput,
  initialDrafts,
  initialMessages,
  initialMovements,
  onboardingProfiles,
  painPoints,
  upcomingBills,
  type Account,
  type AppTab,
  type DraftEntry,
  type EntryContext,
  type FinancialCategory,
  type FinancialConnection,
  type Goal,
  type Message,
  type Movement,
  type MovementCategory,
  type OrbMode,
  type UpcomingBill,
  type WalletCard,
} from './mockData';
import { loadPersistedState, removePersistedState, savePersistedState } from './storage';
import {
  createMovement,
  createFinancialCategory,
  updateFinancialCategory,
  createFinancialConnection,
  payCardInvoice,
  createGoal,
  createScheduledBill,
  createWalletAccount,
  createWalletCard,
  deleteMovement,
  deleteGoal,
  deleteScheduledBill,
  setScheduledBillPaid,
  deleteRemoteDraft,
  deleteWalletAccount,
  setWalletAccountArchived,
  setFinancialCategoryArchived,
  deleteWalletCard,
  ensureUserProfile,
  loadWorkspaceSnapshot,
  persistConfirmedDrafts,
  updateMovement,
  updateRemoteDraftAmount,
  updateRemoteDraftCategory,
  updateRemoteDraftOccurredAt,
  updateRemoteDraftContext,
  updateGoal,
  updateScheduledBill,
  updateWalletAccount,
  updateWalletCard,
} from './supabaseData';
import { isSupabaseConfigured, supabase } from './supabase';
import { appThemes, radius, spacing, type ThemeMode, type ThemePalette } from './theme';

const STORAGE_KEY = '@norte/mvp-state-v1';

const currency = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

type OnboardingProfile = (typeof onboardingProfiles)[number]['id'];
type FocusPanel = 'business' | 'analysis' | 'settings';
type DrawerDestination = AppTab | FocusPanel;

type ManualEntryState = {
  title: string;
  amount: string;
  date: string;
  type: 'income' | 'expense';
  context: EntryContext;
  category: MovementCategory;
  accountId: string;
  cardId: string;
};

type AccountFormState = {
  name: string;
  detail: string;
  balance: string;
  kind: string;
  isBusiness: boolean;
};

type CardFormState = {
  name: string;
  limit: string;
  used: string;
  walletAccountId: string;
  closingDay: string;
  dueDay: string;
  brand: string;
  isBusiness: boolean;
};

type GoalFormState = {
  title: string;
  target: string;
  current: string;
  targetDate: string;
};

type BillFormState = {
  title: string;
  amount: string;
  due: string;
  context: EntryContext;
  isRecurring: boolean;
};

type CategoryFormState = {
  name: string;
  icon: string;
  color: string;
  context: EntryContext | null;
};
type ConnectionFormState = {
  institutionName: string;
  linkedAccountId: string;
};
type CardPaymentFormState = {
  cardId: string;
  walletAccountId: string;
  amount: string;
};

type MovementTypeFilter = 'all' | 'income' | 'expense';
type MovementContextFilter = 'all' | EntryContext;
type MovementCategoryFilter = 'all' | MovementCategory;
type MovementPeriodFilter = 'all' | 'today' | 'week' | 'month';
type MovementSort = 'newest' | 'oldest' | 'highest' | 'lowest';
type ForecastMode = 'normal' | 'conservative';
type FinancialHealth = 'starting' | 'healthy' | 'stable' | 'attention' | 'critical';
type PendingMovementDeletion = {
  movement: Movement;
  timeoutId: ReturnType<typeof setTimeout>;
};

type PersistedState = {
  step: 'welcome' | 'onboarding' | 'app';
  onboardingIndex: number;
  profile: OnboardingProfile;
  selectedPain: string[];
  themeMode: ThemeMode;
  activeTab: AppTab;
  focusPanel: FocusPanel;
  messages: Message[];
  drafts: DraftEntry[];
  movements: Movement[];
  accounts: Account[];
  cards: WalletCard[];
  goals?: Goal[];
  upcomingBills?: UpcomingBill[];
  categories?: FinancialCategory[];
  connections?: FinancialConnection[];
  assistantInput: string;
};

const dockTabItems: Array<{
  key: AppTab;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  activeIcon: keyof typeof Ionicons.glyphMap;
}> = [
  { key: 'home', label: 'Home', icon: 'home-outline', activeIcon: 'home' },
  { key: 'moves', label: 'Movs', icon: 'swap-horizontal-outline', activeIcon: 'swap-horizontal' },
  { key: 'wallet', label: 'Carteira', icon: 'wallet-outline', activeIcon: 'wallet' },
  { key: 'plan', label: 'Metas', icon: 'flag-outline', activeIcon: 'flag' },
];

const leftDockTabs = dockTabItems.slice(0, 2);
const rightDockTabs = dockTabItems.slice(2);
const goalAccentPalette = ['#111111', '#21C45A', '#FF8A00', '#5B8CFF', '#FFD84D'];
const assistantPromptSuggestions = [
  'Organize meu dia financeiro',
  'Quanto posso gastar hoje?',
  'Minha fatura esta alta?',
  'O que vence esta semana?',
];
const styleCache = new Map<ThemeMode, ReturnType<typeof createStyles>>();
let palette: ThemePalette = appThemes.dark;
let activeThemeMode: ThemeMode = 'dark';
let styles = createStyles(palette);

function getStyles(themeMode: ThemeMode) {
  const cached = styleCache.get(themeMode);

  if (cached) {
    return cached;
  }

  const nextStyles = createStyles(appThemes[themeMode]);
  styleCache.set(themeMode, nextStyles);
  return nextStyles;
}

const defaultManualEntry: ManualEntryState = {
  title: '',
  amount: '',
  date: new Date().toISOString().slice(0, 10),
  type: 'expense',
  context: 'Pessoal',
  category: 'Outros',
  accountId: '',
  cardId: '',
};

const defaultAccountForm: AccountFormState = {
  name: '',
  detail: '',
  balance: '0',
  kind: 'cash',
  isBusiness: false,
};

const defaultCardForm: CardFormState = {
  name: '',
  limit: '',
  used: '',
  walletAccountId: '',
  closingDay: '8',
  dueDay: '15',
  brand: 'Credito',
  isBusiness: false,
};

const defaultGoalForm: GoalFormState = {
  title: '',
  target: '',
  current: '0',
  targetDate: '',
};

const defaultBillForm: BillFormState = {
  title: '',
  amount: '',
  due: '',
  context: 'Pessoal',
  isRecurring: false,
};

const categoryIconOptions = ['pricetag-outline', 'restaurant-outline', 'car-outline', 'briefcase-outline', 'home-outline', 'cart-outline', 'heart-outline', 'sparkles-outline'];
const categoryColorOptions = ['#111111', '#21C45A', '#FF8A00', '#5B8CFF', '#FFD84D', '#EF4444'];
const defaultCategoryForm: CategoryFormState = { name: '', icon: 'pricetag-outline', color: '#5B8CFF', context: null };
const defaultConnectionForm: ConnectionFormState = { institutionName: '', linkedAccountId: '' };
const defaultCardPaymentForm: CardPaymentFormState = { cardId: '', walletAccountId: '', amount: '' };

function sumAmounts(items: Array<{ amount: number }>) {
  return items.reduce((total, item) => total + item.amount, 0);
}

function personalContextWeight(context: EntryContext | undefined) {
  return context === 'Negocio' ? 0 : context === 'Compartilhado' ? 0.5 : 1;
}

function createMessage(role: 'user' | 'assistant', text: string): Message {
  return {
    id: `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    role,
    text,
  };
}

function confirmDestructiveAction(title: string, message: string, onConfirm: () => void | Promise<void>) {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined' && window.confirm(`${title}\n\n${message}`)) {
      void onConfirm();
    }
    return;
  }

  Alert.alert(title, message, [
    { text: 'Cancelar', style: 'cancel' },
    { text: 'Excluir', style: 'destructive', onPress: () => void onConfirm() },
  ]);
}

function showNotice(title: string, message: string) {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined') {
      window.alert(`${title}\n\n${message}`);
    }
    return;
  }

  Alert.alert(title, message);
}

function isValidIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

function normalizeEntryDate(value: string) {
  const trimmed = value.trim();

  if (isValidIsoDate(trimmed)) {
    return trimmed;
  }

  const brazilianDate = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!brazilianDate) {
    return null;
  }

  const isoDate = `${brazilianDate[3]}-${brazilianDate[2]}-${brazilianDate[1]}`;
  return isValidIsoDate(isoDate) ? isoDate : null;
}

function buildMovementTimestamp(date: string, previousTimestamp?: string) {
  const time = previousTimestamp?.match(/T(\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z)$/)?.[1] ?? new Date().toISOString().split('T')[1];
  return `${date}T${time}`;
}

function isMovementInPeriod(createdAt: string, period: MovementPeriodFilter) {
  if (period === 'all') {
    return true;
  }

  const movementDate = new Date(createdAt);
  if (Number.isNaN(movementDate.getTime())) {
    return false;
  }

  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (period === 'today') {
    return movementDate >= startToday;
  }

  if (period === 'week') {
    const startWeek = new Date(startToday);
    startWeek.setDate(startWeek.getDate() - ((startWeek.getDay() + 6) % 7));
    return movementDate >= startWeek;
  }

  return movementDate.getFullYear() === now.getFullYear() && movementDate.getMonth() === now.getMonth();
}

function formatBillDue(value: string) {
  const date = isValidIsoDate(value) ? new Date(`${value}T12:00:00`) : null;

  if (!date || Number.isNaN(date.getTime())) {
    return value;
  }

  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const startOfDue = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const dayDifference = Math.round((startOfDue.getTime() - startOfToday.getTime()) / 86400000);

  if (dayDifference === 0) {
    return 'Hoje';
  }

  if (dayDifference === 1) {
    return 'Amanha';
  }

  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}

function formatAuthError(error: unknown) {
  const message = error instanceof Error ? error.message : '';
  const normalized = message.toLowerCase();

  if (normalized.includes('invalid login credentials')) return 'E-mail ou senha incorretos. Confira e tente novamente.';
  if (normalized.includes('email not confirmed')) return 'Confirme seu e-mail antes de entrar na conta.';
  if (normalized.includes('user already registered') || normalized.includes('already been registered')) return 'Este e-mail ja possui uma conta. Tente entrar.';
  if (normalized.includes('password') && normalized.includes('at least')) return 'A senha precisa ter pelo menos 6 caracteres.';
  if (normalized.includes('email rate limit') || normalized.includes('too many requests')) return 'Muitas tentativas. Aguarde um pouco antes de tentar novamente.';
  if (normalized.includes('unable to validate email') || normalized.includes('invalid email')) return 'Informe um e-mail valido para continuar.';
  if (normalized.includes('network') || normalized.includes('fetch')) return 'Nao foi possivel conectar. Verifique sua internet e tente novamente.';

  return message || 'Nao foi possivel autenticar agora. Tente novamente.';
}

function isBillOverdue(value: string) {
  if (!isValidIsoDate(value)) {
    return false;
  }

  const due = new Date(`${value}T12:00:00`);
  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return due < startOfToday;
}

function isBillPending(bill: UpcomingBill) {
  return (bill.status ?? 'pending') === 'pending';
}

function formatGoalDeadline(value: string | null | undefined) {
  if (!value || !isValidIsoDate(value)) {
    return null;
  }

  const days = Math.ceil((new Date(`${value}T12:00:00`).getTime() - new Date().setHours(0, 0, 0, 0)) / 86_400_000);
  if (days < 0) return 'Prazo passou';
  if (days === 0) return 'Prazo hoje';
  if (days <= 14) return `${days} dias para o prazo`;
  return `Prazo ${formatBillDue(value)}`;
}

function nextRecurringDue(value: string) {
  if (!isValidIsoDate(value)) {
    return value;
  }

  const [year, month, day] = value.split('-').map(Number);
  const nextMonthLastDay = new Date(year, month + 1, 0).getDate();
  return new Date(year, month, Math.min(day, nextMonthLastDay)).toISOString().slice(0, 10);
}

function pickAccountForContext(accounts: Account[], context: EntryContext | undefined) {
  const activeAccounts = accounts.filter((account) => !account.isArchived);

  if (activeAccounts.length === 0) {
    return null;
  }

  if (context === 'Negocio') {
    return activeAccounts.find((account) => account.isBusiness) ?? activeAccounts[0];
  }

  return (
    activeAccounts.find((account) => !account.isBusiness && account.kind !== 'reserve') ??
    activeAccounts.find((account) => !account.isBusiness) ??
    activeAccounts[0]
  );
}

function inferContextReply(message: string): EntryContext | null {
  const normalized = message
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

  if (!normalized || normalized.length > 56 || /\d/.test(normalized)) {
    return null;
  }

  if (/(compartilh|dividid|metade|casa e trabalho|pessoal e negocio)/.test(normalized)) {
    return 'Compartilhado';
  }

  if (/(negocio|empresa|pj|trabalho|cliente)/.test(normalized)) {
    return 'Negocio';
  }

  if (/(pessoal|minha casa|particular|meu uso)/.test(normalized)) {
    return 'Pessoal';
  }

  return null;
}

export function NorteApp() {
  const [isHydrating, setIsHydrating] = useState(true);
  const [isAuthLoading, setIsAuthLoading] = useState(isSupabaseConfigured());
  const [isLocalMode, setIsLocalMode] = useState(!isSupabaseConfigured());
  const [isRemoteSyncing, setIsRemoteSyncing] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [step, setStep] = useState<'welcome' | 'onboarding' | 'app'>('welcome');
  const [onboardingIndex, setOnboardingIndex] = useState(0);
  const [profile, setProfile] = useState<OnboardingProfile>('freelancer');
  const [selectedPain, setSelectedPain] = useState<string[]>([
    'Misturo pessoal com negocio',
    'Nao sei quanto posso gastar',
  ]);
  const [themeMode, setThemeMode] = useState<ThemeMode>('light');
  const [assistantMode, setAssistantMode] = useState<OrbMode>('idle');
  const [isAssistantLoading, setIsAssistantLoading] = useState(false);
  const [assistantError, setAssistantError] = useState<string | null>(null);
  const [assistantHealth, setAssistantHealth] = useState<NorteAssistantHealth | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isConversationMode, setIsConversationMode] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState('');
  const [lastSpeechText, setLastSpeechText] = useState('');
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<AppTab>('assistant');
  const [focusPanel, setFocusPanel] = useState<FocusPanel>('business');
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [drafts, setDrafts] = useState<DraftEntry[]>(initialDrafts);
  const [movements, setMovements] = useState<Movement[]>(initialMovements);
  const [accountState, setAccountState] = useState<Account[]>(initialAccounts);
  const [cardState, setCardState] = useState<WalletCard[]>(initialCards);
  const [categoryState, setCategoryState] = useState<FinancialCategory[]>(initialCategories);
  const [connectionState, setConnectionState] = useState<FinancialConnection[]>([]);
  const [goalState, setGoalState] = useState<Goal[]>(goals);
  const [billState, setBillState] = useState<UpcomingBill[]>(upcomingBills);
  const [assistantInput, setAssistantInput] = useState(initialAssistantInput);
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [manualEntry, setManualEntry] = useState<ManualEntryState>(defaultManualEntry);
  const [editingMovementId, setEditingMovementId] = useState<string | null>(null);
  const [showAccountForm, setShowAccountForm] = useState(false);
  const [accountForm, setAccountForm] = useState<AccountFormState>(defaultAccountForm);
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [showCardForm, setShowCardForm] = useState(false);
  const [cardForm, setCardForm] = useState<CardFormState>(defaultCardForm);
  const [editingCardId, setEditingCardId] = useState<string | null>(null);
  const [showGoalForm, setShowGoalForm] = useState(false);
  const [goalForm, setGoalForm] = useState<GoalFormState>(defaultGoalForm);
  const [editingGoalId, setEditingGoalId] = useState<string | null>(null);
  const [contributingGoalId, setContributingGoalId] = useState<string | null>(null);
  const [goalContributionAmount, setGoalContributionAmount] = useState('');
  const [showBillForm, setShowBillForm] = useState(false);
  const [billForm, setBillForm] = useState<BillFormState>(defaultBillForm);
  const [editingBillId, setEditingBillId] = useState<string | null>(null);
  const [showCategoryForm, setShowCategoryForm] = useState(false);
  const [categoryForm, setCategoryForm] = useState<CategoryFormState>(defaultCategoryForm);
  const [categoryError, setCategoryError] = useState<string | null>(null);
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [showConnectionForm, setShowConnectionForm] = useState(false);
  const [connectionForm, setConnectionForm] = useState<ConnectionFormState>(defaultConnectionForm);
  const [cardPaymentForm, setCardPaymentForm] = useState<CardPaymentFormState>(defaultCardPaymentForm);
  const [isPayingCard, setIsPayingCard] = useState(false);
  const [showStatementImport, setShowStatementImport] = useState(false);
  const [statementCsv, setStatementCsv] = useState('');
  const [statementPreview, setStatementPreview] = useState<StatementPreviewItem[]>([]);
  const [statementAccountId, setStatementAccountId] = useState('');
  const [movementTypeFilter, setMovementTypeFilter] = useState<MovementTypeFilter>('all');
  const [movementContextFilter, setMovementContextFilter] = useState<MovementContextFilter>('all');
  const [movementCategoryFilter, setMovementCategoryFilter] = useState<MovementCategoryFilter>('all');
  const [movementPeriodFilter, setMovementPeriodFilter] = useState<MovementPeriodFilter>('all');
  const [movementAccountFilter, setMovementAccountFilter] = useState('all');
  const [movementCardFilter, setMovementCardFilter] = useState('all');
  const [movementSort, setMovementSort] = useState<MovementSort>('newest');
  const [forecastMode, setForecastMode] = useState<ForecastMode>('normal');
  const [movementSearch, setMovementSearch] = useState('');
  const [pendingMovementDeletion, setPendingMovementDeletion] = useState<PendingMovementDeletion | null>(null);
  const [isSavingManualEntry, setIsSavingManualEntry] = useState(false);
  const [isConfirmingDrafts, setIsConfirmingDrafts] = useState(false);
  const recorderRef = useRef<any>(null);
  const recorderStreamRef = useRef<any>(null);
  const recorderChunksRef = useRef<any[]>([]);
  const recognitionRef = useRef<any>(null);
  const recognitionFinalRef = useRef('');
  const conversationModeRef = useRef(false);
  const audioContextRef = useRef<any>(null);
  const analyserRef = useRef<any>(null);
  const sourceNodeRef = useRef<any>(null);
  const silenceTimeoutRef = useRef<any>(null);
  const hasDetectedSpeechRef = useRef(false);
  const monitoringFrameRef = useRef<number | null>(null);
  const currentAudioRef = useRef<any>(null);
  const currentAudioUrlRef = useRef<string | null>(null);
  const realtimeTransportRef = useRef<RealtimeTransport | null>(null);
  const realtimeChannelRef = useRef<any>(null);
  const realtimePeerRef = useRef<any>(null);
  const realtimeStreamRef = useRef<any>(null);
  const realtimeAudioRef = useRef<any>(null);
  const pendingVoiceMessageRef = useRef('');
  const pendingAssistantTranscriptRef = useRef('');
  const isManualSignOutRef = useRef(false);
  const voiceToolHandledRef = useRef(false);

  useEffect(
    () => () => {
      if (pendingMovementDeletion) {
        clearTimeout(pendingMovementDeletion.timeoutId);
      }
    },
    [pendingMovementDeletion],
  );

  const refreshAssistantHealth = async () => {
    try {
      const health = await getNorteAssistantHealth();
      setAssistantHealth(health);
      return health;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Nao consegui validar o backend da IA.';
      setAssistantError(message);
      return null;
    }
  };

  useEffect(() => {
    let active = true;

    async function hydrate() {
      const saved = isSupabaseConfigured() ? null : await loadPersistedState<PersistedState>(STORAGE_KEY);

      if (!active) {
        return;
      }

      if (saved) {
        setStep(saved.step);
        setOnboardingIndex(saved.onboardingIndex);
        setProfile(saved.profile);
        setSelectedPain(saved.selectedPain);
        setThemeMode(saved.themeMode ?? 'light');
        setActiveTab(saved.activeTab);
        setFocusPanel(saved.focusPanel);
        setMessages(saved.messages);
        setDrafts(saved.drafts);
        setMovements(saved.movements);
        setAccountState(saved.accounts);
        setCardState(saved.cards ?? initialCards);
        setCategoryState(saved.categories ?? initialCategories);
        setConnectionState(saved.connections ?? []);
        setGoalState(saved.goals ?? goals);
        setBillState(
          (saved.upcomingBills ?? upcomingBills).map((bill) => ({
            ...bill,
            context: bill.context ?? 'Pessoal',
            isRecurring: bill.isRecurring ?? false,
            status: bill.status ?? 'pending',
          })),
        );
        setAssistantInput(saved.assistantInput);
      }

      setIsHydrating(false);
    }

    hydrate();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!supabase) {
      setIsAuthLoading(false);
      return;
    }

    let active = true;

    supabase.auth.getSession().then(({ data, error }) => {
      if (!active) {
        return;
      }

      if (error) {
        setAuthError(formatAuthError(error));
      }

      setSession(data.session);
      setIsAuthLoading(false);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (event === 'SIGNED_OUT' && !isManualSignOutRef.current) {
        setAuthError('Sua sessao terminou. Entre novamente para continuar com seus dados sincronizados.');
      }
      setSession(nextSession);
      setIsAuthLoading(false);
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!session?.user || !supabase) {
      return;
    }

    let active = true;

    async function bootstrapRemote() {
      const user = session!.user;
      setIsRemoteSyncing(true);

      try {
        await ensureUserProfile({
          userId: user.id,
          fullName: (user.user_metadata?.full_name as string | undefined) ?? user.email ?? '',
          onboardingProfile: profile,
          selectedPainPoints: selectedPain,
        });

        const snapshot = await loadWorkspaceSnapshot(user.id);

        if (!active || !snapshot) {
          return;
        }

        setAccountState(snapshot.accounts);
        setCardState(snapshot.cards);
        setCategoryState([...initialCategories, ...snapshot.categories]);
        setConnectionState(snapshot.connections);
        setGoalState(snapshot.goals);
        setBillState(snapshot.upcomingBills);
        setMovements(snapshot.movements);
        setDrafts(
          snapshot.drafts.map((draft) => ({
            ...draft,
            walletAccountId: draft.walletAccountId ?? pickAccountForContext(snapshot.accounts, draft.context)?.id ?? null,
          })),
        );
        setMessages(snapshot.messages);
      } catch (error) {
        if (active) {
          setAuthError(formatAuthError(error));
        }
      } finally {
        if (active) {
          setIsRemoteSyncing(false);
        }
      }
    }

    bootstrapRemote();

    return () => {
      active = false;
    };
  }, [profile, selectedPain, session?.user, session?.user?.id]);

  useEffect(() => {
    let active = true;

    async function loadAssistantHealth() {
      const health = await refreshAssistantHealth();

      if (active && health) {
        setAssistantHealth(health);
      }
    }

    void loadAssistantHealth();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (activeTab === 'assistant') {
      void refreshAssistantHealth();
    }
  }, [activeTab]);

  useEffect(() => {
    conversationModeRef.current = isConversationMode;
  }, [isConversationMode]);

  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop?.();
        recognitionRef.current = null;
      }

      if (recorderRef.current && recorderRef.current.state !== 'inactive') {
        recorderRef.current.stop();
      }

      if (recorderStreamRef.current) {
        recorderStreamRef.current.getTracks?.().forEach((track: { stop: () => void }) => track.stop());
      }

      if (silenceTimeoutRef.current) {
        clearTimeout(silenceTimeoutRef.current);
      }

      if (monitoringFrameRef.current && typeof cancelAnimationFrame !== 'undefined') {
        cancelAnimationFrame(monitoringFrameRef.current);
      }

      sourceNodeRef.current?.disconnect?.();
      analyserRef.current?.disconnect?.();
      audioContextRef.current?.close?.();

      if (currentAudioRef.current) {
        currentAudioRef.current.pause?.();
      }

      if (currentAudioUrlRef.current && typeof URL !== 'undefined') {
        URL.revokeObjectURL(currentAudioUrlRef.current);
      }

      if (realtimeChannelRef.current) {
        realtimeChannelRef.current.close?.();
      }

      if (realtimePeerRef.current) {
        realtimePeerRef.current.getSenders?.().forEach((sender: any) => sender.track?.stop?.());
        realtimePeerRef.current.close?.();
      }

      if (realtimeStreamRef.current) {
        realtimeStreamRef.current.getTracks?.().forEach((track: { stop: () => void }) => track.stop());
      }

      if (realtimeAudioRef.current) {
        realtimeAudioRef.current.pause?.();
        realtimeAudioRef.current.srcObject = null;
      }
    };
  }, []);

  useEffect(() => {
    if (isHydrating || (isSupabaseConfigured() && !isLocalMode)) {
      return;
    }

    savePersistedState(STORAGE_KEY, {
      step,
      onboardingIndex,
      profile,
      selectedPain,
      themeMode,
      activeTab,
      focusPanel,
      messages,
      drafts,
      movements,
      accounts: accountState,
      cards: cardState,
      categories: categoryState,
      connections: connectionState,
      goals: goalState,
      upcomingBills: billState,
      assistantInput,
    } satisfies PersistedState);
  }, [
    accountState,
    activeTab,
    assistantInput,
    drafts,
    goalState,
    focusPanel,
    isHydrating,
    messages,
    movements,
    onboardingIndex,
    profile,
    selectedPain,
    step,
    themeMode,
    cardState,
    categoryState,
    connectionState,
    billState,
    isLocalMode,
  ]);

  const activeAccounts = useMemo(() => accountState.filter((account) => !account.isArchived), [accountState]);

  useEffect(() => {
    const selectedAccountIsActive = activeAccounts.some((account) => account.id === manualEntry.accountId);
    if (selectedAccountIsActive || activeAccounts.length === 0) {
      return;
    }

    setManualEntry((current) => ({
      ...current,
      accountId: activeAccounts[0].id,
    }));
  }, [activeAccounts, manualEntry.accountId]);

  const pendingQuestions = drafts.filter((draft) => !draft.context).length;
  const userDisplayName =
    (session?.user?.user_metadata?.full_name as string | undefined)?.trim() ||
    session?.user?.email?.split('@')[0] ||
    'Seu Norte';
  const userInitials = userDisplayName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
  const userFirstName = userDisplayName.split(' ')[0] ?? userDisplayName;
  const sortedMovements = useMemo(() => {
    const result = [...movements];

    result.sort((left, right) => {
      if (movementSort === 'oldest') {
        return new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
      }

      if (movementSort === 'highest') {
        return right.amount - left.amount;
      }

      if (movementSort === 'lowest') {
        return left.amount - right.amount;
      }

      return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
    });

    return result;
  }, [movementSort, movements]);
  const visibleMovements = useMemo(
    () =>
      sortedMovements.filter(
        (movement) => {
          const search = movementSearch.trim().toLocaleLowerCase('pt-BR');
          const matchesSearch =
            !search ||
            `${movement.title} ${movement.account} ${movement.context} ${movement.category ?? 'Outros'} ${movement.source}`.toLocaleLowerCase('pt-BR').includes(search);

          return (
            matchesSearch &&
            (movementTypeFilter === 'all' || movement.type === movementTypeFilter) &&
            (movementContextFilter === 'all' || movement.context === movementContextFilter) &&
            (movementCategoryFilter === 'all' || (movement.category ?? 'Outros') === movementCategoryFilter) &&
            (movementAccountFilter === 'all' || movement.walletAccountId === movementAccountFilter) &&
            (movementCardFilter === 'all' || movement.cardId === movementCardFilter) &&
            isMovementInPeriod(movement.createdAt, movementPeriodFilter)
          );
        },
      ),
    [movementAccountFilter, movementCategoryFilter, movementContextFilter, movementPeriodFilter, movementSearch, movementTypeFilter, sortedMovements],
  );
  const visibleMovementTotal = visibleMovements.reduce(
    (total, movement) => total + (movement.type === 'income' ? movement.amount : -movement.amount),
    0,
  );
  const manualEntryAccount = activeAccounts.find((account) => account.id === manualEntry.accountId) ?? activeAccounts[0] ?? null;
  const manualEntryCard = cardState.find((card) => card.id === manualEntry.cardId) ?? null;

  const personalBalance = activeAccounts
    .filter((account) => !account.isBusiness && account.kind !== 'reserve')
    .reduce((total, account) => total + account.balance, 0);
  const businessBalance = activeAccounts
    .filter((account) => account.isBusiness)
    .reduce((total, account) => total + account.balance, 0);
  const reserveBalance = activeAccounts
    .filter((account) => account.kind === 'reserve')
    .reduce((total, account) => total + account.balance, 0);
  const totalBalance = activeAccounts.reduce((total, account) => total + account.balance, 0);
  const pendingBills = billState.filter(isBillPending);
  const upcomingBillsTotal = sumAmounts(pendingBills);
  const personalBillsTotal = pendingBills.reduce((total, bill) => total + bill.amount * personalContextWeight(bill.context), 0);
  const businessBillsTotal = pendingBills.reduce((total, bill) => total + bill.amount * movementBusinessWeight(bill.context), 0);
  const pendingIncome = sumAmounts(drafts.filter((draft) => draft.type === 'income'));
  const pendingExpense = sumAmounts(drafts.filter((draft) => draft.type === 'expense'));
  const pendingPersonalExpense = drafts.reduce(
    (total, draft) =>
      total + (draft.type === 'expense' ? draft.amount * personalContextWeight(draft.context) : draft.context ? 0 : draft.amount),
    0,
  );
  const mixedAmount =
    sumAmounts(drafts.filter((draft) => draft.context === 'Compartilhado')) +
    sumAmounts(movements.filter((movement) => movement.context === 'Compartilhado'));

  const businessProfit = movements.reduce((total, movement) => {
    const weight = movementBusinessWeight(movement.context);
    const signedAmount = movement.type === 'income' ? movement.amount : -movement.amount;
    return total + signedAmount * weight;
  }, 0);

  const spendableToday = Math.max(personalBalance - personalBillsTotal - pendingPersonalExpense - 150, 0);
  const overdueBills = pendingBills.filter((bill) => isBillOverdue(bill.due));
  const categorySpending = useMemo(() => {
    const totals = new Map<string, { amount: number; movementCount: number }>();

    movements
      .filter((movement) => movement.type === 'expense' && isMovementInPeriod(movement.createdAt, 'month'))
      .forEach((movement) => {
        const category = movement.category ?? 'Outros';
        const current = totals.get(category) ?? { amount: 0, movementCount: 0 };
        totals.set(category, { amount: current.amount + movement.amount, movementCount: current.movementCount + 1 });
      });

    return [...totals.entries()]
      .map(([category, totals]) => ({ category, ...totals }))
      .sort((left, right) => right.amount - left.amount);
  }, [movements]);
  const monthIncome = movements
    .filter((movement) => movement.type === 'income' && isMovementInPeriod(movement.createdAt, 'month'))
    .reduce((total, movement) => total + movement.amount, 0);
  const monthExpense = movements
    .filter((movement) => movement.type === 'expense' && isMovementInPeriod(movement.createdAt, 'month'))
    .reduce((total, movement) => total + movement.amount, 0);
  const monthResult = monthIncome - monthExpense;
  const cashForecast = useMemo(() => {
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const daysElapsed = Math.max(now.getDate(), 1);
    const personalMonthlyIncome = movements
      .filter((movement) => movement.type === 'income' && isMovementInPeriod(movement.createdAt, 'month'))
      .reduce((total, movement) => total + movement.amount * personalContextWeight(movement.context), 0);
    const personalMonthlyExpense = movements
      .filter((movement) => movement.type === 'expense' && isMovementInPeriod(movement.createdAt, 'month'))
      .reduce((total, movement) => total + movement.amount * personalContextWeight(movement.context), 0);
    const incomeFactor = forecastMode === 'conservative' ? 0.75 : 1;
    const expenseFactor = forecastMode === 'conservative' ? 1.1 : 1;
    const overdueOutflows = pendingBills
      .filter((bill) => isBillOverdue(bill.due))
      .reduce((total, bill) => total + bill.amount * personalContextWeight(bill.context), 0);
    const cardInvoiceOutflows = cardState
      .filter((card) => !card.isBusiness && card.used > 0)
      .map((card) => {
        const due = new Date(now.getFullYear(), now.getMonth(), card.dueDay ?? 15, 12);
        if (due < now) due.setMonth(due.getMonth() + 1);
        return { due: due.toISOString().slice(0, 10), amount: card.used };
      });

    return buildCashForecast({
      today,
      startingBalance: personalBalance,
      dailyNet: (personalMonthlyIncome * incomeFactor - personalMonthlyExpense * expenseFactor) / daysElapsed,
      immediateOutflows: pendingPersonalExpense + overdueOutflows,
      datedOutflows: pendingBills
        .filter((bill) => !isBillOverdue(bill.due))
        .map((bill) => ({ due: bill.due, amount: bill.amount * personalContextWeight(bill.context) }))
        .concat(cardInvoiceOutflows),
    });
  }, [cardState, forecastMode, movements, pendingBills, pendingPersonalExpense, personalBalance]);
  const hasFinancialData =
    movements.length > 0 || drafts.length > 0 || billState.length > 0 || accountState.some((account) => account.balance !== 0);
  const financialHealth: FinancialHealth =
    !hasFinancialData
      ? 'starting'
      : overdueBills.length > 0 || spendableToday <= 0
      ? 'critical'
      : pendingQuestions > 0 || businessProfit < 0
        ? 'attention'
        : spendableToday >= 1000 && businessProfit >= 0
          ? 'healthy'
          : 'stable';
  const financialHealthPresentation: Record<FinancialHealth, { label: string; color: string }> = {
    starting: { label: 'Comecando', color: '#5B8CFF' },
    healthy: { label: 'Saudavel', color: '#21C45A' },
    stable: { label: 'Estavel', color: '#5B8CFF' },
    attention: { label: 'Atencao', color: '#FF8A00' },
    critical: { label: 'Critico', color: '#EF4444' },
  };
  const healthPresentation = financialHealthPresentation[financialHealth];

  const summaryMetrics = [
    {
      label: 'Hoje voce pode gastar',
      value: currency.format(spendableToday),
      detail: 'Ja descontando sua parte das contas futuras e rascunhos de despesa pendentes.',
    },
    {
      label: 'Contas vencendo',
      value: `${pendingBills.length}`,
      detail: `${currency.format(upcomingBillsTotal)} previstos nas proximas cobrancas.`,
    },
    {
      label: 'A receber em rascunhos',
      value: currency.format(pendingIncome),
      detail: pendingIncome > 0 ? 'Entradas detectadas pela IA aguardando sua confirmacao.' : 'Nenhuma entrada pendente agora.',
    },
    {
      label: 'Lucro do negocio',
      value: currency.format(businessProfit),
      detail: 'Estimativa com base nos movimentos salvos e nos itens compartilhados ponderados.',
    },
  ];

  const highestCardUsage = cardState
    .filter((card) => card.limit > 0)
    .map((card) => ({ card, percentage: card.used / card.limit }))
    .sort((left, right) => right.percentage - left.percentage)[0];

  const northGuidance =
    !hasFinancialData
      ? {
          eyebrow: 'Primeiro passo',
          title: 'Conte seu dia financeiro ao Norte',
          description: 'Fale uma entrada ou despesa e eu organizo tudo em um rascunho para voce revisar.',
          icon: 'sparkles-outline' as keyof typeof Ionicons.glyphMap,
        }
      : pendingQuestions > 0
      ? {
          eyebrow: 'Proximo passo',
          title: 'Termine de classificar seus rascunhos',
          description: `Faltam ${pendingQuestions} resposta${pendingQuestions > 1 ? 's' : ''} para o Norte atualizar seus saldos com seguranca.`,
          icon: 'help-circle-outline' as keyof typeof Ionicons.glyphMap,
        }
      : highestCardUsage && highestCardUsage.percentage >= 0.8
        ? {
            eyebrow: 'Atenção ao cartão',
            title: `${highestCardUsage.card.name} está em ${Math.round(highestCardUsage.percentage * 100)}% do limite`,
            description: `A fatura atual é ${currency.format(highestCardUsage.card.used)} e vence dia ${highestCardUsage.card.dueDay ?? 15}. Vale revisar antes de fazer novas compras no crédito.`,
            icon: 'card-outline' as keyof typeof Ionicons.glyphMap,
          }
      : spendableToday <= 0
        ? {
            eyebrow: 'Atencao ao caixa',
            title: 'Seu limite de hoje esta comprometido',
            description: 'As contas previstas e os gastos pendentes ja consomem o valor livre da sua conta pessoal.',
            icon: 'alert-circle-outline' as keyof typeof Ionicons.glyphMap,
          }
        : businessProfit < 0
          ? {
              eyebrow: 'Visao do negocio',
              title: 'O caixa do negocio pede uma revisao',
              description: `As despesas do periodo superam as entradas em ${currency.format(Math.abs(businessProfit))}.`,
              icon: 'trending-down-outline' as keyof typeof Ionicons.glyphMap,
            }
          : {
              eyebrow: 'Seu Norte de hoje',
              title: `Voce pode gastar ${currency.format(spendableToday)} com tranquilidade`,
              description: 'Esse valor ja considera contas previstas, despesas pendentes e uma margem de seguranca.',
              icon: 'compass-outline' as keyof typeof Ionicons.glyphMap,
            };

  const businessHighlights = [
    `Caixa atual do negocio: ${currency.format(businessBalance)}. ${currency.format(businessBillsTotal)} em contas futuras do negocio.`,
    mixedAmount > 0
      ? `Voce ainda tem ${currency.format(mixedAmount)} em itens compartilhados entre pessoal e negocio.`
      : 'Nenhum item compartilhado foi detectado ate agora.',
    pendingQuestions > 0
      ? `A IA ainda precisa confirmar ${pendingQuestions} classificacoes antes de salvar tudo.`
    : 'Nao ha duvidas pendentes na sua fila de rascunhos.',
  ];

  const personalIncome = movements.reduce(
    (total, movement) =>
      total + (movement.type === 'income' ? movement.amount * (movement.context === 'Compartilhado' ? 0.5 : movement.context === 'Pessoal' ? 1 : 0) : 0),
    0,
  );
  const personalExpenses = movements.reduce(
    (total, movement) =>
      total + (movement.type === 'expense' ? movement.amount * (movement.context === 'Compartilhado' ? 0.5 : movement.context === 'Pessoal' ? 1 : 0) : 0),
    0,
  );
  const businessIncome = movements.reduce(
    (total, movement) => total + (movement.type === 'income' ? movement.amount * movementBusinessWeight(movement.context) : 0),
    0,
  );
  const businessExpenses = movements.reduce(
    (total, movement) => total + (movement.type === 'expense' ? movement.amount * movementBusinessWeight(movement.context) : 0),
    0,
  );
  const businessResult = businessIncome - businessExpenses;
  const businessMargin = businessIncome > 0 ? Math.round((businessResult / businessIncome) * 100) : 0;
  const analysisMetrics = [
    { label: 'Resultado pessoal', value: currency.format(personalIncome - personalExpenses), detail: 'Entradas menos despesas pessoais e compartilhadas.' },
    { label: 'Resultado do negocio', value: currency.format(businessResult), detail: `${businessIncome > 0 ? `${businessMargin}% de margem` : 'Sem receitas classificadas'} no historico salvo.` },
    { label: 'Comprometido', value: currency.format(upcomingBillsTotal + pendingExpense), detail: 'Contas futuras e despesas aguardando confirmacao.' },
    { label: 'Caixa PJ atual', value: currency.format(businessBalance), detail: 'Saldo informado na conta do negocio.' },
  ];

  const analysisHighlights = [
    `${movements.length} movimentos estao salvos localmente neste aparelho.`,
    `Seu caixa pessoal esta em ${currency.format(personalBalance)} e sua reserva em ${currency.format(reserveBalance)}.`,
    pendingExpense > 0
      ? `Se voce confirmar os rascunhos de despesa, o impacto adicional sera de ${currency.format(pendingExpense)}.`
      : 'Nao existem despesas novas aguardando confirmacao.',
  ];

  const handlePainToggle = (value: string) => {
    setSelectedPain((current) =>
      current.includes(value) ? current.filter((item) => item !== value) : [...current, value],
    );
  };

  const handleDraftContext = (id: string, context: EntryContext) => {
    setDrafts((current) =>
      current.map((draft) =>
        draft.id === id
          ? {
              ...draft,
              context,
              walletAccountId: pickAccountForContext(accountState, context)?.id ?? draft.walletAccountId ?? null,
              question: undefined,
              note:
                draft.type === 'income'
                  ? 'Entrada pronta para confirmacao.'
                  : context === 'Compartilhado'
                    ? 'Despesa compartilhada pronta para confirmacao.'
                    : 'Despesa pronta para confirmacao.',
            }
          : draft,
      ),
    );

    if (session && supabase) {
      void updateRemoteDraftContext(id, context);
    }
  };

  const handleDraftAccount = (id: string, walletAccountId: string) => {
    setDrafts((current) =>
      current.map((draft) =>
        draft.id === id
          ? {
              ...draft,
              walletAccountId,
            }
          : draft,
      ),
    );
  };

  const handleUpdateDraft = (id: string, update: { amount: number; occurredAt: string; category: MovementCategory }) => {
    setDrafts((current) =>
      current.map((draft) =>
        draft.id === id
          ? {
              ...draft,
              amount: update.amount,
              occurredAt: update.occurredAt,
              category: update.category,
              note: 'Rascunho revisado, aguardando sua confirmacao.',
            }
          : draft,
      ),
    );

    if (session && supabase) {
      void Promise.all([
        updateRemoteDraftAmount(id, update.amount),
        updateRemoteDraftOccurredAt(id, update.occurredAt),
        updateRemoteDraftCategory(id, update.category),
      ]).catch((error) =>
        setAssistantError(error instanceof Error ? `Revisei o rascunho no app, mas nao consegui sincronizar: ${error.message}` : 'Revisei o rascunho no app, mas nao consegui sincronizar.'),
      );
    }
  };

  const handleRemoveDraft = (id: string) => {
    setDrafts((current) => current.filter((draft) => draft.id !== id));

    if (session && supabase) {
      void deleteRemoteDraft(id);
    }
  };

  const handleAuthSubmit = async (input: {
    email: string;
    password: string;
    fullName?: string;
    mode: 'signin' | 'signup';
  }) => {
    if (!supabase) {
      setAuthError('Supabase nao configurado.');
      return;
    }

    const email = input.email.trim();
    const fullName = input.fullName?.trim() ?? '';

    if (!/^\S+@\S+\.\S+$/.test(email)) {
      setAuthError('Informe um e-mail valido para continuar.');
      return;
    }

    if (input.password.length < 6) {
      setAuthError('A senha precisa ter pelo menos 6 caracteres.');
      return;
    }

    if (input.mode === 'signup' && fullName.length < 2) {
      setAuthError('Informe seu nome para personalizar o Norte.');
      return;
    }

    setIsAuthLoading(true);
    setAuthError(null);

    try {
      if (input.mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({
          email,
          password: input.password,
          options: {
            data: {
              full_name: fullName,
            },
          },
        });

        if (error) {
          throw error;
        }

        if (!data.session) {
          setAuthError('Conta criada. Se a confirmacao de email estiver ativa, confirme e depois entre.');
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password: input.password,
        });

        if (error) {
          throw error;
        }
      }
    } catch (error) {
      setAuthError(formatAuthError(error));
    } finally {
      setIsAuthLoading(false);
    }
  };

  const handleSignOut = async () => {
    if (!supabase) {
      return;
    }

    try {
      isManualSignOutRef.current = true;
      const { error } = await supabase.auth.signOut();
      if (error) {
        throw error;
      }
    } catch (error) {
      isManualSignOutRef.current = false;
      setAuthError(formatAuthError(error));
      return;
    }
    setTimeout(() => {
      isManualSignOutRef.current = false;
    }, 0);
    await removePersistedState(STORAGE_KEY);
    setMessages(initialMessages);
    setDrafts(initialDrafts);
    setMovements([]);
    setAccountState(initialAccounts);
    setCardState(initialCards);
    setGoalState(goals);
    setBillState(upcomingBills);
    setActiveTab('assistant');
    setFocusPanel('business');
    setStep('welcome');
    setIsLocalMode(false);
    setIsDrawerOpen(false);
    setIsProfileOpen(false);
  };

  const handleDrawerNavigate = (destination: DrawerDestination) => {
    if (destination === 'business' || destination === 'analysis' || destination === 'settings') {
      setActiveTab('home');
      setFocusPanel(destination);
    } else {
      setActiveTab(destination);
    }

    setIsDrawerOpen(false);
  };

  const refreshWorkspaceFromCloud = async () => {
    if (!session || !supabase) {
      return;
    }

    const snapshot = await loadWorkspaceSnapshot(session.user.id);

    if (!snapshot) {
      return;
    }

    setAccountState(snapshot.accounts);
    setCardState(snapshot.cards);
    setGoalState(snapshot.goals);
    setBillState(snapshot.upcomingBills);
    setMovements(snapshot.movements);
    setDrafts(snapshot.drafts);
    setMessages(snapshot.messages);
  };

  const handleRefreshWorkspace = async () => {
    setIsRemoteSyncing(true);
    try {
      await refreshWorkspaceFromCloud();
      setAuthError(null);
    } catch (error) {
      setAuthError(formatAuthError(error));
    } finally {
      setIsRemoteSyncing(false);
    }
  };

  const stopAssistantPlayback = () => {
    if (currentAudioRef.current) {
      currentAudioRef.current.pause?.();
      currentAudioRef.current = null;
    }

    if (currentAudioUrlRef.current && typeof URL !== 'undefined') {
      URL.revokeObjectURL(currentAudioUrlRef.current);
      currentAudioUrlRef.current = null;
    }

    setIsSpeaking(false);
  };

  const stopAudioMonitoring = () => {
    if (silenceTimeoutRef.current) {
      clearTimeout(silenceTimeoutRef.current);
      silenceTimeoutRef.current = null;
    }

    if (monitoringFrameRef.current && typeof cancelAnimationFrame !== 'undefined') {
      cancelAnimationFrame(monitoringFrameRef.current);
      monitoringFrameRef.current = null;
    }

    sourceNodeRef.current?.disconnect?.();
    analyserRef.current?.disconnect?.();
    sourceNodeRef.current = null;
    analyserRef.current = null;
    audioContextRef.current?.close?.();
    audioContextRef.current = null;
    hasDetectedSpeechRef.current = false;
  };

  const sendRealtimeEvent = (event: Record<string, unknown>) => {
    const channel = realtimeChannelRef.current;

    if (!channel || channel.readyState !== 'open') {
      return;
    }

    channel.send(JSON.stringify(event));
  };

  const stopRealtimeConversation = () => {
    const transport = realtimeTransportRef.current;
    if (transport) {
      transport.stop();
      realtimeTransportRef.current = null;
    }

    const channel = realtimeChannelRef.current;
    if (channel) {
      channel.close?.();
      realtimeChannelRef.current = null;
    }

    const peer = realtimePeerRef.current;
    if (peer) {
      if (!transport) {
        peer.getSenders?.().forEach((sender: any) => sender.track?.stop?.());
        peer.close?.();
      }
      realtimePeerRef.current = null;
    }

    if (realtimeStreamRef.current) {
      realtimeStreamRef.current.getTracks?.().forEach((track: { stop: () => void }) => track.stop());
      realtimeStreamRef.current = null;
    }

    if (realtimeAudioRef.current) {
      realtimeAudioRef.current.pause?.();
      realtimeAudioRef.current.srcObject = null;
      realtimeAudioRef.current = null;
    }

    pendingVoiceMessageRef.current = '';
    pendingAssistantTranscriptRef.current = '';
    voiceToolHandledRef.current = false;
  };

  const playAssistantSpeech = async (text: string) => {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      stopAssistantPlayback();
      setIsSpeaking(true);

      const audioBlob = await speakNorteText(text, session?.access_token);
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);

      currentAudioRef.current = audio;
      currentAudioUrlRef.current = audioUrl;

      audio.onended = () => {
        stopAssistantPlayback();
        if (conversationModeRef.current && !realtimePeerRef.current) {
          setTimeout(() => {
            void handleVoiceCapture(true);
          }, 350);
        } else {
          setAssistantMode('idle');
        }
      };

      audio.onerror = () => {
        stopAssistantPlayback();
        setAssistantMode('idle');
        setAssistantError('Nao consegui reproduzir a voz da Norte IA agora.');
      };

      await audio.play();
    } catch (error) {
      stopAssistantPlayback();
      setAssistantMode('idle');
      setAssistantError(error instanceof Error ? error.message : 'Falha ao reproduzir a voz da Norte IA.');
    }
  };

  const stopVoiceCapture = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }

    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop();
    }

    if (recorderStreamRef.current) {
      recorderStreamRef.current.getTracks?.().forEach((track: { stop: () => void }) => track.stop());
      recorderStreamRef.current = null;
    }

    stopAudioMonitoring();
    setIsRecording(false);
    setLiveTranscript('');
    recognitionFinalRef.current = '';
  };

  const startRecordedAudioCapture = async () => {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') {
      setAssistantError('O modo de voz por enquanto funciona no navegador.');
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setAssistantError('Seu navegador nao suporta gravacao de audio para a Norte IA.');
      return;
    }

    try {
      setAssistantError(null);
      stopAssistantPlayback();
      setAssistantMode('listening');
      setIsRecording(true);
      setLiveTranscript('Pode falar, estou ouvindo...');

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recorderStreamRef.current = stream;
      recorderChunksRef.current = [];

      const preferredMimeType =
        typeof MediaRecorder.isTypeSupported === 'function' && MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : 'audio/webm';

      const recorder = new MediaRecorder(stream, { mimeType: preferredMimeType });
      recorderRef.current = recorder;

      const AudioContextCtor = (window as any).AudioContext ?? (window as any).webkitAudioContext;
      if (AudioContextCtor) {
        const audioContext = new AudioContextCtor();
        const analyser = audioContext.createAnalyser();
        const source = audioContext.createMediaStreamSource(stream);
        source.connect(analyser);
        analyser.fftSize = 2048;
        analyserRef.current = analyser;
        sourceNodeRef.current = source;
        audioContextRef.current = audioContext;

        const sampleBuffer = new Uint8Array(analyser.fftSize);
        const silenceThreshold = 9;
        const silenceMs = 1100;

        const monitorAudio = () => {
          if (!analyserRef.current || !recorderRef.current || recorderRef.current.state === 'inactive') {
            monitoringFrameRef.current = null;
            return;
          }

          analyser.getByteTimeDomainData(sampleBuffer);

          let total = 0;
          for (const sample of sampleBuffer) {
            total += Math.abs(sample - 128);
          }

          const averageLevel = total / sampleBuffer.length;

          if (averageLevel > silenceThreshold) {
            hasDetectedSpeechRef.current = true;
            setLiveTranscript('Entendendo sua fala...');

            if (silenceTimeoutRef.current) {
              clearTimeout(silenceTimeoutRef.current);
              silenceTimeoutRef.current = null;
            }
          } else if (hasDetectedSpeechRef.current && !silenceTimeoutRef.current) {
            silenceTimeoutRef.current = setTimeout(() => {
              silenceTimeoutRef.current = null;
              stopVoiceCapture();
            }, silenceMs);
          }

          monitoringFrameRef.current = requestAnimationFrame(monitorAudio);
        };

        monitoringFrameRef.current = requestAnimationFrame(monitorAudio);
      }

      recorder.ondataavailable = (event: any) => {
        if (event.data?.size) {
          recorderChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        setIsRecording(false);
        recorderRef.current = null;
        recorderStreamRef.current?.getTracks?.().forEach((track: { stop: () => void }) => track.stop());
        recorderStreamRef.current = null;
        stopAudioMonitoring();

        const audioBlob = new Blob(recorderChunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        recorderChunksRef.current = [];

        if (audioBlob.size === 0) {
          setAssistantMode('idle');
          setAssistantError('Nao recebi audio suficiente para transcrever.');
          return;
        }

        try {
          setAssistantMode('thinking');
          setLiveTranscript('Transcrevendo com a OpenAI...');
          const transcription = await transcribeNorteAudio(
            audioBlob,
            `norte-audio.${preferredMimeType.includes('webm') ? 'webm' : 'wav'}`,
            session?.access_token,
          );
          const transcript = transcription.text.trim();

          if (!transcript) {
            setLiveTranscript('');
            setAssistantMode('idle');
            setAssistantError('Nao consegui entender o que foi dito.');
            return;
          }

          setLiveTranscript(transcript);
          setAssistantInput(transcript);
          await handleInterpretMessage(transcript);
        } catch (error) {
          setLiveTranscript('');
          setAssistantMode('idle');
          setAssistantError(error instanceof Error ? error.message : 'Falha ao transcrever seu audio.');
        }
      };

      recorder.start();
    } catch (error) {
      setAssistantMode('idle');
      setIsRecording(false);
      setLiveTranscript('');
      setAssistantError(error instanceof Error ? error.message : 'Nao consegui iniciar a gravacao.');
    }
  };

  const handleVoiceCapture = async (forceStart = false) => {
    if (isRecording && !forceStart) {
      stopVoiceCapture();
      return;
    }

    await startRecordedAudioCapture();
  };

  const syncAssistantTurnRemotely = async (requestMessage: string, result: AssistantTurnResponse) => {
    if (!session) {
      return null;
    }

    try {
      return await syncNorteAssistantTurn({
        accessToken: session.access_token,
        userId: session.user.id,
        fullName: (session.user.user_metadata?.full_name as string | undefined) ?? session.user.email ?? '',
        onboardingProfile: profile,
        selectedPainPoints: selectedPain,
        requestMessage,
        response: result,
      });
    } catch (remoteError) {
      setAssistantError(
        remoteError instanceof Error
          ? `A IA respondeu, mas nao consegui sincronizar a conversa no banco: ${remoteError.message}`
          : 'A IA respondeu, mas nao consegui sincronizar a conversa no banco.',
      );
      return null;
    }
  };

  const runStructuredAssistantTurn = async (
    message: string,
    options?: {
      clearInput?: boolean;
      playTts?: boolean;
      appendFailureMessage?: boolean;
      awaitRealtimeVoice?: boolean;
    },
  ) => {
    const trimmed = message.trim();

    if (!trimmed) {
      return null;
    }

    const pendingDraft = drafts.find((draft) => !draft.context);
    const contextReply = pendingQuestions === 1 ? inferContextReply(trimmed) : null;
    const correctedAmount = pendingDraft ? parseDraftCorrectionAmount(trimmed) : null;
    const correctedDate = pendingDraft ? parseDraftCorrectionDate(trimmed) : null;

    if (pendingDraft && correctedAmount) {
      const reply = `Certo. Atualizei ${pendingDraft.title} para ${currency.format(correctedAmount)}. Revise o rascunho e confirme quando estiver tudo certo.`;
      const response: AssistantTurnResponse = {
        assistantMessage: reply,
        speechText: reply,
        drafts: [],
      };

      setDrafts((current) =>
        current.map((draft) =>
          draft.id === pendingDraft.id
            ? { ...draft, amount: correctedAmount, note: 'Valor corrigido, aguardando sua revisao.' }
            : draft,
        ),
      );
      if (session && supabase) {
        void updateRemoteDraftAmount(pendingDraft.id, correctedAmount).catch((error) =>
          setAssistantError(error instanceof Error ? `Corrigi o valor no app, mas nao consegui sincronizar: ${error.message}` : 'Corrigi o valor no app, mas nao consegui sincronizar.'),
        );
      }

      if (options?.clearInput) {
        setAssistantInput('');
      }

      setMessages((current) => [...current, createMessage('user', trimmed), createMessage('assistant', reply)]);
      setLastSpeechText(reply);

      if (options?.playTts) {
        setAssistantMode('responding');
        void playAssistantSpeech(reply);
      } else if (options?.awaitRealtimeVoice) {
        setAssistantMode('responding');
      }

      return response;
    }

    if (pendingDraft && correctedDate) {
      const reply = `Certo. Atualizei a data de ${pendingDraft.title} para ${formatBillDue(correctedDate)}. Revise o rascunho e confirme quando estiver tudo certo.`;
      const response: AssistantTurnResponse = {
        assistantMessage: reply,
        speechText: reply,
        drafts: [],
      };

      setDrafts((current) =>
        current.map((draft) =>
          draft.id === pendingDraft.id
            ? { ...draft, occurredAt: correctedDate, note: 'Data corrigida, aguardando sua revisao.' }
            : draft,
        ),
      );
      if (session && supabase) {
        void updateRemoteDraftOccurredAt(pendingDraft.id, correctedDate).catch((error) =>
          setAssistantError(error instanceof Error ? `Corrigi a data no app, mas nao consegui sincronizar: ${error.message}` : 'Corrigi a data no app, mas nao consegui sincronizar.'),
        );
      }

      if (options?.clearInput) {
        setAssistantInput('');
      }

      setMessages((current) => [...current, createMessage('user', trimmed), createMessage('assistant', reply)]);
      setLastSpeechText(reply);

      if (options?.playTts) {
        setAssistantMode('responding');
        void playAssistantSpeech(reply);
      } else if (options?.awaitRealtimeVoice) {
        setAssistantMode('responding');
      }

      return response;
    }

    if (pendingDraft && contextReply) {
      handleDraftContext(pendingDraft.id, contextReply);
      const reply = `Entendi. Classifiquei ${pendingDraft.title} como ${contextReply.toLowerCase()}. Revise o valor e confirme quando estiver tudo certo.`;
      const response: AssistantTurnResponse = {
        assistantMessage: reply,
        speechText: reply,
        drafts: [],
      };

      if (options?.clearInput) {
        setAssistantInput('');
      }

      setMessages((current) => [...current, createMessage('user', trimmed), createMessage('assistant', reply)]);
      setLastSpeechText(reply);

      if (options?.playTts) {
        setAssistantMode('responding');
        void playAssistantSpeech(reply);
      } else if (options?.awaitRealtimeVoice) {
        setAssistantMode('responding');
      }

      return response;
    }

    const runLocalAssistantFallback = () => {
      const parsed = parseFinanceMessage(trimmed);

      if (parsed.drafts.length === 0) {
        return null;
      }

      const reply = `${parsed.reply} A IA esta temporariamente offline, entao deixei tudo como rascunho local para voce revisar.`;
      const response: AssistantTurnResponse = {
        assistantMessage: reply,
        speechText: reply,
        drafts: parsed.drafts,
      };
      const localDrafts = parsed.drafts.map((draft) => ({
        ...draft,
        walletAccountId: pickAccountForContext(accountState, draft.context)?.id ?? null,
      }));

      setAssistantError(null);

      if (options?.clearInput) {
        setAssistantInput('');
      }

      setMessages((current) => [...current, createMessage('user', trimmed), createMessage('assistant', reply)]);
      setDrafts((current) => [...localDrafts, ...current]);
      setLastSpeechText(reply);
      setAssistantMode('idle');
      return response;
    };

    setAssistantError(null);
    const latestHealth = await refreshAssistantHealth();

    if (latestHealth && !latestHealth.openaiConfigured) {
      const localFallback = runLocalAssistantFallback();
      if (!localFallback) {
        setAssistantMode('idle');
        setAssistantError('A IA esta offline e nao consegui identificar um movimento financeiro nessa frase.');
      }
      return localFallback;
    }

    setAssistantMode('thinking');
    setIsAssistantLoading(true);

    if (options?.clearInput) {
      setAssistantInput('');
    }

    try {
      const result = await askNorteAssistant({
        message: trimmed,
        history: messages,
        movements,
        drafts,
        profile,
        selectedPain,
        financialContext: {
          personalBalance,
          today: new Date().toISOString().slice(0, 10),
          businessBalance,
          spendableToday,
          upcomingBillsTotal,
          upcomingBillsCount: pendingBills.length,
          overdueBillsCount: overdueBills.length,
          categorySpending,
          forecastEndBalance: cashForecast.projectedEndBalance,
          forecastLowestBalance: cashForecast.lowestBalance,
          forecastRiskDate: cashForecast.riskDate,
          availableCategories: categoryNames,
          creditCards: cardState.map((card) => ({
            name: card.name,
            invoiceAmount: card.used,
            limit: card.limit,
            availableLimit: Math.max(card.limit - card.used, 0),
            closingDay: card.closingDay ?? 8,
            dueDay: card.dueDay ?? 15,
            isBusiness: Boolean(card.isBusiness),
          })),
          financialConnectionsCount: connectionState.length,
        },
      }, session?.access_token);

      let persistedMessages = [createMessage('user', trimmed), createMessage('assistant', result.assistantMessage)];
      let persistedDrafts = result.drafts.map((draft) => ({
        ...draft,
        walletAccountId: pickAccountForContext(accountState, draft.context)?.id ?? null,
      }));

      const remoteTurn = await syncAssistantTurnRemotely(trimmed, result);
      if (remoteTurn) {
        persistedMessages = remoteTurn.persistedMessages;
        if (remoteTurn.persistedDrafts.length > 0) {
          persistedDrafts = remoteTurn.persistedDrafts.map((draft, index) => ({
            ...draft,
            occurredAt: draft.occurredAt ?? result.drafts[index]?.occurredAt,
            walletAccountId: pickAccountForContext(accountState, draft.context)?.id ?? null,
          }));
        }
      }

      setMessages((current) => [...current, ...persistedMessages]);

      if (persistedDrafts.length > 0) {
        setDrafts((current) => [...persistedDrafts, ...current]);
      }

      setLastSpeechText(result.speechText);

      if (options?.playTts && result.speechText) {
        setAssistantMode('responding');
        void playAssistantSpeech(result.speechText);
      } else if (options?.awaitRealtimeVoice) {
        setAssistantMode('responding');
      } else {
        setAssistantMode('idle');
      }

      return result;
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : 'Nao foi possivel falar com a IA real do Norte agora.';

      const localFallback = runLocalAssistantFallback();

      if (localFallback) {
        return localFallback;
      }

      if (options?.appendFailureMessage ?? true) {
        setMessages((current) => [
          ...current,
          createMessage('user', trimmed),
          createMessage(
            'assistant',
            `Nao consegui falar com o backend real do Norte. Verifique se o servidor esta rodando e se a OpenAI esta configurada. Detalhe: ${errorMessage}`,
          ),
        ]);
      }

      setAssistantError(errorMessage);
      setAssistantMode('idle');
      throw error;
    } finally {
      setIsAssistantLoading(false);
    }
  };

  const buildRealtimeContextInstructions = () => {
    const recentMovements = movements
      .slice(0, 6)
      .map((movement) => `${movement.type === 'income' ? 'Receita' : 'Despesa'} ${movement.title} ${movement.amount} ${movement.context}`)
      .join(' | ');

    const pendingDrafts = drafts
      .slice(0, 6)
      .map((draft) => `${draft.title} ${draft.amount} ${draft.context ?? 'sem contexto'} ${draft.question ?? ''}`.trim())
      .join(' | ');

    return [
      `Contexto do usuario: perfil ${profile}.`,
      `Principais dores: ${selectedPain.join(', ') || 'nenhuma informada'}.`,
      `Movimentos recentes: ${recentMovements || 'nenhum movimento recente.'}`,
      `Rascunhos pendentes: ${pendingDrafts || 'nenhum rascunho pendente.'}`,
      'Em assuntos financeiros, use a ferramenta analyze_financial_message como fonte principal antes de responder.',
    ].join('\n');
  };

  const handleRealtimeServerEvent = async (payload: string) => {
    try {
      const event = JSON.parse(payload) as Record<string, any>;

      switch (event.type) {
        case 'session.created':
        case 'session.updated':
          return;
        case 'input_audio_buffer.speech_started':
          setAssistantMode('listening');
          setLiveTranscript('Estou ouvindo voce em tempo real...');
          return;
        case 'input_audio_buffer.speech_stopped':
          setAssistantMode('thinking');
          return;
        case 'conversation.item.input_audio_transcription.delta':
          pendingVoiceMessageRef.current = `${pendingVoiceMessageRef.current}${event.delta ?? ''}`;
          setLiveTranscript(pendingVoiceMessageRef.current);
          return;
        case 'conversation.item.input_audio_transcription.completed': {
          const transcript = String(event.transcript ?? '').trim();
          pendingVoiceMessageRef.current = transcript;
          pendingAssistantTranscriptRef.current = '';
          voiceToolHandledRef.current = false;
          setLiveTranscript(transcript);
          setAssistantInput(transcript);
          setAssistantMode('thinking');
          return;
        }
        case 'conversation.item.input_audio_transcription.failed':
          setAssistantMode('idle');
          setAssistantError(event.error?.message ?? 'Nao consegui entender seu audio com clareza.');
          return;
        case 'response.created':
          pendingAssistantTranscriptRef.current = '';
          setAssistantMode('responding');
          return;
        case 'response.output_audio_transcript.delta':
          pendingAssistantTranscriptRef.current = `${pendingAssistantTranscriptRef.current}${event.delta ?? ''}`;
          if (!voiceToolHandledRef.current) {
            setLiveTranscript(`Norte: ${pendingAssistantTranscriptRef.current}`);
          }
          return;
        case 'response.output_audio_transcript.done': {
          const spokenTranscript = String(event.transcript ?? pendingAssistantTranscriptRef.current ?? '').trim();
          if (spokenTranscript) {
            setLastSpeechText(spokenTranscript);
          }

          if (!voiceToolHandledRef.current) {
            const userTurn = pendingVoiceMessageRef.current.trim();
            if (userTurn && spokenTranscript) {
              setMessages((current) => [...current, createMessage('user', userTurn), createMessage('assistant', spokenTranscript)]);
            }
          }

          pendingVoiceMessageRef.current = '';
          pendingAssistantTranscriptRef.current = '';
          setAssistantMode(conversationModeRef.current ? 'listening' : 'idle');
          setLiveTranscript(conversationModeRef.current ? 'Pode continuar falando. Eu sigo ouvindo.' : '');
          return;
        }
        case 'response.function_call_arguments.done': {
          if (event.name !== 'analyze_financial_message') {
            return;
          }

          voiceToolHandledRef.current = true;
          const parsedArguments = JSON.parse(String(event.arguments ?? '{}')) as { message?: string };
          const financialMessage = (parsedArguments.message ?? pendingVoiceMessageRef.current ?? '').trim();

          if (!financialMessage) {
            sendRealtimeEvent({
              type: 'conversation.item.create',
              item: {
                type: 'function_call_output',
                call_id: event.call_id,
                output: JSON.stringify({
                  ok: false,
                  error: 'Nao recebi uma frase valida do usuario para analisar.',
                }),
              },
            });
            sendRealtimeEvent({ type: 'response.create' });
            return;
          }

          try {
            const result = await runStructuredAssistantTurn(financialMessage, {
              playTts: false,
              appendFailureMessage: false,
              awaitRealtimeVoice: true,
            });

            sendRealtimeEvent({
              type: 'conversation.item.create',
              item: {
                type: 'function_call_output',
                call_id: event.call_id,
                output: JSON.stringify({
                  ok: true,
                  assistantMessage: result?.assistantMessage ?? '',
                  speechText: result?.speechText ?? '',
                  drafts: result?.drafts ?? [],
                }),
              },
            });
          } catch (toolError) {
            sendRealtimeEvent({
              type: 'conversation.item.create',
              item: {
                type: 'function_call_output',
                call_id: event.call_id,
                output: JSON.stringify({
                  ok: false,
                  error: toolError instanceof Error ? toolError.message : 'Falha ao analisar o movimento financeiro.',
                }),
              },
            });
          }

          sendRealtimeEvent({ type: 'response.create' });
          return;
        }
        case 'error':
          setAssistantError(event.error?.message ?? 'Falha na conversa em tempo real da Norte.');
          return;
        default:
          return;
      }
    } catch (error) {
      setAssistantError(error instanceof Error ? error.message : 'Falha ao interpretar os eventos da conversa em tempo real.');
    }
  };

  const startRealtimeConversation = async () => {
    if (!isRealtimeVoiceSupported()) {
      setAssistantError('Seu navegador nao suporta conversa de voz em tempo real com a Norte.');
      return;
    }

    try {
      setAssistantError(null);
      stopVoiceCapture();
      stopAssistantPlayback();
      stopRealtimeConversation();
      setIsRecording(true);
      setAssistantMode('listening');
      setLiveTranscript('Conectando a Norte em tempo real...');

      const transport = await createRealtimeTransport();
      realtimeTransportRef.current = transport;

      const peer = transport.peerConnection;
      realtimePeerRef.current = peer;
      const channel = transport.dataChannel;
      realtimeChannelRef.current = channel;
      channel.onmessage = (event: any) => {
        void handleRealtimeServerEvent(String(event.data ?? ''));
      };
      channel.onopen = () => {
        sendRealtimeEvent({
          type: 'session.update',
          session: {
            instructions: buildRealtimeContextInstructions(),
          },
        });
        setLiveTranscript('Pode falar naturalmente. A Norte responde sozinha.');
      };
      channel.onclose = () => {
        if (conversationModeRef.current) {
          setAssistantMode('idle');
        }
      };

      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      const answerSdp = await createNorteRealtimeSession(offer.sdp ?? '', session?.access_token);
      await peer.setRemoteDescription({ type: 'answer', sdp: answerSdp });
    } catch (error) {
      stopRealtimeConversation();
      setIsConversationMode(false);
      setIsRecording(false);
      setAssistantMode('idle');
      setLiveTranscript('');
      setAssistantError(
        error instanceof Error
          ? `Nao consegui abrir a conversa ao vivo da Norte: ${error.message}`
          : 'Nao consegui abrir a conversa ao vivo da Norte.',
      );
    }
  };

  const toggleConversationMode = async () => {
    if (isConversationMode) {
      setIsConversationMode(false);
      stopVoiceCapture();
      stopAssistantPlayback();
      stopRealtimeConversation();
      setIsRecording(false);
      setLiveTranscript('');
      setAssistantMode('idle');
      return;
    }

    setAssistantError(null);
    setIsConversationMode(true);
    await startRealtimeConversation();
  };

  const handleReplayLastSpeech = async () => {
    if (!lastSpeechText) {
      setAssistantError('Ainda nao existe uma resposta em voz para repetir.');
      return;
    }

    setAssistantMode('responding');
    await playAssistantSpeech(lastSpeechText);
  };

  const handleInterpretMessage = async (overrideMessage?: string) => {
    const trimmed = (overrideMessage ?? assistantInput).trim();

    if (!trimmed) {
      return;
    }

    try {
      await runStructuredAssistantTurn(trimmed, {
        clearInput: !overrideMessage,
        playTts: true,
        appendFailureMessage: true,
      });
    } catch (error) {
      setAssistantInput(trimmed);
    }
  };

  const handleConfirmDrafts = async () => {
    if (isConfirmingDrafts || drafts.length === 0 || drafts.some((draft) => !draft.context) || activeAccounts.length === 0) {
      return;
    }

    setIsConfirmingDrafts(true);

    try {
      const confirmedMovements = drafts.map((draft) => {
        const baseMovement = buildMovementFromDraft(draft);
        const account =
          activeAccounts.find((item) => item.id === draft.walletAccountId) ??
          pickAccountForContext(accountState, draft.context) ??
          activeAccounts[0] ??
          null;

        return {
          ...baseMovement,
          account: account?.name ?? baseMovement.account,
          walletAccountId: account?.id ?? draft.walletAccountId ?? null,
          cardId: draft.cardId ?? null,
        } satisfies Movement;
      });
      setMovements((current) => [...confirmedMovements, ...current]);
      setAccountState((current) =>
        confirmedMovements.reduce((updatedAccounts, movement) => applyMovementToAccounts(updatedAccounts, movement), current),
      );
      setDrafts([]);
      setMessages((current) => [
        ...current,
        createMessage('assistant', 'Pronto. Salvei os lancamentos confirmados e atualizei seus saldos locais.'),
      ]);
      setAssistantMode('responding');
      setTimeout(() => setAssistantMode('idle'), 1500);

      if (session && supabase) {
        try {
          await persistConfirmedDrafts(session, drafts);
        } catch (error) {
          setMessages((current) => [
            ...current,
            createMessage(
              'assistant',
              `Os dados foram atualizados no app, mas houve falha ao sincronizar com a nuvem: ${error instanceof Error ? error.message : 'erro desconhecido'}.`,
            ),
          ]);
        }
      }
    } finally {
      setIsConfirmingDrafts(false);
    }
  };

  const handleSaveManualEntry = async () => {
    if (isSavingManualEntry) {
      return;
    }

    const amount = parseCurrencyInput(manualEntry.amount);
    const entryDate = normalizeEntryDate(manualEntry.date);

    if (!manualEntry.title.trim() || !amount || !manualEntryAccount || !entryDate) {
      showNotice(
        'Confira o lancamento',
        'Informe uma descricao, um valor valido, uma data valida e escolha a conta que recebeu ou pagou esse movimento.',
      );
      return;
    }

    setIsSavingManualEntry(true);

    const previousMovement = editingMovementId ? movements.find((item) => item.id === editingMovementId) : null;
    const movement: Movement = {
      id: editingMovementId ?? `manual-${Date.now()}`,
      title: manualEntry.title.trim(),
      amount,
      type: manualEntry.type,
      context: manualEntry.context,
      category: manualEntry.category,
      source: 'Manual',
      createdAt: buildMovementTimestamp(entryDate, previousMovement?.createdAt),
      account: manualEntryAccount.name,
      walletAccountId: manualEntryAccount.id,
      cardId: manualEntryCard?.id ?? null,
    };

    try {
      if (editingMovementId) {
        setMovements((current) => current.map((item) => (item.id === editingMovementId ? movement : item)));
        if (previousMovement) {
          if (previousMovement.cardId || movement.cardId) {
            setCardState((current) =>
              current.map((card) => {
                let used = card.used;
                if (previousMovement.cardId === card.id && previousMovement.type === 'expense') used -= previousMovement.amount;
                if (movement.cardId === card.id && movement.type === 'expense') used += movement.amount;
                return { ...card, used: Math.max(used, 0) };
              }),
            );
            if (!previousMovement.cardId && !movement.cardId) {
              setAccountState((current) => applyMovementToAccounts(applyMovementToAccounts(current, previousMovement, -1), movement));
            } else if (!previousMovement.cardId) {
              setAccountState((current) => applyMovementToAccounts(current, previousMovement, -1));
            } else if (!movement.cardId) {
              setAccountState((current) => applyMovementToAccounts(current, movement));
            }
          } else {
            setAccountState((current) => applyMovementToAccounts(applyMovementToAccounts(current, previousMovement, -1), movement));
          }
        }
      } else {
        setMovements((current) => [movement, ...current]);
        if (movement.cardId && movement.type === 'expense') {
          setCardState((current) => current.map((card) => (card.id === movement.cardId ? { ...card, used: card.used + movement.amount } : card)));
        } else {
          setAccountState((current) => applyMovementToAccounts(current, movement));
        }
      }

      setManualEntry({
        ...defaultManualEntry,
        date: new Date().toISOString().slice(0, 10),
        accountId: activeAccounts[0]?.id ?? '',
      });
      setShowManualEntry(false);
      setEditingMovementId(null);

      if (session && supabase) {
        try {
          if (editingMovementId) {
            await updateMovement(session, editingMovementId, {
              title: movement.title,
              amount: movement.amount,
              type: movement.type,
              context: movement.context,
              category: movement.category,
              source: movement.source,
              occurredAt: movement.createdAt,
              walletAccountId: movement.walletAccountId,
              cardId: movement.cardId,
            });
          } else {
            await createMovement(session, {
              title: movement.title,
              amount: movement.amount,
              type: movement.type,
              context: movement.context,
              category: movement.category,
              source: movement.source,
              occurredAt: movement.createdAt,
              walletAccountId: movement.walletAccountId,
              cardId: movement.cardId,
            });
          }

          await refreshWorkspaceFromCloud();
        } catch (error) {
          setMessages((current) => [
            ...current,
            createMessage(
              'assistant',
              `Seu lancamento manual entrou no app, mas ainda nao consegui sincronizar com a nuvem: ${error instanceof Error ? error.message : 'erro desconhecido'}.`,
            ),
          ]);
        }
      }
    } finally {
      setIsSavingManualEntry(false);
    }
  };

  const activeCategories = useMemo(
    () => categoryState.filter((category) => !category.isArchived),
    [categoryState],
  );

  const handlePreviewStatement = () => {
    const preview = previewStatementCsv(statementCsv, movements);
    setStatementPreview(preview);
    if (preview.length === 0) showNotice('Não consegui ler o extrato', 'Use CSV com cabeçalhos Data, Descrição e Valor.');
  };

  const handleConfirmStatementImport = async () => {
    const account = activeAccounts.find((item) => item.id === statementAccountId);
    const items = statementPreview.filter((item) => !item.isDuplicate);
    if (!account || items.length === 0) {
      showNotice('Revise a importação', 'Escolha uma conta e mantenha ao menos um movimento novo.');
      return;
    }
    const imported = items.map((item): Movement => ({
      id: `import-${Date.now()}-${item.id}`,
      title: item.title,
      amount: item.amount,
      type: item.type,
      context: account.isBusiness ? 'Negocio' : 'Pessoal',
      source: 'Manual',
      createdAt: `${item.occurredAt}T12:00:00.000Z`,
      account: account.name,
      walletAccountId: account.id,
      category: getSuggestedMerchantCategory(item.title, activeCategories.map((category) => category.name)) ?? 'Outros',
    }));
    setMovements((current) => [...imported, ...current]);
    setAccountState((current) => imported.reduce((accounts, movement) => applyMovementToAccounts(accounts, movement), current));
    setStatementPreview([]);
    setStatementCsv('');
    setShowStatementImport(false);
    if (session && supabase) {
      try {
        await Promise.all(imported.map((movement) => createMovement(session, { title: movement.title, amount: movement.amount, type: movement.type, context: movement.context, source: movement.source, occurredAt: movement.createdAt, walletAccountId: movement.walletAccountId, category: movement.category })));
        await refreshWorkspaceFromCloud();
      } catch (error) {
        showNotice('Extrato importado no app', error instanceof Error ? `Ainda não sincronizou: ${error.message}` : 'Ainda não sincronizou.');
      }
    }
  };

  const categoryNames = useMemo(() => {
    const names = new Set(activeCategories.map((category) => category.name));
    movements.forEach((movement) => names.add(movement.category ?? 'Outros'));
    drafts.forEach((draft) => names.add(draft.category ?? 'Outros'));
    return [...names];
  }, [activeCategories, drafts, movements]);

  const handleSaveCategory = async () => {
    const name = categoryForm.name.trim().replace(/\s+/g, ' ');
    if (!name || name.length > 48) {
      setCategoryError('Dê um nome de até 48 caracteres para a categoria.');
      return;
    }
    if (categoryState.some((category) => category.id !== editingCategoryId && category.name.toLocaleLowerCase('pt-BR') === name.toLocaleLowerCase('pt-BR'))) {
      setCategoryError('Essa categoria já existe. Escolha outro nome.');
      return;
    }

    const existingCategory = categoryState.find((category) => category.id === editingCategoryId);
    const localCategory: FinancialCategory = {
      id: editingCategoryId ?? `category-${Date.now()}`,
      name,
      icon: categoryForm.icon,
      color: categoryForm.color,
      context: categoryForm.context,
    };
    setCategoryState((current) => editingCategoryId ? current.map((category) => category.id === editingCategoryId ? { ...localCategory, isDefault: existingCategory?.isDefault } : category) : [...current, localCategory]);
    setCategoryForm(defaultCategoryForm);
    setEditingCategoryId(null);
    setCategoryError(null);
    setShowCategoryForm(false);

    if (session && supabase) {
      try {
        const remoteCategory = editingCategoryId && !editingCategoryId.startsWith('category-')
          ? await updateFinancialCategory(session, editingCategoryId, { ...categoryForm, name })
          : await createFinancialCategory(session, { ...categoryForm, name });
        setCategoryState((current) => current.map((category) => (category.id === localCategory.id ? remoteCategory : category)));
      } catch (error) {
        setCategoryError(error instanceof Error ? `Categoria criada no app, mas ainda não sincronizou: ${error.message}` : 'Categoria criada no app, mas ainda não sincronizou.');
      }
    }
  };

  const handleEditCategory = (category: FinancialCategory) => {
    if (category.isDefault) {
      showNotice('Categoria padrão', 'As categorias padrão ficam protegidas para manter a organização do Norte. Crie uma personalizada quando precisar de outra classificação.');
      return;
    }
    setEditingCategoryId(category.id);
    setCategoryForm({ name: category.name, icon: category.icon, color: category.color, context: category.context ?? null });
    setCategoryError(null);
    setShowCategoryForm(true);
  };

  const handleArchiveCategory = async (category: FinancialCategory) => {
    if (category.isDefault) {
      showNotice('Categoria padrão', 'As categorias padrão ficam disponíveis para preservar a organização do Norte.');
      return;
    }
    setCategoryState((current) => current.map((item) => (item.id === category.id ? { ...item, isArchived: true } : item)));
    if (session && supabase && !category.id.startsWith('category-')) {
      try {
        await setFinancialCategoryArchived(session, category.id, true);
      } catch (error) {
        setCategoryState((current) => current.map((item) => (item.id === category.id ? { ...item, isArchived: false } : item)));
        showNotice('Não foi possível arquivar', error instanceof Error ? error.message : 'Tente novamente.');
      }
    }
  };

  const handleSaveManualConnection = async () => {
    const institutionName = connectionForm.institutionName.trim();
    if (!institutionName) {
      showNotice('Informe a instituição', 'Ex.: Nubank, Itaú, Banco do Brasil ou dinheiro em espécie.');
      return;
    }
    const localConnection: FinancialConnection = {
      id: `connection-${Date.now()}`,
      institutionName,
      connectionType: 'manual',
      status: 'active',
      linkedAccountId: connectionForm.linkedAccountId || null,
      lastSyncedAt: new Date().toISOString(),
    };
    setConnectionState((current) => [localConnection, ...current]);
    setConnectionForm(defaultConnectionForm);
    setShowConnectionForm(false);
    if (session && supabase) {
      try {
        const remoteConnection = await createFinancialConnection(session, localConnection);
        setConnectionState((current) => current.map((item) => (item.id === localConnection.id ? remoteConnection : item)));
      } catch (error) {
        showNotice('Conexão local criada', error instanceof Error ? `Ela ainda não sincronizou: ${error.message}` : 'Ela ainda não sincronizou.');
      }
    }
  };

  const handleEditMovement = (movement: Movement) => {
    setEditingMovementId(movement.id);
    setShowManualEntry(true);
    setManualEntry({
      title: movement.title,
      amount: String(movement.amount),
      date: movement.createdAt.slice(0, 10),
      type: movement.type,
      context: movement.context,
      category: movement.category ?? 'Outros',
      accountId:
        activeAccounts.find((account) => account.id === movement.walletAccountId)?.id ??
        activeAccounts.find((account) => account.name === movement.account)?.id ??
        activeAccounts[0]?.id ??
        '',
      cardId: movement.cardId ?? '',
    });
    setActiveTab('moves');
  };

  const finalizeMovementDeletion = async (movement: Movement) => {
    setPendingMovementDeletion((current) => (current?.movement.id === movement.id ? null : current));

    if (session && supabase) {
      try {
        await deleteMovement(session, movement.id);
        await refreshWorkspaceFromCloud();
      } catch (error) {
        setMessages((items) => [
          ...items,
          createMessage(
            'assistant',
            `Nao consegui excluir esse movimento da nuvem: ${error instanceof Error ? error.message : 'erro desconhecido'}.`,
          ),
        ]);
      }
    }
  };

  const undoDeleteMovement = () => {
    if (!pendingMovementDeletion) {
      return;
    }

    clearTimeout(pendingMovementDeletion.timeoutId);
    const { movement } = pendingMovementDeletion;
    setMovements((items) => [movement, ...items]);
    setAccountState((items) => applyMovementToAccounts(items, movement));
    setPendingMovementDeletion(null);
  };

  const handleDeleteMovement = async (movementId: string) => {
    const current = movements.find((item) => item.id === movementId);
    if (!current) {
      return;
    }

    if (pendingMovementDeletion) {
      clearTimeout(pendingMovementDeletion.timeoutId);
      await finalizeMovementDeletion(pendingMovementDeletion.movement);
    }

    setMovements((items) => items.filter((item) => item.id !== movementId));
    setAccountState((items) => applyMovementToAccounts(items, current, -1));
    const timeoutId = setTimeout(() => void finalizeMovementDeletion(current), 7000);
    setPendingMovementDeletion({ movement: current, timeoutId });
  };

  const requestDeleteMovement = (movementId: string) => {
    confirmDestructiveAction(
      'Excluir movimento?',
      'Esse movimento sera removido do historico e o saldo da conta sera recalculado.',
      () => handleDeleteMovement(movementId),
    );
  };

  const handleSaveAccount = async () => {
    const balance = parseCurrencyInput(accountForm.balance);

    if (!accountForm.name.trim() || !Number.isFinite(balance)) {
      showNotice('Confira os dados da conta', 'Informe um nome e um saldo valido, por exemplo: Conta digital e R$ 1.250,00.');
      return;
    }

    const localAccount: Account = {
      id: editingAccountId ?? `account-${Date.now()}`,
      name: accountForm.name.trim(),
      detail: accountForm.detail.trim() || (accountForm.isBusiness ? 'Conta do negocio' : 'Conta pessoal'),
      kind: accountForm.kind,
      isBusiness: accountForm.isBusiness,
      balance,
    };

    setAccountState((current) =>
      editingAccountId ? current.map((item) => (item.id === editingAccountId ? localAccount : item)) : [...current, localAccount],
    );

    setShowAccountForm(false);
    setEditingAccountId(null);
    setAccountForm(defaultAccountForm);

    if (session && supabase) {
      try {
        if (editingAccountId) {
          await updateWalletAccount(session, editingAccountId, localAccount);
        } else {
          await createWalletAccount(session, localAccount);
        }

        await refreshWorkspaceFromCloud();
      } catch (error) {
        setMessages((items) => [
          ...items,
          createMessage(
            'assistant',
            `Nao consegui salvar a conta na nuvem: ${error instanceof Error ? error.message : 'erro desconhecido'}.`,
          ),
        ]);
      }
    }
  };

  const handleEditAccount = (account: Account) => {
    setEditingAccountId(account.id);
    setShowAccountForm(true);
    setAccountForm({
      name: account.name,
      detail: account.detail,
      balance: String(account.balance),
      kind: account.kind,
      isBusiness: account.isBusiness,
    });
    setActiveTab('wallet');
  };

  const handleDeleteAccount = async (accountId: string) => {
    setAccountState((current) => current.filter((item) => item.id !== accountId));
    setCardState((current) => current.map((item) => (item.walletAccountId === accountId ? { ...item, walletAccountId: null } : item)));

    if (session && supabase) {
      try {
        await deleteWalletAccount(session, accountId);
        await refreshWorkspaceFromCloud();
      } catch (error) {
        setMessages((items) => [
          ...items,
          createMessage(
            'assistant',
            `Nao consegui excluir a conta da nuvem: ${error instanceof Error ? error.message : 'erro desconhecido'}.`,
          ),
        ]);
      }
    }
  };

  const handleArchiveAccount = async (accountId: string, isArchived: boolean) => {
    const previousAccount = accountState.find((account) => account.id === accountId);
    setAccountState((items) => items.map((account) => (account.id === accountId ? { ...account, isArchived } : account)));
    if (session && supabase) {
      try {
        await setWalletAccountArchived(session, accountId, isArchived);
      } catch (error) {
        if (previousAccount) {
          setAccountState((items) => items.map((account) => (account.id === accountId ? previousAccount : account)));
        }
        showNotice(
          'Nao foi possivel atualizar a conta',
          error instanceof Error ? error.message : 'Tente novamente em alguns instantes.',
        );
      }
    }
  };

  const requestArchiveAccount = (account: Account) => {
    confirmDestructiveAction(
      'Arquivar conta?',
      'Ela sairá do saldo disponível e dos novos lançamentos. Os movimentos anteriores continuarão no histórico.',
      () => handleArchiveAccount(account.id, true),
    );
  };

  const requestDeleteAccount = (accountId: string) => {
    confirmDestructiveAction(
      'Excluir conta?',
      'Cartoes vinculados perderao a conta associada. Os movimentos historicos serao mantidos.',
      () => handleDeleteAccount(accountId),
    );
  };

  const handleSaveCard = async () => {
    const limit = parseCurrencyInput(cardForm.limit);
    const used = parseCurrencyInput(cardForm.used);
    const closingDay = Number(cardForm.closingDay);
    const dueDay = Number(cardForm.dueDay);

    if (
      !cardForm.name.trim() ||
      !Number.isFinite(limit) ||
      limit <= 0 ||
      !Number.isFinite(used) ||
      used < 0 ||
      used > limit ||
      !Number.isInteger(closingDay) || closingDay < 1 || closingDay > 28 ||
      !Number.isInteger(dueDay) || dueDay < 1 || dueDay > 28
    ) {
      showNotice('Confira os dados do cartao', 'Informe nome, limite, fatura atual e dias de fechamento e vencimento entre 1 e 28.');
      return;
    }

    const localCard: WalletCard = {
      id: editingCardId ?? `card-${Date.now()}`,
      name: cardForm.name.trim(),
      limit,
      used,
      walletAccountId: cardForm.walletAccountId || null,
      closingDay,
      dueDay,
      brand: cardForm.brand.trim() || 'Credito',
      isBusiness: cardForm.isBusiness,
    };

    setCardState((current) =>
      editingCardId ? current.map((item) => (item.id === editingCardId ? localCard : item)) : [...current, localCard],
    );

    setShowCardForm(false);
    setEditingCardId(null);
    setCardForm(defaultCardForm);

    if (session && supabase) {
      try {
        if (editingCardId) {
          await updateWalletCard(session, editingCardId, localCard);
        } else {
          await createWalletCard(session, localCard);
        }

        await refreshWorkspaceFromCloud();
      } catch (error) {
        setMessages((items) => [
          ...items,
          createMessage(
            'assistant',
            `Nao consegui salvar o cartao na nuvem: ${error instanceof Error ? error.message : 'erro desconhecido'}.`,
          ),
        ]);
      }
    }
  };

  const handleEditCard = (card: WalletCard) => {
    setEditingCardId(card.id);
    setShowCardForm(true);
    setCardForm({
      name: card.name,
      limit: String(card.limit),
      used: String(card.used),
      walletAccountId: card.walletAccountId ?? '',
      closingDay: String(card.closingDay ?? 8),
      dueDay: String(card.dueDay ?? 15),
      brand: card.brand ?? 'Credito',
      isBusiness: Boolean(card.isBusiness),
    });
    setActiveTab('wallet');
  };

  const handlePayCardInvoice = async () => {
    if (isPayingCard) return;
    const amount = parseCurrencyInput(cardPaymentForm.amount);
    const card = cardState.find((item) => item.id === cardPaymentForm.cardId);
    const account = activeAccounts.find((item) => item.id === cardPaymentForm.walletAccountId);
    if (!card || !account || !Number.isFinite(amount) || amount <= 0) {
      showNotice('Confira o pagamento', 'Escolha o cartão, a conta de pagamento e um valor válido.');
      return;
    }
    if (amount > card.used) {
      showNotice('Valor acima da fatura', 'O pagamento não pode ser maior que a fatura atual.');
      return;
    }
    if (amount > account.balance) {
      showNotice('Saldo insuficiente', 'Escolha outra conta ou faça um pagamento parcial.');
      return;
    }
    setIsPayingCard(true);
    setCardState((current) => current.map((item) => item.id === card.id ? { ...item, used: Math.max(item.used - amount, 0) } : item));
    setAccountState((current) => current.map((item) => item.id === account.id ? { ...item, balance: item.balance - amount } : item));
    setCardPaymentForm(defaultCardPaymentForm);
    if (session && supabase) {
      try {
        await payCardInvoice(session, { cardId: card.id, walletAccountId: account.id, amount, paidAt: new Date().toISOString() });
      } catch (error) {
        setCardState((current) => current.map((item) => item.id === card.id ? card : item));
        setAccountState((current) => current.map((item) => item.id === account.id ? account : item));
        showNotice('Não foi possível pagar a fatura', error instanceof Error ? error.message : 'Tente novamente.');
      }
    }
    setIsPayingCard(false);
  };

  const handleDeleteCard = async (cardId: string) => {
    setCardState((current) => current.filter((item) => item.id !== cardId));

    if (session && supabase) {
      try {
        await deleteWalletCard(session, cardId);
        await refreshWorkspaceFromCloud();
      } catch (error) {
        setMessages((items) => [
          ...items,
          createMessage(
            'assistant',
            `Nao consegui excluir o cartao da nuvem: ${error instanceof Error ? error.message : 'erro desconhecido'}.`,
          ),
        ]);
      }
    }
  };

  const requestDeleteCard = (cardId: string) => {
    confirmDestructiveAction('Excluir cartao?', 'O cartao sera removido da sua carteira.', () => handleDeleteCard(cardId));
  };

  const handleSaveGoal = async () => {
    const target = parseCurrencyInput(goalForm.target);
    const current = parseCurrencyInput(goalForm.current);

    if (
      !goalForm.title.trim() ||
      !Number.isFinite(target) ||
      target <= 0 ||
      !Number.isFinite(current) ||
      current < 0 ||
      (goalForm.targetDate.trim() && !isValidIsoDate(goalForm.targetDate.trim()))
    ) {
      showNotice('Confira os dados da meta', 'Informe um nome, um objetivo maior que zero e uma data no formato AAAA-MM-DD, se quiser definir prazo.');
      return;
    }

    const localGoal: Goal = {
      id: editingGoalId ?? `goal-${Date.now()}`,
      title: goalForm.title.trim(),
      current: Math.min(current, target),
      target,
      status: current >= target ? 'completed' : editingGoalId ? goalState.find((goal) => goal.id === editingGoalId)?.status ?? 'active' : 'active',
      targetDate: goalForm.targetDate.trim() || null,
    };

    setGoalState((items) =>
      editingGoalId ? items.map((goal) => (goal.id === editingGoalId ? localGoal : goal)) : [...items, localGoal],
    );
    setGoalForm(defaultGoalForm);
    setShowGoalForm(false);
    const savedGoalId = editingGoalId;
    setEditingGoalId(null);

    if (session && supabase) {
      try {
        if (savedGoalId) {
          await updateGoal(session, savedGoalId, localGoal);
        } else {
          await createGoal(session, localGoal);
        }
        await refreshWorkspaceFromCloud();
      } catch (error) {
        setMessages((items) => [
          ...items,
          createMessage('assistant', `A meta foi criada localmente, mas nao sincronizou com a nuvem: ${error instanceof Error ? error.message : 'erro desconhecido'}.`),
        ]);
      }
    }
  };

  const handleEditGoal = (goal: Goal) => {
    setEditingGoalId(goal.id);
    setGoalForm({
      title: goal.title,
      target: String(goal.target),
      current: String(goal.current),
      targetDate: goal.targetDate ?? '',
    });
    setShowGoalForm(true);
    setActiveTab('plan');
  };

  const saveGoalUpdate = async (goal: Goal) => {
    setGoalState((items) => items.map((item) => (item.id === goal.id ? goal : item)));

    if (session && supabase) {
      try {
        await updateGoal(session, goal.id, goal);
        await refreshWorkspaceFromCloud();
      } catch (error) {
        setMessages((items) => [
          ...items,
          createMessage('assistant', `A meta foi atualizada neste aparelho, mas nao sincronizou: ${error instanceof Error ? error.message : 'erro desconhecido'}.`),
        ]);
      }
    }
  };

  const handleGoalContribution = async (goal: Goal) => {
    const contribution = parseCurrencyInput(goalContributionAmount);
    if (!Number.isFinite(contribution) || contribution <= 0) {
      showNotice('Confira o aporte', 'Informe um valor maior que zero para atualizar sua meta.');
      return;
    }

    const current = Math.min(goal.current + contribution, goal.target);
    await saveGoalUpdate({ ...goal, current, status: current >= goal.target ? 'completed' : 'active' });
    setGoalContributionAmount('');
    setContributingGoalId(null);
  };

  const toggleGoalStatus = async (goal: Goal) => {
    const nextStatus = goal.status === 'paused' ? 'active' : 'paused';
    await saveGoalUpdate({ ...goal, status: nextStatus });
  };

  const completeGoal = async (goal: Goal) => {
    await saveGoalUpdate({ ...goal, current: goal.target, status: 'completed' });
  };

  const handleDeleteGoal = (goalId: string) => {
    confirmDestructiveAction('Excluir meta?', 'O progresso desta meta sera removido do seu planejamento.', async () => {
      setGoalState((items) => items.filter((goal) => goal.id !== goalId));
      if (editingGoalId === goalId) {
        setEditingGoalId(null);
        setGoalForm(defaultGoalForm);
        setShowGoalForm(false);
      }

      if (session && supabase) {
        try {
          await deleteGoal(session, goalId);
          await refreshWorkspaceFromCloud();
        } catch (error) {
          setMessages((items) => [
            ...items,
            createMessage('assistant', `A meta saiu deste aparelho, mas nao consegui atualizar a nuvem: ${error instanceof Error ? error.message : 'erro desconhecido'}.`),
          ]);
        }
      }
    });
  };

  const handleSaveBill = async () => {
    const amount = parseCurrencyInput(billForm.amount);

    if (
      !billForm.title.trim() ||
      !Number.isFinite(amount) ||
      amount <= 0 ||
      !isValidIsoDate(billForm.due.trim())
    ) {
      showNotice('Confira os dados da conta', 'Informe uma descricao, um valor maior que zero e a data no formato AAAA-MM-DD.');
      return;
    }

    const localBill: UpcomingBill = {
      id: editingBillId ?? `bill-${Date.now()}`,
      title: billForm.title.trim(),
      amount,
      due: billForm.due.trim(),
      context: billForm.context,
      isRecurring: billForm.isRecurring,
      status: 'pending',
      paidAt: null,
    };

    const savedBillId = editingBillId;
    setBillState((items) => (savedBillId ? items.map((bill) => (bill.id === savedBillId ? localBill : bill)) : [...items, localBill]));
    setBillForm(defaultBillForm);
    setShowBillForm(false);
    setEditingBillId(null);

    if (session && supabase) {
      try {
        if (savedBillId) {
          await updateScheduledBill(session, savedBillId, localBill);
        } else {
          await createScheduledBill(session, localBill);
        }
        await refreshWorkspaceFromCloud();
      } catch (error) {
        setMessages((items) => [
          ...items,
          createMessage('assistant', `A conta foi criada localmente, mas nao sincronizou com a nuvem: ${error instanceof Error ? error.message : 'erro desconhecido'}.`),
        ]);
      }
    }
  };

  const handleEditBill = (bill: UpcomingBill) => {
    setEditingBillId(bill.id);
    setBillForm({
      title: bill.title,
      amount: String(bill.amount),
      due: bill.due,
      context: bill.context,
      isRecurring: bill.isRecurring,
    });
    setShowBillForm(true);
    setActiveTab('plan');
  };

  const handlePayBill = async (bill: UpcomingBill) => {
    const account = pickAccountForContext(accountState, bill.context);
    if (!account) {
      showNotice('Adicione uma conta', 'Voce precisa de uma conta para registrar o pagamento desse vencimento.');
      return;
    }

    const movement: Movement = {
      id: `bill-payment-${Date.now()}`,
      title: bill.title,
      amount: bill.amount,
      type: 'expense',
      context: bill.context,
      source: 'Manual',
      createdAt: new Date().toISOString(),
      account: account.name,
      walletAccountId: account.id,
      cardId: null,
    };

    const paidAt = new Date().toISOString();
    const nextBill = bill.isRecurring
      ? { ...bill, due: nextRecurringDue(bill.due), status: 'pending' as const, paidAt: null }
      : { ...bill, status: 'paid' as const, paidAt };
    setBillState((items) => items.map((item) => (item.id === bill.id ? nextBill : item)));
    setMovements((items) => [movement, ...items]);
    setAccountState((items) => applyMovementToAccounts(items, movement));

    if (session && supabase) {
      try {
        await createMovement(session, {
          title: movement.title,
          amount: movement.amount,
          type: movement.type,
          context: movement.context,
          source: movement.source,
          occurredAt: movement.createdAt,
          walletAccountId: movement.walletAccountId,
        });
        if (bill.isRecurring) {
          await updateScheduledBill(session, bill.id, nextBill);
        } else {
          await setScheduledBillPaid(session, bill.id, paidAt);
        }
        await refreshWorkspaceFromCloud();
      } catch (error) {
        setMessages((items) => [
          ...items,
          createMessage(
            'assistant',
            `O pagamento entrou no app, mas a sincronizacao falhou: ${error instanceof Error ? error.message : 'erro desconhecido'}.`,
          ),
        ]);
      }
    }
  };

  const handleReopenBill = async (bill: UpcomingBill) => {
    setBillState((items) => items.map((item) => (item.id === bill.id ? { ...item, status: 'pending', paidAt: null } : item)));

    if (session && supabase) {
      try {
        await setScheduledBillPaid(session, bill.id, null);
      } catch (error) {
        setBillState((items) => items.map((item) => (item.id === bill.id ? bill : item)));
        showNotice('Nao foi possivel reabrir a conta', error instanceof Error ? error.message : 'Tente novamente em alguns instantes.');
      }
    }
  };

  const handleDeleteBill = (billId: string) => {
    confirmDestructiveAction('Excluir conta futura?', 'Ela deixara de entrar no calculo do seu valor disponivel.', async () => {
      setBillState((items) => items.filter((bill) => bill.id !== billId));

      if (session && supabase) {
        try {
          await deleteScheduledBill(session, billId);
          await refreshWorkspaceFromCloud();
        } catch (error) {
          setMessages((items) => [
            ...items,
            createMessage('assistant', `A conta saiu deste aparelho, mas nao consegui atualizar a nuvem: ${error instanceof Error ? error.message : 'erro desconhecido'}.`),
          ]);
        }
      }
    });
  };

  const handleResetLocalData = () => {
    setStep('welcome');
    setOnboardingIndex(0);
    setProfile('freelancer');
    setSelectedPain(['Misturo pessoal com negocio', 'Nao sei quanto posso gastar']);
    setThemeMode('light');
    setAssistantMode('idle');
    setActiveTab('assistant');
    setFocusPanel('business');
    setMessages(initialMessages);
    setDrafts(initialDrafts);
    setMovements(initialMovements);
    setAccountState(initialAccounts);
    setCardState(initialCards);
    setGoalState(goals);
    setBillState(upcomingBills);
    setAssistantInput(initialAssistantInput);
    setShowManualEntry(false);
    setManualEntry({ ...defaultManualEntry, accountId: initialAccounts[0]?.id ?? '' });
    setEditingMovementId(null);
    setShowAccountForm(false);
    setAccountForm(defaultAccountForm);
    setEditingAccountId(null);
    setShowCardForm(false);
    setCardForm(defaultCardForm);
    setEditingCardId(null);
    setShowGoalForm(false);
    setGoalForm(defaultGoalForm);
    setEditingGoalId(null);
    setContributingGoalId(null);
    setGoalContributionAmount('');
    setShowBillForm(false);
    setBillForm(defaultBillForm);
    setEditingBillId(null);
    setMovementTypeFilter('all');
    setMovementContextFilter('all');
    setMovementCategoryFilter('all');
    setMovementPeriodFilter('all');
    setMovementAccountFilter('all');
    setMovementCardFilter('all');
    setMovementSort('newest');
    setMovementSearch('');
  };

  const sortedGoals = useMemo(
    () =>
      [...goalState]
        .sort((left, right) => {
          const ranking = { active: 0, paused: 1, completed: 2 } as const;
          return ranking[left.status] - ranking[right.status];
        })
        .map((goal) => ({
          ...goal,
          progress: Math.min(goal.current / goal.target, 1),
        })),
    [goalState],
  );
  const decoratedGoals = useMemo(
    () =>
      sortedGoals.map((goal, index) => ({
        ...goal,
        accent: goalAccentPalette[index % goalAccentPalette.length],
      })),
    [sortedGoals],
  );
  const currentTheme = appThemes[themeMode];
  palette = currentTheme;
  activeThemeMode = themeMode;
  styles = getStyles(themeMode);

  if (isHydrating) {
    return (
      <Shell theme={currentTheme}>
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.loadingWrap}>
            <NorteOrb size={140} mode="thinking" theme={currentTheme} />
            <Text style={styles.sectionTitle}>Carregando seu Norte</Text>
            <Text style={styles.bodyText}>Recuperando seus dados locais e preparando a experiencia.</Text>
          </View>
        </SafeAreaView>
      </Shell>
    );
  }

  if (isAuthLoading && isSupabaseConfigured() && !isLocalMode) {
    return (
      <Shell theme={currentTheme}>
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.loadingWrap}>
            <NorteOrb size={140} mode="thinking" theme={currentTheme} />
            <Text style={styles.sectionTitle}>Conectando sua conta</Text>
            <Text style={styles.bodyText}>Validando autenticacao e preparando seu espaco do Norte.</Text>
          </View>
        </SafeAreaView>
      </Shell>
    );
  }

  if (isSupabaseConfigured() && !session && !isLocalMode) {
    return (
      <Shell theme={currentTheme}>
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.authWrap}>
            <AuthScreen
              error={authError}
              isLoading={isAuthLoading}
              onSubmit={handleAuthSubmit}
              onContinueLocal={() => {
                setAuthError(null);
                setIsLocalMode(true);
                setStep('app');
                setActiveTab('assistant');
              }}
              theme={currentTheme}
            />
          </View>
        </SafeAreaView>
      </Shell>
    );
  }

  if (step === 'welcome') {
    return (
      <Shell theme={currentTheme}>
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.welcomeWrap}>
            <View style={styles.logoLockup}>
              <NorteOrb size={132} mode="idle" theme={currentTheme} />
              <Text style={styles.brand}>Norte</Text>
              <Text style={styles.subtitle}>
                O assistente financeiro que organiza sua vida pessoal e seu negocio conversando com voce.
              </Text>
            </View>

            <View style={styles.featureStack}>
              <FeatureRow
                icon="chatbubble-ellipses-outline"
                title="Converse em vez de preencher planilhas"
                description="Voce fala naturalmente, o app interpreta e monta rascunhos antes de salvar."
              />
              <FeatureRow
                icon="git-compare-outline"
                title="Separe pessoal e negocio com clareza"
                description="O Norte identifica ambiguidades, pergunta o que falta e mostra o impacto no caixa."
              />
              <FeatureRow
                icon="sparkles-outline"
                title="Clareza que acompanha voce"
                description="Lançamentos, metas, cartões e decisões financeiras organizados em um só lugar."
              />
            </View>

            <Pressable style={styles.primaryButton} onPress={() => setStep('onboarding')}>
              <Text style={styles.primaryButtonText}>Comecar experiencia</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </Shell>
    );
  }

  if (step === 'onboarding') {
    return (
      <Shell theme={currentTheme}>
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.onboardingHeader}>
            <Text style={styles.kicker}>Onboarding</Text>
            <Text style={styles.sectionTitle}>Vamos adaptar o Norte ao seu momento</Text>
            <Text style={styles.bodyText}>
              Suas escolhas orientam a Norte desde o primeiro dia e podem ser ajustadas quando quiser.
            </Text>
          </View>

          <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
            {onboardingIndex === 0 && (
              <View style={styles.stack}>
                {onboardingProfiles.map((item) => (
                  <SelectableCard
                    key={item.id}
                    selected={profile === item.id}
                    title={item.title}
                    description={item.description}
                    onPress={() => setProfile(item.id)}
                  />
                ))}
              </View>
            )}

            {onboardingIndex === 1 && (
              <View style={styles.stack}>
                <Text style={styles.sectionTitle}>O que mais te atrapalha hoje?</Text>
                <View style={styles.pillRow}>
                  {painPoints.map((item) => (
                    <Pill
                      key={item}
                      label={item}
                      selected={selectedPain.includes(item)}
                      onPress={() => handlePainToggle(item)}
                    />
                  ))}
                </View>
              </View>
            )}

            {onboardingIndex === 2 && (
              <View style={styles.stack}>
                <Card>
                  <Text style={styles.cardTitle}>Como o Norte comeca neste MVP</Text>
                  <Text style={styles.bodyText}>
                    Home clara com o que importa, lancamentos manuais quando quiser e a Norte IA como principal forma de registrar o dia financeiro.
                  </Text>
                  <View style={styles.metricRow}>
                    <MiniMetric
                      label="Perfil"
                      value={profile === 'personal' ? 'Pessoal' : profile === 'freelancer' ? 'Autonomo' : 'MEI'}
                    />
                    <MiniMetric label="Foco" value="Separar e simplificar" />
                  </View>
                </Card>
              </View>
            )}
          </ScrollView>

          <View style={styles.footerActions}>
            {onboardingIndex > 0 ? (
              <Pressable style={styles.secondaryButton} onPress={() => setOnboardingIndex((value) => value - 1)}>
                <Text style={styles.secondaryButtonText}>Voltar</Text>
              </Pressable>
            ) : (
              <View />
            )}

            <Pressable
              style={styles.primaryButton}
              onPress={() => {
                if (onboardingIndex < 2) {
                  setOnboardingIndex((value) => value + 1);
                  return;
                }

                setStep('app');
              }}
            >
              <Text style={styles.primaryButtonText}>{onboardingIndex < 2 ? 'Continuar' : 'Entrar no Norte'}</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </Shell>
    );
  }

  return (
    <Shell theme={currentTheme}>
      <StatusBar barStyle={themeMode === 'dark' ? 'light-content' : 'dark-content'} />
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.appHeader}>
          <View style={styles.headerLeading}>
            <Pressable style={styles.headerMenuButton} onPress={() => setIsDrawerOpen(true)}>
              <Ionicons name="menu-outline" size={22} color={palette.text} />
            </Pressable>
            <View>
              <Text style={styles.kicker}>Norte</Text>
              <Text style={styles.appTitle}>Ola, {userFirstName}</Text>
              <Text style={styles.headerMeta}>Seu dinheiro com mais clareza</Text>
            </View>
          </View>
          <View style={styles.headerActions}>
            <View style={styles.headerBadge}>
              <Text style={styles.headerBadgeText}>
                {isLocalMode ? 'Modo demonstracao' : isRemoteSyncing ? 'Sincronizando' : authError ? 'Erro na nuvem' : 'Nuvem ativa'}
              </Text>
            </View>
            <Pressable style={styles.avatarButton} onPress={() => setIsProfileOpen((value) => !value)}>
              <LinearGradient colors={palette.avatarGradient} style={styles.avatarGradient}>
                <Text style={styles.avatarText}>{userInitials || 'N'}</Text>
              </LinearGradient>
            </Pressable>
          </View>
        </View>

        {isProfileOpen ? (
          <View style={styles.profilePopover}>
            <View style={styles.profileIdentity}>
              <LinearGradient colors={palette.avatarGradient} style={styles.profileAvatarLarge}>
                <Text style={styles.profileAvatarText}>{userInitials || 'N'}</Text>
              </LinearGradient>
              <View style={styles.flexOne}>
                <Text style={styles.cardTitle}>{userDisplayName}</Text>
                <Text style={styles.mutedText}>{session?.user?.email ?? 'Conta local'}</Text>
              </View>
            </View>
            <Pressable style={styles.profileAction} onPress={() => handleDrawerNavigate('settings')}>
              <Ionicons name="settings-outline" size={18} color={palette.text} />
              <Text style={styles.profileActionText}>Abrir configuracoes</Text>
            </Pressable>
            {authError && !isLocalMode ? (
              <View style={styles.profileSyncError}>
                <Text style={styles.profileSyncErrorText}>{authError}</Text>
                <Pressable onPress={() => void handleRefreshWorkspace()} disabled={isRemoteSyncing}>
                  <Text style={styles.inlineLink}>{isRemoteSyncing ? 'Tentando...' : 'Tentar sincronizar'}</Text>
                </Pressable>
              </View>
            ) : null}
            {isLocalMode ? (
              <Pressable style={styles.profileAction} onPress={() => setIsLocalMode(false)}>
                <Ionicons name="cloud-upload-outline" size={18} color={palette.text} />
                <Text style={styles.profileActionText}>Entrar e sincronizar dados</Text>
              </Pressable>
            ) : (
              <Pressable style={styles.profileAction} onPress={() => void handleSignOut()}>
                <Ionicons name="log-out-outline" size={18} color={palette.text} />
                <Text style={styles.profileActionText}>Sair da conta</Text>
              </Pressable>
            )}
          </View>
        ) : null}

        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {activeTab === 'home' && (
            <View style={styles.stack}>
              <BalanceSpotlightCard
                totalBalance={currency.format(totalBalance)}
                personalBalance={currency.format(personalBalance)}
                businessBalance={currency.format(businessBalance)}
                spendableToday={currency.format(spendableToday)}
                healthLabel={healthPresentation.label}
                healthColor={healthPresentation.color}
                monthIncome={currency.format(monthIncome)}
                monthExpense={currency.format(monthExpense)}
                monthResult={currency.format(Math.abs(monthResult))}
                monthResultPositive={monthResult >= 0}
                onOpenWallet={() => setActiveTab('wallet')}
                onOpenMoves={() => setActiveTab('moves')}
                onOpenPlan={() => setActiveTab('plan')}
                onOpenAssistant={() => setActiveTab('assistant')}
              />

              <GuidanceCard
                eyebrow={northGuidance.eyebrow}
                title={northGuidance.title}
                description={northGuidance.description}
                icon={northGuidance.icon}
                onPress={() => setActiveTab(pendingQuestions > 0 ? 'assistant' : 'moves')}
              />

              <CashForecastCard forecast={cashForecast} mode={forecastMode} onChangeMode={setForecastMode} />

              <CreditInvoiceSummaryCard cards={cardState} onPress={() => setActiveTab('wallet')} />

              <Card variant="soft">
                <View style={styles.rowBetween}>
                  <View>
                    <Text style={styles.cardTitle}>Para onde seu dinheiro foi</Text>
                    <Text style={styles.mutedText}>Despesas deste mes</Text>
                  </View>
                  <Pressable onPress={() => setActiveTab('moves')}>
                    <Text style={styles.inlineLink}>Ver movimentos</Text>
                  </Pressable>
                </View>
                <CategorySpendingList items={categorySpending} />
              </Card>

              <Card variant="soft">
                <View style={styles.rowBetween}>
                  <View>
                    <Text style={styles.cardTitle}>Proximos vencimentos</Text>
                    <Text style={styles.mutedText}>O que ainda precisa de atencao</Text>
                  </View>
                  <Pressable onPress={() => setActiveTab('plan')}>
                    <Text style={styles.inlineLink}>Ver agenda</Text>
                  </Pressable>
                </View>
                <UpcomingBillsList bills={pendingBills} />
              </Card>

              <Card variant="soft">
                <View style={styles.rowBetween}>
                  <View>
                    <Text style={styles.cardTitle}>Ultimos movimentos</Text>
                    <Text style={styles.mutedText}>O que entrou e saiu por ultimo</Text>
                  </View>
                  <Pressable onPress={() => setActiveTab('moves')}>
                    <Text style={styles.inlineLink}>Ver todos</Text>
                  </Pressable>
                </View>
                <RecentMovementsList movements={movements} />
              </Card>

              <Card variant="soft">
                <View style={styles.rowBetween}>
                  <Text style={styles.cardTitle}>Suas metas</Text>
                  <Pressable onPress={() => setActiveTab('plan')}>
                    <Text style={styles.inlineLink}>Ver tudo</Text>
                  </Pressable>
                </View>
                <View style={styles.detailStack}>
                  {decoratedGoals.length > 0 ? (
                    decoratedGoals.map((goal) => (
                      <GoalListItem
                        key={goal.id}
                        title={goal.title}
                        current={goal.current}
                        target={goal.target}
                        progress={goal.progress}
                        accent={goal.accent}
                        status={goal.status}
                        targetDate={goal.targetDate}
                      />
                    ))
                  ) : (
                    <View style={styles.emptyState}>
                      <Ionicons name="flag-outline" size={22} color={palette.textMuted} />
                      <Text style={styles.bodyText}>Crie uma meta para dar um destino claro ao seu dinheiro.</Text>
                    </View>
                  )}
                </View>
              </Card>

              <Card variant="soft">
                <View style={styles.rowBetween}>
                  <Text style={styles.cardTitle}>Visoes essenciais</Text>
                  <Pressable onPress={() => setActiveTab('assistant')}>
                    <Text style={styles.inlineLink}>Abrir Norte IA</Text>
                  </Pressable>
                </View>
                <View style={styles.pillRow}>
                  <Pill label="Negocio" selected={focusPanel === 'business'} onPress={() => setFocusPanel('business')} />
                  <Pill label="Analises" selected={focusPanel === 'analysis'} onPress={() => setFocusPanel('analysis')} />
                  <Pill
                    label="Configuracoes"
                    selected={focusPanel === 'settings'}
                    onPress={() => setFocusPanel('settings')}
                  />
                </View>
                {focusPanel === 'business' && (
                  <View style={styles.detailStack}>
                    {businessHighlights.map((item) => (
                      <InsightRow key={item} text={item} />
                    ))}
                  </View>
                )}
                {focusPanel === 'analysis' && (
                  <View style={styles.detailStack}>
                    <View style={styles.grid}>
                      {analysisMetrics.map((metric) => (
                        <MetricCard key={metric.label} label={metric.label} value={metric.value} detail={metric.detail} />
                      ))}
                    </View>
                    {analysisHighlights.map((item) => (
                      <InsightRow key={item} text={item} />
                    ))}
                    <Pressable style={styles.secondaryButton} onPress={() => setActiveTab('assistant')}>
                      <Text style={styles.secondaryButtonText}>Perguntar ao Norte sobre esta analise</Text>
                    </Pressable>
                  </View>
                )}
                {focusPanel === 'settings' && (
                  <View style={styles.detailStack}>
                    <View style={styles.themePanel}>
                      <Text style={styles.cardTitle}>Como o Norte te acompanha</Text>
                      <Text style={styles.mutedText}>Esse contexto orienta as perguntas, alertas e análises.</Text>
                      <View style={styles.pillRow}>
                        {onboardingProfiles.map((item) => (
                          <Pill key={item.id} label={item.id === 'personal' ? 'Pessoal' : item.id === 'freelancer' ? 'Autônomo' : 'Negócio'} selected={profile === item.id} onPress={() => setProfile(item.id)} />
                        ))}
                      </View>
                      <View style={styles.pillRow}>
                        {painPoints.map((item) => <Pill key={item} label={item} selected={selectedPain.includes(item)} onPress={() => handlePainToggle(item)} />)}
                      </View>
                    </View>
                    <View style={styles.themePanel}>
                      <Text style={styles.cardTitle}>Aparencia</Text>
                      <View style={styles.themeOptions}>
                        <Pressable
                          style={[styles.themeOption, themeMode === 'light' && styles.themeOptionActive]}
                          onPress={() => setThemeMode('light')}
                        >
                          <Ionicons name="sunny-outline" size={18} color={themeMode === 'light' ? palette.text : palette.textMuted} />
                          <Text style={[styles.themeOptionText, themeMode === 'light' && styles.themeOptionTextActive]}>Claro</Text>
                        </Pressable>
                        <Pressable
                          style={[styles.themeOption, themeMode === 'dark' && styles.themeOptionActive]}
                          onPress={() => setThemeMode('dark')}
                        >
                          <Ionicons name="moon-outline" size={18} color={themeMode === 'dark' ? palette.text : palette.textMuted} />
                          <Text style={[styles.themeOptionText, themeMode === 'dark' && styles.themeOptionTextActive]}>Dark</Text>
                        </Pressable>
                      </View>
                    </View>
                    <InsightRow
                      text={
                        session
                          ? 'Seus dados ficam sincronizados na sua conta do Supabase e separados de outros usuarios.'
                          : 'Todos os seus dados ficam persistidos localmente neste aparelho.'
                      }
                    />
                    <InsightRow text="Nada e salvo automaticamente sem sua confirmacao na area da IA." />
                    <View style={styles.themePanel}>
                      <View style={styles.rowBetween}>
                        <View>
                          <Text style={styles.cardTitle}>Categorias</Text>
                          <Text style={styles.mutedText}>Personalize como o Norte organiza seus gastos.</Text>
                        </View>
                        <Pressable onPress={() => { setShowCategoryForm((value) => !value); setEditingCategoryId(null); setCategoryForm(defaultCategoryForm); setCategoryError(null); }}>
                          <Text style={styles.inlineLink}>{showCategoryForm ? 'Fechar' : 'Nova'}</Text>
                        </Pressable>
                      </View>
                      {showCategoryForm ? (
                        <View style={styles.detailStack}>
                          <TextInput
                            value={categoryForm.name}
                            onChangeText={(name) => setCategoryForm((current) => ({ ...current, name }))}
                            placeholder="Ex.: Marketing, Pet, Entregas"
                            placeholderTextColor={palette.textMuted}
                            style={styles.field}
                          />
                          <View style={styles.pillRow}>
                            {categoryIconOptions.map((icon) => (
                              <Pressable key={icon} onPress={() => setCategoryForm((current) => ({ ...current, icon }))} style={[styles.iconChoice, categoryForm.icon === icon && styles.iconChoiceActive]}>
                                <Ionicons name={icon as keyof typeof Ionicons.glyphMap} size={18} color={categoryForm.icon === icon ? palette.background : palette.text} />
                              </Pressable>
                            ))}
                          </View>
                          <View style={styles.pillRow}>
                            {categoryColorOptions.map((color) => (
                              <Pressable key={color} onPress={() => setCategoryForm((current) => ({ ...current, color }))} style={[styles.colorChoice, { backgroundColor: color }, categoryForm.color === color && styles.colorChoiceActive]} />
                            ))}
                          </View>
                          <View style={styles.pillRow}>
                            <Pill label="Todos" selected={!categoryForm.context} onPress={() => setCategoryForm((current) => ({ ...current, context: null }))} />
                            <Pill label="Pessoal" selected={categoryForm.context === 'Pessoal'} onPress={() => setCategoryForm((current) => ({ ...current, context: 'Pessoal' }))} />
                            <Pill label="Negocio" selected={categoryForm.context === 'Negocio'} onPress={() => setCategoryForm((current) => ({ ...current, context: 'Negocio' }))} />
                          </View>
                          {categoryError ? <Text style={styles.inlineDanger}>{categoryError}</Text> : null}
                          <Pressable style={styles.primaryButtonCompact} onPress={() => void handleSaveCategory()}>
                            <Text style={styles.primaryButtonText}>{editingCategoryId ? 'Salvar categoria' : 'Criar categoria'}</Text>
                          </Pressable>
                        </View>
                      ) : null}
                      <View style={styles.categoryManagerList}>
                        {activeCategories.map((category) => (
                          <View key={category.id} style={styles.categoryManagerRow}>
                            <View style={[styles.categoryDot, { backgroundColor: category.color }]} />
                            <Ionicons name={category.icon as keyof typeof Ionicons.glyphMap} size={16} color={palette.text} />
                            <Text style={styles.flexOne}>{category.name}</Text>
                            {category.context ? <Text style={styles.mutedText}>{category.context}</Text> : null}
                            {!category.isDefault ? <Pressable onPress={() => handleEditCategory(category)}><Ionicons name="pencil-outline" size={17} color={palette.textMuted} /></Pressable> : null}
                            {!category.isDefault ? <Pressable onPress={() => void handleArchiveCategory(category)}><Ionicons name="archive-outline" size={17} color={palette.textMuted} /></Pressable> : null}
                          </View>
                        ))}
                      </View>
                    </View>
                    <Pressable style={styles.secondaryButton} onPress={handleResetLocalData}>
                      <Text style={styles.secondaryButtonText}>Resetar dados locais</Text>
                    </Pressable>
                  </View>
                )}
              </Card>
            </View>
          )}

          {activeTab === 'assistant' && (
            <View style={styles.stack}>
              <Card>
                <Text style={styles.cardEyebrow}>Norte IA</Text>
                <Text style={styles.sectionTitle}>Converse, revise e confirme</Text>
                <Text style={styles.bodyText}>
                  Aqui nao e bot travado. O app conversa com uma IA real via backend proprio, interpreta sua frase, gera rascunhos e so salva depois da sua validacao.
                </Text>
                <Text style={styles.backendHint}>Backend: {getNorteApiBaseUrl()}</Text>
                <Text style={styles.backendHint}>
                  OpenAI:{' '}
                  {isLocalMode
                    ? 'demonstracao local'
                    : assistantHealth?.openaiConfigured
                      ? 'conectada'
                      : 'aguardando validacao'}{' '}
                  {!isLocalMode && assistantHealth?.model ? `| Modelo: ${assistantHealth.model}` : ''}
                </Text>

                  <View style={styles.orbStage}>
                    <View style={styles.orbStatus}>
                      <View style={[styles.orbStatusDot, { backgroundColor: healthPresentation.color }]} />
                      <Text style={styles.orbStatusText}>Saude financeira: {healthPresentation.label}</Text>
                    </View>
                    <NorteOrb size={290} mode={assistantMode} theme={appThemes.dark} />
                    <Text style={styles.orbLabel}>
                    {assistantMode === 'listening' && (liveTranscript ? `Ouvindo: ${liveTranscript}` : 'Ouvindo seu dia')}
                    {assistantMode === 'thinking' && 'Interpretando movimentos'}
                    {assistantMode === 'responding' && 'Respondendo com contexto'}
                    {assistantMode === 'idle' && (isConversationMode ? 'Modo conversa ativo' : 'Pronta para te organizar')}
                    </Text>
                    <Pressable
                      style={[styles.orbTalkButton, isConversationMode && styles.orbTalkButtonActive]}
                      onPress={() => void toggleConversationMode()}
                    >
                      <Ionicons name={isConversationMode ? 'stop' : 'mic'} size={18} color="#111111" />
                      <Text style={styles.orbTalkButtonText}>{isConversationMode ? 'Encerrar conversa' : 'Falar com o Norte'}</Text>
                    </Pressable>
                  </View>

                  <View style={styles.modeRow}>
                  <ModeButton label={isRecording ? 'Parar audio' : 'Falar agora'} active={isRecording} onPress={() => void handleVoiceCapture()} />
                  <ModeButton label="Enviar" active={assistantMode === 'thinking'} onPress={() => void handleInterpretMessage()} />
                  <ModeButton
                    label={isSpeaking ? 'Tocando voz' : 'Ouvir resposta'}
                    active={isSpeaking || assistantMode === 'responding'}
                    onPress={() => void handleReplayLastSpeech()}
                  />
                </View>

                <View style={styles.quickPromptRow}>
                  {assistantPromptSuggestions.map((prompt) => (
                    <Pressable key={prompt} style={styles.quickPrompt} onPress={() => setAssistantInput(prompt)}>
                      <Ionicons name="sparkles-outline" size={14} color={palette.textMuted} />
                      <Text style={styles.quickPromptText}>{prompt}</Text>
                    </Pressable>
                  ))}
                </View>

                <View style={styles.inputCard}>
                  <TextInput
                    value={assistantInput}
                    onChangeText={setAssistantInput}
                    multiline
                    placeholder="Ex.: gastei 40 na padaria e recebi 300 do cliente Joao"
                    placeholderTextColor={palette.textMuted}
                    style={styles.input}
                  />
                  {assistantError ? (
                    <View style={[styles.statusCard, styles.statusCardError]}>
                      <Text style={[styles.statusText, styles.statusTextError]}>{assistantError}</Text>
                    </View>
                  ) : null}
                  {liveTranscript && assistantMode === 'listening' ? (
                    <View style={[styles.statusCard, styles.statusCardInfo]}>
                      <Text style={styles.statusText}>Transcricao ao vivo: {liveTranscript}</Text>
                    </View>
                  ) : null}
                  <View style={styles.rowBetween}>
                    <Pressable style={[styles.iconButton, isRecording && styles.iconButtonActive]} onPress={() => void handleVoiceCapture()}>
                      <Ionicons name={isRecording ? 'stop-outline' : 'mic-outline'} size={18} color={palette.text} />
                    </Pressable>
                    <Pressable
                      style={[styles.primaryButtonCompact, isAssistantLoading && styles.primaryButtonDisabled]}
                      onPress={() => void handleInterpretMessage()}
                      disabled={isAssistantLoading}
                    >
                      <Text style={styles.primaryButtonText}>
                        {isAssistantLoading ? 'Chamando IA real...' : 'Enviar para a IA'}
                      </Text>
                    </Pressable>
                  </View>
                  <Text style={styles.mutedText}>
                    No modo conversa, a Norte escuta, transcreve o que voce fala na hora e responde em voz automaticamente.
                  </Text>
                </View>
              </Card>

              <Card>
                <View style={styles.rowBetween}>
                  <Text style={styles.cardTitle}>Rascunhos antes de salvar</Text>
                  <Text style={styles.mutedText}>{pendingQuestions} duvidas pendentes</Text>
                </View>

                {drafts.length > 0 ? (
                  <View style={[styles.statusCard, pendingQuestions > 0 ? styles.statusCardInfo : styles.statusCardSuccess]}>
                    <Text style={styles.statusText}>
                      {pendingQuestions > 0
                        ? `Escolha o contexto de ${pendingQuestions} item${pendingQuestions > 1 ? 'ns' : ''} para liberar a confirmacao.`
                        : 'Tudo revisado. Confira os valores e confirme para atualizar seus saldos.'}
                    </Text>
                  </View>
                ) : null}

                {drafts.length === 0 ? (
                  <Text style={styles.bodyText}>Nenhum rascunho pendente. Envie uma frase para a IA organizar.</Text>
                ) : (
                  drafts.map((draft) => (
                    <DraftCard
                      key={draft.id}
                      draft={draft}
                      accounts={accountState}
                      categories={activeCategories}
                      onSelectContext={(context) => handleDraftContext(draft.id, context)}
                      onSelectAccount={(walletAccountId) => handleDraftAccount(draft.id, walletAccountId)}
                      onUpdate={(update) => handleUpdateDraft(draft.id, update)}
                      onRemove={() => handleRemoveDraft(draft.id)}
                    />
                  ))
                )}

                <Pressable
                  style={[
                    styles.primaryButton,
                    (isConfirmingDrafts || drafts.some((draft) => !draft.context) || activeAccounts.length === 0) && styles.primaryButtonDisabled,
                  ]}
                  onPress={() => void handleConfirmDrafts()}
                  disabled={isConfirmingDrafts || drafts.length === 0 || drafts.some((draft) => !draft.context) || activeAccounts.length === 0}
                >
                  <Text style={styles.primaryButtonText}>
                    {isConfirmingDrafts ? 'Salvando lancamentos...' : 'Confirmar e salvar lancamentos'}
                  </Text>
                </Pressable>
              </Card>

              <Card>
                <Text style={styles.cardTitle}>Conversa recente</Text>
                <View style={styles.detailStack}>
                  {messages.slice(-5).map((message) => (
                    <MessageBubble key={message.id} role={message.role} text={message.text} />
                  ))}
                </View>
              </Card>
            </View>
          )}

          {activeTab === 'moves' && (
            <View style={styles.stack}>
              <Card variant="soft">
                <View style={styles.rowBetween}>
                  <View><Text style={styles.cardTitle}>Importar extrato</Text><Text style={styles.mutedText}>CSV com revisão antes de entrar no histórico.</Text></View>
                  <Pressable onPress={() => setShowStatementImport((value) => !value)}><Text style={styles.inlineLink}>{showStatementImport ? 'Fechar' : 'Importar CSV'}</Text></Pressable>
                </View>
                {showStatementImport ? <View style={styles.detailStack}>
                  <TextInput value={statementCsv} onChangeText={setStatementCsv} multiline placeholder="Cole aqui: Data;Descrição;Valor" placeholderTextColor={palette.textMuted} style={[styles.field, styles.statementTextArea]} />
                  <View style={styles.pillRow}>{activeAccounts.map((account) => <Pill key={account.id} label={account.name} selected={statementAccountId === account.id} onPress={() => setStatementAccountId(account.id)} />)}</View>
                  <Pressable style={styles.secondaryButton} onPress={handlePreviewStatement}><Text style={styles.secondaryButtonText}>Revisar extrato</Text></Pressable>
                  {statementPreview.length > 0 ? <View style={styles.detailStack}>
                    {statementPreview.slice(0, 8).map((item) => <View key={item.id} style={styles.rowBetween}><View style={styles.flexOne}><Text style={styles.bodyText}>{item.title}</Text><Text style={styles.mutedText}>{item.occurredAt} {item.isDuplicate ? '/ possível duplicidade' : ''}</Text></View><Text style={item.type === 'income' ? styles.amountPositive : styles.amountNegative}>{item.type === 'income' ? '+' : '-'}{currency.format(item.amount)}</Text></View>)}
                    <Pressable style={styles.primaryButtonCompact} onPress={() => void handleConfirmStatementImport()}><Text style={styles.primaryButtonText}>Importar {statementPreview.filter((item) => !item.isDuplicate).length} movimentos</Text></Pressable>
                  </View> : null}
                </View> : null}
              </Card>
              <Card>
                <View style={styles.rowBetween}>
                  <Text style={styles.cardTitle}>{editingMovementId ? 'Editar movimento' : 'Lancamento manual'}</Text>
                  <Pressable
                    onPress={() => {
                      setShowManualEntry((value) => !value);
                      if (showManualEntry) {
                        setEditingMovementId(null);
                        setManualEntry({ ...defaultManualEntry, accountId: activeAccounts[0]?.id ?? '' });
                      }
                    }}
                  >
                    <Text style={styles.inlineLink}>{showManualEntry ? 'Fechar' : 'Novo lancamento'}</Text>
                  </Pressable>
                </View>

                {showManualEntry && (
                  <View style={styles.manualForm}>
                    <TextInput
                      value={manualEntry.title}
                      onChangeText={(value) => setManualEntry((current) => ({
                        ...current,
                        title: value,
                        category: getSuggestedMerchantCategory(value, activeCategories.map((category) => category.name)) ?? current.category,
                      }))}
                      placeholder="Descricao"
                      placeholderTextColor={palette.textMuted}
                      style={styles.field}
                    />
                    <TextInput
                      value={manualEntry.amount}
                      onChangeText={(value) => setManualEntry((current) => ({ ...current, amount: value }))}
                      placeholder="Valor"
                      keyboardType="decimal-pad"
                      placeholderTextColor={palette.textMuted}
                      style={styles.field}
                    />
                    <TextInput
                      value={manualEntry.date}
                      onChangeText={(value) => setManualEntry((current) => ({ ...current, date: value }))}
                      placeholder="Data (AAAA-MM-DD ou DD/MM/AAAA)"
                      placeholderTextColor={palette.textMuted}
                      style={styles.field}
                    />
                    <View style={styles.pillRow}>
                      <Pill
                        label="Despesa"
                        selected={manualEntry.type === 'expense'}
                        onPress={() => setManualEntry((current) => ({ ...current, type: 'expense' }))}
                      />
                      <Pill
                        label="Receita"
                        selected={manualEntry.type === 'income'}
                        onPress={() => setManualEntry((current) => ({ ...current, type: 'income' }))}
                      />
                      <Pill
                        label={manualEntry.context}
                        selected
                        onPress={() =>
                          setManualEntry((current) => ({
                            ...current,
                            context:
                              current.context === 'Pessoal'
                                ? 'Negocio'
                                : current.context === 'Negocio'
                                  ? 'Compartilhado'
                                  : 'Pessoal',
                          }))
                        }
                      />
                    </View>
                    <View style={styles.selectionBlock}>
                      <Text style={styles.mutedText}>Categoria</Text>
                      {getMerchantPresentation(manualEntry.title)?.category ? <Text style={styles.mutedText}>Sugestão pelo estabelecimento: {getMerchantPresentation(manualEntry.title)?.category}</Text> : null}
                      <View style={styles.pillRow}>
                        {activeCategories.map((category) => (
                          <Pill
                            key={category.id}
                            label={category.name}
                            selected={manualEntry.category === category.name}
                            onPress={() => setManualEntry((current) => ({ ...current, category: category.name }))}
                          />
                        ))}
                      </View>
                    </View>
                    <View style={styles.selectionBlock}>
                      <Text style={styles.mutedText}>Conta</Text>
                      <View style={styles.pillRow}>
                        {activeAccounts.map((account) => (
                          <Pill
                            key={account.id}
                            label={account.name}
                            selected={manualEntry.accountId === account.id}
                            onPress={() => setManualEntry((current) => ({ ...current, accountId: account.id }))}
                          />
                        ))}
                      </View>
                    </View>
                    {cardState.length > 0 ? (
                      <View style={styles.selectionBlock}>
                        <Text style={styles.mutedText}>Forma de pagamento</Text>
                        <View style={styles.pillRow}>
                          <Pill
                            label="Sem cartao"
                            selected={!manualEntry.cardId}
                            onPress={() => setManualEntry((current) => ({ ...current, cardId: '' }))}
                          />
                          {cardState.map((card) => (
                            <Pill
                              key={card.id}
                              label={card.name}
                              selected={manualEntry.cardId === card.id}
                              onPress={() => setManualEntry((current) => ({ ...current, cardId: card.id }))}
                            />
                          ))}
                        </View>
                        {manualEntry.cardId ? <Text style={styles.mutedText}>Compra no crédito entra na fatura; o saldo da conta só muda ao pagar a fatura.</Text> : null}
                      </View>
                    ) : null}
                    <Pressable
                      style={[styles.primaryButtonCompact, isSavingManualEntry && styles.primaryButtonDisabled]}
                      onPress={() => void handleSaveManualEntry()}
                      disabled={isSavingManualEntry}
                    >
                      <Text style={styles.primaryButtonText}>
                        {isSavingManualEntry ? 'Salvando...' : editingMovementId ? 'Atualizar movimento' : 'Salvar lancamento'}
                      </Text>
                    </Pressable>
                  </View>
                )}
              </Card>

              <Card>
                <View style={styles.rowBetween}>
                  <View>
                    <Text style={styles.cardTitle}>Historico de movimentos</Text>
                    <Text style={styles.mutedText}>
                      {visibleMovements.length} itens · {visibleMovementTotal >= 0 ? '+' : '-'}
                      {currency.format(Math.abs(visibleMovementTotal))} de resultado no filtro
                    </Text>
                  </View>
                  <Ionicons name="filter-outline" size={18} color={palette.textMuted} />
                </View>
                <View style={styles.pillRow}>
                  <Pill label="Todos" selected={movementTypeFilter === 'all'} onPress={() => setMovementTypeFilter('all')} />
                  <Pill label="Receitas" selected={movementTypeFilter === 'income'} onPress={() => setMovementTypeFilter('income')} />
                  <Pill label="Despesas" selected={movementTypeFilter === 'expense'} onPress={() => setMovementTypeFilter('expense')} />
                </View>
                <View style={styles.pillRow}>
                  <Pill label="Tudo" selected={movementContextFilter === 'all'} onPress={() => setMovementContextFilter('all')} />
                  <Pill label="Pessoal" selected={movementContextFilter === 'Pessoal'} onPress={() => setMovementContextFilter('Pessoal')} />
                  <Pill label="Negocio" selected={movementContextFilter === 'Negocio'} onPress={() => setMovementContextFilter('Negocio')} />
                  <Pill label="Compartilhado" selected={movementContextFilter === 'Compartilhado'} onPress={() => setMovementContextFilter('Compartilhado')} />
                </View>
                <View style={styles.selectionBlock}>
                  <Text style={styles.mutedText}>Categoria</Text>
                  <View style={styles.pillRow}>
                    <Pill label="Todas" selected={movementCategoryFilter === 'all'} onPress={() => setMovementCategoryFilter('all')} />
                    {categoryNames
                      .filter((category) => movements.some((movement) => (movement.category ?? 'Outros') === category))
                      .map((category) => (
                        <Pill
                          key={category}
                          label={category}
                          selected={movementCategoryFilter === category}
                          onPress={() => setMovementCategoryFilter(category)}
                        />
                      ))}
                  </View>
                </View>
                <View style={styles.pillRow}>
                  <Pill label="Todo periodo" selected={movementPeriodFilter === 'all'} onPress={() => setMovementPeriodFilter('all')} />
                  <Pill label="Hoje" selected={movementPeriodFilter === 'today'} onPress={() => setMovementPeriodFilter('today')} />
                  <Pill label="Semana" selected={movementPeriodFilter === 'week'} onPress={() => setMovementPeriodFilter('week')} />
                  <Pill label="Este mes" selected={movementPeriodFilter === 'month'} onPress={() => setMovementPeriodFilter('month')} />
                </View>
                {accountState.length > 0 ? (
                  <View style={styles.selectionBlock}>
                    <Text style={styles.mutedText}>Conta</Text>
                    <View style={styles.pillRow}>
                      <Pill label="Todas" selected={movementAccountFilter === 'all'} onPress={() => setMovementAccountFilter('all')} />
                      {activeAccounts.map((account) => (
                        <Pill
                          key={account.id}
                          label={account.name}
                          selected={movementAccountFilter === account.id}
                          onPress={() => setMovementAccountFilter(account.id)}
                        />
                      ))}
                    </View>
                  </View>
                ) : null}
                {cardState.length > 0 ? (
                  <View style={styles.selectionBlock}>
                    <Text style={styles.mutedText}>Cartão</Text>
                    <View style={styles.pillRow}>
                      <Pill label="Todos" selected={movementCardFilter === 'all'} onPress={() => setMovementCardFilter('all')} />
                      {cardState.map((card) => <Pill key={card.id} label={card.name} selected={movementCardFilter === card.id} onPress={() => setMovementCardFilter(card.id)} />)}
                    </View>
                  </View>
                ) : null}
                <View style={styles.selectionBlock}>
                  <Text style={styles.mutedText}>Ordenar</Text>
                  <View style={styles.pillRow}>
                    <Pill label="Recentes" selected={movementSort === 'newest'} onPress={() => setMovementSort('newest')} />
                    <Pill label="Antigos" selected={movementSort === 'oldest'} onPress={() => setMovementSort('oldest')} />
                    <Pill label="Maior valor" selected={movementSort === 'highest'} onPress={() => setMovementSort('highest')} />
                    <Pill label="Menor valor" selected={movementSort === 'lowest'} onPress={() => setMovementSort('lowest')} />
                  </View>
                </View>
                <TextInput
                  value={movementSearch}
                  onChangeText={setMovementSearch}
                  placeholder="Buscar por descricao, conta ou contexto"
                  placeholderTextColor={palette.textMuted}
                  style={styles.field}
                />
                <View style={styles.detailStack}>
                  {visibleMovements.length > 0 ? (
                    visibleMovements.map((movement) => (
                      <MovementRow
                        key={movement.id}
                        movement={movement}
                        onEdit={() => handleEditMovement(movement)}
                        onDelete={() => requestDeleteMovement(movement.id)}
                      />
                    ))
                  ) : (
                    <View style={styles.emptyState}>
                      <Ionicons name="search-outline" size={22} color={palette.textMuted} />
                      <Text style={styles.bodyText}>Nenhum movimento combina com esses filtros.</Text>
                    </View>
                  )}
                </View>
                {pendingMovementDeletion ? (
                  <View style={styles.undoBar}>
                    <View style={styles.flexOne}>
                      <Text style={styles.undoTitle}>Movimento removido</Text>
                      <Text style={styles.undoText}>O saldo foi recalculado. Voce ainda pode desfazer.</Text>
                    </View>
                    <Pressable onPress={undoDeleteMovement} style={styles.undoButton}>
                      <Text style={styles.undoButtonText}>Desfazer</Text>
                    </Pressable>
                  </View>
                ) : null}
              </Card>
            </View>
          )}

          {activeTab === 'wallet' && (
            <View style={styles.stack}>
              <WalletHeroCard
                totalBalance={currency.format(totalBalance)}
                availableCredit={currency.format(Math.max(cardState.reduce((sum, card) => sum + (card.limit - card.used), 0), 0))}
                cardsCount={cardState.length}
                accountsCount={accountState.length}
              />

              {cardState.length > 0 ? (
                <Card variant="soft">
                  <View style={styles.rowBetween}>
                    <Text style={styles.cardTitle}>Seus cartoes</Text>
                    <Text style={styles.mutedText}>{cardState.length} ativos</Text>
                  </View>
                  <View style={styles.walletPassStack}>
                    {cardState.map((card, index) => {
                      const linkedAccount = accountState.find((account) => account.id === card.walletAccountId);
                      const remaining = Math.max(card.limit - card.used, 0);

                      return (
                        <WalletPassCard
                          key={card.id}
                          card={card}
                          linkedAccountName={linkedAccount?.name}
                          remaining={currency.format(remaining)}
                          onEdit={() => handleEditCard(card)}
                          onDelete={() => requestDeleteCard(card.id)}
                          index={index}
                        />
                      );
                    })}
                  </View>
                </Card>
              ) : null}

              {cardState.some((card) => card.used > 0) ? (
                <Card>
                  <View style={styles.rowBetween}>
                    <View><Text style={styles.cardTitle}>Pagar fatura</Text><Text style={styles.mutedText}>Você pode pagar total ou parcialmente.</Text></View>
                    <Ionicons name="card-outline" size={20} color={palette.text} />
                  </View>
                  <View style={styles.pillRow}>
                    {cardState.filter((card) => card.used > 0).map((card) => <Pill key={card.id} label={`${card.name} ${currency.format(card.used)}`} selected={cardPaymentForm.cardId === card.id} onPress={() => setCardPaymentForm((current) => ({ ...current, cardId: card.id, amount: current.cardId === card.id ? current.amount : String(card.used) }))} />)}
                  </View>
                  <View style={styles.pillRow}>
                    {activeAccounts.map((account) => <Pill key={account.id} label={account.name} selected={cardPaymentForm.walletAccountId === account.id} onPress={() => setCardPaymentForm((current) => ({ ...current, walletAccountId: account.id }))} />)}
                  </View>
                  <TextInput value={cardPaymentForm.amount} onChangeText={(amount) => setCardPaymentForm((current) => ({ ...current, amount }))} placeholder="Valor do pagamento" keyboardType="decimal-pad" placeholderTextColor={palette.textMuted} style={styles.field} />
                  <Pressable style={[styles.primaryButtonCompact, isPayingCard && styles.primaryButtonDisabled]} onPress={() => void handlePayCardInvoice()} disabled={isPayingCard}><Text style={styles.primaryButtonText}>{isPayingCard ? 'Registrando...' : 'Confirmar pagamento'}</Text></Pressable>
                </Card>
              ) : null}

              <Card variant="soft">
                <View style={styles.rowBetween}>
                  <View>
                    <Text style={styles.cardTitle}>Conexões financeiras</Text>
                    <Text style={styles.mutedText}>Origem dos saldos e movimentos.</Text>
                  </View>
                  <Pressable onPress={() => setShowConnectionForm((value) => !value)}>
                    <Text style={styles.inlineLink}>{showConnectionForm ? 'Fechar' : 'Adicionar'}</Text>
                  </Pressable>
                </View>
                {showConnectionForm ? (
                  <View style={styles.manualForm}>
                    <TextInput value={connectionForm.institutionName} onChangeText={(institutionName) => setConnectionForm((current) => ({ ...current, institutionName }))} placeholder="Instituição ou carteira" placeholderTextColor={palette.textMuted} style={styles.field} />
                    <View style={styles.pillRow}>
                      <Pill label="Sem conta" selected={!connectionForm.linkedAccountId} onPress={() => setConnectionForm((current) => ({ ...current, linkedAccountId: '' }))} />
                      {activeAccounts.map((account) => <Pill key={account.id} label={account.name} selected={connectionForm.linkedAccountId === account.id} onPress={() => setConnectionForm((current) => ({ ...current, linkedAccountId: account.id }))} />)}
                    </View>
                    <Pressable style={styles.primaryButtonCompact} onPress={() => void handleSaveManualConnection()}><Text style={styles.primaryButtonText}>Adicionar manualmente</Text></Pressable>
                  </View>
                ) : null}
                <View style={styles.detailStack}>
                  {connectionState.map((connection) => {
                    const account = accountState.find((item) => item.id === connection.linkedAccountId);
                    return <View key={connection.id} style={styles.connectionRow}>
                      <View style={styles.connectionIcon}><Ionicons name={connection.connectionType === 'manual' ? 'create-outline' : 'sync-outline'} size={17} color={palette.text} /></View>
                      <View style={styles.flexOne}><Text style={styles.bodyText}>{connection.institutionName}</Text><Text style={styles.mutedText}>{connection.connectionType === 'manual' ? `Manual${account ? ` / ${account.name}` : ''}` : 'Open Finance'}</Text></View>
                      <View style={styles.connectionStatus}><View style={[styles.categoryDot, { backgroundColor: connection.status === 'active' ? '#21C45A' : '#FF8A00' }]} /><Text style={styles.mutedText}>{connection.status === 'active' ? 'Atualizada' : 'Atenção'}</Text></View>
                    </View>;
                  })}
                  <View style={styles.connectionPlannedRow}><Ionicons name="shield-checkmark-outline" size={17} color={palette.textMuted} /><Text style={styles.mutedText}>Open Finance em preparação. A conexão real exigirá seu consentimento e parceiro regulado.</Text></View>
                </View>
              </Card>

              <Card variant="soft">
                <Text style={styles.cardTitle}>Contas na carteira</Text>
                <View style={styles.walletAccountGrid}>
                  <WalletAccountSummaryCard title="Conta pessoal" amount={currency.format(personalBalance)} detail="Dia a dia" accent="#1F2227" />
                  <WalletAccountSummaryCard title="Conta PJ" amount={currency.format(businessBalance)} detail="Operacao" accent="#F5A524" />
                  <WalletAccountSummaryCard title="Reserva" amount={currency.format(reserveBalance)} detail="Seguranca" accent="#43C463" />
                </View>
              </Card>

              <Card>
                <View style={styles.rowBetween}>
                  <Text style={styles.cardTitle}>Contas</Text>
                  <Pressable
                    onPress={() => {
                      setShowAccountForm((value) => !value);
                      if (showAccountForm) {
                        setEditingAccountId(null);
                        setAccountForm(defaultAccountForm);
                      }
                    }}
                  >
                    <Text style={styles.inlineLink}>{showAccountForm ? 'Fechar' : 'Nova conta'}</Text>
                  </Pressable>
                </View>
                {showAccountForm ? (
                  <View style={styles.manualForm}>
                    <TextInput
                      value={accountForm.name}
                      onChangeText={(value) => setAccountForm((current) => ({ ...current, name: value }))}
                      placeholder="Nome da conta"
                      placeholderTextColor={palette.textMuted}
                      style={styles.field}
                    />
                    <TextInput
                      value={accountForm.detail}
                      onChangeText={(value) => setAccountForm((current) => ({ ...current, detail: value }))}
                      placeholder="Descricao curta"
                      placeholderTextColor={palette.textMuted}
                      style={styles.field}
                    />
                    <TextInput
                      value={accountForm.balance}
                      onChangeText={(value) => setAccountForm((current) => ({ ...current, balance: value }))}
                      placeholder="Saldo atual"
                      keyboardType="decimal-pad"
                      placeholderTextColor={palette.textMuted}
                      style={styles.field}
                    />
                    <View style={styles.pillRow}>
                      <Pill
                        label={accountForm.kind === 'reserve' ? 'Reserva' : 'Conta'}
                        selected
                        onPress={() => setAccountForm((current) => ({ ...current, kind: current.kind === 'reserve' ? 'cash' : 'reserve' }))}
                      />
                      <Pill
                        label={accountForm.isBusiness ? 'Negocio' : 'Pessoal'}
                        selected
                        onPress={() => setAccountForm((current) => ({ ...current, isBusiness: !current.isBusiness }))}
                      />
                    </View>
                    <Pressable style={styles.primaryButtonCompact} onPress={() => void handleSaveAccount()}>
                      <Text style={styles.primaryButtonText}>{editingAccountId ? 'Atualizar conta' : 'Salvar conta'}</Text>
                    </Pressable>
                  </View>
                ) : null}
                <View style={styles.detailStack}>
                  {accountState.filter((account) => !account.isArchived).map((account) => (
                    <View key={account.id} style={styles.entityCard}>
                      <View style={styles.accountRow}>
                        <View>
                          <Text style={styles.cardTitle}>{account.name}</Text>
                          <Text style={styles.mutedText}>{account.detail}</Text>
                        </View>
                        <Text style={styles.amountPositive}>{currency.format(account.balance)}</Text>
                      </View>
                      <View style={styles.inlineActions}>
                        <Pressable onPress={() => handleEditAccount(account)}>
                          <Text style={styles.inlineLink}>Editar</Text>
                        </Pressable>
                        <Pressable onPress={() => requestArchiveAccount(account)}>
                          <Text style={styles.inlineLink}>Arquivar</Text>
                        </Pressable>
                        <Pressable onPress={() => requestDeleteAccount(account.id)}>
                          <Text style={styles.inlineDanger}>Excluir</Text>
                        </Pressable>
                      </View>
                    </View>
                  ))}
                </View>
                {accountState.some((account) => account.isArchived) ? (
                  <View style={styles.archivedAccountsBlock}>
                    <Text style={styles.mutedText}>Contas arquivadas</Text>
                    {accountState
                      .filter((account) => account.isArchived)
                      .map((account) => (
                        <View key={account.id} style={styles.archivedAccountRow}>
                          <View>
                            <Text style={styles.bodyText}>{account.name}</Text>
                            <Text style={styles.mutedText}>Fora do saldo disponível</Text>
                          </View>
                          <Pressable onPress={() => void handleArchiveAccount(account.id, false)}>
                            <Text style={styles.inlineLink}>Restaurar</Text>
                          </Pressable>
                        </View>
                      ))}
                  </View>
                ) : null}
              </Card>

              <Card>
                <View style={styles.rowBetween}>
                  <Text style={styles.cardTitle}>Cartoes</Text>
                  <Pressable
                    onPress={() => {
                      setShowCardForm((value) => !value);
                      if (showCardForm) {
                        setEditingCardId(null);
                        setCardForm(defaultCardForm);
                      }
                    }}
                  >
                    <Text style={styles.inlineLink}>{showCardForm ? 'Fechar' : 'Novo cartao'}</Text>
                  </Pressable>
                </View>
                {showCardForm ? (
                  <View style={styles.manualForm}>
                    <TextInput
                      value={cardForm.name}
                      onChangeText={(value) => setCardForm((current) => ({ ...current, name: value }))}
                      placeholder="Nome do cartao"
                      placeholderTextColor={palette.textMuted}
                      style={styles.field}
                    />
                    <TextInput
                      value={cardForm.limit}
                      onChangeText={(value) => setCardForm((current) => ({ ...current, limit: value }))}
                      placeholder="Limite"
                      keyboardType="decimal-pad"
                      placeholderTextColor={palette.textMuted}
                      style={styles.field}
                    />
                    <TextInput
                      value={cardForm.used}
                      onChangeText={(value) => setCardForm((current) => ({ ...current, used: value }))}
                      placeholder="Valor usado"
                      keyboardType="decimal-pad"
                      placeholderTextColor={palette.textMuted}
                      style={styles.field}
                    />
                    <TextInput
                      value={cardForm.brand}
                      onChangeText={(value) => setCardForm((current) => ({ ...current, brand: value }))}
                      placeholder="Bandeira (ex.: Visa, Mastercard)"
                      placeholderTextColor={palette.textMuted}
                      style={styles.field}
                    />
                    <View style={styles.pillRow}>
                      <TextInput
                        value={cardForm.closingDay}
                        onChangeText={(value) => setCardForm((current) => ({ ...current, closingDay: value }))}
                        placeholder="Fecha dia"
                        keyboardType="number-pad"
                        placeholderTextColor={palette.textMuted}
                        style={[styles.field, styles.cardDayField]}
                      />
                      <TextInput
                        value={cardForm.dueDay}
                        onChangeText={(value) => setCardForm((current) => ({ ...current, dueDay: value }))}
                        placeholder="Vence dia"
                        keyboardType="number-pad"
                        placeholderTextColor={palette.textMuted}
                        style={[styles.field, styles.cardDayField]}
                      />
                    </View>
                    <View style={styles.pillRow}>
                      <Pill label={cardForm.isBusiness ? 'Cartao do negocio' : 'Cartao pessoal'} selected onPress={() => setCardForm((current) => ({ ...current, isBusiness: !current.isBusiness }))} />
                    </View>
                    <View style={styles.selectionBlock}>
                      <Text style={styles.mutedText}>Vincular a conta</Text>
                      <View style={styles.pillRow}>
                        <Pill
                          label="Sem vinculo"
                          selected={!cardForm.walletAccountId}
                          onPress={() => setCardForm((current) => ({ ...current, walletAccountId: '' }))}
                        />
                        {activeAccounts.map((account) => (
                          <Pill
                            key={account.id}
                            label={account.name}
                            selected={cardForm.walletAccountId === account.id}
                            onPress={() => setCardForm((current) => ({ ...current, walletAccountId: account.id }))}
                          />
                        ))}
                      </View>
                    </View>
                    <Pressable style={styles.primaryButtonCompact} onPress={() => void handleSaveCard()}>
                      <Text style={styles.primaryButtonText}>{editingCardId ? 'Atualizar cartao' : 'Salvar cartao'}</Text>
                    </Pressable>
                  </View>
                ) : null}
                <View style={styles.detailStack}>
                  {cardState.map((card) => {
                    const remaining = card.limit - card.used;
                    const linkedAccount = accountState.find((account) => account.id === card.walletAccountId);
                    return (
                      <View key={card.id} style={styles.entityCard}>
                        <View style={styles.cardBlock}>
                          <View style={styles.rowBetween}>
                            <Text style={styles.cardTitle}>{card.name}</Text>
                            <Text style={styles.mutedText}>{currency.format(remaining)} livre</Text>
                          </View>
                          <Text style={styles.mutedText}>
                            {card.brand ?? 'Credito'} / fecha dia {card.closingDay ?? 8} / vence dia {card.dueDay ?? 15}
                          </Text>
                          <Text style={styles.mutedText}>{linkedAccount ? `Pagamento pela conta ${linkedAccount.name}` : 'Defina a conta para pagar a fatura'}</Text>
                          <View style={styles.progressTrack}>
                            <View
                              style={[
                                styles.progressFill,
                                { width: `${card.limit > 0 ? Math.min((card.used / card.limit) * 100, 100) : 0}%` },
                              ]}
                            />
                          </View>
                        </View>
                        <View style={styles.inlineActions}>
                          <Pressable onPress={() => handleEditCard(card)}>
                            <Text style={styles.inlineLink}>Editar</Text>
                          </Pressable>
                          <Pressable onPress={() => requestDeleteCard(card.id)}>
                            <Text style={styles.inlineDanger}>Excluir</Text>
                          </Pressable>
                        </View>
                      </View>
                    );
                  })}
                </View>
              </Card>
            </View>
          )}

          {activeTab === 'plan' && (
            <View style={styles.stack}>
              <Card variant="soft">
                <GoalsOverviewCard total={currency.format(decoratedGoals.reduce((sum, goal) => sum + goal.target, 0))} goals={decoratedGoals} />
              </Card>

              <Card variant="soft">
                <View style={styles.rowBetween}>
                  <Text style={styles.cardTitle}>Todas as metas</Text>
                  <Pressable
                    onPress={() => {
                      if (showGoalForm) {
                        setEditingGoalId(null);
                        setGoalForm(defaultGoalForm);
                      }
                      setShowGoalForm((value) => !value);
                    }}
                  >
                    <Text style={styles.inlineLink}>{showGoalForm ? 'Fechar' : 'Nova meta'}</Text>
                  </Pressable>
                </View>
                {showGoalForm ? (
                  <View style={styles.manualForm}>
                    <TextInput
                      value={goalForm.title}
                      onChangeText={(value) => setGoalForm((current) => ({ ...current, title: value }))}
                      placeholder="Nome da meta"
                      placeholderTextColor={palette.textMuted}
                      style={styles.field}
                    />
                    <TextInput
                      value={goalForm.target}
                      onChangeText={(value) => setGoalForm((current) => ({ ...current, target: value }))}
                      placeholder="Quanto voce quer juntar"
                      keyboardType="decimal-pad"
                      placeholderTextColor={palette.textMuted}
                      style={styles.field}
                    />
                    <TextInput
                      value={goalForm.current}
                      onChangeText={(value) => setGoalForm((current) => ({ ...current, current: value }))}
                      placeholder="Quanto ja tem guardado"
                      keyboardType="decimal-pad"
                      placeholderTextColor={palette.textMuted}
                      style={styles.field}
                    />
                    <TextInput
                      value={goalForm.targetDate}
                      onChangeText={(value) => setGoalForm((current) => ({ ...current, targetDate: value }))}
                      placeholder="Prazo opcional (AAAA-MM-DD)"
                      placeholderTextColor={palette.textMuted}
                      style={styles.field}
                    />
                    <Pressable style={styles.primaryButtonCompact} onPress={handleSaveGoal}>
                      <Text style={styles.primaryButtonText}>{editingGoalId ? 'Atualizar meta' : 'Salvar meta'}</Text>
                    </Pressable>
                  </View>
                ) : null}
                <View style={styles.detailStack}>
                  {decoratedGoals.length > 0 ? (
                    decoratedGoals.map((goal) => (
                      <View key={goal.id} style={styles.goalEditableItem}>
                        <GoalListItem
                          title={goal.title}
                          current={goal.current}
                          target={goal.target}
                          progress={goal.progress}
                          accent={goal.accent}
                          status={goal.status}
                          targetDate={goal.targetDate}
                        />
                        {contributingGoalId === goal.id ? (
                          <View style={styles.goalContributionForm}>
                            <TextInput
                              value={goalContributionAmount}
                              onChangeText={setGoalContributionAmount}
                              placeholder="Valor do aporte"
                              keyboardType="decimal-pad"
                              placeholderTextColor={palette.textMuted}
                              style={styles.field}
                            />
                            <View style={styles.inlineActions}>
                              <Pressable onPress={() => void handleGoalContribution(goal)}>
                                <Text style={styles.inlineLink}>Salvar aporte</Text>
                              </Pressable>
                              <Pressable
                                onPress={() => {
                                  setContributingGoalId(null);
                                  setGoalContributionAmount('');
                                }}
                              >
                                <Text style={styles.inlineDanger}>Cancelar</Text>
                              </Pressable>
                            </View>
                          </View>
                        ) : null}
                        <View style={styles.inlineActions}>
                          <Pressable onPress={() => handleEditGoal(goal)}>
                            <Text style={styles.inlineLink}>Editar</Text>
                          </Pressable>
                          {goal.status !== 'completed' ? (
                            <Pressable
                              onPress={() => {
                                setContributingGoalId(goal.id);
                                setGoalContributionAmount('');
                              }}
                            >
                              <Text style={styles.inlineLink}>Aportar</Text>
                            </Pressable>
                          ) : null}
                          {goal.status === 'active' || goal.status === 'paused' ? (
                            <Pressable onPress={() => void toggleGoalStatus(goal)}>
                              <Text style={styles.inlineLink}>{goal.status === 'paused' ? 'Retomar' : 'Pausar'}</Text>
                            </Pressable>
                          ) : null}
                          {goal.status !== 'completed' ? (
                            <Pressable onPress={() => void completeGoal(goal)}>
                              <Text style={styles.inlineLink}>Concluir</Text>
                            </Pressable>
                          ) : null}
                          <Pressable onPress={() => handleDeleteGoal(goal.id)}>
                            <Text style={styles.inlineDanger}>Excluir meta</Text>
                          </Pressable>
                        </View>
                      </View>
                    ))
                  ) : (
                    <View style={styles.emptyState}>
                      <Ionicons name="flag-outline" size={22} color={palette.textMuted} />
                      <Text style={styles.bodyText}>Nenhuma meta criada ainda.</Text>
                    </View>
                  )}
                </View>
              </Card>

              <Card variant="soft">
                <View style={styles.rowBetween}>
                  <Text style={styles.cardTitle}>Contas futuras</Text>
                  <Pressable
                    onPress={() => {
                      if (showBillForm) {
                        setEditingBillId(null);
                        setBillForm(defaultBillForm);
                      }
                      setShowBillForm((value) => !value);
                    }}
                  >
                    <Text style={styles.inlineLink}>{showBillForm ? 'Fechar' : 'Nova conta'}</Text>
                  </Pressable>
                </View>
                {showBillForm ? (
                  <View style={styles.manualForm}>
                    <TextInput
                      value={billForm.title}
                      onChangeText={(value) => setBillForm((current) => ({ ...current, title: value }))}
                      placeholder="Nome da conta"
                      placeholderTextColor={palette.textMuted}
                      style={styles.field}
                    />
                    <TextInput
                      value={billForm.amount}
                      onChangeText={(value) => setBillForm((current) => ({ ...current, amount: value }))}
                      placeholder="Valor"
                      keyboardType="decimal-pad"
                      placeholderTextColor={palette.textMuted}
                      style={styles.field}
                    />
                    <TextInput
                      value={billForm.due}
                      onChangeText={(value) => setBillForm((current) => ({ ...current, due: value }))}
                      placeholder="Vencimento (AAAA-MM-DD)"
                      placeholderTextColor={palette.textMuted}
                      style={styles.field}
                    />
                    <View style={styles.selectionBlock}>
                      <Text style={styles.mutedText}>Essa conta e de</Text>
                      <View style={styles.pillRow}>
                        {(['Pessoal', 'Negocio', 'Compartilhado'] as EntryContext[]).map((context) => (
                          <Pill
                            key={context}
                            label={context}
                            selected={billForm.context === context}
                            onPress={() => setBillForm((current) => ({ ...current, context }))}
                          />
                        ))}
                      </View>
                    </View>
                    <View style={styles.selectionBlock}>
                      <Text style={styles.mutedText}>Frequencia</Text>
                      <View style={styles.pillRow}>
                        <Pill
                          label="Uma vez"
                          selected={!billForm.isRecurring}
                          onPress={() => setBillForm((current) => ({ ...current, isRecurring: false }))}
                        />
                        <Pill
                          label="Todo mes"
                          selected={billForm.isRecurring}
                          onPress={() => setBillForm((current) => ({ ...current, isRecurring: true }))}
                        />
                      </View>
                    </View>
                    <Pressable style={styles.primaryButtonCompact} onPress={handleSaveBill}>
                      <Text style={styles.primaryButtonText}>{editingBillId ? 'Atualizar conta futura' : 'Salvar conta futura'}</Text>
                    </Pressable>
                  </View>
                ) : null}
                <View style={styles.detailStack}>
                  {billState.length > 0 ? (
                    [...billState]
                      .sort((left, right) => Number(!isBillPending(left)) - Number(!isBillPending(right)) || left.due.localeCompare(right.due))
                      .map((bill) => (
                      <View key={bill.id} style={styles.goalSubCard}>
                        <View style={styles.flexOne}>
                          <Text style={styles.cardTitle}>{bill.title}</Text>
                          <Text style={styles.mutedText}>
                            {isBillPending(bill)
                              ? isBillOverdue(bill.due)
                                ? 'Vencida'
                                : `Vence ${formatBillDue(bill.due)}`
                              : `Paga ${formatBillDue(bill.paidAt ?? bill.due)}`}{' '}
                            / {bill.context}
                            {bill.isRecurring ? ' / Todo mes' : ''}
                          </Text>
                        </View>
                        <View style={styles.billItemSide}>
                          <Text style={styles.amountNegative}>{currency.format(bill.amount)}</Text>
                          <View style={styles.inlineActions}>
                            {isBillPending(bill) ? (
                              <Pressable
                                onPress={() =>
                                  confirmDestructiveAction(
                                    'Marcar como paga?',
                                    `Vou registrar ${currency.format(bill.amount)} como despesa e atualizar o saldo da ${pickAccountForContext(accountState, bill.context)?.name ?? 'conta selecionada'}.`,
                                    () => handlePayBill(bill),
                                  )
                                }
                              >
                                <Text style={styles.inlineLink}>Pagar</Text>
                              </Pressable>
                            ) : (
                              <Pressable onPress={() => void handleReopenBill(bill)}>
                                <Text style={styles.inlineLink}>Reabrir</Text>
                              </Pressable>
                            )}
                            <Pressable onPress={() => handleEditBill(bill)}>
                              <Text style={styles.inlineLink}>Editar</Text>
                            </Pressable>
                            <Pressable onPress={() => handleDeleteBill(bill.id)}>
                              <Text style={styles.inlineDanger}>Excluir</Text>
                            </Pressable>
                          </View>
                        </View>
                      </View>
                    ))
                  ) : (
                    <View style={styles.emptyState}>
                      <Ionicons name="calendar-outline" size={22} color={palette.textMuted} />
                      <Text style={styles.bodyText}>Cadastre uma conta futura para o Norte proteger seu caixa.</Text>
                    </View>
                  )}
                </View>
              </Card>
            </View>
          )}
        </ScrollView>

        <View style={styles.bottomBar}>
          <View style={styles.bottomBarSide}>
            {leftDockTabs.map((item) => {
              const active = activeTab === item.key;

              return (
                <Pressable key={item.key} style={styles.tabButton} onPress={() => setActiveTab(item.key)}>
                  <Ionicons name={active ? item.activeIcon : item.icon} size={20} color={active ? '#FFFFFF' : '#7D8796'} />
                  <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{item.label}</Text>
                </Pressable>
              );
            })}
          </View>

          <Pressable style={styles.assistantDockButton} onPress={() => setActiveTab('assistant')}>
            <LinearGradient colors={palette.avatarGradient} style={styles.assistantDockCore}>
              <Ionicons name="navigate" size={24} color={palette.background} />
            </LinearGradient>
            <Text style={[styles.assistantDockLabel, activeTab === 'assistant' && styles.assistantDockLabelActive]}>Norte IA</Text>
          </Pressable>

          <View style={styles.bottomBarSide}>
            {rightDockTabs.map((item) => {
              const active = activeTab === item.key;

              return (
                <Pressable key={item.key} style={styles.tabButton} onPress={() => setActiveTab(item.key)}>
                  <Ionicons name={active ? item.activeIcon : item.icon} size={20} color={active ? '#FFFFFF' : '#7D8796'} />
                  <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{item.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <Modal visible={isDrawerOpen} animationType="fade" transparent onRequestClose={() => setIsDrawerOpen(false)}>
          <View style={styles.drawerBackdrop}>
            <Pressable style={styles.drawerScrim} onPress={() => setIsDrawerOpen(false)} />
            <View style={styles.drawerPanel}>
              <View style={styles.drawerTop}>
                <LinearGradient colors={palette.drawerGradient} style={styles.drawerHero}>
                  <View style={styles.rowBetween}>
                    <View>
                      <Text style={styles.cardEyebrow}>Workspace</Text>
                      <Text style={styles.drawerTitle}>Norte pessoal</Text>
                    </View>
                    <LinearGradient colors={palette.avatarGradient} style={styles.drawerAvatar}>
                      <Text style={styles.drawerAvatarText}>{userInitials || 'N'}</Text>
                    </LinearGradient>
                  </View>
                  <Text style={styles.bodyText}>
                    Cada usuario entra na propria area. Seus dados ficam isolados por conta e protegidos pelo Supabase.
                  </Text>
                </LinearGradient>
              </View>

              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.drawerContent}>
                <DrawerSection title="Principal">
                  <DrawerItem icon="home-outline" label="Home" active={activeTab === 'home'} onPress={() => handleDrawerNavigate('home')} />
                  <DrawerItem
                    icon="sparkles-outline"
                    label="Norte IA"
                    active={activeTab === 'assistant'}
                    onPress={() => handleDrawerNavigate('assistant')}
                  />
                  <DrawerItem
                    icon="swap-horizontal-outline"
                    label="Movimentos"
                    active={activeTab === 'moves'}
                    onPress={() => handleDrawerNavigate('moves')}
                  />
                  <DrawerItem
                    icon="wallet-outline"
                    label="Carteira"
                    active={activeTab === 'wallet'}
                    onPress={() => handleDrawerNavigate('wallet')}
                  />
                  <DrawerItem icon="flag-outline" label="Planejar" active={activeTab === 'plan'} onPress={() => handleDrawerNavigate('plan')} />
                </DrawerSection>

                <DrawerSection title="Explorar">
                  <DrawerItem
                    icon="briefcase-outline"
                    label="Area do negocio"
                    active={activeTab === 'home' && focusPanel === 'business'}
                    onPress={() => handleDrawerNavigate('business')}
                  />
                  <DrawerItem
                    icon="analytics-outline"
                    label="Analises"
                    active={activeTab === 'home' && focusPanel === 'analysis'}
                    onPress={() => handleDrawerNavigate('analysis')}
                  />
                  <DrawerItem
                    icon="settings-outline"
                    label="Configuracoes"
                    active={activeTab === 'home' && focusPanel === 'settings'}
                    onPress={() => handleDrawerNavigate('settings')}
                  />
                </DrawerSection>

                <DrawerSection title="Conta">
                  <DrawerItem icon="person-outline" label={userDisplayName} active={false} onPress={() => setIsProfileOpen(true)} />
                  <DrawerItem icon="log-out-outline" label="Sair da conta" active={false} onPress={() => void handleSignOut()} />
                </DrawerSection>
              </ScrollView>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    </Shell>
  );
}

function Shell({ children, theme }: { children: ReactNode; theme: ThemePalette }) {
  return (
    <LinearGradient
      colors={theme.id === 'dark' ? [theme.background, theme.backgroundElevated, theme.background] : [theme.background, theme.background, theme.backgroundSoft]}
      style={styles.container}
    >
      {children}
    </LinearGradient>
  );
}

function Card({ children, variant = 'default' }: { children: ReactNode; variant?: 'default' | 'soft' }) {
  return <View style={[styles.card, variant === 'soft' && styles.cardSoft]}>{children}</View>;
}

function DrawerSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.drawerSection}>
      <Text style={styles.drawerSectionTitle}>{title}</Text>
      <View style={styles.drawerSectionBody}>{children}</View>
    </View>
  );
}

function DrawerItem({
  icon,
  label,
  active,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.drawerItem, active && styles.drawerItemActive]}>
      <Ionicons name={icon} size={18} color={active ? palette.text : palette.textMuted} />
      <Text style={[styles.drawerItemText, active && styles.drawerItemTextActive]}>{label}</Text>
    </Pressable>
  );
}

function FeatureRow({
  icon,
  title,
  description,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description: string;
}) {
  return (
    <View style={styles.featureRow}>
      <View style={styles.featureIcon}>
        <Ionicons name={icon} size={18} color={palette.text} />
      </View>
      <View style={styles.featureText}>
        <Text style={styles.cardTitle}>{title}</Text>
        <Text style={styles.bodyText}>{description}</Text>
      </View>
    </View>
  );
}

function SelectableCard({
  selected,
  title,
  description,
  onPress,
}: {
  selected: boolean;
  title: string;
  description: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.selectableCard, selected && styles.selectableCardActive]}>
      <Text style={styles.cardTitle}>{title}</Text>
      <Text style={styles.bodyText}>{description}</Text>
    </Pressable>
  );
}

function Pill({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.pill, selected && styles.pillActive]}>
      <Text style={[styles.pillText, selected && styles.pillTextActive]}>{label}</Text>
    </Pressable>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.miniMetric}>
      <Text style={styles.mutedText}>{label}</Text>
      <Text style={styles.cardTitle}>{value}</Text>
    </View>
  );
}

function BalanceSpotlightCard({
  totalBalance,
  personalBalance,
  businessBalance,
  spendableToday,
  healthLabel,
  healthColor,
  monthIncome,
  monthExpense,
  monthResult,
  monthResultPositive,
  onOpenWallet,
  onOpenMoves,
  onOpenPlan,
  onOpenAssistant,
}: {
  totalBalance: string;
  personalBalance: string;
  businessBalance: string;
  spendableToday: string;
  healthLabel: string;
  healthColor: string;
  monthIncome: string;
  monthExpense: string;
  monthResult: string;
  monthResultPositive: boolean;
  onOpenWallet: () => void;
  onOpenMoves: () => void;
  onOpenPlan: () => void;
  onOpenAssistant: () => void;
}) {
  return (
    <View style={styles.balanceSpotlight}>
      <View style={styles.balanceChip}>
        <View style={[styles.balanceChipDot, { backgroundColor: healthColor }]} />
        <Text style={styles.balanceChipText}>Saude: {healthLabel}</Text>
      </View>
      <Text style={styles.balanceCaption}>Seu saldo</Text>
      <Text style={styles.balanceAmount}>{totalBalance}</Text>
      <View style={styles.balanceBreakdownRow}>
        <View style={styles.balanceBreakdownCard}>
          <Text style={styles.balanceBreakdownLabel}>Conta pessoal</Text>
          <Text style={styles.balanceBreakdownValue}>{personalBalance}</Text>
        </View>
        <View style={styles.balanceBreakdownCard}>
          <Text style={styles.balanceBreakdownLabel}>Conta PJ</Text>
          <Text style={styles.balanceBreakdownValue}>{businessBalance}</Text>
        </View>
      </View>
      <View style={styles.balanceSpendablePill}>
        <Text style={styles.balanceSpendableLabel}>Disponivel para gastar hoje</Text>
        <Text style={styles.balanceSpendableValue}>{spendableToday}</Text>
      </View>
      <View style={styles.monthSummaryRow}>
        <View style={styles.monthSummaryItem}>
          <Text style={styles.monthSummaryLabel}>Entradas no mes</Text>
          <Text style={styles.monthSummaryPositive}>+{monthIncome}</Text>
        </View>
        <View style={styles.monthSummaryItem}>
          <Text style={styles.monthSummaryLabel}>Saidas no mes</Text>
          <Text style={styles.monthSummaryNegative}>-{monthExpense}</Text>
        </View>
        <View style={styles.monthSummaryItem}>
          <Text style={styles.monthSummaryLabel}>Resultado</Text>
          <Text style={monthResultPositive ? styles.monthSummaryPositive : styles.monthSummaryNegative}>
            {monthResultPositive ? '+' : '-'}{monthResult}
          </Text>
        </View>
      </View>
      <View style={styles.balanceActions}>
        <QuickAction icon="wallet-outline" label="Carteira" onPress={onOpenWallet} />
        <QuickAction icon="swap-horizontal-outline" label="Mov." onPress={onOpenMoves} />
        <QuickAction icon="flag-outline" label="Metas" onPress={onOpenPlan} />
        <QuickAction icon="navigate-outline" label="Norte IA" onPress={onOpenAssistant} />
      </View>
    </View>
  );
}

function GuidanceCard({
  eyebrow,
  title,
  description,
  icon,
  onPress,
}: {
  eyebrow: string;
  title: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={styles.guidanceCard}>
      <View style={styles.guidanceIcon}>
        <Ionicons name={icon} size={20} color={palette.text} />
      </View>
      <View style={styles.guidanceContent}>
        <Text style={styles.guidanceEyebrow}>{eyebrow}</Text>
        <Text style={styles.guidanceTitle}>{title}</Text>
        <Text style={styles.guidanceDescription}>{description}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={palette.textMuted} />
    </Pressable>
  );
}

function CreditInvoiceSummaryCard({ cards, onPress }: { cards: WalletCard[]; onPress: () => void }) {
  const openCards = cards.filter((card) => card.used > 0);
  if (openCards.length === 0) return null;
  const invoice = openCards.reduce((total, card) => total + card.used, 0);
  const mostUsed = [...openCards].sort((left, right) => right.used / right.limit - left.used / left.limit)[0];
  const percentage = Math.round((mostUsed.used / mostUsed.limit) * 100);
  return (
    <Pressable onPress={onPress} style={styles.invoiceSummaryCard}>
      <View style={styles.rowBetween}>
        <View><Text style={styles.cardEyebrow}>Cartões de crédito</Text><Text style={styles.cardTitle}>Fatura em aberto</Text></View>
        <Ionicons name="card-outline" size={21} color="#FFFFFF" />
      </View>
      <Text style={styles.invoiceSummaryValue}>{currency.format(invoice)}</Text>
      <View style={styles.invoiceSummaryFooter}>
        <Text style={styles.invoiceSummaryText}>{mostUsed.name}: {percentage}% do limite</Text>
        <Text style={styles.invoiceSummaryText}>Vence dia {mostUsed.dueDay ?? 15}</Text>
      </View>
    </Pressable>
  );
}

function CashForecastCard({
  forecast,
  mode,
  onChangeMode,
}: {
  forecast: ReturnType<typeof buildCashForecast>;
  mode: ForecastMode;
  onChangeMode: (mode: ForecastMode) => void;
}) {
  const hasRisk = Boolean(forecast.riskDate);

  return (
    <View style={styles.cashForecastCard}>
      <View style={styles.rowBetween}>
        <View>
          <Text style={styles.cashForecastEyebrow}>Previsao de caixa</Text>
          <Text style={styles.cashForecastTitle}>Proximos 30 dias</Text>
        </View>
        <Ionicons name="analytics-outline" size={20} color="#FFFFFF" />
      </View>
      <View style={styles.forecastModeRow}>
        <Pressable
          style={[styles.forecastModeButton, mode === 'normal' && styles.forecastModeButtonActive]}
          onPress={() => onChangeMode('normal')}
        >
          <Text style={[styles.forecastModeText, mode === 'normal' && styles.forecastModeTextActive]}>Ritmo atual</Text>
        </Pressable>
        <Pressable
          style={[styles.forecastModeButton, mode === 'conservative' && styles.forecastModeButtonActive]}
          onPress={() => onChangeMode('conservative')}
        >
          <Text style={[styles.forecastModeText, mode === 'conservative' && styles.forecastModeTextActive]}>Conservador</Text>
        </Pressable>
      </View>
      <View style={styles.forecastMetricRow}>
        <View style={styles.flexOne}>
          <Text style={styles.cashForecastLabel}>Saldo projetado</Text>
          <Text style={hasRisk ? styles.cashForecastRiskValue : styles.cashForecastValue}>{currency.format(forecast.projectedEndBalance)}</Text>
        </View>
        <View style={styles.flexOne}>
          <Text style={styles.cashForecastLabel}>Contas no periodo</Text>
          <Text style={styles.cashForecastValue}>{currency.format(forecast.scheduledOutflows)}</Text>
        </View>
      </View>
      <Text style={styles.cashForecastMessage}>
        {hasRisk
          ? `Atencao: o caixa pode ficar negativo em ${formatBillDue(forecast.riskDate!)}. O menor saldo projetado e ${currency.format(forecast.lowestBalance)}.`
          : `Seu menor saldo projetado e ${currency.format(forecast.lowestBalance)}. O cenario considera contas agendadas e seu ritmo atual.`}
      </Text>
    </View>
  );
}

function WalletHeroCard({
  totalBalance,
  availableCredit,
  cardsCount,
  accountsCount,
}: {
  totalBalance: string;
  availableCredit: string;
  cardsCount: number;
  accountsCount: number;
}) {
  return (
    <View style={styles.walletHeroWrap}>
      <LinearGradient colors={['#111111', '#111111']} style={styles.walletHeroCard}>
        <View style={styles.rowBetween}>
          <View>
            <Text style={styles.walletHeroEyebrow}>Norte Wallet</Text>
            <Text style={styles.walletHeroAmount}>{totalBalance}</Text>
          </View>
          <View style={styles.walletHeroMark}>
            <Ionicons name="wallet" size={18} color="#FFFFFF" />
          </View>
        </View>
        <View style={styles.walletHeroFooter}>
          <View>
            <Text style={styles.walletHeroLabel}>Credito livre</Text>
            <Text style={styles.walletHeroValue}>{availableCredit}</Text>
          </View>
          <View>
            <Text style={styles.walletHeroLabel}>Carteira ativa</Text>
            <Text style={styles.walletHeroValue}>
              {cardsCount} cartoes, {accountsCount} contas
            </Text>
          </View>
        </View>
      </LinearGradient>
      <View style={styles.walletHeroShadowCard} />
      <View style={styles.walletHeroShadowCardBack} />
    </View>
  );
}

function WalletPassCard({
  card,
  linkedAccountName,
  remaining,
  onEdit,
  onDelete,
  index,
}: {
  card: WalletCard;
  linkedAccountName?: string;
  remaining: string;
  onEdit: () => void;
  onDelete: () => void;
  index: number;
}) {
  const tone = [
    ['#111111', '#111111'],
    ['#202020', '#111111'],
    ['#303030', '#111111'],
  ][index % 3] as [string, string];

  return (
    <LinearGradient colors={tone} style={[styles.walletPassCard, index > 0 && styles.walletPassCardOffset]}>
      <View style={styles.rowBetween}>
        <Text style={styles.walletPassBrand}>NORTE</Text>
        <Ionicons name="radio-button-on" size={18} color="rgba(255,255,255,0.86)" />
      </View>
      <View style={styles.walletPassMiddle}>
        <Text style={styles.walletPassName}>{card.name}</Text>
        <Text style={styles.walletPassNumber}>•••• {String(card.id).slice(-4)}</Text>
      </View>
      <View style={styles.rowBetween}>
        <View>
          <Text style={styles.walletPassLabel}>{linkedAccountName ? `Conta ${linkedAccountName}` : 'Sem conta vinculada'}</Text>
          <Text style={styles.walletPassValue}>Fatura {currency.format(card.used)}</Text>
          <Text style={styles.walletPassLabel}>{remaining} livre / fecha {card.closingDay ?? 8} / vence {card.dueDay ?? 15}</Text>
        </View>
        <View style={styles.walletPassActions}>
          <Pressable onPress={onEdit}>
            <Text style={styles.walletPassActionText}>Editar</Text>
          </Pressable>
          <Pressable onPress={onDelete}>
            <Text style={styles.walletPassActionDanger}>Excluir</Text>
          </Pressable>
        </View>
      </View>
    </LinearGradient>
  );
}

function WalletAccountSummaryCard({
  title,
  amount,
  detail,
  accent,
}: {
  title: string;
  amount: string;
  detail: string;
  accent: string;
}) {
  return (
    <View style={styles.walletAccountSummaryCard}>
      <View style={[styles.walletAccountAccent, { backgroundColor: accent }]} />
      <Text style={styles.walletAccountTitle}>{title}</Text>
      <Text style={styles.walletAccountAmount}>{amount}</Text>
      <Text style={styles.walletAccountDetail}>{detail}</Text>
    </View>
  );
}

function QuickAction({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={styles.quickAction}>
      <View style={styles.quickActionIcon}>
        <Ionicons name={icon} size={16} color={palette.id === 'dark' ? palette.text : '#F8F8F6'} />
      </View>
      <Text style={styles.quickActionLabel}>{label}</Text>
    </Pressable>
  );
}

function GoalListItem({
  title,
  current,
  target,
  progress,
  accent,
  status,
  targetDate,
}: {
  title: string;
  current: number;
  target: number;
  progress: number;
  accent: string;
  status: Goal['status'];
  targetDate?: string | null;
}) {
  const statusLabel = status === 'completed' ? 'Concluida' : status === 'paused' ? 'Pausada' : 'Em andamento';
  const deadlineLabel = formatGoalDeadline(targetDate);

  return (
    <View style={styles.goalListItem}>
      <View style={styles.rowBetween}>
        <View style={styles.goalListTitleWrap}>
          <View style={[styles.goalListIcon, { borderColor: accent }]}>
            <View style={[styles.goalListIconCore, { backgroundColor: accent }]} />
          </View>
          <Text style={styles.cardTitle}>{title}</Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={palette.textMuted} />
      </View>
      <View style={styles.rowBetween}>
        <Text style={styles.goalMetricText}>{currency.format(current)}</Text>
        <Text style={styles.goalMetricText}>{currency.format(target)}</Text>
      </View>
      <View style={styles.goalTrack}>
        <View style={[styles.goalFill, { width: `${Math.max(progress * 100, 6)}%`, backgroundColor: accent }]} />
      </View>
      <View style={styles.rowBetween}>
        <Text style={styles.goalMetricSub}>{deadlineLabel ? `${statusLabel} · ${deadlineLabel}` : statusLabel}</Text>
        <Text style={styles.goalMetricSub}>{Math.round(progress * 100)}%</Text>
      </View>
    </View>
  );
}

function GoalsOverviewCard({
  total,
  goals,
}: {
  total: string;
  goals: Array<{ id: string; progress: number; accent: string }>;
}) {
  return (
      <View style={styles.goalsOverviewWrap}>
        <View style={styles.rowBetween}>
        <Text style={styles.goalsOverviewTitle}>Metas</Text>
        <View style={styles.addGoalButton}>
          <Ionicons name="add" size={14} color={palette.id === 'dark' ? palette.background : '#FFFFFF'} />
          <Text style={styles.addGoalText}>Nova meta</Text>
        </View>
      </View>
      <View style={styles.goalsBalancePill}>
        <Text style={styles.goalsBalanceText}>{total}</Text>
        <Text style={styles.goalsBalanceCaption}>Total planejado</Text>
      </View>
      <View style={styles.goalsBarsWrap}>
        {goals.map((goal, index) => (
          <View key={goal.id} style={styles.goalBarColumn}>
            <View style={styles.goalBarTrack}>
              <View
                style={[
                  styles.goalBarFill,
                  {
                    height: `${Math.max(goal.progress * 100, 18)}%`,
                    backgroundColor: goal.accent,
                  },
                ]}
              />
            </View>
            <View style={[styles.goalBarBadge, { borderColor: goal.accent }]}>
              <View style={[styles.goalBarBadgeCore, { backgroundColor: goal.accent }]} />
            </View>
            {index < goals.length - 1 ? <View style={styles.goalBarDivider} /> : null}
          </View>
        ))}
      </View>
    </View>
  );
}

function HeroCard({ title, value, description }: { title: string; value: string; description: string }) {
  return (
    <LinearGradient colors={palette.heroGradient} style={styles.heroCard}>
      <Text style={styles.cardEyebrow}>{title}</Text>
      <Text style={styles.heroValue}>{value}</Text>
      <Text style={styles.bodyText}>{description}</Text>
    </LinearGradient>
  );
}

function MetricCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <View style={styles.metricCard}>
      <Text style={styles.mutedText}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricDetail}>{detail}</Text>
    </View>
  );
}

function InsightRow({ text }: { text: string }) {
  return (
    <View style={styles.insightRow}>
      <View style={styles.insightDot} />
      <Text style={styles.bodyText}>{text}</Text>
    </View>
  );
}

function CategorySpendingList({
  items,
}: {
  items: Array<{ category: string; amount: number; movementCount: number }>;
}) {
  const topItems = items.slice(0, 4);
  const maximum = topItems[0]?.amount ?? 0;

  if (topItems.length === 0) {
    return (
      <View style={styles.emptyState}>
        <Ionicons name="pie-chart-outline" size={22} color={palette.textMuted} />
        <Text style={styles.bodyText}>Seus gastos por categoria aparecerao aqui conforme voce registrar o dia.</Text>
      </View>
    );
  }

  return (
    <View style={styles.categorySpendingList}>
      {topItems.map((item, index) => (
        <View key={item.category} style={styles.categorySpendingItem}>
          <View style={styles.rowBetween}>
            <Text style={styles.bodyText}>{item.category}</Text>
            <Text style={styles.categorySpendingValue}>{currency.format(item.amount)}</Text>
          </View>
          <View style={styles.categorySpendingTrack}>
            <View
              style={[
                styles.categorySpendingFill,
                {
                  width: `${maximum > 0 ? Math.max((item.amount / maximum) * 100, 5) : 0}%`,
                  backgroundColor: index === 0 ? palette.text : ['#21C45A', '#FF8A00', '#5B8CFF'][index - 1] ?? palette.textMuted,
                },
              ]}
            />
          </View>
          <Text style={styles.mutedText}>{item.movementCount} lancamento{item.movementCount === 1 ? '' : 's'}</Text>
        </View>
      ))}
    </View>
  );
}

function UpcomingBillsList({ bills }: { bills: UpcomingBill[] }) {
  const nextBills = [...bills].sort((left, right) => left.due.localeCompare(right.due)).slice(0, 3);

  if (nextBills.length === 0) {
    return (
      <View style={styles.emptyState}>
        <Ionicons name="calendar-outline" size={22} color={palette.textMuted} />
        <Text style={styles.bodyText}>Nenhuma conta pendente por enquanto.</Text>
      </View>
    );
  }

  return (
    <View style={styles.upcomingBillsList}>
      {nextBills.map((bill) => {
        const overdue = isBillOverdue(bill.due);
        return (
          <View key={bill.id} style={styles.upcomingBillRow}>
            <View style={[styles.upcomingBillIcon, overdue && styles.upcomingBillIconOverdue]}>
              <Ionicons name={overdue ? 'alert-circle-outline' : 'calendar-outline'} size={17} color={overdue ? palette.danger : palette.text} />
            </View>
            <View style={styles.flexOne}>
              <Text style={styles.bodyText}>{bill.title}</Text>
              <Text style={styles.mutedText}>{overdue ? 'Vencida' : `Vence ${formatBillDue(bill.due)}`} / {bill.context}</Text>
            </View>
            <Text style={overdue ? styles.amountNegative : styles.categorySpendingValue}>{currency.format(bill.amount)}</Text>
          </View>
        );
      })}
    </View>
  );
}

function RecentMovementsList({ movements }: { movements: Movement[] }) {
  const recentMovements = [...movements]
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
    .slice(0, 4);

  if (recentMovements.length === 0) {
    return (
      <View style={styles.emptyState}>
        <Ionicons name="receipt-outline" size={22} color={palette.textMuted} />
        <Text style={styles.bodyText}>Seus lancamentos recentes aparecerao aqui.</Text>
      </View>
    );
  }

  return (
    <View style={styles.recentMovementsList}>
      {recentMovements.map((movement) => (
        <View key={movement.id} style={styles.recentMovementRow}>
          <View style={[styles.recentMovementIcon, movement.type === 'income' ? styles.recentMovementIconIncome : styles.recentMovementIconExpense]}>
            <Ionicons name={movement.type === 'income' ? 'arrow-down-outline' : 'arrow-up-outline'} size={16} color={palette.text} />
          </View>
          <View style={styles.flexOne}>
            <Text style={styles.bodyText}>{movement.title}</Text>
            <Text style={styles.mutedText}>{formatMovementDate(movement.createdAt)} / {movement.category ?? 'Outros'}</Text>
          </View>
          <Text style={movement.type === 'income' ? styles.amountPositive : styles.amountNegative}>
            {movement.type === 'income' ? '+' : '-'}{currency.format(movement.amount)}
          </Text>
        </View>
      ))}
    </View>
  );
}

function ModeButton({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.modeButton, active && styles.modeButtonActive]}>
      <Text style={[styles.modeButtonText, active && styles.modeButtonTextActive]}>{label}</Text>
    </Pressable>
  );
}

function DraftCard({
  draft,
  accounts,
  categories,
  onSelectContext,
  onSelectAccount,
  onUpdate,
  onRemove,
}: {
  draft: DraftEntry;
  accounts: Account[];
  categories: FinancialCategory[];
  onSelectContext: (context: EntryContext) => void;
  onSelectAccount: (walletAccountId: string) => void;
  onUpdate: (update: { amount: number; occurredAt: string; category: MovementCategory }) => void;
  onRemove: () => void;
}) {
  const activeAccounts = accounts.filter((account) => !account.isArchived);
  const selectedAccount = activeAccounts.find((account) => account.id === draft.walletAccountId);
  const [isEditing, setIsEditing] = useState(false);
  const [amountInput, setAmountInput] = useState(String(draft.amount));
  const [dateInput, setDateInput] = useState(draft.occurredAt ?? new Date().toISOString().slice(0, 10));
  const [categoryInput, setCategoryInput] = useState<MovementCategory>(draft.category ?? 'Outros');
  const [editError, setEditError] = useState<string | null>(null);

  const saveDraftEdits = () => {
    const amount = parseCurrencyInput(amountInput);
    const occurredAt = normalizeEntryDate(dateInput);
    if (!Number.isFinite(amount) || amount <= 0 || !occurredAt) {
      setEditError('Informe um valor maior que zero e uma data valida.');
      return;
    }
    onUpdate({ amount, occurredAt, category: categoryInput });
    setEditError(null);
    setIsEditing(false);
  };

  return (
    <View style={styles.draftCard}>
      <View style={styles.rowBetween}>
        <View style={styles.flexOne}>
          <Text style={styles.cardTitle}>{draft.title}</Text>
          <Text style={styles.mutedText}>{draft.note}</Text>
          {draft.occurredAt ? <Text style={styles.mutedText}>Data: {formatBillDue(draft.occurredAt)}</Text> : null}
        </View>
        <Text style={draft.type === 'income' ? styles.amountPositive : styles.amountNegative}>
          {draft.type === 'income' ? '+' : '-'}
          {currency.format(draft.amount)}
        </Text>
      </View>
      {draft.question ? <Text style={styles.bodyText}>{draft.question}</Text> : null}
      <View style={styles.tag}>
        <Text style={styles.tagText}>{draft.category ?? 'Outros'}</Text>
      </View>
      {isEditing ? (
        <View style={styles.draftEditForm}>
          <TextInput
            value={amountInput}
            onChangeText={setAmountInput}
            placeholder="Valor"
            keyboardType="decimal-pad"
            placeholderTextColor={palette.textMuted}
            style={styles.field}
          />
          <TextInput
            value={dateInput}
            onChangeText={setDateInput}
            placeholder="Data (AAAA-MM-DD)"
            placeholderTextColor={palette.textMuted}
            style={styles.field}
          />
          <View style={styles.pillRow}>
            {categories.map((category) => (
              <Pill key={category.id} label={category.name} selected={categoryInput === category.name} onPress={() => setCategoryInput(category.name)} />
            ))}
          </View>
          {editError ? <Text style={styles.inlineDanger}>{editError}</Text> : null}
          <View style={styles.inlineActions}>
            <Pressable onPress={saveDraftEdits}>
              <Text style={styles.inlineLink}>Salvar revisao</Text>
            </Pressable>
            <Pressable onPress={() => setIsEditing(false)}>
              <Text style={styles.inlineDanger}>Cancelar</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <Pressable
          onPress={() => {
            setAmountInput(String(draft.amount));
            setDateInput(draft.occurredAt ?? new Date().toISOString().slice(0, 10));
            setCategoryInput(draft.category ?? 'Outros');
            setEditError(null);
            setIsEditing(true);
          }}
        >
          <Text style={styles.inlineLink}>Editar dados</Text>
        </Pressable>
      )}
      <View style={styles.pillRow}>
        <Pill label="Pessoal" selected={draft.context === 'Pessoal'} onPress={() => onSelectContext('Pessoal')} />
        <Pill label="Negocio" selected={draft.context === 'Negocio'} onPress={() => onSelectContext('Negocio')} />
        <Pill
          label="Compartilhado"
          selected={draft.context === 'Compartilhado'}
          onPress={() => onSelectContext('Compartilhado')}
        />
      </View>
      {draft.context ? (
        <View style={styles.selectionBlock}>
          <Text style={styles.mutedText}>
            Conta de destino{selectedAccount ? `: ${selectedAccount.name}` : ''}
          </Text>
          <View style={styles.pillRow}>
            {activeAccounts.map((account) => (
              <Pill
                key={account.id}
                label={account.name}
                selected={draft.walletAccountId === account.id}
                onPress={() => onSelectAccount(account.id)}
              />
            ))}
          </View>
        </View>
      ) : null}
      <Pressable onPress={onRemove}>
        <Text style={styles.inlineLink}>Descartar rascunho</Text>
      </Pressable>
    </View>
  );
}

function MessageBubble({ role, text }: { role: 'user' | 'assistant'; text: string }) {
  return (
    <View style={[styles.messageBubble, role === 'assistant' ? styles.assistantBubble : styles.userBubble]}>
      <Text style={styles.messageRole}>{role === 'assistant' ? 'Norte' : 'Voce'}</Text>
      <Text style={styles.bodyText}>{text}</Text>
    </View>
  );
}

function MovementRow({
  movement,
  onEdit,
  onDelete,
}: {
  movement: Movement;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const merchant = getMerchantPresentation(movement.title);
  return (
    <View style={styles.movementRow}>
      <View style={styles.rowBetween}>
        <View style={[styles.merchantIcon, { backgroundColor: merchant?.color ?? palette.backgroundSoft }]}>
          <Ionicons name={(merchant?.icon ?? (movement.type === 'income' ? 'arrow-down-outline' : 'arrow-up-outline')) as keyof typeof Ionicons.glyphMap} size={17} color={merchant?.color === '#FFD84D' ? '#111111' : merchant ? '#FFFFFF' : palette.text} />
        </View>
        <View style={styles.flexOne}>
          <Text style={styles.cardTitle}>{merchant?.name ?? movement.title}</Text>
          <Text style={styles.mutedText}>
            {formatMovementDate(movement.createdAt)} • {movement.source} • {movement.account}
          </Text>
        </View>
        <Text style={movement.type === 'income' ? styles.amountPositive : styles.amountNegative}>
          {movement.type === 'income' ? '+' : '-'}
          {currency.format(movement.amount)}
        </Text>
      </View>
      <View style={styles.pillRow}>
        <View style={styles.tag}>
          <Text style={styles.tagText}>{movement.context}</Text>
        </View>
        <View style={styles.tag}>
          <Text style={styles.tagText}>{movement.category ?? 'Outros'}</Text>
        </View>
      </View>
      <View style={styles.inlineActions}>
        <Pressable onPress={onEdit}>
          <Text style={styles.inlineLink}>Editar</Text>
        </Pressable>
        <Pressable onPress={onDelete}>
          <Text style={styles.inlineDanger}>Excluir</Text>
        </Pressable>
      </View>
    </View>
  );
}

function createStyles(palette: ThemePalette) {
  return StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: palette.background,
  },
  safeArea: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: 132,
    gap: spacing.lg,
  },
  stack: {
    gap: spacing.lg,
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
    paddingHorizontal: spacing.lg,
  },
  authWrap: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  welcomeWrap: {
    flex: 1,
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xxl,
    paddingBottom: spacing.xl,
  },
  logoLockup: {
    alignItems: 'center',
    gap: spacing.md,
  },
  brand: {
    color: palette.text,
    fontSize: 34,
    fontWeight: '700',
    letterSpacing: -1,
  },
  subtitle: {
    color: palette.textMuted,
    fontSize: 16,
    lineHeight: 24,
    textAlign: 'center',
    maxWidth: 320,
  },
  featureStack: {
    gap: spacing.md,
  },
  featureRow: {
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
  },
  featureIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.backgroundSoft,
  },
  featureText: {
    flex: 1,
    gap: 4,
  },
  primaryButton: {
    minHeight: 54,
    borderRadius: radius.pill,
    backgroundColor: palette.text,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  primaryButtonCompact: {
    minHeight: 46,
    borderRadius: radius.pill,
    backgroundColor: palette.text,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  primaryButtonDisabled: {
    opacity: 0.45,
  },
  primaryButtonText: {
    color: palette.background,
    fontSize: 15,
    fontWeight: '700',
  },
  secondaryButton: {
    minHeight: 54,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: palette.border,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  secondaryButtonText: {
    color: palette.text,
    fontSize: 15,
    fontWeight: '600',
  },
  onboardingHeader: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    gap: 8,
  },
  kicker: {
    color: palette.textMuted,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1.4,
  },
  sectionTitle: {
    color: palette.text,
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: -1,
  },
  bodyText: {
    color: palette.textMuted,
    fontSize: 14,
    lineHeight: 22,
  },
  backendHint: {
    color: palette.textMuted,
    fontSize: 12,
  },
  footerActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
  },
  selectableCard: {
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    gap: 8,
  },
  selectableCardActive: {
    borderColor: palette.borderStrong,
    backgroundColor: palette.surface,
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radius.pill,
    backgroundColor: palette.backgroundSoft,
    borderWidth: 1,
    borderColor: palette.border,
  },
  pillActive: {
    backgroundColor: palette.surfaceStrong,
    borderColor: palette.borderStrong,
  },
  pillText: {
    color: palette.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
  pillTextActive: {
    color: palette.id === 'light' ? '#FFFFFF' : palette.text,
  },
  card: {
    borderRadius: radius.lg,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    padding: spacing.lg,
    gap: spacing.md,
  },
  cardSoft: {
    backgroundColor: palette.id === 'dark' ? palette.surface : '#FCFBF8',
    shadowColor: palette.shadow,
    shadowOpacity: palette.id === 'dark' ? 0.16 : 0.08,
    shadowRadius: 14,
    shadowOffset: {
      width: 0,
      height: 10,
    },
    elevation: 4,
  },
  miniMetric: {
    flex: 1,
    gap: 4,
  },
  metricRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  appHeader: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerLeading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  headerMenuButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.id === 'dark' ? palette.surface : '#FFFFFF',
  },
  appTitle: {
    color: palette.text,
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.4,
  },
  headerMeta: {
    color: palette.textMuted,
    fontSize: 13,
    marginTop: 2,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  headerBadge: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: radius.pill,
    backgroundColor: palette.id === 'dark' ? palette.surface : '#FFFFFF',
    borderWidth: 1,
    borderColor: palette.border,
  },
  headerBadgeText: {
    color: palette.text,
    fontSize: 11,
    fontWeight: '700',
  },
  headerIconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
  },
  avatarButton: {
    borderRadius: 22,
  },
  avatarGradient: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: palette.background,
    fontSize: 14,
    fontWeight: '800',
  },
  profilePopover: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: palette.backgroundElevated,
    borderWidth: 1,
    borderColor: palette.border,
    padding: spacing.lg,
    gap: spacing.md,
  },
  profileIdentity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  profileAvatarLarge: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileAvatarText: {
    color: palette.background,
    fontSize: 16,
    fontWeight: '800',
  },
  profileAction: {
    minHeight: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  profileActionText: {
    color: palette.text,
    fontSize: 14,
    fontWeight: '600',
  },
  heroCard: {
    borderRadius: radius.lg,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: palette.borderStrong,
    gap: spacing.sm,
  },
  cardEyebrow: {
    color: palette.textMuted,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  heroValue: {
    color: palette.text,
    fontSize: 38,
    fontWeight: '700',
    letterSpacing: -1.4,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  metricCard: {
    width: '47.6%',
    minHeight: 156,
    borderRadius: radius.md,
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.border,
    padding: spacing.md,
    gap: 10,
  },
  metricValue: {
    color: palette.text,
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.8,
  },
  metricDetail: {
    color: palette.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
  },
  inlineLink: {
    color: palette.text,
    fontSize: 13,
    fontWeight: '700',
  },
  profileSyncError: {
    gap: spacing.xs,
    padding: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: palette.id === 'dark' ? '#3A1A1A' : '#FEE2E2',
  },
  profileSyncErrorText: {
    color: palette.id === 'dark' ? '#FFD1D1' : '#991B1B',
    fontSize: 12,
    lineHeight: 17,
  },
  detailStack: {
    gap: spacing.md,
  },
  balanceSpotlight: {
    borderRadius: radius.lg,
    backgroundColor: '#111111',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
    gap: spacing.md,
    shadowColor: '#050608',
    shadowOpacity: 0.24,
    shadowRadius: 24,
    shadowOffset: {
      width: 0,
      height: 16,
    },
    elevation: 8,
  },
  balanceChip: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  balanceChipDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#21C45A',
  },
  balanceChipText: {
    color: '#F2F2EF',
    fontSize: 11,
    fontWeight: '700',
  },
  balanceCaption: {
    color: '#A0A0A0',
    fontSize: 13,
  },
  balanceAmount: {
    color: '#F2F2EF',
    fontSize: 36,
    fontWeight: '700',
    letterSpacing: -1.2,
  },
  balanceBreakdownRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  balanceBreakdownCard: {
    flex: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    backgroundColor: 'rgba(255,255,255,0.06)',
    gap: 6,
  },
  balanceBreakdownLabel: {
    color: '#A0A0A0',
    fontSize: 12,
    fontWeight: '600',
  },
  balanceBreakdownValue: {
    color: '#F2F2EF',
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.6,
  },
  balanceSpendablePill: {
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    backgroundColor: 'rgba(255,255,255,0.10)',
    gap: 4,
  },
  balanceSpendableLabel: {
    color: '#A0A0A0',
    fontSize: 12,
    fontWeight: '600',
  },
  balanceSpendableValue: {
    color: '#F2F2EF',
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.8,
  },
  balanceActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  quickAction: {
    flex: 1,
    alignItems: 'center',
    gap: 8,
  },
  quickActionIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickActionLabel: {
    color: '#F2F2EF',
    fontSize: 11,
    fontWeight: '600',
  },
  guidanceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.borderStrong,
    backgroundColor: palette.surface,
  },
  guidanceIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.accentGlow,
  },
  guidanceContent: {
    flex: 1,
    gap: 3,
  },
  guidanceEyebrow: {
    color: palette.textMuted,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.7,
  },
  guidanceTitle: {
    color: palette.text,
    fontSize: 15,
    fontWeight: '700',
  },
  guidanceDescription: {
    color: palette.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  walletHeroWrap: {
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  walletHeroCard: {
    borderRadius: radius.lg,
    padding: spacing.xl,
    gap: spacing.xl,
    zIndex: 3,
    shadowColor: '#07090C',
    shadowOpacity: 0.24,
    shadowRadius: 22,
    shadowOffset: {
      width: 0,
      height: 16,
    },
    elevation: 12,
  },
  walletHeroShadowCard: {
    position: 'absolute',
    left: 18,
    right: 18,
    top: 18,
    height: '92%',
    borderRadius: 28,
    backgroundColor: palette.id === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(31,34,39,0.12)',
    zIndex: 2,
  },
  walletHeroShadowCardBack: {
    position: 'absolute',
    left: 36,
    right: 36,
    top: 34,
    height: '84%',
    borderRadius: 24,
    backgroundColor: palette.id === 'dark' ? 'rgba(255,255,255,0.04)' : 'rgba(31,34,39,0.07)',
    zIndex: 1,
  },
  walletHeroEyebrow: {
    color: 'rgba(255,255,255,0.68)',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1.4,
  },
  walletHeroAmount: {
    color: '#FFFFFF',
    fontSize: 34,
    fontWeight: '700',
    letterSpacing: -1.2,
    marginTop: 8,
  },
  walletHeroMark: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  walletHeroFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  walletHeroLabel: {
    color: 'rgba(255,255,255,0.66)',
    fontSize: 12,
    fontWeight: '600',
  },
  walletHeroValue: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    marginTop: 6,
  },
  walletPassStack: {
    gap: spacing.md,
  },
  walletPassCard: {
    borderRadius: radius.lg,
    padding: spacing.lg,
    minHeight: 186,
    justifyContent: 'space-between',
    shadowColor: '#07090C',
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: {
      width: 0,
      height: 12,
    },
    elevation: 9,
  },
  walletPassCardOffset: {
    marginTop: -14,
  },
  walletPassBrand: {
    color: 'rgba(255,255,255,0.66)',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.8,
  },
  walletPassMiddle: {
    gap: 6,
  },
  walletPassName: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: -0.8,
  },
  walletPassNumber: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 2.4,
  },
  walletPassLabel: {
    color: 'rgba(255,255,255,0.64)',
    fontSize: 12,
    fontWeight: '600',
  },
  walletPassValue: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    marginTop: 6,
  },
  walletPassActions: {
    alignItems: 'flex-end',
    gap: 8,
  },
  walletPassActionText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  walletPassActionDanger: {
    color: '#F3A4A4',
    fontSize: 13,
    fontWeight: '700',
  },
  walletAccountGrid: {
    gap: spacing.md,
  },
  walletAccountSummaryCard: {
    borderRadius: radius.md,
    backgroundColor: palette.id === 'dark' ? palette.surfaceSoft : '#FFFFFF',
    borderWidth: 1,
    borderColor: palette.border,
    padding: spacing.md,
    gap: 8,
  },
  walletAccountAccent: {
    width: 34,
    height: 6,
    borderRadius: radius.pill,
  },
  walletAccountTitle: {
    color: palette.textMuted,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1.1,
  },
  walletAccountAmount: {
    color: palette.text,
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: -0.8,
  },
  walletAccountDetail: {
    color: palette.textMuted,
    fontSize: 13,
  },
  selectionBlock: {
    gap: spacing.sm,
  },
  goalListItem: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: palette.id === 'dark' ? palette.surfaceSoft : '#FFFFFF',
    borderWidth: 1,
    borderColor: palette.border,
  },
  goalContributionForm: {
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },
  goalListTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
  },
  goalListIcon: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  goalListIconCore: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  goalMetricText: {
    color: palette.text,
    fontSize: 12,
    fontWeight: '700',
  },
  goalTrack: {
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: palette.id === 'dark' ? 'rgba(255,255,255,0.08)' : '#D8D8D4',
    overflow: 'hidden',
  },
  goalFill: {
    height: '100%',
    borderRadius: radius.pill,
  },
  goalMetricSub: {
    color: palette.textMuted,
    fontSize: 11,
    fontWeight: '600',
  },
  goalsOverviewWrap: {
    gap: spacing.md,
  },
  goalsOverviewTitle: {
    color: palette.text,
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: -0.8,
  },
  addGoalButton: {
    minHeight: 32,
    borderRadius: radius.pill,
    backgroundColor: palette.text,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  addGoalText: {
    color: palette.background,
    fontSize: 11,
    fontWeight: '700',
  },
  goalsBalancePill: {
    alignSelf: 'flex-start',
    gap: 2,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radius.md,
    backgroundColor: palette.id === 'dark' ? palette.surfaceStrong : '#F3F0E8',
  },
  goalsBalanceText: {
    color: palette.text,
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.6,
  },
  goalsBalanceCaption: {
    color: palette.textMuted,
    fontSize: 11,
    fontWeight: '600',
  },
  goalsBarsWrap: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: spacing.sm,
    minHeight: 190,
    paddingTop: spacing.sm,
  },
  goalBarColumn: {
    flex: 1,
    alignItems: 'center',
    position: 'relative',
  },
  goalBarTrack: {
    width: '100%',
    maxWidth: 46,
    height: 142,
    borderRadius: 23,
    backgroundColor: palette.id === 'dark' ? palette.surfaceStrong : '#ECE8DE',
    justifyContent: 'flex-end',
    padding: 5,
  },
  goalBarFill: {
    width: '100%',
    borderRadius: 18,
    minHeight: 20,
  },
  goalBarBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1,
    backgroundColor: palette.surface,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'absolute',
    top: 8,
  },
  goalBarBadgeCore: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  goalBarDivider: {
    position: 'absolute',
    right: -10,
    top: 54,
    width: 12,
    borderTopWidth: 1,
    borderTopColor: palette.borderStrong,
  },
  goalSubCard: {
    borderRadius: radius.md,
    padding: spacing.md,
    backgroundColor: palette.id === 'dark' ? palette.surfaceSoft : '#FFFFFF',
    borderWidth: 1,
    borderColor: palette.border,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.md,
  },
  goalEditableItem: {
    gap: spacing.xs,
  },
  billItemSide: {
    alignItems: 'flex-end',
    gap: spacing.xs,
  },
  insightRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'flex-start',
  },
  insightDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: palette.text,
    marginTop: 8,
  },
  orbStage: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    paddingVertical: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: '#111111',
  },
  orbStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  orbStatusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  orbStatusText: {
    color: '#A0A0A0',
    fontSize: 12,
    fontWeight: '700',
  },
  orbLabel: {
    color: '#F2F2EF',
    fontSize: 15,
    fontWeight: '600',
  },
  orbTalkButton: {
    minHeight: 48,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: '#F2F2EF',
  },
  orbTalkButtonActive: {
    backgroundColor: '#FFFFFF',
  },
  orbTalkButtonText: {
    color: '#111111',
    fontSize: 14,
    fontWeight: '800',
  },
  modeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  modeButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: radius.pill,
    backgroundColor: palette.backgroundSoft,
    borderWidth: 1,
    borderColor: palette.border,
  },
  modeButtonActive: {
    backgroundColor: palette.surfaceStrong,
  },
  modeButtonText: {
    color: palette.textMuted,
    fontSize: 13,
    fontWeight: '700',
  },
  modeButtonTextActive: {
    color: palette.id === 'light' ? '#FFFFFF' : palette.text,
  },
  quickPromptRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  quickPrompt: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.sm,
    paddingVertical: 9,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.backgroundSoft,
  },
  quickPromptText: {
    color: palette.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  inputCard: {
    gap: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.border,
    padding: spacing.md,
    backgroundColor: palette.surface,
  },
  input: {
    minHeight: 84,
    color: palette.text,
    fontSize: 15,
    lineHeight: 22,
    textAlignVertical: 'top',
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.backgroundSoft,
  },
  iconButtonActive: {
    backgroundColor: palette.surfaceStrong,
    borderWidth: 1,
    borderColor: palette.borderStrong,
  },
  cardTitle: {
    color: palette.text,
    fontSize: 16,
    fontWeight: '700',
  },
  mutedText: {
    color: palette.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  draftCard: {
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    gap: spacing.md,
  },
  statusCard: {
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.backgroundSoft,
  },
  statusCardError: {
    borderColor: 'rgba(206,97,97,0.24)',
    backgroundColor: palette.id === 'dark' ? 'rgba(206,97,97,0.12)' : 'rgba(206,97,97,0.08)',
  },
  statusCardInfo: {
    borderColor: palette.borderStrong,
    backgroundColor: palette.id === 'dark' ? 'rgba(255,255,255,0.06)' : '#F7F4EC',
  },
  statusCardSuccess: {
    borderColor: palette.id === 'dark' ? 'rgba(112,215,175,0.28)' : 'rgba(46,154,109,0.24)',
    backgroundColor: palette.id === 'dark' ? 'rgba(112,215,175,0.1)' : 'rgba(46,154,109,0.08)',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.lg,
  },
  statusText: {
    color: palette.text,
    fontSize: 13,
    lineHeight: 18,
  },
  statusTextError: {
    color: palette.danger,
  },
  flexOne: {
    flex: 1,
  },
  amountPositive: {
    color: palette.success,
    fontSize: 16,
    fontWeight: '700',
  },
  amountNegative: {
    color: palette.warning,
    fontSize: 16,
    fontWeight: '700',
  },
  messageBubble: {
    padding: spacing.md,
    borderRadius: radius.md,
    gap: 6,
  },
  assistantBubble: {
    backgroundColor: palette.surfaceSoft,
    borderWidth: 1,
    borderColor: palette.border,
  },
  userBubble: {
    backgroundColor: palette.surfaceStrong,
  },
  messageRole: {
    color: palette.text,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  manualForm: {
    gap: spacing.md,
  },
  field: {
    minHeight: 52,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    paddingHorizontal: spacing.md,
    color: palette.text,
    fontSize: 15,
  },
  movementRow: {
    gap: spacing.sm,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
  },
  tag: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: palette.backgroundSoft,
  },
  tagText: {
    color: palette.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  accountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.md,
  },
  entityCard: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
  },
  cardBlock: {
    gap: spacing.sm,
  },
  inlineActions: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'center',
  },
  archivedAccountsBlock: {
    gap: spacing.sm,
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: palette.border,
  },
  archivedAccountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.xs,
  },
  undoBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: radius.md,
    backgroundColor: palette.surfaceStrong,
    padding: spacing.md,
  },
  undoTitle: {
    color: palette.id === 'light' ? '#FFFFFF' : palette.text,
    fontSize: 14,
    fontWeight: '700',
  },
  undoText: {
    color: palette.id === 'light' ? 'rgba(255,255,255,0.72)' : palette.textMuted,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 3,
  },
  undoButton: {
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    backgroundColor: palette.id === 'light' ? '#FFFFFF' : palette.background,
  },
  undoButtonText: {
    color: palette.id === 'light' ? '#111111' : palette.text,
    fontSize: 13,
    fontWeight: '700',
  },
  inlineDanger: {
    color: palette.danger,
    fontSize: 13,
    fontWeight: '700',
  },
  progressTrack: {
    height: 9,
    borderRadius: radius.pill,
    backgroundColor: palette.backgroundSoft,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: radius.pill,
    backgroundColor: palette.text,
  },
  cashForecastCard: {
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: '#111111',
  },
  invoiceSummaryCard: {
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: '#111111',
  },
  invoiceSummaryValue: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '800',
  },
  invoiceSummaryFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  invoiceSummaryText: {
    flex: 1,
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    fontWeight: '600',
  },
  statementTextArea: {
    minHeight: 112,
    textAlignVertical: 'top',
  },
  cashForecastEyebrow: {
    color: '#AAAAAA',
    fontSize: 12,
    fontWeight: '700',
  },
  cashForecastTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
  },
  forecastModeRow: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  forecastModeButton: {
    minHeight: 32,
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: '#252525',
  },
  forecastModeButtonActive: {
    backgroundColor: '#FFFFFF',
  },
  forecastModeText: {
    color: '#C9C9C9',
    fontSize: 12,
    fontWeight: '700',
  },
  forecastModeTextActive: {
    color: '#111111',
  },
  forecastMetricRow: {
    flexDirection: 'row',
    gap: spacing.lg,
  },
  cashForecastLabel: {
    color: '#AAAAAA',
    fontSize: 12,
  },
  cashForecastValue: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
  cashForecastRiskValue: {
    color: '#FFD1D1',
    fontSize: 18,
    fontWeight: '700',
  },
  cashForecastMessage: {
    color: '#D1D1D1',
    fontSize: 13,
    lineHeight: 19,
  },
  categorySpendingList: {
    gap: spacing.md,
    marginTop: spacing.md,
  },
  categorySpendingItem: {
    gap: spacing.xs,
  },
  categorySpendingValue: {
    color: palette.text,
    fontSize: 14,
    fontWeight: '700',
  },
  categorySpendingTrack: {
    height: 6,
    overflow: 'hidden',
    borderRadius: radius.pill,
    backgroundColor: palette.backgroundSoft,
  },
  categorySpendingFill: {
    height: '100%',
    borderRadius: radius.pill,
  },
  monthSummaryRow: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  monthSummaryItem: {
    flex: 1,
    gap: 4,
  },
  monthSummaryLabel: {
    color: '#AAAAAA',
    fontSize: 11,
    lineHeight: 15,
  },
  monthSummaryPositive: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  monthSummaryNegative: {
    color: '#FFD1D1',
    fontSize: 13,
    fontWeight: '700',
  },
  draftEditForm: {
    gap: spacing.sm,
    paddingTop: spacing.xs,
  },
  upcomingBillsList: {
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  upcomingBillRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 44,
  },
  upcomingBillIcon: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
    backgroundColor: palette.backgroundSoft,
  },
  upcomingBillIconOverdue: {
    backgroundColor: palette.id === 'dark' ? '#3A1A1A' : '#FEE2E2',
  },
  recentMovementsList: {
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  recentMovementRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 44,
  },
  recentMovementIcon: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
  },
  recentMovementIconIncome: {
    backgroundColor: palette.id === 'dark' ? '#163524' : '#DCFCE7',
  },
  recentMovementIconExpense: {
    backgroundColor: palette.id === 'dark' ? '#2C2520' : '#FFF1E5',
  },
  drawerBackdrop: {
    flex: 1,
    backgroundColor: palette.overlay,
    flexDirection: 'row',
  },
  drawerScrim: {
    flex: 1,
  },
  drawerPanel: {
    width: '82%',
    maxWidth: 360,
    backgroundColor: palette.backgroundElevated,
    borderLeftWidth: 1,
    borderColor: palette.border,
    paddingTop: spacing.xxl,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
  },
  drawerTop: {
    paddingBottom: spacing.lg,
  },
  drawerHero: {
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: palette.borderStrong,
    gap: spacing.md,
  },
  drawerTitle: {
    color: palette.text,
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.8,
  },
  drawerAvatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
  },
  drawerAvatarText: {
    color: palette.background,
    fontSize: 14,
    fontWeight: '800',
  },
  drawerContent: {
    gap: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  drawerSection: {
    gap: spacing.sm,
  },
  drawerSectionTitle: {
    color: palette.textMuted,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 1.4,
  },
  drawerSectionBody: {
    gap: spacing.sm,
  },
  drawerItem: {
    minHeight: 50,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  drawerItemActive: {
    backgroundColor: palette.surfaceStrong,
    borderColor: palette.borderStrong,
  },
  drawerItemText: {
    color: palette.textMuted,
    fontSize: 14,
    fontWeight: '600',
  },
  drawerItemTextActive: {
    color: palette.id === 'light' ? '#FFFFFF' : palette.text,
  },
  bottomBar: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    bottom: spacing.lg,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingTop: 10,
    paddingBottom: 12,
    borderRadius: radius.lg,
    backgroundColor: '#111111',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    shadowColor: '#050608',
    shadowOpacity: 0.16,
    shadowRadius: 18,
    shadowOffset: {
      width: 0,
      height: 10,
    },
    elevation: 10,
  },
  bottomBarSide: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  tabButton: {
    minWidth: 58,
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
  },
  assistantDockButton: {
    marginTop: -30,
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: spacing.md,
  },
  assistantDockCore: {
    width: 82,
    height: 82,
    borderRadius: 41,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 6,
    borderColor: '#0E1013',
    shadowColor: palette.shadow,
    shadowOpacity: activeThemeMode === 'dark' ? 0.28 : 0.12,
    shadowRadius: 20,
  },
  assistantDockLabel: {
    color: '#7D8796',
    fontSize: 12,
    fontWeight: '700',
  },
  assistantDockLabelActive: {
    color: '#FFFFFF',
  },
  tabLabel: {
    color: '#7D8796',
    fontSize: 11,
    fontWeight: '600',
  },
  tabLabelActive: {
    color: '#FFFFFF',
  },
  themePanel: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
  },
  iconChoice: {
    width: 38,
    height: 38,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.backgroundSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconChoiceActive: {
    backgroundColor: palette.surfaceStrong,
    borderColor: palette.surfaceStrong,
  },
  colorChoice: {
    width: 28,
    height: 28,
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  colorChoiceActive: {
    borderColor: palette.text,
  },
  categoryManagerList: {
    gap: spacing.xs,
  },
  categoryManagerRow: {
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  categoryDot: {
    width: 8,
    height: 8,
    borderRadius: radius.pill,
  },
  merchantIcon: {
    width: 34,
    height: 34,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  connectionRow: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  connectionIcon: {
    width: 34,
    height: 34,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.backgroundSoft,
  },
  connectionStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  connectionPlannedRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: palette.border,
  },
  cardDayField: {
    flex: 1,
  },
  themeOptions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  themeOption: {
    flex: 1,
    minHeight: 54,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.backgroundSoft,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  themeOptionActive: {
    backgroundColor: palette.surfaceStrong,
    borderColor: palette.borderStrong,
  },
  themeOptionText: {
    color: palette.textMuted,
    fontSize: 13,
    fontWeight: '700',
  },
  themeOptionTextActive: {
    color: palette.text,
  },
  });
}
