# Norte SaaS Architecture

## Produto

O Norte deve servir usuarios que misturam vida pessoal e negocio no mesmo dia: prestador de servico, restaurante, agencia, manicure, loja, profissional autonomo ou familia. A experiencia principal e registrar rapido e receber organizacao financeira e operacional automaticamente.

Principios:

- Registro rapido por texto, voz ou formulario.
- Toda acao critica deve virar dado real persistido.
- Financeiro pessoal e negocio convivem, mas sempre com escopo claro.
- Estoque, contas, clientes, fornecedores, metas e relatorios precisam nascer da mesma operacao, sem retrabalho.
- A interface deve reduzir atrito para quem tem preguica de anotar.

## Stack

- Frontend: React + Vite.
- Auth: Firebase Authentication.
- Database: Cloud Firestore.
- Backend: Cloud Functions.
- Hosting: Firebase Hosting.
- API local: Node HTTP simples para desenvolvimento sem Firebase.
- Testes: `node:test`.

## Modelo De Dados

Documento legado de compatibilidade:

```text
users/{uid}/workspaces/default
```

Modelo SaaS principal:

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

O frontend grava as colecoes por workspace via `saveFirebaseState`. As Cloud Functions tambem sincronizam as mesmas colecoes apos operacoes de venda e compra.
Operacoes feitas por Cloud Function gravam auditoria em `auditLogs`.

## Camadas

### Dominio

Arquivo:

```text
src/domain/norteDomain.js
```

Regras puras:

- Venda paga cria transacao de entrada.
- Venda pendente cria conta a receber.
- Venda baixa estoque quando o item controla estoque.
- Cancelamento de venda desfaz transacao, conta e estoque.
- Compra paga cria transacao de saida.
- Compra pendente cria conta a pagar.
- Compra aumenta estoque e atualiza custo.
- Cancelamento de compra desfaz transacao, conta e estoque.

### Frontend Services

Arquivo:

```text
src/services/operationsService.js
```

Escolhe o motor da operacao:

- Cloud Function quando Firebase Functions estiver disponivel.
- API local quando estiver sem Firebase.
- Dominio local como fallback controlado durante desenvolvimento.

### Cloud Functions

Pasta:

```text
functions/
```

As Functions sao auto-contidas para deploy. Antes de deploy, rode:

```bash
npm run functions:sync-domain
```

Functions atuais:

- `createSale`
- `cancelSale`
- `createPurchase`
- `cancelPurchase`
- `parseEntry`

## Seguranca

Firestore Rules:

- Usuario le e escreve o documento legado apenas quando `request.auth.uid == userId`.
- Workspaces novos exigem documento de membro em `workspaces/{workspaceId}/members/{uid}`.
- Somente owner gerencia membros.

## Qualidade

Testes de dominio:

```text
tests/domain/norteDomain.test.js
tests/domain/entryParser.test.js
```

Validacao local:

```bash
npm test
npm run lint
npm run build
```

## Proximas Frentes Reais

1. Adicionar Firebase Storage para audio, comprovantes e anexos.
2. Adicionar planos, limites e billing.
3. Adicionar convites de equipe e papeis alem de owner.
4. Criar telas administrativas para auditoria e suporte.
5. Adicionar observabilidade de erros e eventos de produto.
