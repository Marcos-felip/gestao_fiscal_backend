import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { DfeNetFiscalEngine } from './dfe-net-fiscal-engine.service';
import {
  EmitirNfceRequest,
  FiscalEngineTransportError,
} from './fiscal-engine.interface';

const CONFIG: Record<string, unknown> = {
  FISCAL_ENGINE_URL: 'http://motor-fiscal:8080',
  FISCAL_ENGINE_API_KEY: 'chave-secreta',
  FISCAL_ENGINE_TIMEOUT: 5000,
};

const mockConfigService = {
  get: jest.fn((key: string, fallback?: unknown) => CONFIG[key] ?? fallback),
};

/** Monta uma resposta HTTP fake com o corpo em texto. */
const httpResponse = (status: number, body: unknown): Response =>
  ({
    status,
    text: () =>
      Promise.resolve(typeof body === 'string' ? body : JSON.stringify(body)),
  }) as unknown as Response;

const emissionRequest = (): EmitirNfceRequest => ({
  emitente: {
    cnpj: '11222333000181',
    razaoSocial: 'Empresa Teste LTDA',
    inscricaoEstadual: '123456789',
    crt: '1',
    logradouro: 'Rua das Flores',
    numero: '100',
    bairro: 'Centro',
    codigoMunicipio: '3550308',
    municipio: 'São Paulo',
    uf: 'SP',
    cep: '01001000',
  },
  itens: [
    {
      numeroItem: 1,
      codigoProduto: 'P1',
      descricao: 'Produto de teste',
      ncm: '22021000',
      cfop: '5102',
      unidadeComercial: 'UN',
      quantidade: 2,
      valorUnitario: 5,
      origem: 0,
      csosn: '102',
    },
  ],
  pagamentos: [{ tipo: 'dinheiro', valor: 10 }],
  valorTotal: 10,
  certificadoBase64: 'cert-base64',
  certificadoSenha: 'senha-do-certificado',
  codigoCsc: 'CSC123',
  idCsc: '000001',
  serie: 1,
  numero: 42,
  ambiente: 'homologacao',
});

describe('DfeNetFiscalEngine', () => {
  let engine: DfeNetFiscalEngine;
  let fetchMock: jest.Mock;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DfeNetFiscalEngine,
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    engine = module.get<DfeNetFiscalEngine>(DfeNetFiscalEngine);

    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  /** Argumentos da última chamada ao fetch. */
  const lastCall = () => {
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    return { url, init };
  };

  describe('emitir', () => {
    it('chama POST /api/nfce/emit com X-Api-Key e devolve o resultado autorizado', async () => {
      fetchMock.mockResolvedValue(
        httpResponse(200, {
          sucesso: true,
          chaveAcesso: '3'.repeat(44),
          protocolo: '135210000123456',
          xmlAutorizadoBase64: 'eG1s',
          danfeBase64: 'cGRm',
          qrCode: 'https://www.nfce.fazenda.sp.gov.br/qrcode?p=123',
        }),
      );

      const result = await engine.emitir(emissionRequest());

      const { url, init } = lastCall();
      expect(url).toBe('http://motor-fiscal:8080/api/nfce/emit');
      expect(init.method).toBe('POST');
      expect(init.headers).toMatchObject({ 'X-Api-Key': 'chave-secreta' });
      expect(result).toEqual({
        sucesso: true,
        chaveAcesso: '3'.repeat(44),
        protocolo: '135210000123456',
        xmlAutorizadoBase64: 'eG1s',
        danfeBase64: 'cGRm',
        qrCode: 'https://www.nfce.fazenda.sp.gov.br/qrcode?p=123',
      });
    });

    it('envia o certificado no corpo da requisição', async () => {
      fetchMock.mockResolvedValue(
        httpResponse(200, { sucesso: true, chaveAcesso: '3'.repeat(44) }),
      );

      await engine.emitir(emissionRequest());

      const body = JSON.parse(lastCall().init.body as string) as Record<
        string,
        unknown
      >;
      expect(body.certificadoBase64).toBe('cert-base64');
      expect(body.certificadoSenha).toBe('senha-do-certificado');
      expect(body.ambiente).toBe('homologacao');
    });

    it('trata HTTP 400 com rejeicao{} como rejeição de negócio', async () => {
      fetchMock.mockResolvedValue(
        httpResponse(400, {
          sucesso: false,
          rejeicao: {
            codigo: '539',
            mensagem: 'Duplicidade de NF-e com diferença na chave de acesso',
            retornoTecnico: 'cStat 539',
          },
        }),
      );

      const result = await engine.emitir(emissionRequest());

      expect(result.sucesso).toBe(false);
      expect(result.rejeicao).toEqual({
        codigo: '539',
        mensagem: 'Duplicidade de NF-e com diferença na chave de acesso',
        retornoTecnico: 'cStat 539',
      });
    });

    it('traduz o envelope de erro genérico em rejeição com os campos inválidos', async () => {
      fetchMock.mockResolvedValue(
        httpResponse(400, {
          codigo: 'VALIDACAO',
          mensagem: 'Dados inválidos',
          erros: [
            { campo: 'itens[0].ncm', mensagem: 'NCM deve ter 8 dígitos' },
            { campo: 'emitente.cep', mensagem: 'CEP inválido' },
          ],
          timestamp: '2026-08-04T12:00:00Z',
        }),
      );

      const result = await engine.emitir(emissionRequest());

      expect(result.sucesso).toBe(false);
      expect(result.rejeicao).toEqual({
        codigo: 'VALIDACAO',
        mensagem: 'Dados inválidos',
        retornoTecnico:
          'itens[0].ncm: NCM deve ter 8 dígitos; emitente.cep: CEP inválido',
      });
    });

    it('trata HTTP 200 com sucesso=false como rejeição', async () => {
      fetchMock.mockResolvedValue(
        httpResponse(200, {
          sucesso: false,
          rejeicao: { codigo: '204', mensagem: 'Duplicidade' },
        }),
      );

      const result = await engine.emitir(emissionRequest());

      expect(result.sucesso).toBe(false);
      expect(result.rejeicao?.codigo).toBe('204');
    });

    it('lança erro de transporte AUTH quando a API Key é recusada', async () => {
      fetchMock.mockResolvedValue(
        httpResponse(401, { codigo: 'AUTH_FALHA', mensagem: 'Chave inválida' }),
      );

      await expect(engine.emitir(emissionRequest())).rejects.toMatchObject({
        name: 'FiscalEngineTransportError',
        kind: 'AUTH',
        httpStatus: 401,
        codigo: 'AUTH_FALHA',
      });
    });

    it('lança erro de transporte SERVER em HTTP 500', async () => {
      fetchMock.mockResolvedValue(
        httpResponse(500, { codigo: 'ERRO_INTERNO', mensagem: 'Falhou' }),
      );

      await expect(engine.emitir(emissionRequest())).rejects.toMatchObject({
        kind: 'SERVER',
        httpStatus: 500,
      });
    });

    it('lança erro de transporte NETWORK quando o motor está fora do ar', async () => {
      fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));

      await expect(engine.emitir(emissionRequest())).rejects.toMatchObject({
        kind: 'NETWORK',
      });
    });

    it('lança erro de transporte TIMEOUT quando o motor não responde a tempo', async () => {
      fetchMock.mockImplementation(
        (_url: string, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            init.signal?.addEventListener('abort', () =>
              reject(new Error('The operation was aborted')),
            );
          }),
      );
      jest.useFakeTimers();

      const promise = engine.emitir(emissionRequest());
      jest.advanceTimersByTime(5000);

      await expect(promise).rejects.toMatchObject({ kind: 'TIMEOUT' });
      jest.useRealTimers();
    });

    it('lança INVALID_RESPONSE quando o sucesso vem sem chave de acesso', async () => {
      fetchMock.mockResolvedValue(
        httpResponse(200, { sucesso: true, protocolo: '135210000123456' }),
      );

      await expect(engine.emitir(emissionRequest())).rejects.toMatchObject({
        kind: 'INVALID_RESPONSE',
      });
    });

    it('lança INVALID_RESPONSE quando o corpo não é JSON', async () => {
      fetchMock.mockResolvedValue(httpResponse(200, '<html>erro</html>'));

      await expect(engine.emitir(emissionRequest())).rejects.toBeInstanceOf(
        FiscalEngineTransportError,
      );
    });
  });

  describe('consultar', () => {
    it('chama POST /api/nfce/consulta com o certificado no corpo', async () => {
      fetchMock.mockResolvedValue(
        httpResponse(200, {
          sucesso: true,
          status: 'Autorizado o uso da NF-e',
          protocolo: '135210000123456',
          xmlConsultaBase64: 'eG1s',
        }),
      );

      const result = await engine.consultar({
        chaveAcesso: '3'.repeat(44),
        certificadoBase64: 'cert-base64',
        certificadoSenha: 'senha',
        ambiente: 'homologacao',
      });

      const { url, init } = lastCall();
      expect(url).toBe('http://motor-fiscal:8080/api/nfce/consulta');
      expect(init.method).toBe('POST');
      expect(result.sucesso).toBe(true);
      expect(result.status).toBe('Autorizado o uso da NF-e');
    });

    it('devolve mensagem de erro em HTTP 400', async () => {
      fetchMock.mockResolvedValue(
        httpResponse(400, {
          sucesso: false,
          mensagemErro: 'Chave de acesso inexistente',
        }),
      );

      const result = await engine.consultar({
        chaveAcesso: '3'.repeat(44),
        certificadoBase64: 'cert-base64',
        certificadoSenha: 'senha',
        ambiente: 'homologacao',
      });

      expect(result).toEqual({
        sucesso: false,
        mensagemErro: 'Chave de acesso inexistente',
      });
    });
  });

  describe('cancelar', () => {
    it('chama POST /api/nfce/cancel e devolve o XML do cancelamento', async () => {
      fetchMock.mockResolvedValue(
        httpResponse(200, {
          sucesso: true,
          protocolo: '135210000999999',
          xmlCancelamentoBase64: 'eG1s',
        }),
      );

      const result = await engine.cancelar({
        chaveAcesso: '3'.repeat(44),
        protocoloAutorizacao: '135210000123456',
        justificativa: 'Cancelamento por erro de digitação no pedido',
        certificadoBase64: 'cert-base64',
        certificadoSenha: 'senha',
        ambiente: 'homologacao',
      });

      expect(lastCall().url).toBe('http://motor-fiscal:8080/api/nfce/cancel');
      expect(result).toEqual({
        sucesso: true,
        protocolo: '135210000999999',
        xmlCancelamentoBase64: 'eG1s',
      });
    });

    it('devolve o motivo da recusa em HTTP 400', async () => {
      fetchMock.mockResolvedValue(
        httpResponse(400, {
          sucesso: false,
          motivoRejeicao: 'Prazo de cancelamento expirado',
        }),
      );

      const result = await engine.cancelar({
        chaveAcesso: '3'.repeat(44),
        protocoloAutorizacao: '135210000123456',
        justificativa: 'Cancelamento por erro de digitação no pedido',
        certificadoBase64: 'cert-base64',
        certificadoSenha: 'senha',
        ambiente: 'homologacao',
      });

      expect(result.sucesso).toBe(false);
      expect(result.motivoRejeicao).toBe('Prazo de cancelamento expirado');
    });
  });

  describe('statusServico', () => {
    it('chama POST /api/sefaz/status-servico e devolve a disponibilidade', async () => {
      fetchMock.mockResolvedValue(
        httpResponse(200, {
          disponivel: true,
          mensagem: 'Serviço em Operação',
          tempoMedioResposta: 1,
        }),
      );

      const result = await engine.statusServico({
        ambiente: 'homologacao',
        uf: 'SP',
        certificadoBase64: 'cert-base64',
        certificadoSenha: 'senha',
      });

      expect(lastCall().url).toBe(
        'http://motor-fiscal:8080/api/sefaz/status-servico',
      );
      expect(result).toEqual({
        disponivel: true,
        mensagem: 'Serviço em Operação',
        tempoMedioResposta: 1,
      });
    });

    it('devolve indisponível quando o motor recusa a requisição', async () => {
      fetchMock.mockResolvedValue(
        httpResponse(400, {
          codigo: 'CERT_INVALIDO',
          mensagem: 'Certificado vencido',
        }),
      );

      const result = await engine.statusServico({
        ambiente: 'homologacao',
        uf: 'SP',
        certificadoBase64: 'cert-base64',
        certificadoSenha: 'senha',
      });

      expect(result).toEqual({
        disponivel: false,
        mensagem: 'Certificado vencido',
      });
    });
  });

  describe('health', () => {
    it('chama GET /health sem X-Api-Key e devolve o motor disponível', async () => {
      fetchMock.mockResolvedValue(httpResponse(200, 'Healthy'));

      const result = await engine.health();

      const { url, init } = lastCall();
      expect(url).toBe('http://motor-fiscal:8080/health');
      expect(init.method).toBe('GET');
      expect(init.headers).toBeUndefined();
      expect(result).toMatchObject({ disponivel: true, status: 'Healthy' });
      expect(result.latenciaMs).toBeGreaterThanOrEqual(0);
    });

    it('lê o status quando o motor responde JSON', async () => {
      fetchMock.mockResolvedValue(httpResponse(200, { status: 'Healthy' }));

      const result = await engine.health();

      expect(result).toMatchObject({ disponivel: true, status: 'Healthy' });
    });

    it('devolve indisponível quando o motor responde erro', async () => {
      fetchMock.mockResolvedValue(httpResponse(503, 'Unhealthy'));

      const result = await engine.health();

      expect(result).toMatchObject({
        disponivel: false,
        status: 'Unhealthy',
        mensagem: 'Motor fiscal respondeu HTTP 503 em /health',
      });
    });

    it('devolve indisponível sem lançar quando a rede falha', async () => {
      fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));

      const result = await engine.health();

      expect(result.disponivel).toBe(false);
      expect(result.mensagem).toContain('ECONNREFUSED');
    });
  });
});
