> **Recorte: NF-e apenas dentro do estado** (12/08/2026). Ver o cabeçalho do
> `proposal.md`. Toda tarefa sobre CFOP 6xxx, DIFAL, partilha ou ST
> interestadual está **fora** — e a dependência da etapa 2 caiu junto.
>
> Antes de começar: rodar `openspec-update-change` para podar as tarefas que o
> recorte tirou. Esta change foi escrita antes das etapas 1 e 2 existirem.

> **Reveja esta proposta antes de começar.** Escrita antes das etapas 1 e 2
> existirem. Rode `openspec-update-change` primeiro.

## 1. Pré-requisitos

- [ ] 1.1 Etapas 1 e 2 aplicadas (`contrato-tributario-do-item`, `regra-fiscal-por-operacao`)
- [ ] 1.2 Change irmã do `fiscal_service` no ar, com `POST /api/nfe/emit` publicado
- [ ] 1.3 Revisar esta proposta contra o que as etapas anteriores produziram

## 2. Migrations

- [ ] 2.1 `serie_nfe` e `proximo_numero_nfe` em `fiscal_settings`
- [ ] 2.2 `ind_ie_dest` em `partners`
- [ ] 2.3 Permissões `fiscal.nfe.emit` e `fiscal.nfe.cancel` com os **três passos**: catálogo, template e backfill em `company_role_permissions`

## 3. Cadastro

- [ ] 3.1 Indicador de IE no DTO e no service de parceiros, com validação
- [ ] 3.2 Regra de completude do destinatário para NF-e: endereço completo, documento e indicador de IE
- [ ] 3.3 Mensagem de pendência nomeando cada campo faltante

## 4. Configuração fiscal

- [ ] 4.1 Série e numeração de NF-e no DTO e no service, com os mesmos limites da NFC-e
- [ ] 4.2 Reserva atômica de numeração por modelo
- [ ] 4.3 Checklist de produção estendido para o modelo 55

## 5. Emissão

- [ ] 5.1 Builder de snapshot da NF-e, separado do da NFC-e
- [ ] 5.2 Destinatário completo, natureza da operação, `tpNF` e `finNFe`
- [ ] 5.3 Transporte, volumes e cobrança quando informados
- [ ] 5.4 `isCfopValido` passa a considerar o modelo e as UFs
- [ ] 5.5 Porta do motor estendida com as operações do modelo 55
- [ ] 5.6 Processador de fila reaproveitado, com o modelo carimbado no documento

## 6. Testes

- [ ] 6.1 Emissão com destinatário completo cria documento e reserva numeração
- [ ] 6.2 Destinatário incompleto recusado **sem consumir numeração**
- [ ] 6.3 Numerações de NF-e e NFC-e independentes
- [ ] 6.4 CFOP interestadual aceito em NF-e e recusado em NFC-e
- [ ] 6.5 CFOP incoerente com as UFs recusado
- [ ] 6.6 Permissões separadas respeitadas
- [ ] 6.7 **Regressão:** emissão de NFC-e inalterada
- [ ] 6.8 `npm test` verde

## 7. Documentação

- [ ] 7.1 `API.md`: rotas, permissões e o que difere da NFC-e
- [ ] 7.2 `FISCAL.md`: fluxo do modelo 55
- [ ] 7.3 `BANCO_DE_DADOS.md`: campos novos
- [ ] 7.4 Avisar a change irmã do frontend
