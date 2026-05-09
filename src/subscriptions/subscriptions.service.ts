import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SubscriptionsService {
  constructor(private prisma: PrismaService) {}

  async subscribe(userId: string, modelId: string) {
    return this.prisma.subscription.create({
      data: {
        userId,
        modelId,
      },
    });
  }

  async hasAccess(userId: string, modelId: string) {
    const sub = await this.prisma.subscription.findFirst({
      where: {
        userId,
        modelId,
        status: 'active',
      },
    });

    return !!sub;
  }
}