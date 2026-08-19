# Design — Regra fiscal por operação

## A decisão: porta antes de implementação

Manter uma matriz tributária brasileira de verdade — quais NCM têm ST em cada UF,
MVA, pauta, alíquota interna, reduções de base — **não é projeto com fim**. Os
estados publicam decreto o tempo todo. É manutenção perpétua.

A porta continua sendo o desenho certo. `IRegraFiscal` segue o mesmo padrão que
já salvou o projeto no motor .NET: o domínio pergunta e não sabe quem responde.

**O que mudou:** a recomendação de *o que colocar atrás dela*.

### Recomendação revisada — assinar, não construir (12/08/2026)

A recomendação anterior era construir uma implementação própria simples. Ela se
apoiava numa premissa que deixou de valer:

> *"O primeiro cliente é uma churrascaria vendendo NFC-e interna a consumidor
> final. A matriz dele cabe em meia dúzia de regras."*

O usuário confirmou que **vai vender para fora do estado**. Isso troca "meia
dúzia de regras" por manutenção perpétua de verdade:

- **ST interestadual** depende de protocolo/convênio entre a UF de origem e cada
  UF de destino, com **MVA ajustada** por combinação origem-destino-produto.
- **DIFAL** exige a alíquota interna da UF de destino e o **FCP** de cada uma —
  27 tabelas que mudam por decreto.
- **Pauta fiscal** de bebida varia por estado e é revisada com frequência.

Nada disso é tabela que se escreve uma vez. É assinatura de manutenção que
alguém precisa fazer todo mês, para sempre — e errar significa nota autorizada
com imposto errado, que só aparece na escrituração do contador.

**Recomendação: assinar a matriz e construir só o adaptador.** A primeira
implementação atrás da porta deveria ser um cliente de serviço, não uma tabela
própria.

**Se o custo inviabilizar**, o caminho é implementação própria com escopo
restrito às UFs onde há venda real — decisão consciente e registrada, não
descoberta no meio do caminho. O orçamento precisa ser pedido **antes** de a
implementação começar, e é a primeira tarefa desta change.

**O que se perde ao trocar de caminho depois:** a implementação. Não o desenho,
não o contrato, não o ponto de integração.

## Quem cadastra as regras — não é o lojista

Esta change previa CRUD de regras fiscais como funcionalidade do usuário. Está
errado, e vale dizer por quê: o dono da lanchonete não sabe o que é MVA, pauta ou
redução de base. Uma tela que dependa dele não vai ser usada, e o sistema vai
emitir pelo padrão do produto para sempre — que é o comportamento de hoje.

Quem responde essas perguntas é o **contador**, que normalmente não tem acesso ao
sistema.

Modelo adotado:

1. **Conjunto base pré-carregado** por UF e por ramo, mantido por quem opera a
   plataforma — não cadastrado cliente a cliente.
2. **Ajuste no onboarding**, feito por quem configura a empresa, com o contador
   ao lado quando houver exceção.
3. **O lojista nunca vê a tela.** Ela existe para configuração e diagnóstico.

Isso não elimina o CRUD — alguém precisa editar. Muda quem, e muda o peso da
tela: ela é ferramenta de configuração, não fluxo de uso corrente, e não deve
aparecer na navegação do usuário comum.

## Recorte por tipo de destinatário

Vender para fora do estado são dois problemas diferentes, e o tamanho da change
depende de qual deles existe:

| Destinatário | O que a nota exige |
|---|---|
| Empresa **contribuinte**, outra UF | CFOP 6102, ICMS interestadual (7% ou 12%), ST quando houver protocolo |
| Consumidor final **não contribuinte**, outra UF | CFOP 6108, **DIFAL** — partilha com a UF de destino, mais FCP |

**Pergunta aberta que muda o escopo pela metade:** há entendimento consolidado de
que emitente do **Simples Nacional** não recolhe DIFAL nas vendas a consumidor
final não contribuinte (ADI 5464, STF). Se valer para este emitente, toda a
partilha sai do escopo.

Isto **não é decisão do sistema nem de quem implementa** — precisa ser confirmado
com o contador antes de a change ser dimensionada.

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
  etapa 3 — **se** forem devidos. Ver a pergunta aberta sobre Simples Nacional
  na seção de recorte por destinatário: a resposta pode tirá-los do roteiro.
- **Versionamento das regras no tempo.** Alíquota muda e notas antigas precisam
  continuar explicáveis — mas o snapshot já congela o quadro aplicado, então o
  histórico está preservado onde importa. Vigência por regra é refinamento
  posterior, e deve ser reavaliado quando houver caso real.
