import cors from 'cors';
import express, { type Request, type Response } from 'express';
import multer from 'multer';
import OpenAI from 'openai';
import { toFile } from 'openai/uploads';
import { z } from 'zod';

import type { AssistantTurnRequest } from '../src/assistantTypes';
import { generateNorteAssistantTurn } from './assistantService';
import { syncAssistantTurnAdmin } from './assistantSyncService';
import { isSupabaseAdminConfigured } from './supabaseAdmin';

const port = Number(process.env.PORT || 8787);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 20 * 1024 * 1024,
  },
});
const app = express();

app.use(cors());
app.use(express.json({ limit: '2mb' }));

const assistantTurnRequestSchema = z.object({
  message: z.string().min(1),
  history: z.array(
    z.object({
      id: z.string(),
      role: z.enum(['user', 'assistant']),
      text: z.string(),
    }),
  ),
  movements: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      amount: z.number(),
      type: z.enum(['income', 'expense']),
      context: z.enum(['Pessoal', 'Negocio', 'Compartilhado']),
      source: z.enum(['IA', 'Manual']),
      createdAt: z.string(),
      account: z.string(),
    }),
  ),
  drafts: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      amount: z.number(),
      type: z.enum(['income', 'expense']),
      context: z.enum(['Pessoal', 'Negocio', 'Compartilhado']).optional(),
      question: z.string().optional(),
      note: z.string(),
    }),
  ),
  profile: z.enum(['personal', 'freelancer', 'business']),
  selectedPain: z.array(z.string()),
});

const assistantSyncRequestSchema = z.object({
  userId: z.string().uuid(),
  fullName: z.string().optional().nullable(),
  onboardingProfile: z.enum(['personal', 'freelancer', 'business']),
  selectedPainPoints: z.array(z.string()),
  requestMessage: z.string().min(1),
  response: z.object({
    assistantMessage: z.string().min(1),
    speechText: z.string().min(1),
    responseId: z.string().optional().nullable(),
    drafts: z.array(
      z.object({
        id: z.string(),
        title: z.string().min(1),
        amount: z.number().positive(),
        type: z.enum(['income', 'expense']),
        context: z.enum(['Pessoal', 'Negocio', 'Compartilhado']).optional(),
        question: z.string().optional(),
        note: z.string().min(1),
      }),
    ),
  }),
});

function ensureApiKey() {
  if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY.includes('sk-your-key-here')) {
    throw new Error('OPENAI_API_KEY nao configurada no backend do Norte.');
  }
}

function getOpenAIClient() {
  ensureApiKey();

  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });
}

function inferAudioExtension(mimeType: string | undefined) {
  switch (mimeType) {
    case 'audio/webm':
      return 'webm';
    case 'audio/mp4':
    case 'audio/m4a':
      return 'm4a';
    case 'audio/mpeg':
      return 'mp3';
    case 'audio/wav':
    case 'audio/x-wav':
      return 'wav';
    case 'audio/ogg':
      return 'ogg';
    default:
      return 'webm';
  }
}

function buildRealtimeSessionConfig() {
  return {
    type: 'realtime',
    model: process.env.OPENAI_REALTIME_MODEL || 'gpt-realtime-2',
    voice: process.env.OPENAI_REALTIME_VOICE || 'marin',
    output_modalities: ['audio'],
    reasoning: {
      effort: 'low',
    },
    input_audio_transcription: {
      model: process.env.OPENAI_REALTIME_TRANSCRIBE_MODEL || 'gpt-4o-transcribe',
    },
    turn_detection: {
      type: 'semantic_vad',
      eagerness: 'medium',
      create_response: true,
      interrupt_response: true,
    },
    instructions: `
Voce e o Norte, um assistente financeiro brasileiro premium, humano e muito natural em voz.

Regras:
- fale sempre em portugues do Brasil
- mantenha respostas curtas, claras e fluidas, como uma conversa real
- quando o usuario falar de gastos, receitas, clientes, Pix, contas, cartoes, metas, negocio, lucro ou organizacao financeira, use a ferramenta analyze_financial_message antes de responder
- nunca diga que algo foi salvo definitivamente sem confirmacao humana
- quando a ferramenta retornar uma pergunta de esclarecimento, faca essa pergunta com naturalidade
- quando a ferramenta retornar drafts, converse como alguem organizando a vida financeira junto com o usuario
- nao leia JSON, nao descreva estrutura tecnica e nao fale como robô
    `.trim(),
    tools: [
      {
        type: 'function',
        name: 'analyze_financial_message',
        description:
          'Interpreta a fala do usuario, gera rascunhos financeiros, identifica ambiguidades e devolve a melhor resposta do Norte para esse turno.',
        parameters: {
          type: 'object',
          additionalProperties: false,
          properties: {
            message: {
              type: 'string',
              description: 'Frase do usuario transcrita ou resumida com fidelidade para analise financeira.',
            },
          },
          required: ['message'],
        },
      },
    ],
    tool_choice: 'auto',
  };
}

app.get('/api/health', (_req: Request, res: Response) => {
  res.json({
    ok: true,
    service: 'norte-backend',
    openaiConfigured: Boolean(process.env.OPENAI_API_KEY && !process.env.OPENAI_API_KEY.includes('sk-your-key-here')),
    supabaseConfigured: isSupabaseAdminConfigured(),
    model: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
  });
});

app.post('/api/assistant/respond', async (req: Request, res: Response) => {
  try {
    const payload = assistantTurnRequestSchema.parse(req.body) as AssistantTurnRequest;
    const result = await generateNorteAssistantTurn(getOpenAIClient(), payload);
    res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha interna no backend do Norte.';
    res.status(500).send(message);
  }
});

app.post('/api/assistant/sync-turn', async (req: Request, res: Response) => {
  try {
    const body = assistantSyncRequestSchema.parse(req.body);

    if (!isSupabaseAdminConfigured()) {
      res.status(503).send('Supabase service role ainda nao configurado no backend do Norte.');
      return;
    }

    const result = await syncAssistantTurnAdmin(body);
    res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha ao sincronizar a conversa no Norte.';
    res.status(500).send(message);
  }
});

app.post('/api/voice/transcribe', upload.single('audio'), async (req: Request, res: Response) => {
  try {
    if (!req.file?.buffer) {
      res.status(400).send('Arquivo de audio nao enviado.');
      return;
    }

    const originalName = req.file.originalname?.trim();
    const safeFileName =
      originalName && originalName.includes('.')
        ? originalName
        : `norte-audio.${inferAudioExtension(req.file.mimetype)}`;

    const uploadedFile = await toFile(req.file.buffer, safeFileName, {
      type: req.file.mimetype || 'audio/webm',
    });

    const transcription = await getOpenAIClient().audio.transcriptions.create({
      file: uploadedFile,
      model: 'gpt-4o-transcribe',
    });

    res.json({ text: transcription.text });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha ao transcrever audio.';
    res.status(500).send(message);
  }
});

app.post('/api/realtime/session', express.text({ type: ['application/sdp', 'text/plain'], limit: '2mb' }), async (req: Request, res: Response) => {
  try {
    ensureApiKey();

    const offerSdp = typeof req.body === 'string' ? req.body.trim() : '';

    if (!offerSdp) {
      res.status(400).send('SDP da oferta WebRTC nao enviado.');
      return;
    }

    const formData = new FormData();
    formData.set('sdp', offerSdp);
    formData.set('session', JSON.stringify(buildRealtimeSessionConfig()));

    const openaiResponse = await fetch('https://api.openai.com/v1/realtime/calls', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: formData,
    });

    const answerSdp = await openaiResponse.text();

    if (!openaiResponse.ok) {
      res.status(openaiResponse.status).send(answerSdp || 'Falha ao abrir a sessao Realtime do Norte.');
      return;
    }

    res.setHeader('Content-Type', 'application/sdp');
    res.send(answerSdp);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha ao iniciar a conversa de voz em tempo real.';
    res.status(500).send(message);
  }
});

app.post('/api/voice/speak', async (req: Request, res: Response) => {
  try {
    const body = z.object({ text: z.string().min(1) }).parse(req.body);

    const speech = await getOpenAIClient().audio.speech.create({
      model: process.env.OPENAI_TTS_MODEL || 'gpt-4o-mini-tts',
      voice: process.env.OPENAI_TTS_VOICE || 'alloy',
      input: body.text,
      response_format: 'mp3',
    });

    const buffer = Buffer.from(await speech.arrayBuffer());
    res.setHeader('Content-Type', 'audio/mpeg');
    res.send(buffer);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha ao gerar audio.';
    res.status(500).send(message);
  }
});

app.listen(port, () => {
  console.log(`Norte backend ativo em http://localhost:${port}`);
});
