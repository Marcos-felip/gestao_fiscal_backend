import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaExceptionFilter } from '../src/common/filters/prisma-exception.filter';

/**
 * Fumaça da aplicação: ela sobe, o prefixo global vale e as rotas nascem
 * fechadas.
 *
 * O arquivo que estava aqui era o boilerplate do Nest — esperava
 * `GET /` → `Hello World!`, de um `AppController` que já não existe. Ficou
 * vermelho por meses, citado como pendência em duas changes, e a única coisa
 * que ensinou foi a ignorar o `test:e2e`.
 *
 * O que este teste protege é o contrário do que aquele protegia: não uma rota
 * de exemplo, mas os três acoplamentos que quebram tudo de uma vez quando
 * alguém mexe no `main.ts` — módulo raiz que não instancia, prefixo trocado e
 * guard global desligado.
 */
describe('Aplicação (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();

    // Mesma configuração do `bootstrap()`. Sem isto o teste exercitaria uma
    // aplicação diferente da que roda em produção — e passaria justamente nos
    // casos em que o `main.ts` estivesse errado.
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new PrismaExceptionFilter());

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('serve as rotas sob o prefixo /api/v1', async () => {
    // 401 e não 404: a rota existe e o guard a protege.
    await request(app.getHttpServer()).get('/api/v1/products').expect(401);
  });

  it('não serve rota alguma fora do prefixo', async () => {
    await request(app.getHttpServer()).get('/products').expect(404);
  });

  it('responde 404 para rota inexistente dentro do prefixo', async () => {
    await request(app.getHttpServer()).get('/api/v1/nao-existe').expect(404);
  });

  it('recusa acesso sem token nas rotas de negócio', async () => {
    // Uma amostra por domínio: o que se verifica é que nenhuma nasceu aberta.
    const rotas = [
      '/api/v1/sales',
      '/api/v1/partners',
      '/api/v1/fiscal/documents',
      '/api/v1/companies',
    ];

    for (const rota of rotas) {
      await request(app.getHttpServer()).get(rota).expect(401);
    }
  });
});
