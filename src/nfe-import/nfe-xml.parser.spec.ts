import { BadRequestException } from '@nestjs/common';
import { totalMismatch, parseIncomingNfe } from './nfe-xml.parser';

/**
 * O parser é a porta de entrada de arquivo de terceiro: cada emissor escreve o
 * leiaute 4.00 do seu jeito, com ou sem prefixo de namespace, com um item ou
 * com trezentos, com e sem duplicatas.
 *
 * O que estes testes protegem é o que vira bug silencioso: código de produto
 * perdendo zero à esquerda, chave de acesso virando número, e "SEM GTIN"
 * casando item errado.
 */

const CHAVE = '31260851720322000146550010000000051234567890';

const item = (over: Partial<Record<string, string>> = {}) => `
  <det nItem="1">
    <prod>
      <cProd>${over.cProd ?? '007'}</cProd>
      <cEAN>${over.cEAN ?? '7891234567895'}</cEAN>
      <xProd>${over.xProd ?? 'REFRIG LATA 350'}</xProd>
      <NCM>${over.NCM ?? '22021000'}</NCM>
      <CFOP>${over.CFOP ?? '1102'}</CFOP>
      <uCom>${over.uCom ?? 'CX'}</uCom>
      <qCom>${over.qCom ?? '10.0000'}</qCom>
      <vUnCom>${over.vUnCom ?? '25.5000'}</vUnCom>
      <vProd>${over.vProd ?? '255.00'}</vProd>
    </prod>
    <imposto>
      <ICMS><ICMS00><orig>0</orig><CST>00</CST></ICMS00></ICMS>
      <PIS><PISAliq><CST>07</CST></PISAliq></PIS>
      <COFINS><COFINSAliq><CST>07</CST></COFINSAliq></COFINS>
    </imposto>
  </det>`;

const nota = (
  opcoes: { itens?: string; cobr?: string; mod?: string } = {},
) => `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">
  <NFe>
    <infNFe Id="NFe${CHAVE}" versao="4.00">
      <ide>
        <cUF>31</cUF>
        <mod>${opcoes.mod ?? '55'}</mod>
        <serie>1</serie>
        <nNF>4321</nNF>
        <dhEmi>2026-08-15T09:30:00-03:00</dhEmi>
        <tpNF>1</tpNF>
      </ide>
      <emit>
        <CNPJ>51.720.322/0001-46</CNPJ>
        <xNome>Distribuidora Teste LTDA</xNome>
        <xFant>Distribuidora Teste</xFant>
        <enderEmit>
          <xLgr>Rua das Bebidas</xLgr>
          <nro>500</nro>
          <xBairro>Industrial</xBairro>
          <cMun>3143302</cMun>
          <xMun>Montes Claros</xMun>
          <UF>MG</UF>
          <CEP>39400-000</CEP>
        </enderEmit>
        <IE>0011234560012</IE>
      </emit>
      <dest>
        <CNPJ>11222333000181</CNPJ>
        <xNome>Empresa Compradora LTDA</xNome>
      </dest>
      ${opcoes.itens ?? item()}
      <total><ICMSTot><vProd>255.00</vProd><vNF>255.00</vNF></ICMSTot></total>
      ${opcoes.cobr ?? ''}
    </infNFe>
  </NFe>
  <protNFe><infProt><nProt>131260000000001</nProt></infProt></protNFe>
</nfeProc>`;

describe('parseIncomingNfe', () => {
  it('lê a nota inteira do formato que o fornecedor manda', () => {
    const lida = parseIncomingNfe(nota());

    expect(lida.chaveAcesso).toBe(CHAVE);
    expect(lida.number).toBe(4321);
    expect(lida.series).toBe(1);
    expect(lida.issuer.cnpj).toBe('51720322000146');
    expect(lida.issuer.legalName).toBe('Distribuidora Teste LTDA');
    expect(lida.issuer.city).toBe('Montes Claros');
    expect(lida.issuer.zipCode).toBe('39400000');
    expect(lida.recipientDocument).toBe('11222333000181');
    expect(lida.totalAmount).toBe(255);
  });

  it('preserva o código do produto como texto', () => {
    // "007" virando 7 quebraria o de-para do fornecedor sem nenhum erro.
    expect(parseIncomingNfe(nota()).items[0].supplierCode).toBe('007');
  });

  it('preserva a chave de acesso sem passar por número', () => {
    // 44 dígitos não cabem num double: viraria 3.126085172032e+43.
    expect(parseIncomingNfe(nota()).chaveAcesso).toHaveLength(44);
  });

  it('lê o item com unidade, quantidade e valores', () => {
    const [primeiro] = parseIncomingNfe(nota()).items;

    expect(primeiro.description).toBe('REFRIG LATA 350');
    expect(primeiro.unit).toBe('CX');
    expect(primeiro.quantity).toBe(10);
    expect(primeiro.unitPrice).toBe(25.5);
    expect(primeiro.gtin).toBe('7891234567895');
    expect(primeiro.ncm).toBe('22021000');
    expect(primeiro.cfop).toBe('1102');
  });

  it('lê o quadro tributário do item, que o cadastro do produto reaproveita', () => {
    const [primeiro] = parseIncomingNfe(nota()).items;

    expect(primeiro.tax.origem).toBe(0);
    expect(primeiro.tax.situacaoIcms).toBe('00');
    expect(primeiro.tax.cstPis).toBe('07');
    expect(primeiro.tax.cstCofins).toBe('07');
  });

  it('acha a situação em qualquer filho do grupo, não só nos conhecidos', () => {
    // O grupo do ICMS tem um filho por situação (ICMS00, ICMS60, ICMSSN102…) e
    // a NT seguinte acrescenta outros. Procurar por nome quebraria calado.
    const simples = nota().replace(
      '<ICMS><ICMS00><orig>0</orig><CST>00</CST></ICMS00></ICMS>',
      '<ICMS><ICMSSN102><orig>3</orig><CSOSN>102</CSOSN></ICMSSN102></ICMS>',
    );

    const [primeiro] = parseIncomingNfe(simples).items;

    expect(primeiro.tax.origem).toBe(3);
    expect(primeiro.tax.situacaoIcms).toBe('102');
  });

  it('item sem grupo de imposto não derruba a leitura', () => {
    const semImposto = nota().replace(/<imposto>[\s\S]*?<\/imposto>/, '');

    const [primeiro] = parseIncomingNfe(semImposto).items;

    expect(primeiro.tax.origem).toBeNull();
    expect(primeiro.tax.situacaoIcms).toBeNull();
    expect(primeiro.description).toBe('REFRIG LATA 350');
  });

  it('trata "SEM GTIN" como ausência, não como código', () => {
    const lida = parseIncomingNfe(nota({ itens: item({ cEAN: 'SEM GTIN' }) }));

    expect(lida.items[0].gtin).toBeNull();
  });

  it('recusa GTIN de tamanho inválido em vez de casar errado', () => {
    const lida = parseIncomingNfe(nota({ itens: item({ cEAN: '123' }) }));

    expect(lida.items[0].gtin).toBeNull();
  });

  it('lê nota com vários itens', () => {
    const dois = `${item()}${item({ cProd: '008', xProd: 'AGUA 500' }).replace('nItem="1"', 'nItem="2"')}`;
    const lida = parseIncomingNfe(nota({ itens: dois }));

    expect(lida.items).toHaveLength(2);
    expect(lida.items[1].itemNumber).toBe(2);
    expect(lida.items[1].supplierCode).toBe('008');
  });

  it('lê as duplicatas quando existem', () => {
    const cobr = `<cobr>
      <dup><nDup>001</nDup><dVenc>2026-09-15</dVenc><vDup>127.50</vDup></dup>
      <dup><nDup>002</nDup><dVenc>2026-10-15</dVenc><vDup>127.50</vDup></dup>
    </cobr>`;
    const lida = parseIncomingNfe(nota({ cobr }));

    expect(lida.duplicatas).toHaveLength(2);
    expect(lida.duplicatas[0].number).toBe('001');
    expect(lida.duplicatas[0].amount).toBe(127.5);
    expect(lida.duplicatas[1].dueDate?.getUTCMonth()).toBe(9); // outubro
  });

  it('nota sem cobrança não inventa duplicata', () => {
    expect(parseIncomingNfe(nota()).duplicatas).toEqual([]);
  });

  it('lê NF-e sem a casca do nfeProc', () => {
    const solta = nota()
      .replace(/<nfeProc[^>]*>/, '')
      .replace('</nfeProc>', '')
      .replace(/<protNFe>[\s\S]*<\/protNFe>/, '');

    expect(parseIncomingNfe(solta).chaveAcesso).toBe(CHAVE);
  });

  it('lê XML com prefixo de namespace', () => {
    const comPrefixo = nota()
      .replace(
        /<(\/?)(nfeProc|NFe|infNFe|ide|emit|dest|det|prod)\b/g,
        '<$1nfe:$2',
      )
      .replace(/xmlns=/, 'xmlns:nfe=');

    expect(parseIncomingNfe(comPrefixo).chaveAcesso).toBe(CHAVE);
  });

  it('recusa arquivo que não é NF-e, dizendo o que falta', () => {
    expect(() => parseIncomingNfe('<html><body>DANFE</body></html>')).toThrow(
      /não é um XML de NF-e/i,
    );
  });

  it('recusa modelo diferente de 55, nomeando o modelo', () => {
    expect(() => parseIncomingNfe(nota({ mod: '65' }))).toThrow(/modelo 65/);
  });

  it('recusa arquivo vazio', () => {
    expect(() => parseIncomingNfe('   ')).toThrow(BadRequestException);
  });

  it('recusa nota sem itens', () => {
    const semItens = nota().replace(item(), '');

    expect(() => parseIncomingNfe(semItens)).toThrow(/nenhum item/i);
  });

  it('recusa emitente pessoa física, que ainda não é importável', () => {
    const comCpf = nota().replace(
      '<CNPJ>51.720.322/0001-46</CNPJ>',
      '<CPF>12345678909</CPF>',
    );

    expect(() => parseIncomingNfe(comCpf)).toThrow(/produtor rural/i);
  });
});

describe('totalMismatch', () => {
  it('não acusa divergência quando a soma bate', () => {
    expect(totalMismatch(parseIncomingNfe(nota()))).toBe(0);
  });

  it('mede a diferença sem recusar — frete e desconto vivem aí', () => {
    const comFrete = nota().replace('<vNF>255.00</vNF>', '<vNF>285.00</vNF>');

    expect(totalMismatch(parseIncomingNfe(comFrete))).toBe(30);
  });
});
