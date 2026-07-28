import { Module } from '@nestjs/common';
import { PermissionProfilesService } from './permission-profiles.service';
import { PermissionProfilesController } from './permission-profiles.controller';

@Module({
  controllers: [PermissionProfilesController],
  providers: [PermissionProfilesService],
  exports: [PermissionProfilesService],
})
export class PermissionProfilesModule {}
