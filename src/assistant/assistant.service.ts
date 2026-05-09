import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AssistantChatDto } from './dto/assistant-chat.dto';
import { AssistantResponse } from './types/assistant.types';
import { ExecuteModelDto } from './dto/execute-model.dto';
import OpenAI from 'openai';

type Language = 'ar' | 'en' | 'mixed';

type AssistantIntent =
  | 'GREETING'
  | 'SMALL_TALK'
  | 'MODEL_REQUEST'
  | 'CUSTOM_MODEL_REQUEST'
  | 'ASK_CLARIFICATION'
  | 'UNKNOWN';

type AssistantDecision =
  | 'REPLY_DIRECTLY'
  | 'RECOMMEND_MODEL'
  | 'ASK_CLARIFICATION'
  | 'CREATE_CUSTOM_REQUEST';

type ChatRole = 'USER' | 'ASSISTANT';

interface IntentClassification {
  intent: AssistantIntent;
  language: Language;
  confidence: number;
  reply: string;
  detectedNeed: string;
  searchQuery: string;
}

@Injectable()
export class AssistantService {
  constructor(private readonly prisma: PrismaService) {}

  async chat(userId: string, dto: AssistantChatDto): Promise<AssistantResponse> {
    const message = dto.message?.trim();

    if (!message) {
      return {
        reply: 'الرسالة فارغة. اكتب طلبك حتى أقدر أساعدك.',
        replyAudioUrl: null,
        intent: 'GENERAL',
        recommendedModel: null,
        customModelRequest: false,
      };
    }

    const session = await this.getOrCreateSession(userId);
    const recentMessages = await this.getRecentMessages(session.id);

    await this.saveMessage(session.id, 'USER', message);

    const classification =
      (await this.classifyIntent(message, recentMessages)) ??
      this.fallbackClassifyIntent(message);

   const sessionData = (session.data || {}) as any;

const previousUserMessage = recentMessages
  .filter((m) => m.role === 'USER')
  .slice(-1)[0]?.content;

const currentLanguage = this.detectLanguage(message);
const previousLanguage = previousUserMessage
  ? this.detectLanguage(previousUserMessage)
  : null;

const language = (
  sessionData.language ||
  currentLanguage ||
  previousLanguage ||
  classification.language ||
  'ar'
) as Language;

const activeCustomStates = ['ASK_GOAL', 'ASK_INPUT_TYPE', 'ASK_USERS'];

if (activeCustomStates.includes(session.state)) {
  const assistantResult = await this.handleCustomModelFlow(
    message,
    language,
    session,
    userId,
  );

  const voiceReply = this.buildVoiceReply(assistantResult.reply, language);
  const replyAudioUrl = await this.generateAudio(voiceReply, language);

  await this.saveMessage(session.id, 'ASSISTANT', assistantResult.reply);

  return {
    reply: assistantResult.reply,
    replyAudioUrl,
    intent: 'GENERAL',
    recommendedModel: assistantResult.recommendedModel,
    customModelRequest: assistantResult.customModelRequest,
  };
}
    const contextFeatures = this.extractContextFeatures(
      message,
      recentMessages,
      classification,
    );

    const modelSearchText = [
      message,
      classification.searchQuery || '',
      classification.detectedNeed || '',
    ].join(' ');

    const shouldSearchModel =
      classification.intent === 'MODEL_REQUEST' ||
      contextFeatures.hasClearUseCase;

    const recommendedModel = shouldSearchModel
      ? await this.findBestModel(modelSearchText)
      : null;

    const decision = this.decideNextAction({
      classification,
      recommendedModel,
      contextFeatures,
    });

    const assistantResult = await this.executeDecision({
      decision,
      language,
      classification,
      recommendedModel,
      recentMessages,
      contextFeatures,
      session,
      userId,
      message,
    });

    const voiceReply = this.buildVoiceReply(assistantResult.reply, language);
    const replyAudioUrl = await this.generateAudio(voiceReply, language);

    await this.saveMessage(session.id, 'ASSISTANT', assistantResult.reply);

    return {
      reply: assistantResult.reply,
      replyAudioUrl,
      intent: 'GENERAL',
      recommendedModel: assistantResult.recommendedModel,
      customModelRequest: assistantResult.customModelRequest,
    };
  }
private mapGoal(message: string): string {
  const text = this.normalize(message);

  if (text.includes('1') || text.includes('خدمة') || text.includes('support')) {
    return 'customer_support';
  }

  if (text.includes('2') || text.includes('مبيعات') || text.includes('sales')) {
    return 'sales';
  }

  if (text.includes('3') || text.includes('تحليل') || text.includes('analysis')) {
    return 'analytics';
  }

  if (text.includes('4') || text.includes('اتمتة') || text.includes('أتمتة') || text.includes('automation')) {
    return 'automation';
  }

  return 'other';
}
private mapInputType(message: string): string {
  const text = this.normalize(message);

  if (text.includes('1') || text.includes('نص') || text.includes('text')) {
    return 'text';
  }

  if (text.includes('2') || text.includes('صوت') || text.includes('voice')) {
    return 'voice';
  }

  if (text.includes('3') || text.includes('both') || text.includes('الاثنين')) {
    return 'text_voice';
  }

  return 'text';
}
private parseUsers(message: string): number {
  const match = message.match(/\d+/);
  return match ? parseInt(match[0], 10) : 1;
}
  // =========================
  // 🧠 DECISION ENGINE
  // =========================

  private decideNextAction(input: {
    classification: IntentClassification;
    recommendedModel: any | null;
    contextFeatures: any;
  }): AssistantDecision {
    const { classification, recommendedModel, contextFeatures } = input;

    const scores: Record<AssistantDecision, number> = {
      REPLY_DIRECTLY: 0,
      RECOMMEND_MODEL: 0,
      ASK_CLARIFICATION: 0,
      CREATE_CUSTOM_REQUEST: 0,
    };

    if (classification.intent === 'GREETING') {
      scores.REPLY_DIRECTLY += 5;
    }

    if (classification.intent === 'SMALL_TALK') {
      scores.REPLY_DIRECTLY += 4;
    }

    if (classification.intent === 'MODEL_REQUEST') {
      scores.RECOMMEND_MODEL += 4;
    }
    if (recommendedModel && contextFeatures.hasClearUseCase) {
  scores.RECOMMEND_MODEL += 8;
}
    if (contextFeatures.wantsVoice) scores.RECOMMEND_MODEL += 2;
    if (contextFeatures.wantsChatbot) scores.RECOMMEND_MODEL += 2;
    if (contextFeatures.wantsFileAnalysis) scores.RECOMMEND_MODEL += 2;
    if (contextFeatures.wantsAutomation) scores.RECOMMEND_MODEL += 2;

    if (classification.intent === 'CUSTOM_MODEL_REQUEST') {
      scores.CREATE_CUSTOM_REQUEST += 10;
    }

    if (classification.intent === 'ASK_CLARIFICATION') {
      scores.ASK_CLARIFICATION += 5;
    }

    if (classification.confidence < 0.55) {
      scores.ASK_CLARIFICATION += 4;
    }

    if (
      classification.intent === 'MODEL_REQUEST' &&
      !recommendedModel &&
      classification.confidence >= 0.55
    ) {
      scores.ASK_CLARIFICATION += 8;
    }

   if (
  classification.intent === 'MODEL_REQUEST' &&
  !recommendedModel &&
  !contextFeatures.hasClearUseCase
) {
  scores.ASK_CLARIFICATION += 5;
}

    const best = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];

    return best[0] as AssistantDecision;
  }

  // =========================
  // 🔁 CUSTOM MODEL FLOW
  // =========================

  private async handleCustomModelFlow(
    message: string,
    language: Language,
    session: any,
    userId: string,
  ) {
    const state = session.state || 'IDLE';
    const currentData = session.data || {};

    if (state === 'IDLE' || state === 'DONE') {
      await this.prisma.assistantSession.update({
        where: { id: session.id },
        data: {
          state: 'ASK_GOAL',
          data: {language},
        },
      });

      return {
        reply:
  language === 'en'
    ? 'What is the goal of the custom model?\n1. Customer support\n2. Sales\n3. Data analysis\n4. Automation'
    : 'شو الهدف من الموديل؟\n1. خدمة عملاء\n2. مبيعات\n3. تحليل بيانات\n4. أتمتة',
          recommendedModel: null,
          customModelRequest: true,
      };
    }

    if (state === 'ASK_GOAL') {
      await this.prisma.assistantSession.update({
        where: { id: session.id },
        data: {
          state: 'ASK_INPUT_TYPE',
          data: {
            ...currentData,
            goal: this.mapGoal(message),
          },
        },
      });

      return {
        reply:
          language === 'en'
           ? 'What input type do you need?\n1. Text\n2. Voice\n3. Both'
    : 'شو نوع الإدخال؟\n1. نص\n2. صوت\n3. الاثنين',
        recommendedModel: null,
        customModelRequest: true,
      };
    }

    if (state === 'ASK_INPUT_TYPE') {
      await this.prisma.assistantSession.update({
        where: { id: session.id },
        data: {
          state: 'ASK_USERS',
          data: {
            ...currentData,
            inputType: this.mapInputType(message),
          },
        },
      });

      return {
        reply:
          language === 'en'
            ? 'How many users do you expect to use this model?'
            : 'كم عدد المستخدمين المتوقع يستخدموا هذا الموديل؟',
        recommendedModel: null,
        customModelRequest: true,
      };
    }

    if (state === 'ASK_USERS') {
      const finalData = {
        ...currentData,
        users: this.parseUsers(message),
      };

      await this.prisma.customModelRequest.create({
        data: {
          userId,
          title: `Custom AI Model - ${finalData.goal || 'New Request'}`,
          description: `Goal: ${finalData.goal || 'N/A'} | Input Type: ${
            finalData.inputType || 'N/A'
          } | Users: ${finalData.users || 'N/A'}`,
          detectedNeed: finalData.goal || message,
          inputType: finalData.inputType || 'mixed',
          language,
          status: 'pending',
        },
      });

      await this.prisma.assistantSession.update({
        where: { id: session.id },
        data: {
          state: 'DONE',
          data: finalData,
        },
      });

      return {
        reply:
          language === 'en'
            ? 'Perfect. I created your custom model request. Our team can review it and follow up with you.'
            : 'ممتاز. تم إنشاء طلب الموديل المخصص. فريقنا يقدر يراجعه ويتواصل معك.',
        recommendedModel: null,
        customModelRequest: true,
      };
    }

    return {
      reply:
        language === 'en'
          ? 'Can you clarify what you need?'
          : 'ممكن توضح أكثر شو المطلوب؟',
      recommendedModel: null,
      customModelRequest: false,
    };
  }

  private async executeDecision(input: {
    decision: AssistantDecision;
    language: Language;
    classification: IntentClassification;
    recommendedModel: any | null;
    recentMessages: { role: string; content: string }[];
    contextFeatures: any;
    session: any;
    userId: string;
    message: string;
  }) {
    const {
      decision,
      language,
      classification,
      recommendedModel,
      recentMessages,
      contextFeatures,
      session,
      userId,
      message,
    } = input;

    if (decision === 'REPLY_DIRECTLY') {
      const reply =
        classification.reply ||
        this.buildContextAwareSmallTalkReply(language, recentMessages);

      return {
        reply,
        recommendedModel: null,
        customModelRequest: false,
      };
    }

    if (decision === 'ASK_CLARIFICATION') {
      const reply =
        classification.reply ||
        this.buildSmartClarificationReply(language, contextFeatures);

      return {
        reply,
        recommendedModel: null,
        customModelRequest: false,
      };
    }

    if (decision === 'RECOMMEND_MODEL') {
      if (recommendedModel) {
        const reply = this.buildModelReply(language, recommendedModel.name);

        return {
          reply,
          recommendedModel: {
            id: recommendedModel.id,
            name: recommendedModel.name,
            description: recommendedModel.description,
          },
          customModelRequest: false,
        };
      }

      return {
        reply: this.buildSmartClarificationReply(language, contextFeatures),
        recommendedModel: null,
        customModelRequest: false,
      };
    }

    if (decision === 'CREATE_CUSTOM_REQUEST') {
      return this.handleCustomModelFlow(message, language, session, userId);
    }

    return {
      reply:
        language === 'en'
          ? 'Can you clarify what you need?'
          : 'ممكن توضح أكثر شو المطلوب؟',
      recommendedModel: null,
      customModelRequest: false,
    };
  }

  // =========================
  // 🔊 AUDIO
  // =========================

  private async generateAudio(
    reply: string,
    language: Language,
  ): Promise<string | null> {
    try {
      const ttsResponse = await fetch('http://127.0.0.1:8000/tts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'xi-api-key': process.env.ELEVENLABS_API_KEY || '',
        },
        body: JSON.stringify({
          text: reply,
          lang: language === 'ar' ? 'ar' : 'en',
        }),
      });

      if (!ttsResponse.ok) {
        console.error('TTS failed:', ttsResponse.status);
        return null;
      }

      const data = await ttsResponse.json();
      return data.audio_url ?? null;
    } catch (error) {
      console.error('TTS error:', error);
      return null;
    }
  }

  private buildVoiceReply(reply: string, language: Language): string {
    if (reply.length <= 130) return reply;

    if (language === 'en') {
      return 'I found a suitable direction for you. Would you like me to continue with the details?';
    }

    return 'لقيت لك خيار مناسب. تحب أكمل معك بالتفاصيل؟';
  }

  // =========================
  // 🧠 INTENT
  // =========================

  private async classifyIntent(
    message: string,
    history: { role: string; content: string }[] = [],
  ): Promise<IntentClassification> {
    try {
      const response = await fetch('http://127.0.0.1:8000/assistant-brain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: message, history }),
      });

      if (!response.ok) {
        return this.fallbackClassifyIntent(message);
      }

      const data = await response.json();

      if (!data) {
        return this.fallbackClassifyIntent(message);
      }

      return {
        intent: data.intent || this.fallbackClassifyIntent(message).intent,
        language: data.language || this.detectLanguage(message),
        confidence: Number(data.confidence ?? 0.6),
        reply: data.reply || '',
        detectedNeed: data.detectedNeed || message,
        searchQuery: data.searchQuery || message,
      };
    } catch (error) {
      console.error('Intent classification failed:', error);
      return this.fallbackClassifyIntent(message);
    }
  }

 private fallbackClassifyIntent(message: string): IntentClassification {
  const language = (this.detectLanguage(message) || 'ar') as Language;
  const normalized = this.normalize(message);

    const greetingWords = [
      'hi',
      'hello',
      'hey',
      'مرحبا',
      'اهلا',
      'أهلا',
      'السلام عليكم',
    ];

    const smallTalkWords = [
      'كيفك',
      'كيف الحال',
      'شو اخبارك',
      'how are you',
      'what are you doing',
    ];

    const customWords = [
      'custom',
      'خاص',
      'مخصص',
      'ابني',
      'اعمللي',
      'build for me',
      'create model',
    ];

    const modelWords = [
  'model',
  'ai',
  'chatbot',
  'voice',
  'pdf',
  'file',
  'document',
  'resume',
  'cv',
  'summary',
  'summarize',
  'question',
  'answer',
  'موديل',
  'ذكاء',
  'شات',
  'صوت',
  'تحليل',
  'ملف',
  'ملفات',
  'مستند',
  'مستندات',
  'تلخيص',
  'لخص',
  'ألخص',
  'الخص',
  'سؤال',
  'أسئلة',
  'اسئلة',
  'assistant',
];

    if (greetingWords.some((word) => normalized.includes(this.normalize(word)))) {
      return {
        intent: 'GREETING',
        language,
        confidence: 0.9,
        reply: '',
        detectedNeed: '',
        searchQuery: message,
      };
    }

    if (smallTalkWords.some((word) => normalized.includes(this.normalize(word)))) {
      return {
        intent: 'SMALL_TALK',
        language,
        confidence: 0.85,
        reply: '',
        detectedNeed: '',
        searchQuery: message,
      };
    }

    if (customWords.some((word) => normalized.includes(this.normalize(word)))) {
      return {
        intent: 'CUSTOM_MODEL_REQUEST',
        language,
        confidence: 0.8,
        reply: '',
        detectedNeed: message,
        searchQuery: message,
      };
    }

    if (modelWords.some((word) => normalized.includes(this.normalize(word)))) {
      return {
        intent: 'MODEL_REQUEST',
        language,
        confidence: 0.75,
        reply: '',
        detectedNeed: message,
        searchQuery: message,
      };
    }

    return {
      intent: 'ASK_CLARIFICATION',
      language,
      confidence: 0.45,
      reply: '',
      detectedNeed: message,
      searchQuery: message,
    };
  }

    // =========================
  // 🔍 MODEL MATCH
  // =========================

  private async findBestModel(message: string) {
    const models = await this.prisma.aIModel.findMany({
      where: { isActive: true },
    });

    const normalizedMessage = this.normalize(message);
    const expandedMessage = this.expandSearchQuery(normalizedMessage);

    let bestModel: any = null;
    let bestScore = 0;

    for (const model of models) {
      const searchableParts = [
        model.name,
        model.description,
        model.category,
        ...(model.capabilities || []),
        ...(model.inputTypes || []),
      ];

      let score = 0;

      const normalizedModelText = this.normalize(
        searchableParts.filter(Boolean).join(' '),
      );

      const expandedModelText = this.expandSearchQuery(normalizedModelText);

      const messageWords = expandedMessage
        .split(' ')
        .filter((word) => word.length > 2);

      for (const word of messageWords) {
        if (expandedModelText.includes(word)) {
          score += 1;
        }
      }

      if (this.hasCvNeed(expandedMessage, model)) score += 6;
      if (this.hasPdfNeed(expandedMessage, model)) score += 6;
      if (this.hasVoiceNeed(expandedMessage, model)) score += 5;
      if (this.hasChatNeed(expandedMessage, model)) score += 5;
      if (this.hasMarketingNeed(expandedMessage, model)) score += 5;
      if (this.hasDataNeed(expandedMessage, model)) score += 5;
      if (this.hasFileNeed(expandedMessage, model)) score += 3;

      if (score > bestScore) {
        bestScore = score;
        bestModel = model;
      }
    }

    return bestScore >= 2 ? bestModel : null;
  }

  private expandSearchQuery(text: string): string {
    const aliases: Record<string, string[]> = {
      pdf: [
        'pdf',
        'ملف',
        'ملفات',
        'مستند',
        'مستندات',
        'وثيقة',
        'وثائق',
      ],
      document: [
        'document',
        'documents',
        'file',
        'files',
        'ملف',
        'ملفات',
        'مستند',
        'مستندات',
        'وثيقة',
      ],
      summary: [
        'summary',
        'summarize',
        'تلخيص',
        'لخص',
        'ألخص',
        'الخص',
        'ملخص',
      ],
      question: [
        'question',
        'questions',
        'answer',
        'answers',
        'qa',
        'اسأل',
        'أسأل',
        'سؤال',
        'اسئلة',
        'أسئلة',
        'اجوبة',
        'أجوبة',
      ],
      resume: [
        'resume',
        'cv',
        'career',
        'job',
        'سيرة',
        'السيرة',
        'وظيفة',
        'وظائف',
        'توظيف',
      ],
      chatbot: [
        'chatbot',
        'chat bot',
        'chat',
        'faq',
        'customer support',
        'شات',
        'شات بوت',
        'دردشة',
        'محادثة',
        'خدمة عملاء',
        'دعم عملاء',
      ],
      voice: [
        'voice',
        'audio',
        'speech',
        'tts',
        'stt',
        'صوت',
        'صوتي',
        'تسجيل',
        'كلام',
      ],
      marketing: [
        'marketing',
        'ads',
        'content',
        'social media',
        'campaign',
        'تسويق',
        'اعلان',
        'إعلان',
        'اعلانات',
        'إعلانات',
        'محتوى',
        'سوشال',
      ],
      data: [
        'data',
        'analytics',
        'dashboard',
        'excel',
        'database',
        'بيانات',
        'تحليل بيانات',
        'تحليل',
        'داشبورد',
        'اكسل',
        'إكسل',
        'قاعدة بيانات',
      ],
    };

    let expanded = text;

    for (const [mainWord, words] of Object.entries(aliases)) {
      for (const word of words) {
        const normalizedWord = this.normalize(word);

        if (text.includes(normalizedWord)) {
          expanded += ` ${mainWord} ${words.join(' ')}`;
        }
      }
    }

    return this.normalize(expanded);
  }

  private hasCvNeed(message: string, model: any): boolean {
    const userNeedsCv =
      message.includes('cv') ||
      message.includes('resume') ||
      message.includes('career') ||
      message.includes('job') ||
      message.includes('سيرة') ||
      message.includes('وظيفة') ||
      message.includes('وظائف') ||
      message.includes('توظيف');

    const modelSupportsCv =
      model.category?.toLowerCase().includes('cv') ||
      model.name?.toLowerCase().includes('resume') ||
      model.name?.toLowerCase().includes('cv') ||
      model.description?.toLowerCase().includes('resume') ||
      model.description?.toLowerCase().includes('cv') ||
      model.capabilities?.some((cap: string) => {
        const c = this.normalize(cap);
        return c.includes('resume') || c.includes('cv') || c.includes('career');
      });

    return userNeedsCv && modelSupportsCv;
  }

  private hasPdfNeed(message: string, model: any): boolean {
    const userNeedsPdf =
      message.includes('pdf') ||
      message.includes('ملف') ||
      message.includes('ملفات') ||
      message.includes('مستند') ||
      message.includes('مستندات') ||
      message.includes('وثيقة') ||
      message.includes('تلخيص') ||
      message.includes('لخص') ||
      message.includes('الخص') ||
      message.includes('ألخص') ||
      message.includes('أسئلة') ||
      message.includes('اسئلة') ||
      message.includes('سؤال');

    const modelSupportsPdf =
      model.category?.toLowerCase().includes('pdf') ||
      model.name?.toLowerCase().includes('pdf') ||
      model.description?.toLowerCase().includes('pdf') ||
      model.description?.toLowerCase().includes('document') ||
      model.capabilities?.some((cap: string) => {
        const c = this.normalize(cap);
        return (
          c.includes('pdf') ||
          c.includes('document') ||
          c.includes('file') ||
          c.includes('summary') ||
          c.includes('question')
        );
      });

    return userNeedsPdf && modelSupportsPdf;
  }

  private hasVoiceNeed(message: string, model: any): boolean {
    const userNeedsVoice =
      message.includes('voice') ||
      message.includes('audio') ||
      message.includes('speech') ||
      message.includes('tts') ||
      message.includes('stt') ||
      message.includes('صوت') ||
      message.includes('صوتي') ||
      message.includes('تسجيل') ||
      message.includes('كلام');

    const modelSupportsVoice =
      model.inputTypes?.includes('voice') ||
      model.category?.toLowerCase().includes('voice') ||
      model.name?.toLowerCase().includes('voice') ||
      model.name?.toLowerCase().includes('audio') ||
      model.description?.toLowerCase().includes('voice') ||
      model.description?.toLowerCase().includes('audio') ||
      model.capabilities?.some((cap: string) => {
        const c = this.normalize(cap);
        return (
          c.includes('voice') ||
          c.includes('audio') ||
          c.includes('speech') ||
          c.includes('tts') ||
          c.includes('stt')
        );
      });

    return userNeedsVoice && modelSupportsVoice;
  }

  private hasChatNeed(message: string, model: any): boolean {
    const userNeedsChat =
      message.includes('chat') ||
      message.includes('chatbot') ||
      message.includes('chat bot') ||
      message.includes('faq') ||
      message.includes('شات') ||
      message.includes('دردشة') ||
      message.includes('محادثة') ||
      message.includes('بوت') ||
      message.includes('خدمة عملاء') ||
      message.includes('دعم عملاء');

    const modelSupportsChat =
      model.category?.toLowerCase().includes('chat') ||
      model.category?.toLowerCase().includes('chatbot') ||
      model.name?.toLowerCase().includes('chat') ||
      model.name?.toLowerCase().includes('chatbot') ||
      model.description?.toLowerCase().includes('chat') ||
      model.description?.toLowerCase().includes('chatbot') ||
      model.description?.toLowerCase().includes('customer support') ||
      model.capabilities?.some((cap: string) => {
        const c = this.normalize(cap);
        return (
          c.includes('chat') ||
          c.includes('chatbot') ||
          c.includes('faq') ||
          c.includes('customer support')
        );
      });

    return userNeedsChat && modelSupportsChat;
  }

  private hasMarketingNeed(message: string, model: any): boolean {
    const userNeedsMarketing =
      message.includes('marketing') ||
      message.includes('ads') ||
      message.includes('content') ||
      message.includes('social media') ||
      message.includes('campaign') ||
      message.includes('تسويق') ||
      message.includes('اعلان') ||
      message.includes('إعلان') ||
      message.includes('اعلانات') ||
      message.includes('إعلانات') ||
      message.includes('محتوى') ||
      message.includes('سوشال');

    const modelSupportsMarketing =
      model.category?.toLowerCase().includes('marketing') ||
      model.name?.toLowerCase().includes('marketing') ||
      model.description?.toLowerCase().includes('marketing') ||
      model.description?.toLowerCase().includes('ads') ||
      model.description?.toLowerCase().includes('content') ||
      model.capabilities?.some((cap: string) => {
        const c = this.normalize(cap);
        return (
          c.includes('marketing') ||
          c.includes('ads') ||
          c.includes('content') ||
          c.includes('social media') ||
          c.includes('campaign')
        );
      });

    return userNeedsMarketing && modelSupportsMarketing;
  }

  private hasDataNeed(message: string, model: any): boolean {
    const userNeedsData =
      message.includes('data') ||
      message.includes('analytics') ||
      message.includes('dashboard') ||
      message.includes('excel') ||
      message.includes('database') ||
      message.includes('بيانات') ||
      message.includes('تحليل') ||
      message.includes('داشبورد') ||
      message.includes('اكسل') ||
      message.includes('إكسل') ||
      message.includes('قاعدة بيانات');

    const modelSupportsData =
      model.category?.toLowerCase().includes('data') ||
      model.category?.toLowerCase().includes('analytics') ||
      model.name?.toLowerCase().includes('data') ||
      model.name?.toLowerCase().includes('analytics') ||
      model.description?.toLowerCase().includes('data') ||
      model.description?.toLowerCase().includes('analytics') ||
      model.description?.toLowerCase().includes('dashboard') ||
      model.capabilities?.some((cap: string) => {
        const c = this.normalize(cap);
        return (
          c.includes('data') ||
          c.includes('analytics') ||
          c.includes('dashboard') ||
          c.includes('excel') ||
          c.includes('database')
        );
      });

    return userNeedsData && modelSupportsData;
  }

  private hasFileNeed(message: string, model: any): boolean {
    const userNeedsFile =
      message.includes('pdf') ||
      message.includes('file') ||
      message.includes('files') ||
      message.includes('document') ||
      message.includes('documents') ||
      message.includes('ملف') ||
      message.includes('ملفات') ||
      message.includes('مستند') ||
      message.includes('مستندات');

    const modelSupportsFile =
      model.inputTypes?.includes('pdf') ||
      model.inputTypes?.includes('file') ||
      model.capabilities?.some((cap: string) => {
        const c = this.normalize(cap);
        return (
          c.includes('pdf') ||
          c.includes('file') ||
          c.includes('document')
        );
      }) ||
      false;

    return userNeedsFile && modelSupportsFile;
  }
  // =========================
  // 💾 MEMORY
  // =========================

  private async getOrCreateSession(userId: string) {
    const existingSession = await this.prisma.assistantSession.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    if (existingSession) return existingSession;

    return this.prisma.assistantSession.create({
      data: { userId },
    });
  }

  private async saveMessage(
    sessionId: string,
    role: ChatRole,
    content: string,
  ) {
    return this.prisma.assistantMessage.create({
      data: {
        sessionId,
        role,
        content,
      },
    });
  }

  private async getRecentMessages(sessionId: string) {
    const messages = await this.prisma.assistantMessage.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'desc' },
      take: 12,
    });

    return messages.reverse();
  }

  private extractContextFeatures(
  message: string,
  recentMessages: { role: string; content: string }[],
  classification?: any,
) {
  const userHistoryOnly = recentMessages
    .filter((m) => m.role === 'USER')
    .map((m) => m.content);

  const fullContext = this.normalize([
    ...userHistoryOnly,
    message,
    classification?.detectedNeed || '',
    classification?.searchQuery || '',
  ].join(' '));

  const wantsCv =
    fullContext.includes('cv') ||
    fullContext.includes('resume') ||
    fullContext.includes('career') ||
    fullContext.includes('job') ||
    fullContext.includes('سيرة') ||
    fullContext.includes('وظيفة') ||
    fullContext.includes('توظيف');

  const wantsCoding =
    fullContext.includes('code') ||
    fullContext.includes('coding') ||
    fullContext.includes('programming') ||
    fullContext.includes('bug') ||
    fullContext.includes('website') ||
    fullContext.includes('كود') ||
    fullContext.includes('برمجة') ||
    fullContext.includes('موقع');

  const wantsMarketing =
    fullContext.includes('marketing') ||
    fullContext.includes('ads') ||
    fullContext.includes('content') ||
    fullContext.includes('social media') ||
    fullContext.includes('اعلان') ||
    fullContext.includes('إعلان') ||
    fullContext.includes('محتوى') ||
    fullContext.includes('تسويق');

  const wantsData =
    fullContext.includes('data') ||
    fullContext.includes('analytics') ||
    fullContext.includes('dashboard') ||
    fullContext.includes('excel') ||
    fullContext.includes('database') ||
    fullContext.includes('تحليل بيانات') ||
    fullContext.includes('داشبورد') ||
    fullContext.includes('قاعدة بيانات');

  const wantsVoice =
    fullContext.includes('voice') ||
    fullContext.includes('audio') ||
    fullContext.includes('speech') ||
    fullContext.includes('tts') ||
    fullContext.includes('stt') ||
    fullContext.includes('صوت');

  const wantsChatbot =
    fullContext.includes('chatbot') ||
    fullContext.includes('chat bot') ||
    fullContext.includes('chat') ||
    fullContext.includes('شات') ||
    fullContext.includes('دردشة');

  const wantsFileAnalysis =
    fullContext.includes('pdf') ||
    fullContext.includes('file') ||
    fullContext.includes('document') ||
    fullContext.includes('ملف') ||
    fullContext.includes('ملفات') ||
    fullContext.includes('مستند');

  const wantsAutomation =
    fullContext.includes('automation') ||
    fullContext.includes('automate') ||
    fullContext.includes('اتمتة') ||
    fullContext.includes('أتمتة');

  return {
    wantsCv,
    wantsCoding,
    wantsMarketing,
    wantsData,
    wantsVoice,
    wantsChatbot,
    wantsFileAnalysis,
    wantsAutomation,
    hasClearUseCase:
      wantsCv ||
      wantsCoding ||
      wantsMarketing ||
      wantsData ||
      wantsVoice ||
      wantsChatbot ||
      wantsFileAnalysis ||
      wantsAutomation,
    lastIntent: classification?.intent ?? null,
  };
}
  // =========================
  // 💬 REPLIES
  // =========================

  private buildContextAwareSmallTalkReply(
    language: Language,
    recentMessages: { role: string; content: string }[],
  ) {
    const hasConversation = recentMessages.length > 0;

    if (language === 'en') {
      return hasConversation
        ? "I'm here with you. Tell me what you want to build, analyze, or automate next."
        : "Hello, I'm IxON, your smart AI assistant. How can I help you today?";
    }

    return hasConversation
      ? 'أنا معك. احكيلي شو بدك نكمل، نبني، أو نحلل الآن؟'
      : 'مرحبًا، معك IxON المساعد الذكي. كيف بقدر أساعدك اليوم؟';
  }

  private buildSmartClarificationReply(language: Language, context: any) {
    if (context?.wantsVoice) {
      return language === 'en'
        ? 'Do you want the voice model for customer support, sales, or automation?'
        : 'هل تريد موديل الصوت لخدمة العملاء، المبيعات، أو الأتمتة؟';
    }

    if (context?.wantsFileAnalysis) {
      return language === 'en'
        ? 'What type of files do you want to analyze: PDF, invoices, reports, or documents?'
        : 'شو نوع الملفات اللي بدك تحللها: PDF، فواتير، تقارير، أو مستندات؟';
    }

    if (context?.wantsChatbot) {
      return language === 'en'
        ? 'Do you need the chatbot for customer support, sales, or internal use?'
        : 'هل تحتاج الشات بوت لخدمة العملاء، المبيعات، أو للاستخدام الداخلي؟';
    }

    return language === 'en'
      ? 'Do you need it for chat, voice, file analysis, automation, or customer support?'
      : 'هل تحتاجه للدردشة، الصوت، تحليل الملفات، الأتمتة، أو خدمة العملاء؟';
  }

  private buildModelReply(language: Language, modelName: string) {
    if (language === 'en') {
      return `I found a suitable AI model for your request: ${modelName}. I can show you its details, pricing, or help you start using it.`;
    }

    return `وجدت موديل مناسب لطلبك: ${modelName}. أقدر أعرض لك تفاصيله، السعر، أو أساعدك تبدأ باستخدامه.`;
  }

  // =========================
  // 🧩 HELPERS
  // =========================

  private detectLanguage(message: string): Language | null {
  const hasArabic = /[\u0600-\u06FF]/.test(message);
  const hasEnglish = /[a-zA-Z]/.test(message);

  if (hasArabic && hasEnglish) return 'mixed';
  if (hasArabic) return 'ar';
  if (hasEnglish) return 'en';

  return null;
}


  private normalize(value: string): string {
    return value
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // =========================
  // ⚙️ EXECUTE MODEL
  // =========================

  async executeModel(userId: string, dto: ExecuteModelDto) {
    const model = await this.prisma.aIModel.findUnique({
      where: { id: dto.modelId },
    });

    if (!model || !model.endpoint) {
      throw new Error('Model not available');
    }

    const response = await fetch(`http://127.0.0.1:8000${model.endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: dto.input }),
    });

    if (!response.ok) {
      return {
        model: model.name,
        executed: false,
        message: 'الموديل غير جاهز للتنفيذ حاليًا.',
        statusCode: response.status,
      };
    }

    const result = await response.json();

    await this.prisma.aIRequest.create({
      data: {
        userId,
        modelId: model.id,
        input: dto.input,
        output: JSON.stringify(result),
      },
    });

    return {
      model: model.name,
      executed: true,
      result,
    };
  }
}