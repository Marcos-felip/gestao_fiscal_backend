import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { FiscalController } from './fiscal.controller';
import { FiscalService } from './fiscal.service';
import { DfeNetFiscalEngine } from './fiscal-engine/dfe-net-fiscal-engine.service';
import { FiscalEmissionProcessor } from './jobs/fiscal-emission.processor';
import { OnSaleConfirmedListener } from './listeners/on-sale-confirmed.listener';
import { QueueModule } from '../queue/queue.module';
import { StorageModule } from '../storage/storage.module';
import { FISCAL_EMISSION_QUEUE } from '../queue/queue.constants';

@Module({
  imports: [
    QueueModule,
    StorageModule,
    BullModule.registerQueue({
      name: FISCAL_EMISSION_QUEUE,
    }),
    EventEmitterModule,
  ],
  controllers: [FiscalController],
  providers: [
    FiscalService,
    DfeNetFiscalEngine,
    FiscalEmissionProcessor,
    OnSaleConfirmedListener,
  ],
  exports: [FiscalService, DfeNetFiscalEngine],
})
export class FiscalModule {}
