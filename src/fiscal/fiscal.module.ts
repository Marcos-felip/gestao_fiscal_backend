import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { FiscalController } from './fiscal.controller';
import { FiscalService } from './fiscal.service';
import { FiscalOperationsService } from './fiscal-operations.service';
import { DfeNetFiscalEngine } from './fiscal-engine/dfe-net-fiscal-engine.service';
import { FiscalEmissionProcessor } from './jobs/fiscal-emission.processor';
import { OnSaleConfirmedListener } from './listeners/on-sale-confirmed.listener';
import { CertificateCryptoService } from './certificates/certificate-crypto.service';
import { FiscalCertificateService } from './certificates/fiscal-certificate.service';
import { QueueModule } from '../queue/queue.module';
import { StorageModule } from '../storage/storage.module';
import { REGRA_FISCAL } from './rules/fiscal-rules.port';
import { ProductFallbackRule } from './rules/product-fallback-rule.service';

@Module({
  imports: [QueueModule, StorageModule, EventEmitterModule],
  controllers: [FiscalController],
  providers: [
    FiscalService,
    FiscalOperationsService,
    DfeNetFiscalEngine,
    CertificateCryptoService,
    FiscalCertificateService,
    FiscalEmissionProcessor,
    OnSaleConfirmedListener,
    // Regra fiscal por operação — etapa 2. A implementação de hoje responde com
    // o cadastro do produto; trocar de matriz é trocar esta linha.
    ProductFallbackRule,
    { provide: REGRA_FISCAL, useExisting: ProductFallbackRule },
  ],
  exports: [FiscalService, DfeNetFiscalEngine, FiscalCertificateService],
})
export class FiscalModule {}
