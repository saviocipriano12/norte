import type { DraftEntry, Message, Movement } from './mockData';

export type AssistantProfile = 'personal' | 'freelancer' | 'business';

export type AssistantFinancialContext = {
  today: string;
  personalBalance: number;
  businessBalance: number;
  spendableToday: number;
  upcomingBillsTotal: number;
  upcomingBillsCount: number;
  overdueBillsCount: number;
  categorySpending: Array<{
    category: string;
    amount: number;
    movementCount: number;
  }>;
};

export type AssistantTurnRequest = {
  message: string;
  history: Message[];
  movements: Movement[];
  drafts: DraftEntry[];
  profile: AssistantProfile;
  selectedPain: string[];
  financialContext?: AssistantFinancialContext;
};

export type AssistantTurnResponse = {
  assistantMessage: string;
  drafts: DraftEntry[];
  speechText: string;
  responseId?: string | null;
};
