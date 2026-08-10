# Norte

MVP mobile em Expo para um app de financas com IA conversacional no centro da experiencia.

## O que ja existe

- onboarding inicial para definir o perfil do usuario
- home com resumo financeiro claro e visoes de negocio, analises e configuracoes
- area Norte IA com orbe animado, conversa, rascunhos e confirmacao antes de salvar
- historico com lancamentos vindos da IA e formulario manual
- carteira com contas, cartoes e saldos
- planejamento com contas futuras e metas
- persistencia local com AsyncStorage para manter o estado do MVP entre sessoes
- backend proprio para IA real com OpenAI
- endpoints prontos para texto, transcricao de voz e fala sintetizada
- autenticacao real com Supabase no app
- bootstrap remoto de perfil, contas e workspace do usuario

## Arquitetura da IA

O app mobile nao conversa direto com a OpenAI. Ele fala com um backend nosso, e o backend fala com a OpenAI.

Isso e importante porque:

- a chave da OpenAI nao pode ficar exposta no app
- as regras do Norte ficam centralizadas no servidor
- fica mais facil evoluir memoria, ferramentas e voz depois

## Configuracao

1. Crie um arquivo `.env` baseado em `.env.example`
2. Preencha sua `OPENAI_API_KEY`
3. Ajuste `EXPO_PUBLIC_NORTE_API_URL` se for testar em dispositivo fisico
4. Quando criar o Supabase, preencha as variaveis dele tambem

Exemplo:

```env
OPENAI_API_KEY=sk-your-key-here
OPENAI_MODEL=gpt-4.1-mini
OPENAI_TTS_MODEL=gpt-4o-mini-tts
OPENAI_TTS_VOICE=alloy
PORT=8787
EXPO_PUBLIC_NORTE_API_URL=http://localhost:8787
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

## Rodando

Tudo junto em desenvolvimento:

```bash
npm run dev
```

Ou web + backend:

```bash
npm run dev:web
```

Separado:

Backend da IA:

```bash
npm run server
```

App Expo:

```bash
npm start
```

Preview web:

```bash
npm run web
```

## O que vou precisar do Supabase

Quando voce criar o projeto, me mande estes dados:

- `Project URL`
- `Anon public key`
- `Service role key`

Com isso eu consigo ligar:

- autenticacao real
- persistencia dos usuarios
- contas, cartoes, movimentos e rascunhos no banco
- historico de conversa da IA
- seguranca por usuario com RLS

O schema inicial ja ficou preparado em `supabase/schema.sql`.

Se voce ja rodou o schema antes da camada de auth entrar, rode tambem:

`supabase/patches/001_auth_profile_bootstrap.sql`

Para habilitar a edicao sincronizada de metas em bancos existentes, rode tambem:

`supabase/patches/002_goal_updates.sql`

Esse patch cria o perfil automaticamente quando um novo usuario nasce no Auth e libera o insert do proprio perfil.

## Estrutura principal

- `src/NorteApp.tsx`: fluxo principal, telas e integracao com a IA
- `src/NorteOrb.tsx`: orbe animado da area de IA
- `src/norteApi.ts`: cliente HTTP do app para o backend
- `src/storage.ts`: persistencia local do MVP
- `server/index.ts`: API do Norte
- `server/assistantService.ts`: chamada estruturada para a OpenAI
- `server/nortePrompt.ts`: comportamento e regras do assistente
