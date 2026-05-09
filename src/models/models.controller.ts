import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ModelsService } from './models.service';
import { CreateModelDto } from './dto/create-model.dto';

@Controller('models')
export class ModelsController {
  constructor(private modelsService: ModelsService) {}

  @Post()
  create(@Body() body: CreateModelDto) {
    return this.modelsService.create(body);
  }

  @Get()
  findAll() {
    return this.modelsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.modelsService.findOne(id);
  }
}