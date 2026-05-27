# Plano de acao do Norte

## Objetivo

Levar o app do zero ate o primeiro usuario ativo: uma pessoa real usando por 7 dias para registrar vida pessoal, negocio, metas e operacao diaria por texto ou voz.

## Produto inicial

Promessa:

> Fale ou digite o que aconteceu. O app organiza dinheiro, negocio, metas e proximas acoes.

O app precisa parecer simples na frente e inteligente por tras. A primeira versao deve ser pequena, mas completa no fluxo principal.

## Escopo da primeira versao

- Onboarding por perfil de negocio.
- Separacao entre pessoal e negocio.
- Contas manuais.
- Lancamentos por texto natural.
- Lancamentos por voz usando reconhecimento do navegador.
- Confirmacao antes de salvar.
- Resumo do dia.
- Produtos, servicos, materiais e projetos.
- Estoque simples quando fizer sentido.
- Historico de movimentacoes.
- Metas financeiras.
- Dados persistidos localmente para teste rapido.

## Perfis atendidos

- Prestador de servico.
- Vendedor de produtos.
- Quem produz para vender.
- Agencia, freelancer ou projeto por contrato.
- Negocio hibrido.

## Proximas fases

### Fase 1: Validar experiencia

- Testar com 1 usuario real.
- Observar se ele consegue cadastrar o negocio sem ajuda.
- Observar se entende a diferenca entre pessoal e negocio.
- Medir se o registro por voz ajuda de verdade.
- Registrar as frases reais que o usuario fala.

### Fase 2: Backend real

- Criar autenticacao.
- Persistir dados em PostgreSQL.
- Separar dados por usuario e empresa.
- Criar historico de alteracoes.
- Adicionar backup.

### Fase 3: IA em producao

- Trocar o parser local por um extrator com IA.
- Transcrever audio no backend.
- Guardar texto original e confianca da IA.
- Fazer perguntas quando faltar informacao.

### Fase 4: Rotina diaria

- Resumo diario automatico.
- Alertas de contas, estoque e metas.
- Contas a receber.
- Mensagens prontas de cobranca.

### Fase 5: Primeiro grupo de usuarios

- Testar com 5 usuarios.
- Depois 10.
- Depois 30.
- Priorizar apenas funcionalidades que aparecem no uso real.

## Criterio de sucesso do primeiro usuario

O primeiro usuario ativo deve:

- usar por pelo menos 7 dias;
- registrar movimentos em 5 dias ou mais;
- testar voz ou texto natural;
- consultar resumo, metas ou negocio;
- dizer que usaria no dia seguinte sem ser lembrado.
