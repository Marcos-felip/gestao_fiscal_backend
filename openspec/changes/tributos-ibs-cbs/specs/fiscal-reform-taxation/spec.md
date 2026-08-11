> ⚠️ Requisitos escritos em 11/08/2026. **Revalide contra a NT vigente** antes de
> implementar.

## ADDED Requirements

### Requirement: Tributos da reforma no quadro tributário do item
O quadro tributário do item SHALL comportar situação tributária, classificação
tributária, alíquotas e valores de IBS e CBS, além do Imposto Seletivo quando
aplicável, e SHALL gravá-los no snapshot como o restante do quadro.

#### Scenario: Item com IBS e CBS
- **WHEN** um item é resolvido para uma operação sujeita a IBS e CBS
- **THEN** o snapshot registra a situação, a classificação, as alíquotas e os valores, e os envia ao motor

#### Scenario: Operação fora do regime da reforma
- **WHEN** a operação não exige os tributos da reforma
- **THEN** o item é emitido sem esses grupos, como antes

### Requirement: Classificação tributária é dado, não constante de código
A classificação tributária (`cClassTrib`) SHALL ser mantida como cadastro
consultável e atualizável, e SHALL NOT ser codificada como enum fixo.

#### Scenario: Tabela atualizada
- **WHEN** a tabela oficial de classificação tributária é revisada
- **THEN** a atualização é feita por dado, sem exigir alteração de código nem novo deploy do motor

#### Scenario: Classificação desconhecida
- **WHEN** um item referencia classificação que não existe no cadastro
- **THEN** a emissão é recusada com mensagem em português nomeando o código

### Requirement: Resolução da classificação pela regra fiscal
A classificação tributária SHALL ser determinada pela mesma porta que resolve
CFOP e situação tributária por operação.

#### Scenario: Resolução por NCM e operação
- **WHEN** um item é resolvido para uma operação
- **THEN** a classificação tributária vem da regra fiscal, junto do CFOP e da situação tributária

#### Scenario: Regra registrada no documento
- **WHEN** a classificação é resolvida
- **THEN** o snapshot registra qual regra a determinou, como já faz com o restante do quadro

### Requirement: Totais de IBS e CBS
O documento SHALL registrar os totais de IBS e CBS, somados dos itens, e SHALL
recusar a emissão quando divergirem além da tolerância de centavos.

#### Scenario: Totais somados
- **WHEN** uma nota com itens tributados pela reforma é emitida
- **THEN** os totais equivalem à soma dos valores dos itens

### Requirement: Convivência durante a transição
O sistema SHALL emitir tanto documentos com os tributos da reforma quanto sem
eles, conforme a operação e a vigência.

#### Scenario: Emissão no regime anterior
- **WHEN** a operação não exige os tributos da reforma
- **THEN** o documento é emitido sem eles, sem erro

#### Scenario: Documento anterior permanece legível
- **WHEN** um documento gravado antes desta capacidade é consultado ou reprocessado
- **THEN** o snapshot é lido na versão anterior sem erro
