export type AssistantIntent = 'GENERAL';

export interface RecommendedModelResponse {
  id: string;
  name: string;
  description: string | null;
}

export interface AssistantResponse {
  reply: string;
  replyAudioUrl?: string | null;
  intent: AssistantIntent;
  recommendedModel: RecommendedModelResponse | null;
  customModelRequest: boolean;
}