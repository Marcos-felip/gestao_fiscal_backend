import { Module } from '@nestjs/common';
import { NfeImportService } from './nfe-import.service';
import { NfeImportController } from './nfe-import.controller';

// `StorageModule` e `PrismaModule` são globais — não entram em `imports`.
@Module({
  controllers: [NfeImportController],
  providers: [NfeImportService],
  exports: [NfeImportService],
})
export class NfeImportModule {}
