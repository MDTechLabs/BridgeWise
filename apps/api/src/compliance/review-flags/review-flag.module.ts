import { Module } from '@nestjs/common';
import { ComplianceAdminGuard } from './compliance-admin.guard';
import { ReviewFlagController } from './review-flag.controller';
import { ReviewFlagService } from './review-flag.service';

@Module({
  controllers: [ReviewFlagController],
  providers: [ReviewFlagService, ComplianceAdminGuard],
  exports: [ReviewFlagService],
})
export class ReviewFlagModule {}
