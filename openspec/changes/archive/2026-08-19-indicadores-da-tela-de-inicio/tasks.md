> **Leia `design.md` antes.** As três decisões que mais economizam retrabalho:
> uma rota por domínio (a permissão vem de graça), o dia é o do lojista e não o
> do servidor, e o fechamento às cegas continua cego na home.

## 1. Fundação

- [x] 1.1 `src/common/utils/business-day.ts`: limites de hoje, ontem, mês e mês
  anterior no fuso da operação, via `Intl` — nunca deslocamento fixo `-03:00`
- [x] 1.2 Falhar alto quando o fuso configurado não for reconhecido, em vez de
  cair para UTC em silêncio
- [x] 1.3 `APP_TIMEZONE` no `.env.example`, com `America/Sao_Paulo` como padrão
- [x] 1.4 Testes do utilitário cobrindo a virada de dia às 21h local e a virada de mês

## 2. Módulo

- [x] 2.1 `src/dashboard/` — module, controller e service, só leitura
- [x] 2.2 `FilterDashboardDto` com `establishmentId` opcional, validado como UUID
- [x] 2.3 Estabelecimento de outra empresa recusado, sem revelar se existe
- [x] 2.4 Registrar em `app.module.ts`

## 3. Vendas

- [x] 3.1 `GET /dashboard/sales` — hoje, ontem e mês, com quantidade, valor e ticket médio
- [x] 3.2 Só `CONCLUIDA` e `deletedAt: null` compõem faturamento
- [x] 3.3 Orçamentos em aberto contados à parte, como funil
- [x] 3.4 `GET /dashboard/sales-chart?range=30d|12m` com o eixo completo, dias vazios em zero
- [x] 3.5 `range` fora do aceito recusado em português

## 4. Financeiro

- [x] 4.1 `GET /dashboard/receivables` — vencido, vence hoje, próximos 7 dias, total em aberto
- [x] 4.2 `GET /dashboard/payables` — mesmo recorte, permissão própria
- [x] 4.3 Saldo em aberto como `Σamount − ΣpaidAmount`, nunca o valor de face
- [x] 4.4 VENCIDO derivado contra o agora, pelo mesmo critério do módulo financeiro

## 5. Fiscal e estoque

- [x] 5.1 `GET /dashboard/fiscal` — documentos do mês por situação e valor autorizado
- [x] 5.2 Aviso de certificado A1 vencendo em até 30 dias, com data e dias restantes
- [x] 5.3 Empresa sem configuração fiscal responde zerada, sem erro
- [x] 5.4 `GET /dashboard/stock-alerts` — zerados e no/abaixo do mínimo, com amostra
- [x] 5.5 Produto sem mínimo definido fora do alerta de mínimo

## 6. Caixa

- [x] 6.1 `GET /dashboard/cash` — sessões abertas com caixa, operador e abertura
- [x] 6.2 Sessões fechadas hoje contadas
- [x] 6.3 **Fechamento às cegas respeitado**: com `cashBlindClose`, o valor da sessão
  aberta não é revelado

## 7. Permissões e contrato

- [x] 7.1 Uma permissão por rota, reaproveitando as dos domínios — **nenhuma nova**
- [x] 7.2 Swagger em português em cada rota
- [x] 7.3 `API.md` do backend com os sete contratos
- [x] 7.4 Espelhar o contrato no `API.md` do frontend

## 8. Testes

- [x] 8.1 `dashboard.service.spec.ts` com PrismaService mockado
- [x] 8.2 Faturamento ignora orçamento, venda em aberto e cancelada
- [x] 8.3 Título parcial pesa o saldo, não o valor de face
- [x] 8.4 Série do gráfico devolve dia vazio com zero
- [x] 8.5 Fechamento às cegas esconde o valor da sessão aberta
- [x] 8.6 `npm test` e `npm run build` limpos
