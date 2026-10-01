import { Module } from '@nestjs/common';
import { RequestLogsService } from './request-logs.service.js';

@Module({
  providers: [RequestLogsService],
  exports: [RequestLogsService],
})
export class RequestLogsModule {}
