import { Controller, Post, Body, Req, UseGuards } from '@nestjs/common';
import { AiService } from './ai.service';
import { JwtGuard } from '../auth/jwt/jwt.guard';

@Controller('ai')
export class AiController {
  constructor(private aiService: AiService) {}

  @Post('resume')
  @UseGuards(JwtGuard)
  async analyze(@Req() req: any, @Body() body: any) {
    return this.aiService.analyzeResume(req.user.userId, body.text);
  }
}