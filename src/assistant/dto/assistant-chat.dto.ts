import { IsString, MinLength } from 'class-validator';

export class AssistantChatDto {
  @IsString()
  @MinLength(2)
  message!: string;
}
