import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateModelDto } from './dto/create-model.dto';

@Injectable()
export class ModelsService {
  constructor(private prisma: PrismaService) {}

  create(data: CreateModelDto) {
    return this.prisma.aIModel.create({
      data,
    });
  }

  findAll() {
    return this.prisma.aIModel.findMany({
      where: { isActive: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  findOne(id: string) {
    return this.prisma.aIModel.findUnique({
      where: { id },
    });
  }
}