import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import { z } from 'zod';

import type { AssistantTurnRequest, AssistantTurnResponse } from '../src/assistantTypes';
import type { DraftEntry } from '../src/mockData';
import { buildNorteSystemPrompt, buildNorteUserPrompt } from './nortePrompt';

const norteDraftSchema = z.object({
  type: z.enum(['income', 'expense']),
  title: z.string().min(1),
  amount: z.number().positive(),
  context: z.enum(['Pessoal', 'Negocio', 'Compartilhado']).nullable(),
  question: z.string().nullable(),
  note: z.string().min(1),
  occurredAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  category: z.enum(['Alimentacao', 'Moradia', 'Transporte', 'Assinaturas', 'Saude', 'Educacao', 'Lazer', 'Trabalho', 'Impostos', 'Vendas', 'Servicos', 'Outros']).nullable(),
});

const norteResponseSchema = z.object({
  assistantMessage: z.string().min(1),
  drafts: z.array(norteDraftSchema),
  speechText: z.string().min(1),
});

function serializeHistory(history: AssistantTurnRequest['history']) {
  return history
    .slice(-8)
    .map((item) => `${item.role === 'assistant' ? 'Norte' : 'Usuario'}: ${item.text}`)
    .join('\n');
}

function serializeMovements(movements: AssistantTurnRequest['movements']) {
  return movements
    .slice(0, 12)
    .map(
      (movement) =>
        `${movement.type === 'income' ? 'Receita' : 'Despesa'} | ${movement.title} | ${movement.amount} | ${movement.context} | ${movement.category ?? 'Outros'} | ${movement.source}`,
    )
    .join('\n');
}

function serializeDrafts(drafts: AssistantTurnRequest['drafts']) {
  return drafts
    .slice(0, 12)
    .map(
      (draft) =>
        `${draft.type === 'income' ? 'Receita' : 'Despesa'} | ${draft.title} | ${draft.amount} | ${draft.context ?? 'Sem contexto'} | ${draft.category ?? 'Outros'} | ${draft.question ?? 'Sem pergunta'}`,
    )
    .join('\n');
}

function serializeFinancialContext(context: AssistantTurnRequest['financialContext']) {
  if (!context) {
    return 'O resumo financeiro ainda nao esta disponivel.';
  }

  return [
    `Data atual: ${context.today}`,
    `Saldo pessoal atual: R$ ${context.personalBalance.toFixed(2)}`,
    `Caixa atual do negocio: R$ ${context.businessBalance.toFixed(2)}`,
    `Disponivel para gastar hoje: R$ ${context.spendableToday.toFixed(2)}`,
    `Contas futuras: ${context.upcomingBillsCount} no total de R$ ${context.upcomingBillsTotal.toFixed(2)}`,
    `Contas vencidas: ${context.overdueBillsCount}`,
    `Despesas deste mes por categoria: ${context.categorySpending.length > 0 ? context.categorySpending.map((item) => `${item.category}: R$ ${item.amount.toFixed(2)} (${item.movementCount} itens)`).join(', ') : 'Sem despesas categorizadas neste mes.'}`,
    `Previsao para 30 dias: saldo final estimado de R$ ${context.forecastEndBalance.toFixed(2)}, menor saldo de R$ ${context.forecastLowestBalance.toFixed(2)}${context.forecastRiskDate ? `, com risco em ${context.forecastRiskDate}` : ', sem risco de saldo negativo no cenario atual'}.`,
  ].join('\n');
}

function normalizeDrafts(drafts: Array<z.infer<typeof norteDraftSchema>>): DraftEntry[] {
  return drafts
    .filter((draft) => Number.isFinite(draft.amount) && draft.amount > 0)
    .map((draft) => {
      const context = draft.context ?? undefined;
      const question = draft.question?.trim() || undefined;

      return {
        id: `draft-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        type: draft.type,
        title: draft.title.trim().slice(0, 120),
        amount: draft.amount,
        context,
        question:
          context || question
            ? context
              ? undefined
              : question
            : draft.type === 'income'
              ? 'Essa entrada e pessoal ou do negocio?'
              : 'Esse gasto foi pessoal, do negocio ou compartilhado?',
        note: draft.note.trim() || 'Movimento identificado, aguardando sua revisao.',
        occurredAt: draft.occurredAt ?? undefined,
        category: draft.category ?? 'Outros',
      } satisfies DraftEntry;
    });
}

export async function generateNorteAssistantTurn(
  client: OpenAI,
  payload: AssistantTurnRequest,
): Promise<AssistantTurnResponse> {
  const response = await client.responses.parse({
    model: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
    instructions: buildNorteSystemPrompt(),
    input: buildNorteUserPrompt({
      message: payload.message,
      profile: payload.profile,
      selectedPain: payload.selectedPain,
      historyText: serializeHistory(payload.history),
      movementsText: serializeMovements(payload.movements),
      draftsText: serializeDrafts(payload.drafts),
      financialContextText: serializeFinancialContext(payload.financialContext),
    }),
    text: {
      format: zodTextFormat(norteResponseSchema, 'norte_assistant_response'),
    },
  });

  const parsed = response.output_parsed;

  if (!parsed) {
    throw new Error('A OpenAI nao retornou uma resposta estruturada do Norte.');
  }

  return {
    assistantMessage: parsed.assistantMessage,
    speechText: parsed.speechText,
    drafts: normalizeDrafts(parsed.drafts),
    responseId: response.id,
  };
}
