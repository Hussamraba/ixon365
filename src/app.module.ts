import { Module } from '@nestjs/common';
import { UsersModule } from './users/users.module';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { ModelsModule } from './models/models.module';
import { AiModule } from './ai/ai.module';
import { SubscriptionsModule } from './subscriptions/subscriptions.module';
import { AssistantModule } from './assistant/assistant.module';


@Module({
  imports: [UsersModule, PrismaModule, AuthModule, ModelsModule, AiModule, SubscriptionsModule, AssistantModule],
})
export class AppModule {}