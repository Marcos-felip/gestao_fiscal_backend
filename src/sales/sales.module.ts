import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { SalesService } from './sales.service';
import { SalesController } from './sales.controller';

@Module({
  imports: [EventEmitterModule],
  controllers: [SalesController],
  providers: [SalesService],
  exports: [SalesService],
})
export class SalesModule {}
