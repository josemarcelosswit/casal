import React, { useState, useEffect } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer 
} from 'recharts';
import { 
  Wallet, TrendingUp, Plus, Trash2, Calendar, 
  ChevronLeft, ChevronRight, Receipt, History, Pencil
} from 'lucide-react';
import { format, subMonths, addMonths, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { motion } from 'motion/react';

import { 
  FinanceTransaction, TransactionType 
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
import { ScrollArea } from '@/components/ui/scroll-area';

const COLORS = ['#2563eb', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

export default function App() {
  const [loading, setLoading] = useState(true);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [transactions, setTransactions] = useState<FinanceTransaction[]>([]);
  const [periodicityFilter, setPeriodicityFilter] = useState<'all' | 'monthly' | 'yearly'>('all');
  
  // Load data from LocalStorage on mount
  useEffect(() => {
    const savedTransactions = localStorage.getItem('financas_cadal_transactions');
    const savedMonth = localStorage.getItem('financas_cadal_month');
    
    if (savedMonth) {
      setCurrentMonth(new Date(savedMonth));
    }

    if (savedTransactions) {
      setTransactions(JSON.parse(savedTransactions));
    }
    
    setLoading(false);
  }, []);

  // Save transactions to LocalStorage
  useEffect(() => {
    if (!loading) {
      localStorage.setItem('financas_cadal_transactions', JSON.stringify(transactions));
    }
  }, [transactions, loading]);

  // Save current month to LocalStorage
  useEffect(() => {
    if (!loading) {
      localStorage.setItem('financas_cadal_month', currentMonth.toISOString());
    }
  }, [currentMonth, loading]);

  const handleExportData = () => {
    const data = {
      transactions,
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
        if (data.transactions) {
          if (confirm('Isso irá substituir todos os seus dados atuais. Deseja continuar?')) {
            setTransactions(data.transactions);
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
    const trxDate = data.date ? parseISO(data.date) : new Date();
    const newTransaction: FinanceTransaction = {
      id: Math.random().toString(36).substr(2, 9),
      userId: 'local-user',
      type: data.type as TransactionType,
      amount: data.amount || 0,
      description: data.description || '',
      category: 'Geral',
      date: data.date || new Date().toISOString(),
      month: format(trxDate, 'yyyy-MM'),
      paid: data.paid !== undefined ? data.paid : true,
      periodicity: data.periodicity || 'monthly',
      createdAt: new Date().toISOString()
    };
    setTransactions(prev => [newTransaction, ...prev]);
  };

  const handleDeleteTransaction = (id: string) => {
    setTransactions(prev => prev.filter(t => t.id !== id));
  };

  const handleUpdateTransaction = (id: string, data: Partial<FinanceTransaction>) => {
    setTransactions(prev => prev.map(t => {
      if (t.id === id) {
        const updated = { ...t, ...data };
        if (data.date) {
          updated.month = format(parseISO(data.date), 'yyyy-MM');
        }
        return updated;
      }
      return t;
    }));
  };

  const changeMonth = (offset: number) => {
    setCurrentMonth(prev => offset > 0 ? addMonths(prev, 1) : subMonths(prev, 1));
  };

  // Filter transactions for current month
  const monthStr = format(currentMonth, 'yyyy-MM');
  const filteredTransactions = transactions
    .filter(t => t.month === monthStr)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const totals = filteredTransactions.reduce((acc, curr) => {
    if (curr.type === 'income') {
      acc.income += curr.amount;
      if (curr.paid === false) acc.unpaidIncome += curr.amount;
    } else {
      acc.expense += curr.amount;
      if (curr.paid === false) acc.unpaidExpense += curr.amount;
      if (curr.periodicity === 'yearly') {
        acc.yearlyExpense += curr.amount;
      } else {
        acc.monthlyExpense += curr.amount;
      }
    }
    return acc;
  }, { income: 0, expense: 0, unpaidIncome: 0, unpaidExpense: 0, monthlyExpense: 0, yearlyExpense: 0 });

  const balance = totals.income - totals.expense;

  const displayFilteredTransactions = filteredTransactions.filter(t => {
    if (periodicityFilter === 'all') return true;
    if (periodicityFilter === 'monthly') return t.periodicity !== 'yearly';
    if (periodicityFilter === 'yearly') return t.periodicity === 'yearly';
    return true;
  });

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
            subtext={totals.unpaidIncome > 0 ? `Pendente: R$ ${totals.unpaidIncome.toLocaleString('pt-BR')}` : 'Tudo recebido! ✅'}
          />
          <KPICard 
            label="Despesas Fixas" 
            amount={totals.expense} 
            color="slate" 
            subtext={`Mensais: R$ ${totals.monthlyExpense.toLocaleString('pt-BR')} • Anuais: R$ ${totals.yearlyExpense.toLocaleString('pt-BR')}`}
          />
          <KPICard 
            label="Saldo Restante" 
            amount={balance} 
            color={balance >= 0 ? "emerald" : "amber"} 
            subtext={totals.unpaidExpense > 0 ? `Falta quitar: R$ ${totals.unpaidExpense.toLocaleString('pt-BR')}` : 'Contas quitadas'}
          />
          <KPICard 
            label="Poupança" 
            amount={totals.income > 0 ? ((balance / totals.income) * 100) : 0} 
            color="blue" 
            isPercent
            subtext={balance > 0 ? 'Economia saudável' : 'Orçamento apertado'}
          />
        </section>

        <div className="grid grid-cols-12 gap-6 pb-8">
          <div className="col-span-12 lg:col-span-8 flex flex-col gap-6">
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
                  {/* Filtro de Periodicidade de Dívida */}
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-4 mb-4 gap-3">
                    <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 self-start shadow-inner">
                      <button
                        type="button"
                        onClick={() => setPeriodicityFilter('all')}
                        className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                          periodicityFilter === 'all' 
                            ? 'bg-white text-blue-600 shadow-xs' 
                            : 'text-slate-500 hover:text-slate-900'
                        }`}
                      >
                        Todos ({filteredTransactions.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setPeriodicityFilter('monthly')}
                        className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                          periodicityFilter === 'monthly' 
                            ? 'bg-white text-blue-600 shadow-xs' 
                            : 'text-slate-500 hover:text-slate-900'
                        }`}
                      >
                        Mensais ({filteredTransactions.filter(t => t.periodicity !== 'yearly').length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setPeriodicityFilter('yearly')}
                        className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                          periodicityFilter === 'yearly' 
                            ? 'bg-white text-blue-600 shadow-xs' 
                            : 'text-slate-500 hover:text-slate-900'
                        }`}
                      >
                        Anuais ({filteredTransactions.filter(t => t.periodicity === 'yearly').length})
                      </button>
                    </div>

                    <div className="flex items-center gap-4 text-xs font-semibold text-slate-500 px-1">
                      <span>Mensais: <strong className="text-slate-700 font-bold">R$ {totals.monthlyExpense.toLocaleString('pt-BR')}</strong></span>
                      <span className="text-slate-300">|</span>
                      <span>Anuais: <strong className="text-purple-600 font-bold">R$ {totals.yearlyExpense.toLocaleString('pt-BR')}</strong></span>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-slate-400 text-left border-b border-slate-100">
                          <th className="pb-3 px-2 font-semibold uppercase text-[10px] tracking-wider">Lançamento</th>
                          <th className="pb-3 px-2 font-semibold uppercase text-[10px] tracking-wider text-right">Valor</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {displayFilteredTransactions.length > 0 ? (
                          displayFilteredTransactions.map((t) => (
                            <tr key={t.id} className="group hover:bg-slate-50 transition-colors">
                              <td className="py-3 px-2">
                                <div className="flex items-center gap-3">
                                  {/* Clickable Circle Checklist Toggle */}
                                  <button
                                    onClick={() => handleUpdateTransaction(t.id, { paid: t.paid === false ? true : false })}
                                    className="flex-shrink-0 focus:outline-none transition-all active:scale-90"
                                    title={t.paid === false ? "Marcar como Pago" : "Marcar como Não Pago"}
                                  >
                                    {t.paid === false ? (
                                      <div className="w-5 h-5 rounded-full border-2 border-rose-400 bg-rose-50 hover:bg-rose-100 flex items-center justify-center text-rose-500 transition-colors cursor-pointer">
                                        <div className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-pulse" />
                                      </div>
                                    ) : (
                                      <div className="w-5 h-5 rounded-full border-2 border-emerald-500 bg-emerald-500 text-white hover:bg-emerald-600 flex items-center justify-center transition-colors cursor-pointer">
                                        <svg className="w-3.5 h-3.5 stroke-[3]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                        </svg>
                                      </div>
                                    )}
                                  </button>

                                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${t.type === 'income' ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-600'}`}>
                                    {t.type === 'income' ? <Plus className="h-4 w-4" /> : <div className="w-1.5 h-1.5 rounded-full bg-current" />}
                                  </div>
                                  <div>
                                    <p className={`font-bold text-slate-700 leading-tight ${t.paid === false ? 'text-slate-500 font-medium' : ''}`}>{t.description}</p>
                                    <div className="flex items-center gap-2 mt-0.5">
                                      <p className="text-[10px] text-slate-400 font-medium">{format(parseISO(t.date), 'dd MMM', { locale: ptBR })}</p>
                                      <span className={`text-[8px] font-extrabold px-1.5 py-0.5 rounded uppercase tracking-wider ${
                                        t.paid === false 
                                          ? 'bg-rose-50 text-rose-600 border border-rose-100' 
                                          : 'bg-emerald-50 text-emerald-600 border border-emerald-100'
                                      }`}>
                                        {t.type === 'income' 
                                          ? (t.paid === false ? 'A receber' : 'Recebido') 
                                          : (t.paid === false ? 'Não Pago' : 'Pago')}
                                      </span>
                                      <span className={`text-[8px] font-extrabold px-1.5 py-0.5 rounded uppercase tracking-wider ${
                                        t.periodicity === 'yearly'
                                          ? 'bg-purple-50 text-purple-600 border border-purple-100'
                                          : 'bg-slate-100 text-slate-600 border border-slate-150'
                                      }`}>
                                        {t.periodicity === 'yearly' ? 'Anual' : 'Mensal'}
                                      </span>
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
                                <div className="flex items-center justify-end gap-1">
                                  <EditTransactionDialog transaction={t} onUpdate={handleUpdateTransaction} />
                                  <Button 
                                    variant="ghost" 
                                    size="icon" 
                                    onClick={() => handleDeleteTransaction(t.id)}
                                    className="h-8 w-8 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
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

          <div className="col-span-12 lg:col-span-4 flex flex-col gap-6">
            <Card className="shadow-sm border-slate-200 rounded-2xl flex flex-col">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg font-bold flex items-center gap-2 font-heading">
                  <TrendingUp className="h-5 w-5 text-indigo-500" />
                  Visualização Financeira
                </CardTitle>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col px-6 pb-6">
                <div className="flex items-end justify-around gap-6 pb-4 mt-6 h-40">
                  <BarIndicator label="Receita" value={totals.income} total={Math.max(totals.income, totals.expense)} color="bg-emerald-500" />
                  <BarIndicator label="Fixos" value={totals.expense} total={Math.max(totals.income, totals.expense)} color="bg-slate-300" />
                  <BarIndicator label="Sobra" value={Math.max(0, balance)} total={Math.max(totals.income, totals.expense)} color="bg-blue-500" />
                </div>

                <div className="border-t border-slate-100 pt-4 mt-4 text-xs">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-3">Divisão das despesas</span>
                  
                  <div className="space-y-3">
                    <div>
                      <div className="flex justify-between font-semibold text-slate-600 mb-1">
                        <span>Dívidas Mensais</span>
                        <span>R$ {totals.monthlyExpense.toLocaleString('pt-BR')} ({totals.expense > 0 ? ((totals.monthlyExpense / totals.expense) * 100).toFixed(0) : 0}%)</span>
                      </div>
                      <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-slate-500 rounded-full" 
                          style={{ width: `${totals.expense > 0 ? (totals.monthlyExpense / totals.expense) * 100 : 0}%` }}
                        />
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between font-semibold text-slate-600 mb-1">
                        <span>Dívidas Anuais</span>
                        <span>R$ {totals.yearlyExpense.toLocaleString('pt-BR')} ({totals.expense > 0 ? ((totals.yearlyExpense / totals.expense) * 100).toFixed(0) : 0}%)</span>
                      </div>
                      <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-purple-500 rounded-full" 
                          style={{ width: `${totals.expense > 0 ? (totals.yearlyExpense / totals.expense) * 100 : 0}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
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

function KPICard({ label, amount, color, isPercent = false, subtext }: { label: string, amount: number, color: 'emerald' | 'slate' | 'amber' | 'blue', isPercent?: boolean, subtext?: string }) {
  const textColors = {
    emerald: 'text-emerald-600',
    slate: 'text-slate-800',
    amber: 'text-amber-600',
    blue: 'text-blue-600'
  };

  return (
    <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md hover:border-slate-300 transition-all flex flex-col justify-between min-h-[105px]">
      <div>
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
      {subtext && (
        <span className="text-[10px] font-semibold text-slate-400 mt-2 block border-t border-slate-50 pt-1.5">
          {subtext}
        </span>
      )}
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

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button className="bg-blue-600 hover:bg-blue-700 shadow-sm gap-2" />}>
        <Plus className="h-4 w-4" /> Novo Lançamento
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px] rounded-2xl border-none shadow-2xl">
        <DialogHeader>
          <DialogTitle className="font-heading text-xl">Adicionar Transação</DialogTitle>
        </DialogHeader>
        <TransactionForm 
          onSave={(data) => {
            onAdd(data);
            setOpen(false);
          }} 
        />
      </DialogContent>
    </Dialog>
  );
}

function EditTransactionDialog({ transaction, onUpdate }: { transaction: FinanceTransaction, onUpdate: (id: string, data: any) => void }) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={
        <Button 
          variant="ghost" 
          size="icon" 
          className="h-8 w-8 text-slate-300 hover:text-blue-500 hover:bg-blue-50 rounded-lg"
        />
      }>
        <Pencil className="h-4 w-4" />
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px] rounded-2xl border-none shadow-2xl">
        <DialogHeader>
          <DialogTitle className="font-heading text-xl">Editar Transação</DialogTitle>
        </DialogHeader>
        <TransactionForm 
          initialData={transaction}
          onSave={(data) => {
            onUpdate(transaction.id, data);
            setOpen(false);
          }} 
        />
      </DialogContent>
    </Dialog>
  );
}

function TransactionForm({ onSave, initialData }: { onSave: (data: any) => void, initialData?: FinanceTransaction }) {
  const [type, setType] = useState<TransactionType>(initialData?.type || 'expense');
  const [amount, setAmount] = useState(initialData?.amount.toString() || '');
  const [description, setDescription] = useState(initialData?.description || '');
  const [date, setDate] = useState(initialData ? format(parseISO(initialData.date), 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd'));
  const [paid, setPaid] = useState<boolean>(initialData ? initialData.paid !== false : true);
  const [periodicity, setPeriodicity] = useState<'monthly' | 'yearly'>(initialData?.periodicity || 'monthly');
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurringMonths, setRecurringMonths] = useState('1');

  const reset = () => {
    if (!initialData) {
      setAmount('');
      setDescription('');
      setPaid(true);
      setPeriodicity('monthly');
      setIsRecurring(false);
      setRecurringMonths('1');
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Improved number parsing for Brazilian format (handle comma as decimal)
    // If input type is "number", value is always dot-separated strings, but we handle just in case or for text inputs
    const cleanAmount = amount.replace(',', '.');
    const parsedAmount = parseFloat(cleanAmount);
    
    if (isNaN(parsedAmount)) return;

    if (!initialData && isRecurring && parseInt(recurringMonths) > 1) {
      const baseDate = new Date(date + 'T12:00:00');
      for (let i = 0; i < parseInt(recurringMonths); i++) {
        const nextDate = addMonths(baseDate, i);
        onSave({
          type,
          amount: parsedAmount,
          description: `${description} (${i + 1}/${recurringMonths})`,
          date: nextDate.toISOString(),
          paid: paid,
          periodicity: periodicity
        });
      }
    } else {
      onSave({
        type,
        amount: parsedAmount,
        description,
        date: new Date(date + 'T12:00:00').toISOString(),
        paid: paid,
        periodicity: periodicity
      });
    }
    
    reset();
  };

  return (
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

        {/* Periodicidade Selector */}
        <div className="grid gap-1.5">
          <Label className="text-[10px] font-bold uppercase text-slate-400 ml-1">Frequência / Periodicidade</Label>
          <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200">
            <button
              type="button"
              className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                periodicity === 'monthly' 
                  ? 'bg-white text-slate-800 shadow-xs font-bold' 
                  : 'text-slate-400 hover:text-slate-600'
              }`}
              onClick={() => setPeriodicity('monthly')}
            >
              {type === 'income' ? 'Mensal (Salário, Proventos)' : 'Mensal (Gasto de Rotina)'}
            </button>
            <button
              type="button"
              className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                periodicity === 'yearly' 
                  ? 'bg-white text-slate-800 shadow-xs font-bold' 
                  : 'text-slate-400 hover:text-slate-600'
              }`}
              onClick={() => setPeriodicity('yearly')}
            >
              {type === 'income' ? 'Anual (Bônus, 13º)' : 'Anual (IPVA, Seguros)'}
            </button>
          </div>
        </div>

        {/* Premium Status Toggle Switch */}
        <div className="flex items-center justify-between p-3.5 bg-slate-50 border border-slate-150 rounded-xl">
          <div className="flex flex-col">
            <span className="text-xs font-bold text-slate-700">
              {type === 'income' ? 'Valor já recebido?' : 'Valor já pago?'}
            </span>
            <span className="text-[10px] text-slate-400 font-medium">
              {type === 'income' 
                ? 'Marcar se a receita já foi recebida' 
                : 'Marcar se a conta já foi quitada'}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setPaid(!paid)}
            className={`w-12 h-7 rounded-full transition-colors relative p-1 duration-200 cursor-pointer ${
              paid ? 'bg-emerald-500' : 'bg-slate-300'
            }`}
          >
            <div
              className={`w-5 h-5 bg-white rounded-full shadow-sm flex items-center justify-center transition-transform duration-200 transform ${
                paid ? 'translate-x-[20px]' : 'translate-x-0'
              }`}
            >
              {paid ? (
                <svg className="w-3.5 h-3.5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <div className="w-1.5 h-1.5 rounded-full bg-slate-400" />
              )}
            </div>
          </button>
        </div>

        {!initialData && (
          <div className="space-y-3 pt-2">
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
        )}
      </div>

      <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 h-12 text-sm font-bold uppercase tracking-wider rounded-xl shadow-lg shadow-blue-100 mt-2">
        {initialData ? 'Atualizar Transação' : 'Salvar Transação'}
      </Button>
    </form>
  );
}
