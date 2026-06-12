# Auditoria Interna Do Produto

## Diagnostico Honesto

O Norte ainda nao esta pronto para teste real com usuario comum. Ele tem boa base tecnica e algumas regras de dominio funcionando, mas a experiencia atual parece ferramenta interna: excesso de informacao tecnica, telas com hierarquia fraca, formularios demais, pouca sensacao de fluxo guiado e pouca clareza sobre o que o usuario deve fazer primeiro.

O objetivo agora nao e adicionar landing page nem marketing. O objetivo e reconstruir o produto interno ate ele ficar usavel, bonito e confiavel.

## Problemas Que Impedem Teste Real

- A tela inicial ainda nao parece uma rotina simples de uso diario.
- Informacoes tecnicas como Firebase, workspace e modo local aparecem para o usuario.
- O app mistura produto, debug e configuracao na mesma interface.
- A IA ainda parece uma tela visual, nao uma conversa real.
- O registro por voz/texto ainda nao tem fluxo de confirmacao premium.
- O app depende demais de formularios.
- A navegacao ainda parece uma lista de modulos, nao uma experiencia guiada.
- Falta uma hierarquia clara entre pessoal, negocio, contas, operacao e relatorios.
- Estados vazios nao ensinam nem encantam.
- O design ainda nao passa confianca de SaaS moderno.

## Direcao Correta

O app deve ser mobile-first e guiado por uma acao principal: tocar no Norte IA, falar o que aconteceu ou perguntar algo, confirmar e seguir.

A interface deve ter tres camadas:

1. **Hoje**: bussola, saldo, alertas e proxima acao.
2. **Norte IA**: conversa, voz, confirmacao e orientacao.
3. **Gestao**: movimentos, contas, vendas, compras, estoque, clientes, metas e relatorios.

## Funcionalidades Basicas Que Ainda Precisam Ficar Fortes

- Lancamentos com categorias editaveis.
- Contas, carteiras e cartoes com saldos claros.
- Contas a pagar e receber com vencimento, baixa e recorrencia.
- Parcelamento.
- Filtros por periodo, categoria, conta e escopo.
- Relatorios por periodo.
- Fluxo de caixa futuro.
- Metas com aportes e progresso.
- Clientes e fornecedores com historico.
- Vendas, compras e estoque com menos friccao.
- Backup/exportacao sem parecer recurso tecnico.
- Plano/assinatura sem bloquear o uso beta.

## IA Que O Produto Precisa

Primeira versao real da IA deve fazer poucas coisas muito bem:

- cumprimentar o usuario pelo nome;
- resumir a situacao financeira atual;
- receber fala ou texto;
- extrair lancamentos;
- perguntar o que faltar;
- confirmar antes de salvar;
- responder perguntas simples sobre saldo, contas, gastos e metas.

Nao vamos prometer consultoria financeira nem automacao total antes de ter confianca.

## Ordem De Execucao

### Sprint 1: Limpeza E Estrutura Interna

- Remover termos tecnicos da UI principal.
- Reorganizar topbar e navegacao.
- Melhorar home com bussola e proxima acao.
- Melhorar Norte IA como tela central.
- Criar estados vazios melhores.

### Sprint 2: Registro Inteligente

- Redesenhar tela de registro.
- Melhorar drafts e confirmacao.
- Criar perguntas quando faltar dado.
- Tornar manual rapido, nao pesado.

### Sprint 3: Financeiro Essencial

- Categorias.
- Recorrencias.
- Parcelas.
- Periodos e filtros.
- Relatorios de verdade.

### Sprint 4: Operacao

- Vendas.
- Compras.
- Estoque.
- Clientes.
- Fornecedores.

### Sprint 5: IA Real E Planos

- Voz real.
- Resposta falada.
- Tools conectadas aos dados.
- Stripe e planos.

## Regra De Qualidade

Nenhuma tela deve parecer que foi feita para desenvolvedor. Se aparecer nome de provedor, ID tecnico, objeto interno ou status de infraestrutura para o usuario comum, esta errado.
