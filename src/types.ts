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
}

export interface FinanceDebt {
  id: string;
  userId: string;
  name: string;
  totalAmount: number;
  remainingAmount: number;
  dueDate: string;
  interestRate?: number;
  createdAt: string;
}

export interface UserProfile {
  uid: string;
  email: string;
  displayName?: string;
  createdAt: string;
}
