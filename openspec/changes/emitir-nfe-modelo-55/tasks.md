> **Recorte: NF-e apenas dentro do estado** (12/08/2026). Ver o cabeçalho do
> `proposal.md`. Toda tarefa sobre CFOP 6xxx, DIFAL, partilha ou ST
> interestadual está **fora** — e a dependência da etapa 2 caiu junto.
>
> **Podada em 12/08/2026** contra o que as etapas 0 e 1 produziram e contra os
> dois recortes: operação interna e destinatário pessoa jurídica.

## 1. Pré-requisitos

- [x] 1.1 Etapa 1 aplicada (`contrato-tributario-do-item`). **A etapa 2 saiu do caminho** — adiada, e o recorte interno removeu a dependência
- [ ] 1.2 Change irmã do `fiscal_service` no ar, com `POST /api/nfe/emit` publicado
- [x] 1.3 Revisar esta proposta contra o que as etapas anteriores produziram — feito nesta poda

## 1b. Destinatário e escolha do modelo

- [ ] 1b.1 `indIEDest` com os três valores: `1` contribuinte, `2` isento de IE, `9` não contribuinte
- [ ] 1b.2 Validação do destinatário por indicador — contribuinte exige IE; isento e não contribuinte, não. CNPJ é sempre obrigatório
- [x] 1b.3 ~~Critério de escolha entre NFC-e e NF-e para pessoa física~~ — **resolvido pelo recorte:** PF emite NFC-e, PJ emite NF-e. Não há sobreposição a arbitrar
- [ ] 1b.4 Recusar NF-e sem destinatário identificado ou com destinatário pessoa física, com mensagem dizendo o que falta

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

- [ ] 5.1 Builder de snapshot da NF-e, separado do da NFC-e — o quadro tributário por item já vem pronto da etapa 1 e **não** é remontado aqui
- [ ] 5.2 Destinatário completo, natureza da operação, `tpNF` e `finNFe`
- [ ] 5.3 Transporte, volumes e cobrança quando informados
- [x] 5.4 ~~`isCfopValido` passa a considerar o modelo e as UFs~~ — **fora do recorte.** Operação interna usa `5xxx`, que a validação atual já aceita. Volta se houver venda interestadual
- [ ] 5.5 Porta do motor estendida com as operações do modelo 55
- [ ] 5.6 Processador de fila reaproveitado, com o modelo carimbado no documento

## 6. Testes

- [ ] 6.1 Emissão com destinatário completo cria documento e reserva numeração
- [ ] 6.2 Destinatário incompleto recusado **sem consumir numeração**
- [ ] 6.3 Numerações de NF-e e NFC-e independentes
- [x] 6.4 ~~CFOP interestadual aceito em NF-e e recusado em NFC-e~~ — fora do recorte
- [x] 6.5 ~~CFOP incoerente com as UFs recusado~~ — fora do recorte
- [ ] 6.6 Permissões separadas respeitadas
- [ ] 6.6b NF-e para destinatário pessoa física recusada, nomeando o motivo
- [ ] 6.6c `indIEDest` isento e não contribuinte aceitos sem IE; contribuinte sem IE recusado
- [ ] 6.7 **Regressão:** emissão de NFC-e inalterada
- [ ] 6.8 `npm test` verde

## 7. Documentação

- [ ] 7.1 `API.md`: rotas, permissões e o que difere da NFC-e
- [ ] 7.2 `FISCAL.md`: fluxo do modelo 55
- [ ] 7.3 `BANCO_DE_DADOS.md`: campos novos
- [ ] 7.4 Avisar a change irmã do frontend
