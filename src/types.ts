export type TransactionType = 'income' | 'expense';

export interface FinanceTransaction {
  id: string;
  userId: string;
  type: TransactionType;
  category: string;
  amount: number;
  description: string;
  date: string; // ISO date
  month: string; // YYYY-MM
  createdAt: string;
  paid?: boolean;
  periodicity?: 'monthly' | 'yearly';
  recurrenceId?: string;
  customTag?: string;
}
