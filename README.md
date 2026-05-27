# Norte

SaaS financeiro e operacional para vida pessoal e pequenos negocios. O app registra entradas por texto ou voz, organiza contas, metas, clientes, fornecedores, vendas, compras, estoque, contas a pagar/receber e relatorios do dia.

## Rodar localmente

```bash
npm install
npm install --prefix functions
npm run dev
```

Servicos locais:

- App web: `http://127.0.0.1:5173`
- API local: `http://127.0.0.1:8787`

## Firebase

O projeto usa Firebase Authentication, Cloud Firestore, Cloud Functions e Firebase Hosting.
Em producao, o app bloqueia abertura sem Firebase configurado para evitar uso real sem login e isolamento por usuario.

Variaveis esperadas em `.env`:

```text
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
VITE_FIREBASE_MEASUREMENT_ID=
```

No Console do Firebase, habilite:

- Authentication com Email/Senha.
- Cloud Firestore.
- Cloud Functions.
- Firebase Hosting.

## Vercel

O arquivo `vercel.json` ja define build Vite, saida `dist` e rewrite para SPA.

Cadastre no Vercel as mesmas variaveis `VITE_FIREBASE_*` listadas acima. Sem elas, o app mostra uma tela de bloqueio de producao em vez de cair em modo local.

## Dados

O estado ainda e salvo em `users/{uid}/workspaces/default` para compatibilidade, mas o modelo real do SaaS ja grava entidades em colecoes por workspace:

```text
users/{uid}
workspaces/{workspaceId}
workspaces/{workspaceId}/members/{uid}
workspaces/{workspaceId}/accounts/{id}
workspaces/{workspaceId}/transactions/{id}
workspaces/{workspaceId}/clients/{id}
workspaces/{workspaceId}/suppliers/{id}
workspaces/{workspaceId}/catalog/{id}
workspaces/{workspaceId}/bills/{id}
workspaces/{workspaceId}/goals/{id}
workspaces/{workspaceId}/sales/{id}
workspaces/{workspaceId}/purchases/{id}
workspaces/{workspaceId}/auditLogs/{id}
```

As regras em `firestore.rules` limitam acesso ao usuario autenticado e aos membros do workspace.

## Backend

Operacoes criticas ficam em `src/domain/norteDomain.js` e sao compartilhadas por:

- Frontend, quando precisa atualizar estado local.
- API local em `server/index.js`.
- Cloud Functions em `functions/src/index.js`.

Functions disponiveis:

- `createSale`
- `cancelSale`
- `createPurchase`
- `cancelPurchase`
- `parseEntry`

As operacoes feitas por Cloud Functions tambem registram auditoria no workspace.

Antes de deploy, sincronize as regras de dominio para as Functions:

```bash
npm run functions:sync-domain
```

## Scripts

```bash
npm run dev                  # app + API local
npm run client               # somente Vite
npm run server               # somente API local
npm test                     # testes de dominio
npm run lint                 # lint
npm run build                # build web
npm run functions:sync-domain
npm run deploy:firebase      # build + sync dominio + firebase deploy
```

## Validacao

Antes de liberar uma versao:

```bash
npm test
npm run lint
npm run build
```

O `npm audit` das Functions ainda aponta vulnerabilidade moderada transitiva em pacotes Google/Firebase ligados a `uuid`. `npm audit fix` nao resolve sem downgrade quebrador sugerido pelo npm. A dependencia direta esta nas versoes atuais (`firebase-admin` e `firebase-functions`).
