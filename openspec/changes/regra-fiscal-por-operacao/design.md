# Design — Regra fiscal por operação

## A decisão: porta antes de implementação

Manter uma matriz tributária brasileira de verdade — quais NCM têm ST em cada UF,
MVA, pauta, alíquota interna, reduções de base — **não é projeto com fim**. Os
estados publicam decreto o tempo todo. É manutenção perpétua.

Existem serviços que vendem essa regra por assinatura. A pergunta "construir ou
assinar" não tem resposta única: depende do volume e da diversidade dos clientes.

Decisão adotada: **construir simples agora, atrás de uma porta.**

Motivo: o primeiro cliente é uma churrascaria vendendo NFC-e interna a consumidor
final. A matriz dele cabe em meia dúzia de regras. Assinar hoje é pagar por
complexidade que não existe e integrar contra necessidades desconhecidas.

O que torna isso seguro é a porta. `IRegraFiscal` segue o mesmo padrão que já
salvou o projeto no motor .NET: o domínio pergunta e não sabe quem responde. No
dia em que entrar cliente interestadual com ST, troca-se a implementação por um
adaptador do fornecedor sem tocar em domínio.

**O que se perde se a decisão virar "assinar" depois:** a implementação própria.
Não o desenho, não o contrato, não o ponto de integração. É perda aceitável.

## Entrada e saída da porta

```
resolver(contexto) -> quadro

contexto: { produto: { ncm, cest, origem, cfopPadrao, situacaoPadrao },
            emitente: { crt, uf, contribuinteIcms },
            destinatario: { uf, contribuinte, consumidorFinal },
            operacao: { tipo, finalidade, presenca } }

quadro:   { cfop, icms, ipi, pis, cofins, regraAplicada }
```

`regraAplicada` não é enfeite. Quando uma nota sair com imposto errado, a
primeira pergunta vai ser "por que saiu assim" — e sem saber qual regra
respondeu, a resposta é adivinhação. Ele entra no snapshot, junto do quadro.

## Precedência

Regra mais específica vence. A especificidade é contada pelo número de critérios
preenchidos: uma regra que casa NCM + UF destino + tipo de operação ganha de uma
que casa só NCM.

Empate é erro de cadastro, não decisão do sistema: duas regras igualmente
específicas casando o mesmo contexto **falham a emissão**, com mensagem apontando
as duas. Escolher em silêncio esconderia o problema até a escrituração.

## Fallback: o produto continua valendo

Se nenhuma regra casa, a resposta vem do cadastro do produto — CFOP e situação
tributária como estão hoje.

Isso não é preguiça; é o que garante que a change **não muda comportamento** para
quem não cadastrar regra nenhuma. Uma base sem regras cadastradas continua
emitindo exatamente como antes. Sem essa garantia, a etapa 2 vira uma migração
de risco em vez de uma capacidade nova.

## O simulador

Dado um produto e uma operação hipotética, mostrar o quadro que sairia — sem
emitir nada.

Parece secundário e não é. Hoje a única forma de descobrir o que vai sair é
emitir e olhar o XML — o que consome numeração. Um simulador permite ao contador
conferir a configuração antes de a primeira nota sair, e é a ferramenta de
diagnóstico quando algo vier errado.

## O que fica de fora

- **Tabelas de MVA, pauta e alíquota interna por UF.** São dado, não código, e
  são exatamente o que se compra de um fornecedor. A implementação própria aceita
  esses valores cadastrados manualmente na regra.
- **Cálculo de DIFAL e partilha.** Entram junto com a NF-e interestadual, na
  etapa 3, quando houver operação que os exija.
- **Versionamento das regras no tempo.** Alíquota muda e notas antigas precisam
  continuar explicáveis — mas o snapshot já congela o quadro aplicado, então o
  histórico está preservado onde importa. Vigência por regra é refinamento
  posterior, e deve ser reavaliado quando houver caso real.
