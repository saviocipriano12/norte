import type { AssistantTurnRequest, AssistantTurnResponse } from './assistantTypes';
import type { DraftEntry, Message } from './mockData';

const apiBaseUrl = process.env.EXPO_PUBLIC_NORTE_API_URL ?? 'http://localhost:8787';

export type NorteAssistantHealth = {
  ok: boolean;
  service: string;
  openaiConfigured: boolean;
  supabaseConfigured?: boolean;
  model: string;
};

export function getNorteApiBaseUrl() {
  return apiBaseUrl;
}

export async function getNorteAssistantHealth(): Promise<NorteAssistantHealth> {
  const response = await fetch(`${apiBaseUrl}/api/health`);

  if (!response.ok) {
    throw new Error('Falha ao consultar a saude do backend do Norte.');
  }

  return (await response.json()) as NorteAssistantHealth;
}

export async function askNorteAssistant(payload: AssistantTurnRequest): Promise<AssistantTurnResponse> {
  const response = await fetch(`${apiBaseUrl}/api/assistant/respond`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || 'Falha ao conversar com o backend do Norte.');
  }

  return (await response.json()) as AssistantTurnResponse;
}

export async function transcribeNorteAudio(audioFile: Blob, filename = 'norte-audio.webm'): Promise<{ text: string }> {
  const formData = new FormData();
  formData.append('audio', audioFile, filename);

  const response = await fetch(`${apiBaseUrl}/api/voice/transcribe`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || 'Falha ao transcrever o audio no Norte.');
  }

  return (await response.json()) as { text: string };
}

export async function speakNorteText(text: string): Promise<Blob> {
  const response = await fetch(`${apiBaseUrl}/api/voice/speak`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ text }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || 'Falha ao gerar voz no Norte.');
  }

  return await response.blob();
}

export async function createNorteRealtimeSession(offerSdp: string): Promise<string> {
  const response = await fetch(`${apiBaseUrl}/api/realtime/session`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/sdp',
    },
    body: offerSdp,
  });

  const answerSdp = await response.text();

  if (!response.ok) {
    throw new Error(answerSdp || 'Falha ao iniciar a sessao Realtime do Norte.');
  }

  return answerSdp;
}

export async function syncNorteAssistantTurn(payload: {
  userId: string;
  fullName?: string | null;
  onboardingProfile: 'personal' | 'freelancer' | 'business';
  selectedPainPoints: string[];
  requestMessage: string;
  response: AssistantTurnResponse;
}): Promise<{ persistedMessages: Message[]; persistedDrafts: DraftEntry[] }> {
  const response = await fetch(`${apiBaseUrl}/api/assistant/sync-turn`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || 'Falha ao sincronizar a conversa da Norte.');
  }

  return (await response.json()) as { persistedMessages: Message[]; persistedDrafts: DraftEntry[] };
}
