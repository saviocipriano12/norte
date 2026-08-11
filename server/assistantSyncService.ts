import type { AssistantTurnResponse } from '../src/assistantTypes';
import type { DraftEntry, Message } from '../src/mockData';
import { getSupabaseAdmin } from './supabaseAdmin';

type SyncProfileInput = {
  userId: string;
  fullName?: string | null;
  onboardingProfile: 'personal' | 'freelancer' | 'business';
  selectedPainPoints: string[];
};

function messageRowToApp(row: { id: string; role: string; text: string }): Message {
  return {
    id: row.id,
    role: row.role === 'assistant' ? 'assistant' : 'user',
    text: row.text,
  };
}

function draftRowToApp(row: {
  id: string;
  title: string;
  amount: number | string;
  type: string;
  context: string | null;
  question: string | null;
  note: string;
  occurred_at?: string | null;
  category?: string | null;
}): DraftEntry {
  return {
    id: row.id,
    title: row.title,
    amount: Number(row.amount),
    type: row.type as DraftEntry['type'],
    context: (row.context as DraftEntry['context'] | null) ?? undefined,
    question: row.question ?? undefined,
    note: row.note,
    occurredAt: row.occurred_at ?? undefined,
    category: (row.category as DraftEntry['category'] | null) ?? 'Outros',
  };
}

function buildDefaultAccountSeed(userId: string) {
  return [
    { user_id: userId, name: 'Conta pessoal', kind: 'cash', currency: 'BRL', balance: 0, is_business: false },
    { user_id: userId, name: 'Conta PJ', kind: 'cash', currency: 'BRL', balance: 0, is_business: true },
    { user_id: userId, name: 'Reserva', kind: 'reserve', currency: 'BRL', balance: 0, is_business: false },
  ];
}

export async function ensureUserProfileAdmin(input: SyncProfileInput) {
  const admin = getSupabaseAdmin();

  const { data: existingProfile, error: existingProfileError } = await admin
    .from('profiles')
    .select('id')
    .eq('id', input.userId)
    .maybeSingle();

  if (existingProfileError) {
    throw new Error(existingProfileError.message || 'Nao foi possivel consultar o perfil do usuario.');
  }

  if (existingProfile?.id) {
    const { error: updateError } = await admin
      .from('profiles')
      .update({
        full_name: input.fullName ?? '',
        onboarding_profile: input.onboardingProfile,
        selected_pain_points: input.selectedPainPoints,
        updated_at: new Date().toISOString(),
      })
      .eq('id', input.userId);

    if (updateError) {
      throw new Error(updateError.message || 'Nao foi possivel atualizar o perfil do usuario.');
    }
  } else {
    const { error: insertError } = await admin.from('profiles').insert({
      id: input.userId,
      full_name: input.fullName ?? '',
      onboarding_profile: input.onboardingProfile,
      selected_pain_points: input.selectedPainPoints,
      updated_at: new Date().toISOString(),
    });

    if (insertError) {
      throw new Error(insertError.message || 'Nao foi possivel criar o perfil do usuario.');
    }
  }

  const { data: existingAccounts, error: accountsError } = await admin
    .from('wallet_accounts')
    .select('id')
    .eq('user_id', input.userId)
    .limit(1);

  if (accountsError) {
    throw new Error(accountsError.message || 'Nao foi possivel verificar as contas do usuario.');
  }

  if (!existingAccounts || existingAccounts.length === 0) {
    const { error: seedError } = await admin.from('wallet_accounts').insert(buildDefaultAccountSeed(input.userId));

    if (seedError) {
      throw new Error(seedError.message || 'Nao foi possivel criar as contas iniciais do usuario.');
    }
  }
}

async function ensureAssistantThreadAdmin(userId: string) {
  const admin = getSupabaseAdmin();

  const { data: existing, error: existingError } = await admin
    .from('assistant_threads')
    .select('id')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (existingError) {
    throw new Error(existingError.message || 'Nao foi possivel consultar a thread do Norte.');
  }

  if (existing?.id) {
    return existing.id as string;
  }

  const { data: created, error: createError } = await admin
    .from('assistant_threads')
    .insert({ user_id: userId, title: 'Conversa Norte' })
    .select('id')
    .single();

  if (createError || !created?.id) {
    throw new Error(createError?.message || 'Nao foi possivel criar a thread do Norte.');
  }

  return created.id as string;
}

export async function syncAssistantTurnAdmin(input: {
  requestMessage: string;
  response: AssistantTurnResponse;
  userId: string;
  fullName?: string | null;
  onboardingProfile: 'personal' | 'freelancer' | 'business';
  selectedPainPoints: string[];
}): Promise<{ persistedMessages: Message[]; persistedDrafts: DraftEntry[] }> {
  const admin = getSupabaseAdmin();

  await ensureUserProfileAdmin({
    userId: input.userId,
    fullName: input.fullName,
    onboardingProfile: input.onboardingProfile,
    selectedPainPoints: input.selectedPainPoints,
  });

  const threadId = await ensureAssistantThreadAdmin(input.userId);

  const { data: insertedMessages, error: messageError } = await admin
    .from('assistant_messages')
    .insert([
      {
        thread_id: threadId,
        user_id: input.userId,
        role: 'user',
        text: input.requestMessage,
      },
      {
        thread_id: threadId,
        user_id: input.userId,
        role: 'assistant',
        text: input.response.assistantMessage,
        response_id: input.response.responseId ?? null,
      },
    ])
    .select('id, role, text');

  if (messageError) {
    throw new Error(messageError.message || 'Nao foi possivel salvar as mensagens da conversa.');
  }

  let persistedDrafts: DraftEntry[] = [];

  if (input.response.drafts.length > 0) {
    const sourceMessageId = insertedMessages?.find((message) => message.role === 'user')?.id ?? null;
    const { data: insertedDrafts, error: draftError } = await admin
      .from('transaction_drafts')
      .insert(
        input.response.drafts.map((draft) => ({
          user_id: input.userId,
          thread_id: threadId,
          source_message_id: sourceMessageId,
          title: draft.title,
          amount: draft.amount,
          type: draft.type,
          context: draft.context ?? null,
          question: draft.question ?? null,
          note: draft.note,
          occurred_at: draft.occurredAt ?? null,
          category: draft.category ?? 'Outros',
          status: 'pending',
          updated_at: new Date().toISOString(),
        })),
      )
      .select('id, title, amount, type, context, question, note, occurred_at, category');

    if (draftError) {
      throw new Error(draftError.message || 'Nao foi possivel salvar os rascunhos da Norte.');
    }

    persistedDrafts = (insertedDrafts ?? []).map((draft) => draftRowToApp(draft as never));
  }

  return {
    persistedMessages: (insertedMessages ?? []).map((message) => messageRowToApp(message as never)),
    persistedDrafts,
  };
}
