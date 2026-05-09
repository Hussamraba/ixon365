import {
  IsArray,
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreateModelDto {
  @IsString()
  name!: string;

  @IsString()
  description!: string;

  @IsNumber()
  price!: number;

  // 🔥 نوع الموديل (مش CV فقط)
  @IsOptional()
  @IsString()
  category?: string;

  // 🔥 شو بعمل الموديل (مهم للـ matching)
  @IsOptional()
  @IsArray()
  capabilities?: string[];

  // 🔥 نوع الإدخال (text, voice, pdf...)
  @IsOptional()
  @IsArray()
  inputTypes?: string[];

  // 🔥 endpoint تبع FastAPI
  @IsOptional()
  @IsString()
  endpoint?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}