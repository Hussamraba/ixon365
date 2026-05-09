import { Controller, Post, Body, Req, UseGuards } from '@nestjs/common';
import { SubscriptionsService } from './subscriptions.service';
import { JwtGuard } from '../auth/jwt/jwt.guard';

@Controller('subscriptions')
export class SubscriptionsController {
  constructor(private subService: SubscriptionsService) {}

  @Post()
  @UseGuards(JwtGuard)
  async subscribe(@Req() req: any, @Body() body: any) {
    return this.subService.subscribe(req.user.userId, body.modelId);
  }
}