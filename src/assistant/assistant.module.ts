import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AssistantController } from './assistant.controller';
import { AssistantService } from './assistant.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [
    PrismaModule,
    JwtModule.register({
      secret: 'SECRET_KEY',
      signOptions: { expiresIn: '1d' },
    }),
  ],
  controllers: [AssistantController],
  providers: [AssistantService],
})
export class AssistantModule {}