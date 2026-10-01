import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { BillingModule } from '../billing/billing.module.js';
import { ReportsModule } from '../reports/reports.module.js';
import { RequestLogsModule } from '../request-logs/request-logs.module.js';
import { ShelfModule } from '../shelf/shelf.module.js';
import { JobsService } from './jobs.service.js';

@Module({
  imports: [
    ShelfModule,
    BillingModule,
    AuthModule,
    ReportsModule,
    RequestLogsModule,
  ],
  providers: [JobsService],
  exports: [JobsService],
})
export class JobsModule {}
