# Deploy Do Norte

## Bloqueios Externos

O projeto esta pronto para deploy, mas esta maquina ainda nao tem login ativo no Firebase CLI nem token de CI:

```bash
npx firebase login:list
```

Quando aparecer uma conta autorizada, rode:

```bash
npm run verify:prod
npm run deploy:firebase
```

## Firebase

Projeto configurado:

```text
norte-b506b
```

Arquivos usados:

```text
.firebaserc
firebase.json
firestore.rules
firestore.indexes.json
functions/
```

Antes do deploy, habilite no console:

- Authentication com Email/Senha.
- Cloud Firestore.
- Cloud Functions.
- Firebase Hosting, se for usar hosting Firebase alem do Vercel.

## Vercel

O app tem `vercel.json` para build Vite e rewrite SPA.

Configure estas variaveis no Vercel em Production, Preview e Development:

```text
VITE_FIREBASE_API_KEY
VITE_FIREBASE_AUTH_DOMAIN
VITE_FIREBASE_PROJECT_ID
VITE_FIREBASE_STORAGE_BUCKET
VITE_FIREBASE_MESSAGING_SENDER_ID
VITE_FIREBASE_APP_ID
VITE_FIREBASE_MEASUREMENT_ID
```

Deploy manual:

```bash
npm run deploy:vercel
```

Deploy recomendado:

- conectar o repositório `saviocipriano12/norte` no Vercel;
- adicionar as variaveis acima;
- deixar o Vercel publicar automaticamente a branch `main`.

## Checklist De Primeiro Usuario

1. Criar usuario A.
2. Completar onboarding.
3. Registrar venda paga.
4. Registrar venda a receber.
5. Registrar compra paga.
6. Registrar compra a pagar.
7. Cancelar uma venda e conferir estoque/contas/transacoes.
8. Criar usuario B em outro email.
9. Confirmar que usuario B nao ve dados do usuario A.
10. Fazer refresh no navegador e confirmar persistencia.
