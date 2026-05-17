import React, { useState, useEffect } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer 
} from 'recharts';
import { 
  Wallet, TrendingDown, TrendingUp, Plus, Trash2, Calendar, 
  ChevronLeft, ChevronRight, LogOut, Receipt, History, Info,
  CheckCircle2, AlertCircle
} from 'lucide-react';
import { format, subMonths, addMonths, startOfMonth, endOfMonth, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { motion, AnimatePresence } from 'motion/react';

import { 
  FinanceTransaction, FinanceDebt, TransactionType 
} from './types';

import { Button } from '@/components/ui/button';
import { 
  Card, CardContent, CardDescription, CardHeader, CardTitle 
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger 
} from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';

const COLORS = ['#2563eb', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

export default function App() {
  const [loading, setLoading] = useState(true);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [transactions, setTransactions] = useState<FinanceTransaction[]>([]);
  const [debts, setDebts] = useState<FinanceDebt[]>([]);
  
  // Load data from LocalStorage on mount
  useEffect(() => {
    const savedTransactions = localStorage.getItem('financas_cadal_transactions');
    const savedDebts = localStorage.getItem('financas_cadal_debts');
    const savedMonth = localStorage.getItem('financas_cadal_month');
    
    if (savedMonth) {
      setCurrentMonth(new Date(savedMonth));
    }

    if (savedTransactions) {
      setTransactions(JSON.parse(savedTransactions));
    }
    
    if (savedDebts) {
      setDebts(JSON.parse(savedDebts));
    } else {
      // Add the requested apartment debt as initial data if nothing is saved
      const initialDebt: FinanceDebt = {
        id: 'initial-apt-debt',
        userId: 'local-user',
        name: 'Apartamento',
        totalAmount: 60000,
        remainingAmount: 60000,
        dueDate: format(addMonths(new Date(), 1), 'yyyy-MM-dd'),
        createdAt: new Date().toISOString()
      };
      setDebts([initialDebt]);
    }
    
    setLoading(false);
  }, []);

  // Save transactions to LocalStorage
  useEffect(() => {
    if (!loading) {
      localStorage.setItem('financas_cadal_transactions', JSON.stringify(transactions));
    }
  }, [transactions, loading]);

  // Save debts to LocalStorage
  useEffect(() => {
    if (!loading) {
      localStorage.setItem('financas_cadal_debts', JSON.stringify(debts));
    }
  }, [debts, loading]);

  // Save current month to LocalStorage
  useEffect(() => {
    if (!loading) {
      localStorage.setItem('financas_cadal_month', currentMonth.toISOString());
    }
  }, [currentMonth, loading]);

  const handleExportData = () => {
    const data = {
      transactions,
      debts,
      version: '1.0',
      exportedAt: new Date().toISOString()
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `financas_familia_backup_${format(new Date(), 'yyyy-MM-dd')}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleImportData = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target?.result as string);
        if (data.transactions && data.debts) {
          if (confirm('Isso irá substituir todos os seus dados atuais. Deseja continuar?')) {
            setTransactions(data.transactions);
            setDebts(data.debts);
          }
        } else {
          alert('Arquivo de backup inválido.');
        }
      } catch (err) {
        alert('Erro ao ler o arquivo de backup.');
      }
    };
    reader.readAsText(file);
  };

  const handleAddTransaction = (data: Partial<FinanceTransaction>) => {
    const newTransaction: FinanceTransaction = {
      id: Math.random().toString(36).substr(2, 9),
      userId: 'local-user',
      type: data.type as TransactionType,
      amount: data.amount || 0,
      description: data.description || '',
      category: 'Geral',
      date: data.date || new Date().toISOString(),
      month: (data as any).customMonth || format(currentMonth, 'yyyy-MM'),
      isSpouse: !!data.isSpouse,
      createdAt: new Date().toISOString()
    };
    setTransactions(prev => [newTransaction, ...prev]);
  };

  const handleDeleteTransaction = (id: string) => {
    setTransactions(prev => prev.filter(t => t.id !== id));
  };

  const handleAddDebt = (data: Partial<FinanceDebt>) => {
    const newDebt: FinanceDebt = {
      id: Math.random().toString(36).substr(2, 9),
      userId: 'local-user',
      name: data.name || '',
      totalAmount: data.totalAmount || 0,
      remainingAmount: data.remainingAmount || 0,
      dueDate: data.dueDate || new Date().toISOString(),
      createdAt: new Date().toISOString()
    };
    setDebts(prev => [newDebt, ...prev]);
  };

  const handleUpdateDebt = (id: string, amount: number) => {
    setDebts(prev => prev.map(d => d.id === id ? { ...d, remainingAmount: amount } : d));
  };

  const changeMonth = (offset: number) => {
    setCurrentMonth(prev => offset > 0 ? addMonths(prev, 1) : subMonths(prev, 1));
  };

  // Filter transactions for current month
  const monthStr = format(currentMonth, 'yyyy-MM');
  const filteredTransactions = transactions.filter(t => t.month === monthStr);

  const totals = filteredTransactions.reduce((acc, curr) => {
    if (curr.type === 'income') acc.income += curr.amount;
    else acc.expense += curr.amount;
    return acc;
  }, { income: 0, expense: 0 });

  const balance = totals.income - totals.expense;

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#F8FAFC]">
        <div className="animate-pulse flex flex-col items-center gap-4">
          <Wallet className="h-12 w-12 text-blue-600" />
          <p className="text-gray-500 font-medium">Carregando...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 font-sans flex flex-col">
      {/* Header */}
      <header className="h-16 bg-white border-b border-slate-200 sticky top-0 z-10 px-8 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center text-white shadow-sm">
            <Wallet className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-800 font-heading">Finanças Casal</h1>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              Gestão Mensal • {format(currentMonth, 'MMMM yyyy', { locale: ptBR })}
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-6">
          <div className="hidden md:flex flex-col items-end mr-4">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-tighter">Saldo Previsto</span>
            <span className={`font-bold text-xl font-heading ${balance >= 0 ? 'text-blue-600' : 'text-rose-600'}`}>
              R$ {balance.toLocaleString('pt-BR')}
            </span>
          </div>

          <div className="flex items-center bg-slate-100 rounded-xl p-1 shadow-inner border border-slate-200">
            <Button size="icon" variant="ghost" onClick={() => changeMonth(-1)} className="h-8 w-8 hover:bg-white hover:shadow-sm transition-all rounded-lg">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="px-3 text-xs font-bold min-w-[110px] text-center uppercase tracking-tight text-slate-600">
              {format(currentMonth, 'MMM yyyy', { locale: ptBR })}
            </span>
            <Button size="icon" variant="ghost" onClick={() => changeMonth(1)} className="h-8 w-8 hover:bg-white hover:shadow-sm transition-all rounded-lg">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          
          <Separator orientation="vertical" className="h-8 hidden sm:block" />
          
          <div className="bg-emerald-50 text-emerald-700 font-bold text-[10px] px-3 py-1.5 rounded-lg border border-emerald-100 uppercase tracking-wider shadow-sm flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Local
          </div>

          <div className="flex items-center gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleExportData}
              className="text-[10px] font-bold uppercase tracking-wider h-8 rounded-lg border-slate-200"
            >
              Exportar
            </Button>
            <div className="relative">
              <input
                type="file"
                id="import-data"
                className="hidden"
                accept=".json"
                onChange={handleImportData}
              />
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => document.getElementById('import-data')?.click()}
                className="text-[10px] font-bold uppercase tracking-wider h-8 rounded-lg border-slate-200"
              >
                Importar
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full p-6 space-y-6">
        {/* KPI Row */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KPICard 
            label="Renda Total" 
            amount={totals.income} 
            color="emerald" 
          />
          <KPICard 
            label="Despesas Fixas" 
            amount={totals.expense} 
            color="slate" 
          />
          <KPICard 
            label="Dívidas Ativas" 
            amount={debts.length > 0 ? debts.reduce((a, b) => a + b.remainingAmount, 0) : 0} 
            color="amber" 
          />
          <KPICard 
            label="Poupança" 
            amount={totals.income > 0 ? ((balance / totals.income) * 100) : 0} 
            color="blue" 
            isPercent
          />
        </section>

        <div className="grid grid-cols-12 gap-6 pb-8">
          <div className="col-span-12 lg:col-span-7 flex flex-col gap-6">
            <Card className="flex-1 shadow-sm border-slate-200 rounded-2xl overflow-hidden flex flex-col">
              <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                <h2 className="font-bold text-slate-700 flex items-center gap-2 font-heading">
                  <Receipt className="h-5 w-5 text-blue-500" />
                  Fluxo de Caixa Mensal
                </h2>
                <AddTransactionDialog onAdd={handleAddTransaction} />
              </div>
              
              <CardContent className="p-0 overflow-hidden flex flex-col">
                <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-4 bg-white">
                  <div className="p-4 bg-emerald-50/50 rounded-xl border border-emerald-100 flex flex-col justify-between">
                    <div>
                      <p className="text-[10px] text-emerald-700 font-bold uppercase tracking-wider mb-2">Entradas (R$)</p>
                      <div className="space-y-2">
                        {filteredTransactions.filter(t => t.type === 'income').slice(0, 2).map((t, i) => (
                          <div key={i} className="flex justify-between text-sm">
                            <span className="text-slate-500 truncate mr-2">{t.description}</span>
                            <span className="font-bold text-slate-700">R$ {t.amount.toLocaleString('pt-BR')}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 flex flex-col justify-between">
                    <div>
                      <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-2">Despesas (R$)</p>
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="text-slate-500">Média</span>
                          <span className="font-bold text-slate-700">R$ {filteredTransactions.length > 0 ? (totals.expense / (filteredTransactions.filter(t => t.type === 'expense').length || 1)).toLocaleString('pt-BR') : 0}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-slate-500">Lançamentos</span>
                          <span className="font-bold text-amber-600">{filteredTransactions.length} itens</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="p-4 flex-1">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-slate-400 text-left border-b border-slate-100">
                          <th className="pb-3 px-2 font-semibold uppercase text-[10px] tracking-wider">Lançamento</th>
                          <th className="pb-3 px-2 font-semibold uppercase text-[10px] tracking-wider text-right">Valor</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {filteredTransactions.length > 0 ? (
                          filteredTransactions.map((t) => (
                            <tr key={t.id} className="group hover:bg-slate-50 transition-colors">
                              <td className="py-3 px-2">
                                <div className="flex items-center gap-3">
                                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${t.type === 'income' ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-600'}`}>
                                    {t.type === 'income' ? <Plus className="h-4 w-4" /> : <div className="w-1.5 h-1.5 rounded-full bg-current" />}
                                  </div>
                                  <div>
                                    <p className="font-bold text-slate-700 leading-tight">{t.description}</p>
                                    <div className="flex items-center gap-2">
                                      <p className="text-[10px] text-slate-400 font-medium">{format(parseISO(t.date), 'dd MMM', { locale: ptBR })}</p>
                                      {t.isSpouse && <span className="text-[8px] bg-indigo-50 text-indigo-600 px-1 rounded uppercase font-bold border border-indigo-100">Cônjuge</span>}
                                    </div>
                                  </div>
                                </div>
                              </td>
                              <td className="py-3 px-2 text-right">
                                <span className={`font-bold tabular-nums ${t.type === 'income' ? 'text-emerald-600' : 'text-slate-800'}`}>
                                  {t.type === 'income' ? '' : '-'} R$ {t.amount.toLocaleString('pt-BR')}
                                </span>
                              </td>
                              <td className="py-3 pl-2 text-right opacity-0 group-hover:opacity-100 transition-opacity">
                                <Button 
                                  variant="ghost" 
                                  size="icon" 
                                  onClick={() => handleDeleteTransaction(t.id)}
                                  className="h-8 w-8 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={3} className="py-20 text-center">
                              <div className="flex flex-col items-center gap-2 opacity-20">
                                <History className="h-10 w-10 text-slate-400" />
                                <p className="font-bold uppercase text-xs tracking-widest">Sem lançamentos</p>
                              </div>
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="col-span-12 lg:col-span-5 flex flex-col gap-6">
            <Card className="shadow-sm border-slate-200 rounded-2xl md:h-[350px] flex flex-col">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg font-bold flex items-center gap-2 font-heading">
                  <TrendingUp className="h-5 w-5 text-indigo-500" />
                  Visualização Financeira
                </CardTitle>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col px-6">
                <div className="flex items-end justify-around gap-6 pb-4 mt-6 flex-1">
                  <BarIndicator label="Receita" value={totals.income} total={Math.max(totals.income, totals.expense)} color="bg-emerald-500" />
                  <BarIndicator label="Fixos" value={totals.expense} total={Math.max(totals.income, totals.expense)} color="bg-slate-300" />
                  <BarIndicator label="Ativos" value={debts.reduce((a, b) => a + b.remainingAmount, 0)} total={Math.max(totals.income, totals.expense)} color="bg-amber-400" />
                  <BarIndicator label="Livre" value={Math.max(0, balance)} total={Math.max(totals.income, totals.expense)} color="bg-blue-500" />
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-sm border-slate-200 rounded-2xl flex-1 flex flex-col min-h-[400px]">
              <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
                <h2 className="font-bold text-slate-700 flex items-center gap-2 font-heading">
                  <TrendingDown className="h-5 w-5 text-amber-500" />
                  Dívidas & Compromissos
                </h2>
                <Dialog>
                  <DialogTrigger asChild>
                    <Button variant="ghost" size="sm" className="font-bold text-[10px] text-blue-600 hover:text-blue-700 rounded-lg uppercase tracking-wider">
                      + Adicionar
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="rounded-2xl">
                    <DialogHeader>
                      <DialogTitle className="font-heading">Nova Dívida</DialogTitle>
                    </DialogHeader>
                    <DebtForm onAdd={handleAddDebt} />
                  </DialogContent>
                </Dialog>
              </div>
              <CardContent className="p-4 flex-1 overflow-hidden">
                <ScrollArea className="h-[350px] pr-4">
                  <div className="space-y-4">
                    {debts.length > 0 ? (
                      debts.map((debt) => (
                        <div key={debt.id} className="p-4 bg-white border border-slate-100 rounded-2xl hover:border-slate-200 hover:shadow-sm transition-all group">
                          <div className="flex justify-between items-start mb-3">
                            <div>
                              <span className="text-sm font-bold text-slate-700 block mb-0.5">{debt.name}</span>
                              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">
                                Vence em {format(parseISO(debt.dueDate), 'dd/MM/yyyy')}
                              </span>
                            </div>
                            <div className="text-right">
                              <p className="text-sm font-bold text-slate-900 leading-none mb-1">R$ {debt.remainingAmount.toLocaleString('pt-BR')}</p>
                              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tighter">Saldo Devedor</p>
                            </div>
                          </div>
                          
                          <div className="space-y-2">
                            <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                              <motion.div 
                                className="h-full bg-amber-500 rounded-full" 
                                initial={{ width: 0 }}
                                animate={{ width: `${Math.min(100, (1 - debt.remainingAmount / debt.totalAmount) * 100)}%` }}
                              />
                            </div>
                            <div className="flex justify-between text-[10px] font-bold text-slate-400 uppercase tracking-tighter">
                              <span>Quitação: {Math.max(0, ((1 - debt.remainingAmount / debt.totalAmount) * 100)).toFixed(0)}%</span>
                              <div className="flex gap-2">
                                <button 
                                  className="text-blue-600 hover:underline"
                                  onClick={() => {
                                    const newVal = prompt("Digite o novo saldo devedor:", debt.remainingAmount.toString());
                                    if (newVal !== null && !isNaN(parseFloat(newVal))) handleUpdateDebt(debt.id, parseFloat(newVal));
                                  }}
                                >
                                  Atualizar
                                </button>
                                <button 
                                  className="text-rose-500 hover:underline"
                                  onClick={() => {
                                    if (confirm("Deseja realmente excluir esta dívida?")) {
                                      setDebts(prev => prev.filter(d => d.id !== debt.id));
                                    }
                                  }}
                                >
                                  Excluir
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="py-20 text-center opacity-20">
                        <AlertCircle className="h-10 w-10 mx-auto text-slate-400 mb-2" />
                        <p className="font-bold uppercase text-[10px] tracking-widest">Sem dívidas registradas</p>
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>

      <footer className="h-12 bg-white border-t border-slate-200 px-8 flex items-center justify-between text-[10px] font-bold text-slate-400 uppercase tracking-widest">
        <div className="flex gap-6">
          <span>© 2026 Dashboard Financeiro</span>
          <span className="text-slate-300">|</span>
          <span className="hidden sm:inline">Modo Local Offline</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-500 ring-4 ring-blue-50"></span>
          <span className="text-blue-600">Dados Salvos no Navegador</span>
        </div>
      </footer>
    </div>
  );
}

function KPICard({ label, amount, color, isPercent = false }: { label: string, amount: number, color: 'emerald' | 'slate' | 'amber' | 'blue', isPercent?: boolean }) {
  const textColors = {
    emerald: 'text-emerald-600',
    slate: 'text-slate-800',
    amber: 'text-amber-600',
    blue: 'text-blue-600'
  };

  return (
    <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md hover:border-slate-300 transition-all">
      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">{label}</p>
      <div className="flex items-end gap-2">
        <p className={`text-2xl font-bold font-heading tabular-nums leading-none ${textColors[color]}`}>
          {isPercent ? `${amount.toFixed(0)}%` : `R$ ${amount.toLocaleString('pt-BR')}`}
        </p>
        {isPercent && (
           <div className="flex-1 h-2 bg-slate-50 border border-slate-100 rounded-full overflow-hidden mb-1">
            <motion.div 
              className="h-full bg-blue-500 rounded-full" 
              initial={{ width: 0 }}
              animate={{ width: `${Math.min(100, Math.max(0, amount))}%` }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function BarIndicator({ label, value, total, color }: { label: string, value: number, total: number, color: string }) {
  const heightPercent = total > 0 ? (value / total) * 100 : 0;
  
  return (
    <div className="flex flex-col items-center flex-1 h-full max-w-[60px]">
      <div className="relative flex-1 w-full bg-slate-50 rounded-t-xl overflow-hidden flex flex-col justify-end">
        <motion.div 
          className={`w-full ${color} rounded-t-lg shadow-sm`}
          initial={{ height: 0 }}
          animate={{ height: `${Math.min(100, heightPercent)}%` }}
          transition={{ duration: 0.8, ease: "easeOut" }}
        />
        <div className="absolute top-2 w-full text-center">
           <span className="text-[8px] font-bold text-slate-800 bg-white/50 backdrop-blur-xs px-1 rounded">
             {heightPercent.toFixed(0)}%
           </span>
        </div>
      </div>
      <span className="text-[9px] mt-2.5 font-bold text-slate-400 uppercase tracking-tighter">{label}</span>
    </div>
  );
}

function AddTransactionDialog({ onAdd }: { onAdd: (data: any) => void }) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<TransactionType>('expense');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [isSpouse, setIsSpouse] = useState(false);
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurringMonths, setRecurringMonths] = useState('1');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (isRecurring && parseInt(recurringMonths) > 1) {
      const baseDate = parseISO(date);
      for (let i = 0; i < parseInt(recurringMonths); i++) {
        const nextDate = addMonths(baseDate, i);
        onAdd({
          type,
          amount: parseFloat(amount),
          description: `${description} (${i + 1}/${recurringMonths})`,
          date: nextDate.toISOString(),
          isSpouse,
          customMonth: format(nextDate, 'yyyy-MM')
        });
      }
    } else {
      onAdd({
        type,
        amount: parseFloat(amount),
        description,
        date,
        isSpouse
      });
    }
    
    setOpen(false);
    reset();
  };

  const reset = () => {
    setAmount('');
    setDescription('');
    setIsSpouse(false);
    setIsRecurring(false);
    setRecurringMonths('1');
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="bg-blue-600 hover:bg-blue-700 shadow-sm gap-2">
          <Plus className="h-4 w-4" /> Novo Lançamento
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px] rounded-2xl border-none shadow-2xl">
        <DialogHeader>
          <DialogTitle className="font-heading text-xl">Adicionar Transação</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-6 mt-4">
          <div className="flex bg-slate-100 p-1 rounded-xl shadow-inner border border-slate-200">
            <button
              type="button"
              className={`flex-1 py-2 text-xs font-bold uppercase tracking-tight rounded-lg transition-all ${type === 'income' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-400'}`}
              onClick={() => setType('income')}
            >
              Receita
            </button>
            <button
              type="button"
              className={`flex-1 py-2 text-xs font-bold uppercase tracking-tight rounded-lg transition-all ${type === 'expense' ? 'bg-white text-rose-600 shadow-sm' : 'text-slate-400'}`}
              onClick={() => setType('expense')}
            >
              Despesa
            </button>
          </div>

          <div className="space-y-4">
            <div className="grid gap-1.5">
              <Label htmlFor="amount" className="text-[10px] font-bold uppercase text-slate-400 ml-1">Valor (R$)</Label>
              <Input 
                id="amount" 
                type="number" 
                placeholder="0,00" 
                required 
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="rounded-xl border-slate-200 h-11"
              />
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="description" className="text-[10px] font-bold uppercase text-slate-400 ml-1">Descrição</Label>
              <Input 
                id="description" 
                placeholder="Ex: Aluguel, Supermercado..." 
                required
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="rounded-xl border-slate-200 h-11"
              />
            </div>

            <div className="grid gap-4">
              <div className="grid gap-1.5">
                <Label htmlFor="date" className="text-[10px] font-bold uppercase text-slate-400 ml-1">Data</Label>
                <Input 
                  id="date" 
                  type="date" 
                  required
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="rounded-xl border-slate-200 h-11"
                />
              </div>
            </div>

            <div className="space-y-3 pt-2">
              <div className="flex items-center space-x-3 ml-1 cursor-pointer group">
                <input 
                  type="checkbox" 
                  id="spouse" 
                  checked={isSpouse}
                  onChange={(e) => setIsSpouse(e.target.checked)}
                  className="w-4 h-4 rounded-md border-slate-300 text-blue-600 focus:ring-blue-600 transition-colors"
                />
                <Label htmlFor="spouse" className="text-xs font-semibold text-slate-600 cursor-pointer group-hover:text-slate-900 transition-colors">
                  Esta é a renda do cônjuge?
                </Label>
              </div>

              <div className="flex items-center justify-between border-t border-slate-100 pt-3">
                <div className="flex items-center space-x-3 ml-1 cursor-pointer group">
                  <input 
                    type="checkbox" 
                    id="recurring" 
                    checked={isRecurring}
                    onChange={(e) => setIsRecurring(e.target.checked)}
                    className="w-4 h-4 rounded-md border-slate-300 text-blue-600 focus:ring-blue-600 transition-colors"
                  />
                  <Label htmlFor="recurring" className="text-xs font-semibold text-slate-600 cursor-pointer group-hover:text-slate-900 transition-colors">
                    Repetir mensalmente?
                  </Label>
                </div>
                
                {isRecurring && (
                  <div className="flex items-center gap-2">
                    <Label className="text-[10px] font-bold uppercase text-slate-400">Meses:</Label>
                    <Input 
                      type="number" 
                      min="2" 
                      max="48"
                      value={recurringMonths}
                      onChange={(e) => setRecurringMonths(e.target.value)}
                      className="w-16 h-8 text-xs rounded-lg text-center"
                    />
                  </div>
                )}
              </div>
            </div>
          </div>

          <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 h-12 text-sm font-bold uppercase tracking-wider rounded-xl shadow-lg shadow-blue-100 mt-2">Salvar Transação</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DebtForm({ onAdd }: { onAdd: (data: any) => void }) {
  const [name, setName] = useState('');
  const [total, setTotal] = useState('');
  const [remaining, setRemaining] = useState('');
  const [due, setDue] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onAdd({
      name,
      totalAmount: parseFloat(total),
      remainingAmount: parseFloat(remaining),
      dueDate: due
    });
    setName('');
    setTotal('');
    setRemaining('');
    setDue('');
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid gap-1.5">
        <Label className="text-[10px] font-bold uppercase text-slate-400 ml-1">Nome da Dívida</Label>
        <Input placeholder="Ex: Empréstimo, Carro..." required value={name} onChange={e => setName(e.target.value)} className="rounded-xl border-slate-200 h-11" />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="grid gap-1.5">
          <Label className="text-[10px] font-bold uppercase text-slate-400 ml-1">Valor Total (R$)</Label>
          <Input type="number" step="0.01" required value={total} onChange={e => setTotal(e.target.value)} className="rounded-xl border-slate-200 h-11" />
        </div>
        <div className="grid gap-1.5">
          <Label className="text-[10px] font-bold uppercase text-slate-400 ml-1">Saldo Atual (R$)</Label>
          <Input type="number" step="0.01" required value={remaining} onChange={e => setRemaining(e.target.value)} className="rounded-xl border-slate-200 h-11" />
        </div>
      </div>
      <div className="grid gap-1.5">
        <Label className="text-[10px] font-bold uppercase text-slate-400 ml-1">Data de Vencimento</Label>
        <Input type="date" required value={due} onChange={e => setDue(e.target.value)} className="rounded-xl border-slate-200 h-11" />
      </div>
      <Button type="submit" className="w-full bg-slate-900 hover:bg-slate-800 h-12 text-sm font-bold uppercase tracking-wider rounded-xl shadow-lg shadow-slate-100">Cadastrar Dívida</Button>
    </form>
  );
}
