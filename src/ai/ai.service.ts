import { ForbiddenException, Injectable } from '@nestjs/common';
import axios from 'axios';
import { PrismaService } from '../prisma/prisma.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';

@Injectable()
export class AiService {
  constructor(
    private prisma: PrismaService,
    private subService: SubscriptionsService,
  ) {}

  async analyzeResume(userId: string, text: string) {
    // مؤقتًا: جيب أول موديل اسمه Resume Analyzer
    const model = await this.prisma.aIModel.findFirst({
      where: {
        name: 'Resume Analyzer',
        isActive: true,
      },
    });

    if (!model) {
      throw new ForbiddenException('Resume Analyzer model not found');
    }

    const hasAccess = await this.subService.hasAccess(userId, model.id);

    if (!hasAccess) {
      throw new ForbiddenException('You must subscribe to use this model');
    }

    const response = await axios.post('http://localhost:8000/analyze-resume', {
      text,
    });

    const result = response.data;

    await this.prisma.aIRequest.create({
      data: {
        userId,
        modelId: model.id,
        input: text,
        output: JSON.stringify(result),
      },
    });

    return result;
  }
}