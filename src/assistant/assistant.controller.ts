import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { AssistantService } from './assistant.service';
import { AssistantChatDto } from './dto/assistant-chat.dto';
import { JwtGuard } from '../auth/jwt/jwt.guard';
import { ExecuteModelDto } from './dto/execute-model.dto';

@Controller('assistant')
export class AssistantController {
  constructor(private readonly assistantService: AssistantService) {}

  @UseGuards(JwtGuard)
  @Post('chat')
  async chat(@Req() req, @Body() dto: AssistantChatDto) {
    return this.assistantService.chat(req.user.userId, dto);
  }

  @UseGuards(JwtGuard)
  @Post('execute')
  async execute(@Req() req, @Body() dto: ExecuteModelDto) {
    return this.assistantService.executeModel(req.user.userId, dto);
  }
}