import type { Session } from '@supabase/supabase-js';

import type { AssistantTurnResponse } from './assistantTypes';
import {
  initialAccounts,
  initialCards,
  initialMessages,
  goals as initialGoals,
  upcomingBills as initialUpcomingBills,
  type Account,
  type DraftEntry,
  type Message,
  type Movement,
  type Goal,
  type UpcomingBill,
  type WalletCard,
} from './mockData';
import { resolveMovementAccount } from './financeEngine';
import { supabase } from './supabase';

type WorkspaceSnapshot = {
  accounts: Account[];
  cards: WalletCard[];
  goals: Goal[];
  upcomingBills: UpcomingBill[];
  movements: Movement[];
  drafts: DraftEntry[];
  messages: Message[];
};

type AccountInput = {
  name: string;
  detail: string;
  kind: string;
  isBusiness: boolean;
  balance?: number;
};

type CardInput = {
  name: string;
  limit: number;
  used: number;
  walletAccountId?: string | null;
};

type MovementInput = {
  title: string;
  amount: number;
  type: 'income' | 'expense';
  context: Movement['context'];
  source: Movement['source'];
  occurredAt: string;
  walletAccountId?: string | null;
  cardId?: string | null;
  accountName?: string;
};

type UserProfileInput = {
  userId: string;
  fullName?: string | null;
  onboardingProfile: 'personal' | 'freelancer' | 'business';
  selectedPainPoints: string[];
};

type GoalInput = Pick<Goal, 'title' | 'target' | 'current'>;
type UpcomingBillInput = Pick<UpcomingBill, 'title' | 'amount' | 'due'>;

function requireSupabase() {
  if (!supabase) {
    throw new Error('Supabase nao configurado no app.');
  }

  return supabase;
}

function buildDefaultAccountSeed(userId: string) {
  return initialAccounts.map((account) => ({
    user_id: userId,
    name: account.name,
    kind: account.name === 'Reserva' ? 'reserve' : 'cash',
    currency: 'BRL',
    balance: account.balance,
    is_business: account.name.includes('PJ'),
  }));
}

function messageRowToApp(row: { id: string; role: string; text: string }): Message {
  return {
    id: row.id,
    role: row.role === 'assistant' ? 'assistant' : 'user',
    text: row.text,
  };
}

function accountRowToApp(account: {
  id: string;
  name: string;
  balance: number | string;
  kind: string;
  is_business: boolean;
}) {
  return {
    id: account.id,
    name: account.name,
    balance: Number(account.balance),
    detail: account.is_business ? 'Conta sincronizada do negocio' : 'Conta sincronizada',
    kind: account.kind,
    isBusiness: account.is_business,
  } satisfies Account;
}

function cardRowToApp(card: {
  id: string;
  name: string;
  limit_amount: number | string;
  used_amount: number | string;
  wallet_account_id: string | null;
}) {
  return {
    id: card.id,
    name: card.name,
    limit: Number(card.limit_amount),
    used: Number(card.used_amount),
    walletAccountId: card.wallet_account_id,
  } satisfies WalletCard;
}

function movementRowToApp(
  movement: {
    id: string;
    title: string;
    amount: number | string;
    type: string;
    context: string;
    source: string;
    occurred_at: string;
    wallet_account_id: string | null;
    card_id: string | null;
  },
  accountMap: Map<string, string>,
): Movement {
  return {
    id: movement.id,
    title: movement.title,
    amount: Number(movement.amount),
    type: movement.type as Movement['type'],
    context: movement.context as Movement['context'],
    source: movement.source as Movement['source'],
    createdAt: movement.occurred_at,
    account:
      accountMap.get(movement.wallet_account_id ?? '') ??
      resolveMovementAccount(movement.context as Movement['context']),
    walletAccountId: movement.wallet_account_id,
    cardId: movement.card_id,
  };
}

export async function ensureUserProfile(input: UserProfileInput) {
  const client = requireSupabase();

  const { data: existingProfile, error: existingProfileError } = await client
    .from('profiles')
    .select('id')
    .eq('id', input.userId)
    .maybeSingle();

  if (existingProfileError) {
    throw new Error(existingProfileError.message || 'Nao foi possivel consultar o perfil do usuario.');
  }

  if (existingProfile?.id) {
    const { error: profileUpdateError } = await client
      .from('profiles')
      .update({
        full_name: input.fullName ?? '',
        onboarding_profile: input.onboardingProfile,
        selected_pain_points: input.selectedPainPoints,
        updated_at: new Date().toISOString(),
      })
      .eq('id', input.userId);

    if (profileUpdateError) {
      throw new Error(profileUpdateError.message || 'Nao foi possivel atualizar o perfil do usuario.');
    }
  } else {
    const { error: profileInsertError } = await client.from('profiles').insert({
      id: input.userId,
      full_name: input.fullName ?? '',
      onboarding_profile: input.onboardingProfile,
      selected_pain_points: input.selectedPainPoints,
      updated_at: new Date().toISOString(),
    });

    if (profileInsertError) {
      throw new Error(profileInsertError.message || 'Nao foi possivel criar o perfil do usuario.');
    }
  }

  const { data: existingAccounts, error: accountsError } = await client
    .from('wallet_accounts')
    .select('id')
    .eq('user_id', input.userId)
    .limit(1);

  if (accountsError) {
    throw new Error(accountsError.message || 'Nao foi possivel verificar as contas iniciais do usuario.');
  }

  if (!existingAccounts || existingAccounts.length === 0) {
    const { error: seedError } = await client.from('wallet_accounts').insert(buildDefaultAccountSeed(input.userId));

    if (seedError) {
      throw new Error(seedError.message || 'Nao foi possivel criar as contas iniciais do usuario.');
    }
  }
}

export async function loadWorkspaceSnapshot(userId: string): Promise<WorkspaceSnapshot | null> {
  const client = requireSupabase();

  const [{ data: accounts }, { data: cards }, { data: goals }, { data: upcomingBills }, { data: movements }, { data: drafts }, { data: messages }] = await Promise.all([
    client.from('wallet_accounts').select('*').eq('user_id', userId).order('created_at', { ascending: true }),
    client.from('cards').select('*').eq('user_id', userId).order('created_at', { ascending: true }),
    client.from('goals').select('*').eq('user_id', userId).order('created_at', { ascending: true }),
    client.from('scheduled_bills').select('*').eq('user_id', userId).order('due_date', { ascending: true }),
    client.from('transactions').select('*').eq('user_id', userId).order('occurred_at', { ascending: false }).limit(50),
    client
      .from('transaction_drafts')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false }),
    client.from('assistant_messages').select('id, role, text').eq('user_id', userId).order('created_at', { ascending: true }).limit(20),
  ]);

  const accountRows = accounts ?? [];
  const accountMap = new Map(accountRows.map((account) => [account.id as string, account.name as string]));

  return {
    accounts: accountRows.length > 0 ? accountRows.map((account) => accountRowToApp(account as never)) : initialAccounts,
    cards: (cards ?? []).length > 0 ? (cards ?? []).map((card) => cardRowToApp(card as never)) : initialCards,
    goals:
      (goals ?? []).length > 0
        ? (goals ?? []).map((goal) => ({
            id: goal.id as string,
            title: goal.title as string,
            target: Number(goal.target_amount),
            current: Number(goal.current_amount),
          }))
        : initialGoals,
    upcomingBills:
      (upcomingBills ?? []).length > 0
        ? (upcomingBills ?? []).map((bill) => ({
            id: bill.id as string,
            title: bill.title as string,
            amount: Number(bill.amount),
            due: bill.due_date as string,
          }))
        : initialUpcomingBills,
    movements: (movements ?? []).map((movement) => movementRowToApp(movement as never, accountMap)),
    drafts: (drafts ?? []).map((draft) => ({
      id: draft.id as string,
      title: draft.title as string,
      amount: Number(draft.amount),
      type: draft.type as 'income' | 'expense',
      context: (draft.context as DraftEntry['context'] | null) ?? undefined,
      question: (draft.question as string | null) ?? undefined,
      note: draft.note as string,
      walletAccountId: null,
      cardId: null,
    })),
    messages: (messages ?? []).length > 0 ? (messages ?? []).map(messageRowToApp) : initialMessages,
  };
}

async function ensureAssistantThread(userId: string) {
  const client = requireSupabase();

  const { data: existing } = await client
    .from('assistant_threads')
    .select('id')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (existing?.id) {
    return existing.id as string;
  }

  const { data: created, error } = await client
    .from('assistant_threads')
    .insert({ user_id: userId, title: 'Conversa Norte' })
    .select('id')
    .single();

  if (error || !created?.id) {
    throw new Error(error?.message || 'Nao foi possivel criar a thread do Norte.');
  }

  return created.id as string;
}

export async function persistAssistantTurn(
  session: Session,
  requestMessage: string,
  response: AssistantTurnResponse,
  profileContext?: Pick<UserProfileInput, 'onboardingProfile' | 'selectedPainPoints'>,
): Promise<{ persistedMessages: Message[]; persistedDrafts: DraftEntry[] }> {
  const client = requireSupabase();
  const userId = session.user.id;

  await ensureUserProfile({
    userId,
    fullName: (session.user.user_metadata?.full_name as string | undefined) ?? session.user.email ?? '',
    onboardingProfile: profileContext?.onboardingProfile ?? 'freelancer',
    selectedPainPoints: profileContext?.selectedPainPoints ?? [],
  });

  const threadId = await ensureAssistantThread(userId);

  const { data: insertedMessages, error: messageError } = await client
    .from('assistant_messages')
    .insert([
      { thread_id: threadId, user_id: userId, role: 'user', text: requestMessage },
      {
        thread_id: threadId,
        user_id: userId,
        role: 'assistant',
        text: response.assistantMessage,
        response_id: response.responseId ?? null,
      },
    ])
    .select('id, role, text');

  if (messageError) {
    throw new Error(messageError.message);
  }

  let persistedDrafts: DraftEntry[] = [];

  if (response.drafts.length > 0) {
    const sourceMessageId = insertedMessages?.find((message) => message.role === 'user')?.id ?? null;
    const { data: insertedDrafts, error: draftError } = await client
      .from('transaction_drafts')
      .insert(
        response.drafts.map((draft) => ({
          user_id: userId,
          thread_id: threadId,
          source_message_id: sourceMessageId,
          title: draft.title,
          amount: draft.amount,
          type: draft.type,
          context: draft.context ?? null,
          question: draft.question ?? null,
          note: draft.note,
          status: 'pending',
        })),
      )
      .select('*');

    if (draftError) {
      throw new Error(draftError.message);
    }

    persistedDrafts = (insertedDrafts ?? []).map((draft) => ({
      id: draft.id as string,
      title: draft.title as string,
      amount: Number(draft.amount),
      type: draft.type as 'income' | 'expense',
      context: (draft.context as DraftEntry['context'] | null) ?? undefined,
      question: (draft.question as string | null) ?? undefined,
      note: draft.note as string,
    }));
  }

  return {
    persistedMessages: (insertedMessages ?? []).map(messageRowToApp),
    persistedDrafts,
  };
}

export async function updateRemoteDraftContext(draftId: string, context: DraftEntry['context']) {
  const client = requireSupabase();
  await client
    .from('transaction_drafts')
    .update({
      context: context ?? null,
      question: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', draftId);
}

export async function deleteRemoteDraft(draftId: string) {
  const client = requireSupabase();
  await client.from('transaction_drafts').delete().eq('id', draftId);
}

async function findWalletAccountId(userId: string, accountName: string) {
  const client = requireSupabase();
  const { data } = await client
    .from('wallet_accounts')
    .select('id')
    .eq('user_id', userId)
    .eq('name', accountName)
    .maybeSingle();

  return (data?.id as string | undefined) ?? null;
}

async function updateWalletBalance(accountId: string, delta: number) {
  const client = requireSupabase();

  const { data: account } = await client.from('wallet_accounts').select('balance').eq('id', accountId).maybeSingle();
  if (!account) {
    return;
  }

  await client
    .from('wallet_accounts')
    .update({
      balance: Number(account.balance) + delta,
      updated_at: new Date().toISOString(),
    })
    .eq('id', accountId);
}

function movementBalanceDelta(type: Movement['type'], amount: number) {
  return type === 'income' ? amount : -amount;
}

export async function persistManualMovement(session: Session, movement: Movement) {
  const client = requireSupabase();
  const walletAccountId = await findWalletAccountId(session.user.id, movement.account);

  await client.from('transactions').insert({
    user_id: session.user.id,
    wallet_account_id: walletAccountId,
    title: movement.title,
    amount: movement.amount,
    type: movement.type,
    context: movement.context,
    source: movement.source,
    occurred_at: movement.createdAt,
  });

  if (walletAccountId) {
    await updateWalletBalance(walletAccountId, movementBalanceDelta(movement.type, movement.amount));
  }
}

export async function persistConfirmedDrafts(session: Session, drafts: DraftEntry[]) {
  const client = requireSupabase();

  for (const draft of drafts) {
    const accountName = resolveMovementAccount(draft.context ?? 'Pessoal');
    const walletAccountId =
      draft.walletAccountId ?? (await findWalletAccountId(session.user.id, accountName));
    await client.from('transactions').insert({
      user_id: session.user.id,
      wallet_account_id: walletAccountId,
      card_id: draft.cardId ?? null,
      draft_id: draft.id,
      title: draft.title,
      amount: draft.amount,
      type: draft.type,
      context: draft.context ?? 'Pessoal',
      source: 'IA',
      occurred_at: new Date().toISOString(),
    });

    await client.from('transaction_drafts').update({ status: 'confirmed', updated_at: new Date().toISOString() }).eq('id', draft.id);

    if (walletAccountId) {
      await updateWalletBalance(walletAccountId, movementBalanceDelta(draft.type, draft.amount));
    }
  }
}

export async function createWalletAccount(session: Session, input: AccountInput) {
  const client = requireSupabase();
  const { data, error } = await client
    .from('wallet_accounts')
    .insert({
      user_id: session.user.id,
      name: input.name,
      kind: input.kind,
      currency: 'BRL',
      balance: input.balance ?? 0,
      is_business: input.isBusiness,
      updated_at: new Date().toISOString(),
    })
    .select('*')
    .single();

  if (error || !data) {
    throw new Error(error?.message || 'Nao foi possivel criar a conta.');
  }

  return {
    ...accountRowToApp(data as never),
    detail: input.detail,
  } satisfies Account;
}

export async function updateWalletAccount(session: Session, accountId: string, input: AccountInput) {
  const client = requireSupabase();
  const { data, error } = await client
    .from('wallet_accounts')
    .update({
      name: input.name,
      kind: input.kind,
      is_business: input.isBusiness,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', session.user.id)
    .eq('id', accountId)
    .select('*')
    .single();

  if (error || !data) {
    throw new Error(error?.message || 'Nao foi possivel atualizar a conta.');
  }

  return {
    ...accountRowToApp(data as never),
    detail: input.detail,
  } satisfies Account;
}

export async function deleteWalletAccount(session: Session, accountId: string) {
  const client = requireSupabase();
  const { error } = await client.from('wallet_accounts').delete().eq('user_id', session.user.id).eq('id', accountId);

  if (error) {
    throw new Error(error.message);
  }
}

export async function createWalletCard(session: Session, input: CardInput) {
  const client = requireSupabase();
  const { data, error } = await client
    .from('cards')
    .insert({
      user_id: session.user.id,
      wallet_account_id: input.walletAccountId ?? null,
      name: input.name,
      limit_amount: input.limit,
      used_amount: input.used,
    })
    .select('*')
    .single();

  if (error || !data) {
    throw new Error(error?.message || 'Nao foi possivel criar o cartao.');
  }

  return cardRowToApp(data as never);
}

export async function updateWalletCard(session: Session, cardId: string, input: CardInput) {
  const client = requireSupabase();
  const { data, error } = await client
    .from('cards')
    .update({
      wallet_account_id: input.walletAccountId ?? null,
      name: input.name,
      limit_amount: input.limit,
      used_amount: input.used,
    })
    .eq('user_id', session.user.id)
    .eq('id', cardId)
    .select('*')
    .single();

  if (error || !data) {
    throw new Error(error?.message || 'Nao foi possivel atualizar o cartao.');
  }

  return cardRowToApp(data as never);
}

export async function deleteWalletCard(session: Session, cardId: string) {
  const client = requireSupabase();
  const { error } = await client.from('cards').delete().eq('user_id', session.user.id).eq('id', cardId);

  if (error) {
    throw new Error(error.message);
  }
}

export async function createGoal(session: Session, input: GoalInput) {
  const client = requireSupabase();
  const { data, error } = await client
    .from('goals')
    .insert({
      user_id: session.user.id,
      title: input.title,
      target_amount: input.target,
      current_amount: input.current,
    })
    .select('*')
    .single();

  if (error || !data) {
    throw new Error(error?.message || 'Nao foi possivel criar a meta.');
  }

  return {
    id: data.id as string,
    title: data.title as string,
    target: Number(data.target_amount),
    current: Number(data.current_amount),
  } satisfies Goal;
}

export async function deleteGoal(session: Session, goalId: string) {
  const client = requireSupabase();
  const { error } = await client.from('goals').delete().eq('user_id', session.user.id).eq('id', goalId);

  if (error) {
    throw new Error(error.message);
  }
}

export async function createScheduledBill(session: Session, input: UpcomingBillInput) {
  const client = requireSupabase();
  const { data, error } = await client
    .from('scheduled_bills')
    .insert({
      user_id: session.user.id,
      title: input.title,
      amount: input.amount,
      due_date: input.due,
    })
    .select('*')
    .single();

  if (error || !data) {
    throw new Error(error?.message || 'Nao foi possivel criar a conta futura.');
  }

  return {
    id: data.id as string,
    title: data.title as string,
    amount: Number(data.amount),
    due: data.due_date as string,
  } satisfies UpcomingBill;
}

export async function deleteScheduledBill(session: Session, billId: string) {
  const client = requireSupabase();
  const { error } = await client.from('scheduled_bills').delete().eq('user_id', session.user.id).eq('id', billId);

  if (error) {
    throw new Error(error.message);
  }
}

export async function createMovement(session: Session, input: MovementInput) {
  const client = requireSupabase();
  const resolvedWalletAccountId =
    input.walletAccountId ?? (input.accountName ? await findWalletAccountId(session.user.id, input.accountName) : null);

  const { data, error } = await client
    .from('transactions')
    .insert({
      user_id: session.user.id,
      wallet_account_id: resolvedWalletAccountId,
      card_id: input.cardId ?? null,
      title: input.title,
      amount: input.amount,
      type: input.type,
      context: input.context,
      source: input.source,
      occurred_at: input.occurredAt,
    })
    .select('*')
    .single();

  if (error || !data) {
    throw new Error(error?.message || 'Nao foi possivel criar o movimento.');
  }

  if (resolvedWalletAccountId) {
    await updateWalletBalance(resolvedWalletAccountId, movementBalanceDelta(input.type, input.amount));
  }

  const accountName =
    resolvedWalletAccountId
      ? (
          await client
            .from('wallet_accounts')
            .select('name')
            .eq('id', resolvedWalletAccountId)
            .maybeSingle()
        ).data?.name ?? resolveMovementAccount(input.context)
      : resolveMovementAccount(input.context);

  return movementRowToApp(
    {
      id: data.id as string,
      title: data.title as string,
      amount: data.amount as number | string,
      type: data.type as string,
      context: data.context as string,
      source: data.source as string,
      occurred_at: data.occurred_at as string,
      wallet_account_id: resolvedWalletAccountId,
      card_id: (data.card_id as string | null) ?? null,
    },
    new Map(resolvedWalletAccountId ? [[resolvedWalletAccountId, accountName]] : []),
  );
}

export async function updateMovement(session: Session, movementId: string, input: MovementInput) {
  const client = requireSupabase();
  const { data: existing, error: existingError } = await client
    .from('transactions')
    .select('wallet_account_id, amount, type')
    .eq('user_id', session.user.id)
    .eq('id', movementId)
    .single();

  if (existingError || !existing) {
    throw new Error(existingError?.message || 'Movimento nao encontrado.');
  }

  const resolvedWalletAccountId =
    input.walletAccountId ?? (input.accountName ? await findWalletAccountId(session.user.id, input.accountName) : null);

  const { data, error } = await client
    .from('transactions')
    .update({
      wallet_account_id: resolvedWalletAccountId,
      card_id: input.cardId ?? null,
      title: input.title,
      amount: input.amount,
      type: input.type,
      context: input.context,
      occurred_at: input.occurredAt,
    })
    .eq('user_id', session.user.id)
    .eq('id', movementId)
    .select('*')
    .single();

  if (error || !data) {
    throw new Error(error?.message || 'Nao foi possivel atualizar o movimento.');
  }

  const previousWalletAccountId = existing.wallet_account_id as string | null;
  const previousDelta = movementBalanceDelta(existing.type as Movement['type'], Number(existing.amount));
  const nextDelta = movementBalanceDelta(input.type, input.amount);

  if (previousWalletAccountId) {
    await updateWalletBalance(previousWalletAccountId, -previousDelta);
  }

  if (resolvedWalletAccountId) {
    await updateWalletBalance(resolvedWalletAccountId, nextDelta);
  }

  const accountMap = new Map<string, string>();
  if (resolvedWalletAccountId) {
    const { data: account } = await client.from('wallet_accounts').select('name').eq('id', resolvedWalletAccountId).maybeSingle();
    if (account?.name) {
      accountMap.set(resolvedWalletAccountId, account.name as string);
    }
  }

  return movementRowToApp(
    {
      id: data.id as string,
      title: data.title as string,
      amount: data.amount as number | string,
      type: data.type as string,
      context: data.context as string,
      source: data.source as string,
      occurred_at: data.occurred_at as string,
      wallet_account_id: resolvedWalletAccountId,
      card_id: (data.card_id as string | null) ?? null,
    },
    accountMap,
  );
}

export async function deleteMovement(session: Session, movementId: string) {
  const client = requireSupabase();
  const { data: existing, error: fetchError } = await client
    .from('transactions')
    .select('wallet_account_id, amount, type')
    .eq('user_id', session.user.id)
    .eq('id', movementId)
    .single();

  if (fetchError || !existing) {
    throw new Error(fetchError?.message || 'Movimento nao encontrado.');
  }

  const { error } = await client.from('transactions').delete().eq('user_id', session.user.id).eq('id', movementId);

  if (error) {
    throw new Error(error.message);
  }

  if (existing.wallet_account_id) {
    await updateWalletBalance(
      existing.wallet_account_id as string,
      -movementBalanceDelta(existing.type as Movement['type'], Number(existing.amount)),
    );
  }
}
