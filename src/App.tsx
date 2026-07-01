import React, { useState, useEffect } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer 
} from 'recharts';
import { 
  Wallet, TrendingUp, Plus, Trash2, Calendar, 
  ChevronLeft, ChevronRight, ChevronDown, Receipt, History, Pencil,
  Cloud, CloudOff, Loader2, LogIn, LogOut, Check, Info, AlertCircle, RefreshCw, Smartphone, Search
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
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger 
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';

import { auth, db, handleFirestoreError, OperationType } from './lib/firebase';
import { 
  collection, doc, setDoc, deleteDoc, updateDoc, 
  onSnapshot, query, writeBatch 
} from 'firebase/firestore';
import { 
  onAuthStateChanged, signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, User, signOut,
  GoogleAuthProvider, signInWithPopup
} from 'firebase/auth';

const COLORS = ['#2563eb', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

export const TAG_PRESETS = [
  { id: 'ganho', emoji: '📈', label: 'Ganho', bg: 'bg-emerald-50 text-emerald-700 border-emerald-100' },
  { id: 'perca', emoji: '📉', label: 'Perca', bg: 'bg-rose-50 text-rose-700 border-rose-100' },
  { id: 'jose', emoji: '🧔', label: 'José', bg: 'bg-indigo-50 text-indigo-700 border-indigo-100' },
  { id: 'ster', emoji: '🤓', label: 'Ster (Óculos)', bg: 'bg-amber-50 text-amber-700 border-amber-100' },
  { id: 'cacheada', emoji: '👩‍🦱', label: 'Black Ruivo', bg: 'bg-purple-50 text-purple-700 border-purple-100' },
];

function safeParseDate(dateVal: any): Date {
  if (!dateVal) return new Date();
  if (dateVal instanceof Date) {
    return isNaN(dateVal.getTime()) ? new Date() : dateVal;
  }
  // Handle Firestore Timestamp object
  if (dateVal && typeof dateVal === 'object' && 'seconds' in dateVal) {
    return new Date((dateVal.seconds || 0) * 1000);
  }
  try {
    const parsed = parseISO(String(dateVal));
    if (!isNaN(parsed.getTime())) return parsed;
  } catch (e) {}
  
  const d = new Date(dateVal);
  if (!isNaN(d.getTime())) return d;
  
  return new Date();
}

function getRelatedTransactions(target: FinanceTransaction, allTransactions: FinanceTransaction[]): FinanceTransaction[] {
  if (!target) return [];
  if (target.recurrenceId) {
    return allTransactions.filter(t => t && t.recurrenceId === target.recurrenceId);
  }
  
  // Custom helper to clean descriptions like "(1/12)" or "(Mês 1/12)" to group old elements
  const cleanDesc = (desc: string): string => {
    if (!desc) return '';
    return desc.replace(/\s*\(\d+\/\d+\)$/, '').replace(/\s*\(Mês\s*\d+\/\d+\)$/, '').trim();
  };
  
  const targetDesc = target.description || '';
  const targetClean = cleanDesc(targetDesc);
  
  if (targetClean !== targetDesc.trim()) {
    return allTransactions.filter(t => {
      if (!t) return false;
      const tDesc = t.description || '';
      return t.type === target.type && 
             t.amount === target.amount && 
             cleanDesc(tDesc) === targetClean;
    });
  }
  
  return [target];
}

export default function App() {
  const [loading, setLoading] = useState(true);
  const [currentMonth, setCurrentMonth] = useState(new Date());

  // Generate list of 24 months around the current date for the dropdown selector
  const selectOptions = React.useMemo(() => {
    const list = Array.from({ length: 25 }, (_, i) => {
      const d = addMonths(new Date(), i - 12);
      return {
        value: format(d, 'yyyy-MM'),
        label: format(d, 'MMMM yyyy', { locale: ptBR }),
      };
    });
    
    // Check if the current selected month is in the list
    const currentFormatted = format(currentMonth, 'yyyy-MM');
    const exists = list.some(item => item.value === currentFormatted);
    if (!exists) {
      list.push({
        value: currentFormatted,
        label: format(currentMonth, 'MMMM yyyy', { locale: ptBR })
      });
      list.sort((a, b) => a.value.localeCompare(b.value));
    }
    return list;
  }, [currentMonth]);

  const handleSelectMonthChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value; // "yyyy-MM"
    const parsed = safeParseDate(`${val}-15`);
    setCurrentMonth(parsed);
  };
  const [transactions, setTransactions] = useState<FinanceTransaction[]>([]);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [transactionToDelete, setTransactionToDelete] = useState<FinanceTransaction | null>(null);
  const [relatedTransactions, setRelatedTransactions] = useState<FinanceTransaction[]>([]);
  const [periodicityFilter, setPeriodicityFilter] = useState<'all' | 'monthly' | 'yearly'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Authentication & Cloud Sync states
  const [user, setUser] = useState<User | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [authError, setAuthError] = useState('');
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [submittingAuth, setSubmittingAuth] = useState(false);
  
  const [isIframe, setIsIframe] = useState(false);

  // Authenticated state & Real-time Sync
  useEffect(() => {
    try {
      setIsIframe(window.self !== window.top);
    } catch (e) {
      setIsIframe(true);
    }

    // Sync current month state from LocalStorage on mount
    try {
      const savedMonth = localStorage.getItem('financas_cadal_month');
      if (savedMonth) {
        setCurrentMonth(safeParseDate(savedMonth));
      }
    } catch (e) {
      console.error("Error loading saved month:", e);
    }

    const unsubscribeAuth = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      
      if (!currentUser) {
        // No user authenticated: fallback to LocalStorage
        setLoading(true);
        setIsSyncing(true);
        try {
          const savedTransactions = localStorage.getItem('financas_cadal_transactions');
          if (savedTransactions) {
            setTransactions(JSON.parse(savedTransactions));
          } else {
            setTransactions([]);
          }
        } catch (err) {
          console.error("Error reading local transactions:", err);
          setTransactions([]);
        }
        setLoading(false);
        setIsSyncing(false);
      }
    });

    return () => {
      unsubscribeAuth();
    };
  }, []);

  // Manage Firestore subscription and migration when user logs in/out
  useEffect(() => {
    if (!user) return;

    setLoading(true);
    setIsSyncing(true);

    let unsubscribeFirestore: (() => void) | null = null;

    const initializeCloudSync = async () => {
      // 1. Check & Migrate Any Local Transactions to Cloud Automatically
      try {
        const savedLocal = localStorage.getItem('financas_cadal_transactions');
        if (savedLocal) {
          const localTrxs = JSON.parse(savedLocal) as FinanceTransaction[];
          if (localTrxs.length > 0) {
            const batch = writeBatch(db);
            localTrxs.forEach((t) => {
              const docRef = doc(db, 'users', user.uid, 'transactions', t.id);
              batch.set(docRef, {
                userId: user.uid,
                type: t.type,
                amount: t.amount,
                category: t.category || 'Geral',
                description: t.description || '',
                date: t.date || new Date().toISOString(),
                month: t.month || format(new Date(), 'yyyy-MM'),
                createdAt: t.createdAt || new Date().toISOString(),
                paid: t.paid !== undefined ? t.paid : true,
                periodicity: t.periodicity || 'monthly',
                customTag: t.customTag || ''
              });
            });
            try {
              await batch.commit();
            } catch (writeErr) {
              handleFirestoreError(writeErr, OperationType.WRITE, `users/${user.uid}/transactions`);
            }
            try {
              localStorage.removeItem('financas_cadal_transactions');
            } catch (e) {}
          }
        }
      } catch (migrateErr) {
        console.error("Migration error:", migrateErr);
      }

      // 2. Subscribe to Firestore Real-time Transactions from '/users/{userId}/transactions'
      const q = query(collection(db, 'users', user.uid, 'transactions'));
      unsubscribeFirestore = onSnapshot(q, (snapshot) => {
        const cloudTransactions: FinanceTransaction[] = [];
        snapshot.forEach((doc) => {
          cloudTransactions.push({ id: doc.id, ...doc.data() } as FinanceTransaction);
        });
        // Sort by date descending
        cloudTransactions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        setTransactions(cloudTransactions);
        setLoading(false);
        setIsSyncing(false);
      }, (err) => {
        handleFirestoreError(err, OperationType.GET, `users/${user.uid}/transactions`);
        setLoading(false);
        setIsSyncing(false);
      });
    };

    initializeCloudSync();

    return () => {
      if (unsubscribeFirestore) {
        unsubscribeFirestore();
      }
    };
  }, [user]);

  // Save guest transactions only when not authenticated
  useEffect(() => {
    if (!loading && !user) {
      try {
        localStorage.setItem('financas_cadal_transactions', JSON.stringify(transactions));
      } catch (err) {
        console.error("Error saving transactions to localStorage:", err);
      }
    }
  }, [transactions, loading, user]);

  // Save current month to LocalStorage (works for both guests & authenticated users)
  useEffect(() => {
    if (!loading) {
      try {
        localStorage.setItem('financas_cadal_month', currentMonth.toISOString());
      } catch (err) {
        console.error("Error saving month to localStorage:", err);
      }
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

  const handleImportData = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const data = JSON.parse(event.target?.result as string);
        if (data.transactions) {
          if (confirm('Isso irá substituir todos os seus dados atuais. Deseja continuar?')) {
            if (user) {
              setLoading(true);
              try {
                // Delete existing ones first or write new ones in batch
                const batch = writeBatch(db);
                // Also create/import new ones
                data.transactions.forEach((t: any) => {
                  const docRef = doc(db, 'users', user.uid, 'transactions', t.id || Math.random().toString(36).substr(2, 9));
                  batch.set(docRef, {
                    userId: user.uid,
                    type: t.type,
                    amount: t.amount,
                    category: t.category || 'Geral',
                    description: t.description || '',
                    date: t.date || new Date().toISOString(),
                    month: t.month || format(new Date(), 'yyyy-MM'),
                    createdAt: t.createdAt || new Date().toISOString(),
                    paid: t.paid !== undefined ? t.paid : true,
                    periodicity: t.periodicity || 'monthly',
                    customTag: t.customTag || ''
                  });
                });
                try {
                  await batch.commit();
                } catch (batchErr) {
                  handleFirestoreError(batchErr, OperationType.WRITE, `users/${user.uid}/transactions`);
                }
              } catch (migrateErr) {
                console.error("Import cloud write error:", migrateErr);
                alert("Erro ao importar dados na nuvem.");
              } finally {
                setLoading(false);
              }
            } else {
              setTransactions(data.transactions);
            }
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

  const handleAddTransaction = async (data: Partial<FinanceTransaction>) => {
    const trxDate = data.date ? safeParseDate(data.date) : new Date();
    const newId = Math.random().toString(36).substr(2, 9);
    const newTransaction: FinanceTransaction = {
      id: newId,
      userId: user ? user.uid : 'local-user',
      type: data.type as TransactionType,
      amount: data.amount || 0,
      description: data.description || '',
      category: 'Geral',
      date: data.date || new Date().toISOString(),
      month: format(trxDate, 'yyyy-MM'),
      paid: data.paid !== undefined ? data.paid : true,
      periodicity: data.periodicity || 'monthly',
      recurrenceId: data.recurrenceId || undefined,
      customTag: data.customTag || '',
      createdAt: new Date().toISOString()
    };

    if (user) {
      try {
        await setDoc(doc(db, 'users', user.uid, 'transactions', newId), newTransaction);
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, `users/${user.uid}/transactions/${newId}`);
      }
    } else {
      setTransactions(prev => [newTransaction, ...prev]);
    }
  };

  const handleDeleteTransaction = async (id: string) => {
    if (!id) {
      console.warn("handleDeleteTransaction called with empty/missing id");
      return;
    }
    if (user) {
      try {
        await deleteDoc(doc(db, 'users', user.uid, 'transactions', id));
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, `users/${user.uid}/transactions/${id}`);
      }
    } else {
      setTransactions(prev => prev.filter(t => t && t.id && t.id !== id));
    }
  };

  const onInitiateDelete = (t: FinanceTransaction) => {
    if (!t) return;
    try {
      const related = getRelatedTransactions(t, transactions);
      if (related && related.length > 1) {
        setTransactionToDelete(t);
        setRelatedTransactions(related);
        setDeleteConfirmOpen(true);
      } else {
        handleDeleteTransaction(t.id);
      }
    } catch (err) {
      console.error("Error initiating transaction delete:", err);
    }
  };

  const confirmDeleteSingle = async () => {
    if (!transactionToDelete) return;
    try {
      await handleDeleteTransaction(transactionToDelete.id);
    } catch (err) {
      console.error("Error in confirmDeleteSingle:", err);
    } finally {
      setDeleteConfirmOpen(false);
      setTransactionToDelete(null);
      setRelatedTransactions([]);
    }
  };

  const confirmDeleteAll = async () => {
    if (!transactionToDelete || !relatedTransactions || relatedTransactions.length === 0) return;
    
    try {
      if (user) {
        const batch = writeBatch(db);
        relatedTransactions.forEach(t => {
          if (t && t.id) {
            batch.delete(doc(db, 'users', user.uid, 'transactions', t.id));
          }
        });
        try {
          await batch.commit();
        } catch (batchErr) {
          handleFirestoreError(batchErr, OperationType.WRITE, `users/${user.uid}/transactions`);
        }
      } else {
        const idsToDelete = new Set(relatedTransactions.filter(t => t && t.id).map(t => t.id));
        setTransactions(prev => prev.filter(t => t && t.id && !idsToDelete.has(t.id)));
      }
    } catch (err) {
      console.error("Error in confirmDeleteAll:", err);
    } finally {
      setDeleteConfirmOpen(false);
      setTransactionToDelete(null);
      setRelatedTransactions([]);
    }
  };

  const handleUpdateTransaction = async (id: string, data: Partial<FinanceTransaction>) => {
    const updatedData: Record<string, any> = { ...data };
    if (data.date) {
      updatedData.month = format(safeParseDate(data.date), 'yyyy-MM');
    }

    if (user) {
      try {
        await setDoc(doc(db, 'users', user.uid, 'transactions', id), updatedData, { merge: true });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `users/${user.uid}/transactions/${id}`);
      }
    } else {
      setTransactions(prev => prev.map(t => {
        if (t.id === id) {
          const updated = { ...t, ...data };
          if (data.date) {
            updated.month = format(safeParseDate(data.date), 'yyyy-MM');
          }
          return updated;
        }
        return t;
      }));
    }
  };

  const changeMonth = (offset: number) => {
    setCurrentMonth(prev => offset > 0 ? addMonths(prev, 1) : subMonths(prev, 1));
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    if (!authEmail || !authPassword) {
      setAuthError('Preencha os campos de E-mail ou Usuário e Senha.');
      return;
    }
    
    const emailStr = authEmail.trim().toLowerCase();
    const finalEmail = emailStr.includes('@') ? emailStr : `${emailStr}@financas.com`;
    const finalPassword = authPassword.length < 6 ? authPassword.padEnd(6, '0') : authPassword;

    setSubmittingAuth(true);
    try {
      if (authMode === 'login') {
        try {
          await signInWithEmailAndPassword(auth, finalEmail, finalPassword);
        } catch (err: any) {
          if (err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential') {
            // Se o usuário não existe ainda, cria a conta na hora de forma mágica e silenciosa!
            await createUserWithEmailAndPassword(auth, finalEmail, finalPassword);
          } else {
            throw err;
          }
        }
      } else {
        await createUserWithEmailAndPassword(auth, finalEmail, finalPassword);
      }
      setAuthModalOpen(false);
      setAuthEmail('');
      setAuthPassword('');
    } catch (err: any) {
      console.error("Auth error:", err);
      if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        setAuthError('E-mail ou senha incorretos.');
      } else if (err.code === 'auth/email-already-in-use') {
        setAuthError('Este endereço de e-mail já está sendo utilizado.');
      } else if (err.code === 'auth/invalid-email') {
        setAuthError('Formato de e-mail ou usuário inválido.');
      } else if (err.code === 'auth/weak-password') {
        setAuthError('A senha precisa conter no mínimo 6 caracteres.');
      } else {
        setAuthError('Erro na autenticação. Verifique sua conexão.');
      }
    } finally {
      setSubmittingAuth(false);
    }
  };

  const handleLogout = async () => {
    if (confirm('Deseja realmente sair da nuvem? Suas informações continuam salvas em segurança para acesso posterior.')) {
      setLoading(true);
      try {
        await signOut(auth);
      } catch (err) {
        console.error("Logout error:", err);
        setLoading(false);
      }
    }
  };

  // Filter transactions for current month
  const monthStr = format(currentMonth, 'yyyy-MM');
  const filteredTransactions = transactions
    .filter(t => t && t.month === monthStr)
    .sort((a, b) => {
      if (!a) return 1;
      if (!b) return -1;
      
      // 'income' (ganho) always on top, 'expense' (perca) always on bottom
      if (a.type === 'income' && b.type === 'expense') return -1;
      if (a.type === 'expense' && b.type === 'income') return 1;
      
      // If same type, sort by date descending
      const aTime = a.date ? new Date(a.date).getTime() : 0;
      const bTime = b.date ? new Date(b.date).getTime() : 0;
      return bTime - aTime;
    });

  const totals = filteredTransactions.reduce((acc, curr) => {
    if (curr) {
      if (curr.type === 'income') {
        acc.income += curr.amount || 0;
        if (curr.paid === false) acc.unpaidIncome += curr.amount || 0;
      } else {
        acc.expense += curr.amount || 0;
        if (curr.paid === false) acc.unpaidExpense += curr.amount || 0;
        if (curr.periodicity === 'yearly') {
          acc.yearlyExpense += curr.amount || 0;
        } else {
          acc.monthlyExpense += curr.amount || 0;
        }
      }
    }
    return acc;
  }, { income: 0, expense: 0, unpaidIncome: 0, unpaidExpense: 0, monthlyExpense: 0, yearlyExpense: 0 });

  const balance = totals.income - totals.expense;

  const displayFilteredTransactions = filteredTransactions.filter(t => {
    if (!t) return false;
    
    // 1. Periodicity filter
    let matchesPeriodicity = true;
    if (periodicityFilter === 'monthly') {
      matchesPeriodicity = t.periodicity !== 'yearly';
    } else if (periodicityFilter === 'yearly') {
      matchesPeriodicity = t.periodicity === 'yearly';
    }
    
    // 2. Search query filter
    let matchesSearch = true;
    if (searchQuery.trim() !== '') {
      const q = searchQuery.toLowerCase();
      const desc = (t.description || '').toLowerCase();
      const tag = (t.customTag || '').toLowerCase();
      
      // Map tag ID to its label for easy searching
      let tagLabel = '';
      if (tag === 'jose') tagLabel = 'josé';
      else if (tag === 'ster') tagLabel = 'ster óculos';
      else if (tag === 'cacheada') tagLabel = 'black ruivo';
      else if (tag === 'ganho') tagLabel = 'ganho';
      else if (tag === 'perca') tagLabel = 'perca';
      
      matchesSearch = desc.includes(q) || tag.includes(q) || tagLabel.includes(q);
    }
    
    return matchesPeriodicity && matchesSearch;
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
    <div className="min-h-screen bg-[#FAFBFD] text-slate-800 font-sans flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-slate-100/80 sticky top-0 z-20 px-4 sm:px-8 py-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center justify-between w-full md:w-auto">
          <div className="flex items-center gap-3">
            <span className="font-heading tracking-tight text-xl font-light text-slate-400">
              finanças<span className="font-bold text-slate-800">casal</span>
            </span>
            <div className="h-4 w-[1px] bg-slate-200" />
            <span className="text-[10px] bg-blue-50 text-blue-700 font-semibold px-2 py-0.5 rounded-full uppercase tracking-wider font-heading">
              {format(currentMonth, 'MMMM yyyy', { locale: ptBR })}
            </span>
          </div>
        </div>
        
        {/* Actions / Switches */}
        <div className="flex items-center justify-between md:justify-end gap-3 sm:gap-4 w-full md:w-auto mt-0.5 md:mt-0">
          {/* Saldo previsto Capsule */}
          <div className="flex items-center gap-1.5 bg-slate-50/50 border border-slate-100 rounded-lg p-1 px-2.5">
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Previsto</span>
            <span className={`font-semibold text-xs font-heading ${balance >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
              R$ {balance.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {/* Month selector controls - beautiful & low profile */}
            <div className="flex items-center bg-slate-50/50 border border-slate-100 rounded-lg p-0.5">
              <Button 
                size="icon" 
                variant="ghost" 
                type="button"
                onClick={() => changeMonth(-1)} 
                className="h-7 w-7 hover:bg-white hover:text-blue-600 rounded-md cursor-pointer text-slate-400 transition-all"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              
              <div className="relative flex items-center bg-transparent">
                <select
                  value={format(currentMonth, 'yyyy-MM')}
                  onChange={handleSelectMonthChange}
                  className="appearance-none bg-transparent pl-2.5 pr-6 py-1 text-[11px] font-bold uppercase tracking-wider text-slate-600 hover:text-blue-600 rounded-md cursor-pointer focus:outline-none min-w-[90px] text-center shrink-0 transition-colors"
                  title="Selecione o mês"
                >
                  {selectOptions.map((opt) => (
                    <option key={opt.value} value={opt.value} className="text-slate-600 normal-case bg-white font-medium text-xs">
                      {opt.label.charAt(0).toUpperCase() + opt.label.slice(1)}
                    </option>
                  ))}
                </select>
                <ChevronDown className="h-3 w-3 text-slate-400 absolute right-1 pointer-events-none" />
              </div>
              
              <Button 
                size="icon" 
                variant="ghost" 
                type="button"
                onClick={() => changeMonth(1)} 
                className="h-7 w-7 hover:bg-white hover:text-blue-600 rounded-md cursor-pointer text-slate-400 transition-all"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
            
            {/* Cloud and Backup controls */}
            <div className="flex items-center gap-2">
              {user ? (
                <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-100 p-0.5 rounded-lg pl-2">
                  <div className="flex items-center gap-1 text-[9px] font-bold text-emerald-600 uppercase tracking-wider">
                    <Cloud className="h-3 w-3 text-emerald-500 shrink-0" />
                    <span className="hidden sm:inline">Sincronizado</span>
                  </div>
                  <span className="text-[10px] font-semibold text-slate-500 max-w-[70px] sm:max-w-[100px] truncate" title={user.email || ''}>
                    {user.email?.endsWith('@financas.com') ? user.email.split('@')[0] : user.email}
                  </span>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    type="button"
                    onClick={handleLogout} 
                    title="Sair da Conta (Nuvem)"
                    className="h-6 w-6 hover:bg-white rounded-md text-slate-450 hover:text-rose-600 transition-all cursor-pointer"
                  >
                    <LogOut className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ) : (
                <Button 
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setAuthModalOpen(true)}
                  className="bg-slate-50 hover:bg-slate-100 text-slate-600 border border-slate-200/65 font-bold text-[9px] px-2.5 h-8 rounded-lg uppercase tracking-wider flex items-center gap-1.5 cursor-pointer shadow-xs transition-all shrink-0"
                >
                  <CloudOff className="h-3 w-3 text-slate-400 shrink-0" />
                  Nuvem
                </Button>
              )}
            </div>
            
            <div className="hidden sm:flex items-center gap-1">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleExportData}
                className="text-[9px] font-bold uppercase tracking-wider h-8 rounded-lg border-slate-200 hover:bg-slate-50 cursor-pointer"
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
                  className="text-[9px] font-bold uppercase tracking-wider h-8 rounded-lg border-slate-200 hover:bg-slate-50 cursor-pointer"
                >
                  Importar
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Auth Sincronizar Modal */}
        <Dialog open={authModalOpen && !user} onOpenChange={setAuthModalOpen}>
          <DialogContent className="sm:max-w-[420px] rounded-2xl border-slate-200 bg-white shadow-2xl p-5">
            <DialogHeader>
              <DialogTitle className="text-xl font-bold flex items-center gap-2">
                <Cloud className="h-6 w-6 text-blue-600 animate-bounce animate-duration-1000" />
                Sincronizar com Nuvem
              </DialogTitle>
              <DialogDescription className="text-slate-500 text-xs mt-1">
                Guarde suas receitas e despesas na na nuvem para não perder nada e acessar do seu celular ou do computador de forma sincronizada!
              </DialogDescription>
            </DialogHeader>

            {authError && (
              <div className="bg-rose-50 border border-rose-150 rounded-xl p-3 flex items-start gap-2.5 text-xs text-rose-600 animate-shake">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>{authError}</span>
              </div>
            )}

            {/* Direct Help Banner for specific credentials */}
            <div className="bg-blue-50/80 p-3 rounded-xl border border-blue-100 text-xs text-blue-700 space-y-1">
              <span className="font-bold flex items-center gap-1">🔑 Acesso Sincronizado:</span>
              <p className="text-[11px] leading-relaxed text-blue-600 font-medium">
                Digite o usuário <strong className="font-extrabold bg-white px-1.5 py-0.5 rounded border border-blue-200 text-blue-700">cerveja</strong> e a sua senha cadastrada no campo correspondente!
              </p>
            </div>

            {isIframe && (
              <div className="bg-amber-50/90 border border-amber-150 p-3 rounded-xl text-[11px] text-amber-800 space-y-2 leading-relaxed">
                <span className="font-extrabold flex items-center gap-1 text-amber-900">💡 Dica Importante para Celular:</span>
                <p>
                  Para não precisar logar de novo ao atualizar a página no celular, use o link direto do app fora do chat:
                </p>
                <div className="flex gap-2">
                  <input 
                    type="text" 
                    readOnly 
                    value={window.location.href} 
                    className="bg-white border border-amber-200 rounded px-2 py-1 text-[10px] select-all font-mono flex-1 text-slate-700"
                    id="direct-app-link"
                  />
                  <Button 
                    type="button"
                    size="sm" 
                    className="h-7 text-[10px] bg-amber-600 hover:bg-amber-700 text-white font-bold px-2 rounded cursor-pointer animate-pulse hover:animate-none"
                    onClick={() => {
                      const el = document.getElementById('direct-app-link') as HTMLInputElement;
                      if (el) {
                        el.select();
                        navigator.clipboard.writeText(el.value);
                        alert('Link copiado! Abra no Safari ou Chrome do celular.');
                      }
                    }}
                  >
                    Copiar
                  </Button>
                </div>
              </div>
            )}

            <form onSubmit={handleEmailAuth} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="auth-email-global" className="text-[10px] font-bold uppercase text-slate-400">E-mail ou Usuário</Label>
                <Input
                  id="auth-email-global"
                  type="text"
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                  placeholder="Ex: cerveja ou seu e-mail"
                  className="rounded-xl border-slate-250 focus-visible:ring-blue-500/25 focus-visible:border-blue-500 placeholder:text-slate-350 bg-white"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="auth-password-global" className="text-[10px] font-bold uppercase text-slate-400">Senha</Label>
                <Input
                  id="auth-password-global"
                  type="password"
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  placeholder="Sua senha secreta"
                  className="rounded-xl border-slate-250 focus-visible:ring-blue-500/25 focus-visible:border-blue-500 bg-white"
                  required
                />
              </div>

              <Button
                type="submit"
                disabled={submittingAuth}
                className="w-full h-11 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-md cursor-pointer transition-all flex items-center justify-center gap-2"
              >
                {submittingAuth ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <LogIn className="h-4 w-4" />
                )}
                Entrar e Sincronizar
              </Button>
            </form>

            <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-150 text-[10px] text-slate-500 font-semibold space-y-1 text-center">
              <span className="flex items-center justify-center gap-1.5"><Smartphone className="h-3.5 w-3.5 text-blue-500 shrink-0" /> Perfeito para usar no celular e PC!</span>
              <span className="flex items-center justify-center gap-1.5 text-emerald-600"><Check className="h-3.5 w-3.5 text-emerald-500 shrink-0" /> Seus dados atuais migram automaticamente!</span>
            </div>
          </DialogContent>
        </Dialog>

        {/* Modal de Confirmação de Exclusão de Lançamento Recorrente */}
        <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
          <DialogContent className="sm:max-w-[440px] max-w-[95%] rounded-lg border border-slate-200 shadow-2xl p-5 bg-white">
            <DialogHeader className="pb-2 border-b border-slate-100">
              <DialogTitle className="font-heading text-lg font-bold text-slate-800 flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-amber-500" />
                Excluir Lançamento Recorrente
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-3 text-slate-600 text-sm">
              <p>
                Este lançamento <strong className="text-slate-900 font-bold">"{transactionToDelete?.description}"</strong> faz parte de um grupo recorrente de transações.
              </p>
              <div className="bg-slate-50 border border-slate-150 rounded-md p-3 text-xs text-slate-500 space-y-1.5 font-sans">
                <span className="font-bold text-slate-700 flex items-center gap-1">📌 Informações do Grupo:</span>
                <p>• Total de parcelas encontradas no sistema: <strong className="text-slate-800 font-extrabold">{relatedTransactions.length} meses/lançamentos</strong>.</p>
                <p>• Valor de cada lançamento: <strong className="text-slate-800 font-extrabold">R$ {transactionToDelete ? transactionToDelete.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '0,00'}</strong>.</p>
              </div>
              <p className="text-xs text-slate-400">
                Escolha a opção desejada. Nenhuma das opções irá apagar dados de outros grupos ou transações não relacionadas.
              </p>
            </div>
            
            <div className="flex flex-col gap-2 pt-2 border-t border-slate-100">
              <Button 
                type="button"
                onClick={confirmDeleteSingle}
                className="w-full bg-slate-100 text-slate-700 hover:bg-rose-50 hover:text-rose-600 border border-slate-200 hover:border-rose-200 font-bold uppercase tracking-wider text-xs py-2.5 rounded-md transition-all cursor-pointer"
              >
                Excluir Apenas Este Mês
              </Button>
              <Button 
                type="button"
                onClick={confirmDeleteAll}
                className="w-full bg-rose-600 text-white hover:bg-rose-700 font-bold uppercase tracking-wider text-xs py-2.5 rounded-md shadow-md transition-all cursor-pointer"
              >
                Excluir de Todos os Meses ({relatedTransactions.length} parcelas)
              </Button>
              <Button 
                type="button"
                variant="ghost"
                onClick={() => {
                  setDeleteConfirmOpen(false);
                  setTransactionToDelete(null);
                  setRelatedTransactions([]);
                }}
                className="w-full text-slate-400 hover:text-slate-600 font-bold uppercase tracking-wider text-[10px] h-9 rounded-md cursor-pointer"
              >
                Cancelar Exclusão
              </Button>
            </div>
          </DialogContent>
        </Dialog>
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
            <Card className="flex-1 shadow-xs border border-slate-100 rounded-2xl overflow-hidden flex flex-col bg-white">
              <div className="p-5 border-b border-slate-50 flex items-center justify-between">
                <h2 className="text-base font-semibold text-slate-800 flex items-center gap-2 font-heading">
                  <Receipt className="h-4.5 w-4.5 text-blue-500" />
                  Fluxo de Caixa Mensal
                </h2>
                <AddTransactionDialog onAdd={handleAddTransaction} />
              </div>
              
              <CardContent className="p-0 overflow-hidden flex flex-col">
                {/* Modern summary strip sitting as a sleek horizontal bar */}
                <div className="mx-5 mt-5 p-4 bg-slate-50/60 rounded-xl border border-slate-100 grid grid-cols-3 gap-4 text-center">
                  <div>
                    <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block mb-0.5">Entradas</span>
                    <span className="text-sm font-semibold text-emerald-600 font-heading">R$ {totals.income.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div>
                    <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block mb-0.5">Despesas</span>
                    <span className="text-sm font-semibold text-slate-700 font-heading">R$ {totals.expense.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div>
                    <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block mb-0.5">Sobra</span>
                    <span className={`text-sm font-semibold font-heading ${balance >= 0 ? 'text-indigo-600' : 'text-rose-600'}`}>R$ {balance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                  </div>
                </div>

                <div className="p-5 flex-1 animate-fade-in">
                  {/* Campo de Busca de Dívidas */}
                  <div className="mb-4.5 relative">
                    <Search className="absolute left-3.5 top-2.5 h-4 w-4 text-slate-400" />
                    <Input
                      type="text"
                      placeholder="Procurar dívida pelo nome ou marcador (ex: José, Ster, Perca)..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-10 h-9 rounded-xl border-slate-250 bg-slate-50/40 focus-visible:bg-white focus-visible:ring-blue-500/25 focus-visible:border-blue-500 text-xs text-slate-700"
                    />
                    {searchQuery && (
                      <button
                        type="button"
                        onClick={() => setSearchQuery('')}
                        className="absolute right-3.5 top-2.5 text-[10px] font-extrabold uppercase text-slate-400 hover:text-slate-600 cursor-pointer"
                      >
                        Limpar
                      </button>
                    )}
                  </div>

                  {/* Filter Header controls - minimalist segmented design */}
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-4 mb-4 border-b border-slate-50 gap-3">
                    <div className="flex bg-slate-100/85 p-0.5 rounded-lg border border-slate-200/50 self-start">
                      <button
                        type="button"
                        onClick={() => setPeriodicityFilter('all')}
                        className={`px-3 py-1 text-[11px] font-bold rounded-md transition-all cursor-pointer ${
                          periodicityFilter === 'all' 
                            ? 'bg-white text-blue-600 shadow-xs' 
                            : 'text-slate-500 hover:text-slate-800'
                        }`}
                      >
                        Todos ({filteredTransactions.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setPeriodicityFilter('monthly')}
                        className={`px-3 py-1 text-[11px] font-bold rounded-md transition-all cursor-pointer ${
                          periodicityFilter === 'monthly' 
                            ? 'bg-white text-blue-600 shadow-xs' 
                            : 'text-slate-500 hover:text-slate-800'
                        }`}
                      >
                        Mensais ({filteredTransactions.filter(t => t && t.periodicity !== 'yearly').length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setPeriodicityFilter('yearly')}
                        className={`px-3 py-1 text-[11px] font-bold rounded-md transition-all cursor-pointer ${
                          periodicityFilter === 'yearly' 
                            ? 'bg-white text-blue-600 shadow-xs' 
                            : 'text-slate-500 hover:text-slate-800'
                        }`}
                      >
                        Anuais ({filteredTransactions.filter(t => t && t.periodicity === 'yearly').length})
                      </button>
                    </div>

                    <div className="flex items-center gap-3 text-[11px] font-medium text-slate-400 px-1">
                      <span>Média por item: <strong className="text-slate-600 font-bold">R$ {filteredTransactions.length > 0 ? (totals.expense / (filteredTransactions.filter(t => t && t.type === 'expense').length || 1)).toLocaleString('pt-BR', { maximumFractionDigits: 2 }) : '0,00'}</strong></span>
                    </div>
                  </div>

                  {/* Transaction Modern Feed List */}
                  <div className="space-y-2.5 max-h-[500px] overflow-y-auto pr-1">
                    {displayFilteredTransactions.length > 0 ? (
                      displayFilteredTransactions.map((t) => (
                        <div 
                          key={t.id} 
                          className="group flex items-center justify-between p-3.5 bg-white border border-slate-100 hover:border-slate-200/85 hover:bg-slate-50/20 rounded-xl transition-all"
                        >
                          <div className="flex items-center gap-3.5 min-w-0">
                            {/* Modern checklist toggle */}
                            <button
                              onClick={() => handleUpdateTransaction(t.id, { paid: t.paid === false ? true : false })}
                              className="focus:outline-none transition-all active:scale-95 shrink-0"
                              title={t.paid === false ? "Marcar como Pago" : "Marcar como Não Pago"}
                            >
                              {t.paid === false ? (
                                <div className="w-5.5 h-5.5 rounded-full border border-rose-250 bg-rose-50/40 hover:bg-rose-50 flex items-center justify-center text-rose-400 cursor-pointer transition-colors">
                                  <div className="w-1.5 h-1.5 rounded-full bg-rose-450 animate-pulse" />
                                </div>
                              ) : (
                                <div className="w-5.5 h-5.5 rounded-full border border-emerald-300 bg-emerald-50 text-emerald-600 flex items-center justify-center cursor-pointer hover:bg-emerald-100/80 transition-colors">
                                  <Check className="w-3.5 h-3.5 stroke-[3]" />
                                </div>
                              )}
                            </button>

                            <div className="min-w-0">
                              <p className={`font-semibold text-slate-700 text-sm leading-snug flex flex-wrap items-center gap-1.5 truncate ${t.paid === false ? 'text-slate-500 font-medium' : ''}`}>
                                {t.customTag && (() => {
                                  const tagObj = TAG_PRESETS.find(p => p.id === t.customTag);
                                  if (!tagObj) return null;
                                  return (
                                    <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[9px] font-extrabold rounded border ${tagObj.bg} shrink-0`}>
                                      <span>{tagObj.emoji}</span>
                                      <span>{tagObj.label}</span>
                                    </span>
                                  );
                                })()}
                                <span className="truncate">{t.description}</span>
                              </p>
                              <div className="flex items-center gap-2 mt-1">
                                <span className="text-[10px] text-slate-400 font-medium">
                                  {format(safeParseDate(t.date), 'dd MMM', { locale: ptBR })}
                                </span>
                                <span className="text-slate-300">•</span>
                                <span className={`text-[9px] font-medium uppercase tracking-wider ${
                                  t.periodicity === 'yearly'
                                    ? 'text-purple-600'
                                    : 'text-slate-550'
                                }`}>
                                  {t.periodicity === 'yearly' ? 'Anual' : 'Mensal'}
                                </span>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-4 pl-3 shrink-0">
                            <span className={`font-semibold text-sm tabular-nums tracking-tight font-heading ${t.type === 'income' ? 'text-emerald-600' : 'text-slate-800'}`}>
                              {t.type === 'income' ? '+' : '-'} R$ {t.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </span>

                            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                              <EditTransactionDialog transaction={t} onUpdate={handleUpdateTransaction} />
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                onClick={() => onInitiateDelete(t)}
                                className="h-7 w-7 text-slate-350 hover:text-rose-500 hover:bg-rose-50 rounded-md transition-colors"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="py-16 text-center">
                        <div className="flex flex-col items-center gap-2.5 text-slate-400/60">
                          <History className="h-8 w-8 text-slate-300" />
                          <p className="font-bold text-[10px] uppercase tracking-widest text-slate-400">Nenhum lançamento encontrado</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="col-span-12 lg:col-span-4 flex flex-col gap-6">
            <Card className="shadow-xs border border-slate-100 rounded-2xl bg-white flex flex-col">
              <CardHeader className="pb-3 border-b border-slate-50">
                <CardTitle className="text-base font-semibold flex items-center gap-2 font-heading text-slate-800">
                  <TrendingUp className="h-4.5 w-4.5 text-indigo-500" />
                  Divisão de Gasto / Orçamento
                </CardTitle>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col p-6">
                {/* Horizontal bento progress indicator */}
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5">Consumo do Orçamento</span>
                <div className="bg-slate-50/50 rounded-xl p-4 border border-slate-100/60 mb-6">
                  {(() => {
                    const pctSpent = totals.income > 0 ? (totals.expense / totals.income) * 100 : 0;
                    return (
                      <div className="space-y-3">
                        <div className="flex items-baseline justify-between text-xs font-semibold">
                          <span className="text-slate-600">Comprometido</span>
                          <span className={`${pctSpent > 85 ? 'text-rose-600' : 'text-slate-800'}`}>
                            {pctSpent.toFixed(0)}% das entradas
                          </span>
                        </div>
                        <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                          <motion.div 
                            className={`h-full rounded-full ${pctSpent > 85 ? 'bg-rose-500' : 'bg-indigo-500'}`}
                            initial={{ width: 0 }}
                            animate={{ width: `${Math.min(100, pctSpent)}%` }}
                            transition={{ duration: 0.8, ease: "easeOut" }}
                          />
                        </div>
                        <span className="text-[10px] text-slate-400 font-medium block">
                          Sua margem de economia é de R$ {Math.max(0, balance).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                    );
                  })()}
                </div>

                <div className="space-y-4 text-xs">
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Detalhamento das Contas</span>
                  
                  <div className="space-y-4">
                    <div className="p-3.5 bg-slate-50/30 rounded-xl border border-slate-100/60">
                      <div className="flex justify-between font-semibold text-slate-700 mb-1.5">
                        <span>Dívidas Mensais</span>
                        <span className="font-mono">R$ {totals.monthlyExpense.toLocaleString('pt-BR')}</span>
                      </div>
                      <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-slate-400 rounded-full transition-all" 
                          style={{ width: `${totals.expense > 0 ? (totals.monthlyExpense / totals.expense) * 100 : 0}%` }}
                        />
                      </div>
                      <span className="text-[9.5px] text-slate-400 font-medium mt-1.5 block">
                        Representa {totals.expense > 0 ? ((totals.monthlyExpense / totals.expense) * 100).toFixed(0) : 0}% das despesas totais
                      </span>
                    </div>

                    <div className="p-3.5 bg-slate-50/30 rounded-xl border border-slate-100/60">
                      <div className="flex justify-between font-semibold text-slate-700 mb-1.5">
                        <span>Dívidas Anuais</span>
                        <span className="font-mono">R$ {totals.yearlyExpense.toLocaleString('pt-BR')}</span>
                      </div>
                      <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-purple-500 rounded-full transition-all" 
                          style={{ width: `${totals.expense > 0 ? (totals.yearlyExpense / totals.expense) * 100 : 0}%` }}
                        />
                      </div>
                      <span className="text-[9.5px] text-slate-400 font-medium mt-1.5 block">
                        Representa {totals.expense > 0 ? ((totals.yearlyExpense / totals.expense) * 100).toFixed(0) : 0}% das despesas totais
                      </span>
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
    emerald: 'text-emerald-650',
    slate: 'text-slate-800',
    amber: 'text-amber-600',
    blue: 'text-indigo-600'
  };

  const borderColors = {
    emerald: 'border-emerald-100',
    slate: 'border-slate-100',
    amber: 'border-amber-100',
    blue: 'border-indigo-100'
  };

  return (
    <div className={`bg-white p-5 rounded-2xl border ${borderColors[color] || 'border-slate-100'} shadow-xs hover:shadow-sm transition-all flex flex-col justify-between min-h-[105px]`}>
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{label}</p>
          <span className={`w-2 h-2 rounded-full ${color === 'emerald' ? 'bg-emerald-400' : color === 'amber' ? 'bg-amber-400' : color === 'blue' ? 'bg-indigo-400' : 'bg-slate-400'}`} />
        </div>
        <div className="flex items-baseline gap-1.5">
          <p className={`text-2xl sm:text-2.5xl font-semibold font-heading tracking-tight tabular-nums leading-none ${textColors[color]}`}>
            {isPercent ? `${amount.toFixed(0)}%` : `R$ ${amount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          </p>
        </div>
      </div>
      {subtext && (
        <span className="text-[10px] font-medium text-slate-450 mt-3 block border-t border-slate-50 pt-1.5 truncate">
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
      <DialogTrigger render={<Button className="bg-blue-600 hover:bg-blue-700 shadow-sm gap-2 rounded-lg" />}>
        <Plus className="h-4 w-4" /> Novo Lançamento
      </DialogTrigger>
      <DialogContent className="sm:max-w-[480px] max-w-[95%] rounded-lg border border-slate-200 shadow-2xl p-5 bg-white">
        <DialogHeader className="pb-2 border-b border-slate-100">
          <DialogTitle className="font-heading text-lg font-bold text-slate-800">Nova Transação</DialogTitle>
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
      <DialogContent className="sm:max-w-[480px] max-w-[95%] rounded-lg border border-slate-200 shadow-2xl p-5 bg-white">
        <DialogHeader className="pb-2 border-b border-slate-100">
          <DialogTitle className="font-heading text-lg font-bold text-slate-800">Editar Transação</DialogTitle>
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
  const [date, setDate] = useState(initialData ? format(safeParseDate(initialData.date), 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd'));
  const [paid, setPaid] = useState<boolean>(initialData ? initialData.paid !== false : false);
  const [periodicity, setPeriodicity] = useState<'monthly' | 'yearly'>(initialData?.periodicity || 'monthly');
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurringMonths, setRecurringMonths] = useState('1');
  const [recurringType, setRecurringType] = useState<'split' | 'replicate'>('split');
  const [customTag, setCustomTag] = useState<string>(initialData?.customTag || '');

  const reset = () => {
    if (!initialData) {
      setAmount('');
      setDescription('');
      setPaid(false);
      setPeriodicity('monthly');
      setIsRecurring(false);
      setRecurringMonths('1');
      setRecurringType('split');
      setCustomTag('');
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Improved number parsing for Brazilian format (handle comma as decimal)
    const cleanAmount = amount.replace(',', '.');
    const parsedAmount = parseFloat(cleanAmount);
    
    if (isNaN(parsedAmount)) return;

    if (!initialData && isRecurring && parseInt(recurringMonths) > 1) {
      const baseDate = safeParseDate(date ? date + 'T12:00:00' : new Date());
      const monthsCount = parseInt(recurringMonths) || 1;
      const recurrenceId = 'group_' + Math.random().toString(36).substr(2, 9);
      
      const installmentAmount = recurringType === 'split'
        ? Math.round((parsedAmount / monthsCount) * 100) / 100
        : parsedAmount;

      for (let i = 0; i < monthsCount; i++) {
        const nextDate = addMonths(baseDate, i);
        onSave({
          type,
          amount: installmentAmount,
          description: recurringType === 'split' 
            ? `${description} (${i + 1}/${monthsCount})` 
            : `${description} (Mês ${i + 1}/${monthsCount})`,
          date: nextDate.toISOString(),
          paid: paid,
          periodicity: periodicity,
          recurrenceId: recurrenceId,
          customTag: customTag
        });
      }
    } else {
      const finalDate = safeParseDate(date ? date + 'T12:00:00' : new Date());
      onSave({
        type,
        amount: parsedAmount,
        description,
        date: finalDate.toISOString(),
        paid: paid,
        periodicity: periodicity,
        customTag: customTag
      });
    }
    
    reset();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 mt-4 text-slate-700">
      {/* Type Selector (Tab bar) - Sleek & Square */}
      <div className="flex bg-slate-100 p-1 rounded-md border border-slate-250 shadow-inner">
        <button
          type="button"
          className={`flex-1 py-1.5 text-xs font-bold uppercase tracking-wider rounded-md transition-all cursor-pointer ${
            type === 'income' 
              ? 'bg-emerald-600 text-white shadow-sm font-black' 
              : 'text-slate-500 hover:text-slate-700'
          }`}
          onClick={() => setType('income')}
        >
          Receita
        </button>
        <button
          type="button"
          className={`flex-1 py-1.5 text-xs font-bold uppercase tracking-wider rounded-md transition-all cursor-pointer ${
            type === 'expense' 
              ? 'bg-rose-600 text-white shadow-sm font-black' 
              : 'text-slate-500 hover:text-slate-700'
          }`}
          onClick={() => setType('expense')}
        >
          Despesa
        </button>
      </div>

      {/* Grid Layout - 2 columns on small/medium blocks */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
        
        {/* Descrição - Full span */}
        <div className="grid gap-1.5 sm:col-span-2">
          <Label htmlFor="description" className="text-[10px] font-bold uppercase text-slate-400 ml-0.5">Descrição</Label>
          <Input 
            id="description" 
            placeholder="Ex: Aluguel, Supermercado, Salário..." 
            required
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="rounded-md border-slate-200 h-10 focus-visible:ring-slate-400 focus-visible:border-slate-400"
          />
        </div>

        {/* Valor */}
        <div className="grid gap-1.5 col-span-1">
          <Label htmlFor="amount" className="text-[10px] font-bold uppercase text-slate-400 ml-0.5">Valor (R$)</Label>
          <Input 
            id="amount" 
            type="text" 
            inputMode="decimal"
            placeholder="0,00" 
            required 
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="rounded-md border-slate-200 h-10 tracking-wide font-medium focus-visible:ring-slate-400 focus-visible:border-slate-400"
          />
        </div>

        {/* Data */}
        <div className="grid gap-1.5 col-span-1">
          <Label htmlFor="date" className="text-[10px] font-bold uppercase text-slate-400 ml-0.5">Data</Label>
          <Input 
            id="date" 
            type="date" 
            required
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-md border-slate-200 h-10 focus-visible:ring-slate-400 focus-visible:border-slate-400"
          />
        </div>
      </div>

      {/* Periodicidade Selector - Sleek and Compact */}
      <div className="grid gap-1.5">
        <Label className="text-[10px] font-bold uppercase text-slate-400 ml-0.5">Frequência</Label>
        <div className="flex bg-slate-50 p-1 rounded-md border border-slate-200">
          <button
            type="button"
            className={`flex-1 py-1 text-xs font-bold rounded-md transition-all cursor-pointer ${
              periodicity === 'monthly' 
                ? 'bg-white text-slate-800 shadow-sm border border-slate-200' 
                : 'text-slate-400 hover:text-slate-600'
            }`}
            onClick={() => setPeriodicity('monthly')}
          >
            {type === 'income' ? 'Mensal (Disponível sempre)' : 'Mensal (Fatura, Mensalidade)'}
          </button>
          <button
            type="button"
            className={`flex-1 py-1 text-xs font-bold rounded-md transition-all cursor-pointer ${
              periodicity === 'yearly' 
                ? 'bg-white text-slate-800 shadow-sm border border-slate-200' 
                : 'text-slate-400 hover:text-slate-600'
            }`}
            onClick={() => setPeriodicity('yearly')}
          >
            {type === 'income' ? 'Anual (Anuidade, Bônus)' : 'Anual (IPVA, IPTU)'}
          </button>
        </div>
      </div>

      {/* Marcador / Atribuição (Emoji) - Beautiful grid of presets */}
      <div className="grid gap-1.5">
        <Label className="text-[10px] font-bold uppercase text-slate-400 ml-0.5">Responsável / Marcador (Emoji)</Label>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setCustomTag('')}
            className={`px-2.5 py-1.5 text-[11px] font-bold rounded-lg border transition-all cursor-pointer flex items-center gap-1 ${
              customTag === ''
                ? 'bg-slate-200 border-slate-300 text-slate-800 shadow-xs'
                : 'bg-white border-slate-200 text-slate-400 hover:text-slate-600 hover:border-slate-300'
            }`}
          >
            Sem Marcador
          </button>
          {TAG_PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setCustomTag(p.id)}
              className={`px-2.5 py-1.5 text-[11px] font-bold rounded-lg border transition-all cursor-pointer flex items-center gap-1 ${
                customTag === p.id
                  ? `${p.bg} border-blue-500 ring-2 ring-blue-50/50 shadow-xs`
                  : 'bg-white border-slate-200 text-slate-600 hover:text-slate-800 hover:border-slate-300'
              }`}
            >
              <span className="text-sm shrink-0">{p.emoji}</span>
              <span>{p.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Payment and Options Split Layout - Highly compact and neat */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-1">
        
        {/* Toggle pago/recebido in a square compact card */}
        <button
          type="button"
          onClick={() => setPaid(!paid)}
          className={`flex items-center justify-between p-2.5 rounded-lg border text-left transition-all cursor-pointer ${
            paid 
              ? 'bg-emerald-50/50 border-emerald-200 text-emerald-900 shadow-xs' 
              : 'bg-slate-50 border-slate-200 text-slate-600 hover:border-slate-300'
          }`}
        >
          <div className="flex flex-col pr-1">
            <span className="text-xs font-bold">
              {type === 'income' ? 'Pago/Recebido?' : 'Valor Pago?'}
            </span>
            <span className="text-[9px] text-slate-400 font-medium">
              {paid ? 'Sim, confirmado!' : 'Aguardando pendência'}
            </span>
          </div>
          <div className="flex items-center shrink-0">
            {paid ? (
              <div className="w-5 h-5 bg-emerald-600 text-white rounded-md flex items-center justify-center shadow-xs">
                <Check className="w-3.5 h-3.5 stroke-[3]" />
              </div>
            ) : (
              <div className="w-5 h-5 bg-white border border-slate-300 rounded-md flex items-center justify-center shadow-inner">
                <div className="w-1.5 h-1.5 rounded-xs bg-slate-300" />
              </div>
            )}
          </div>
        </button>

        {/* Recurring Switch in a neat, interactive card */}
        {!initialData && (
          <button
            type="button"
            onClick={() => setIsRecurring(!isRecurring)}
            className={`flex items-center justify-between p-2.5 rounded-lg border text-left transition-all cursor-pointer ${
              isRecurring 
                ? 'bg-blue-5/50 border-blue-200 text-blue-900 shadow-xs' 
                : 'bg-slate-50 border-slate-200 text-slate-600 hover:border-slate-300'
            }`}
          >
            <div className="flex flex-col pr-1">
              <span className="text-xs font-bold">Dividir em meses?</span>
              <span className="text-[9px] text-slate-400 font-medium">
                {isRecurring ? 'Ativo' : 'Apenas uma vez'}
              </span>
            </div>
            <div className="flex items-center shrink-0">
              {isRecurring ? (
                <div className="w-5 h-5 bg-blue-600 text-white rounded-md flex items-center justify-center shadow-xs">
                  <Check className="w-3.5 h-3.5 stroke-[3]" />
                </div>
              ) : (
                <div className="w-5 h-5 bg-white border border-slate-300 rounded-md flex items-center justify-center shadow-inner">
                  <div className="w-1.5 h-1.5 rounded-xs bg-slate-300" />
                </div>
              )}
            </div>
          </button>
        )}
      </div>

      {/* Recurrence Settings area - Animated & Compact */}
      {!initialData && isRecurring && (
        <motion.div 
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          className="space-y-3 bg-slate-50 p-3 rounded-lg border border-slate-200 mt-2 overflow-hidden"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-700">Quantidade de Meses</span>
            <div className="flex items-center gap-1">
              <Input 
                type="number" 
                min="2" 
                max="48"
                value={recurringMonths}
                onChange={(e) => setRecurringMonths(e.target.value)}
                className="w-16 h-8 text-xs rounded-md text-center border-slate-200 focus-visible:ring-slate-400"
              />
              <span className="text-xs text-slate-400 font-semibold">meses</span>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-[9px] font-bold uppercase text-slate-400">Distribuição do Lançamento</Label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setRecurringType('split')}
                className={`p-2 text-left rounded-md border text-xs flex flex-col gap-0.5 cursor-pointer transition-all ${
                  recurringType === 'split'
                    ? 'bg-white border-blue-500 ring-2 ring-blue-50 text-slate-800 font-bold'
                    : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
                }`}
              >
                <span>Dividir valor</span>
                <span className="text-[8px] font-normal text-slate-400">Divide {amount || '0,00'} em {recurringMonths}x</span>
              </button>
              
              <button
                type="button"
                onClick={() => setRecurringType('replicate')}
                className={`p-2 text-left rounded-md border text-xs flex flex-col gap-0.5 cursor-pointer transition-all ${
                  recurringType === 'replicate'
                    ? 'bg-white border-blue-500 ring-2 ring-blue-50 text-slate-800 font-bold'
                    : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
                }`}
              >
                <span>Valor mensal fixo</span>
                <span className="text-[8px] font-normal text-slate-400">Repete {amount || '0,00'} todo mês</span>
              </button>
            </div>
          </div>

          {(() => {
            const monthsVal = parseInt(recurringMonths) || 1;
            const amtVal = parseFloat(amount.replace(',', '.')) || 0;
            if (monthsVal > 1 && amtVal > 0) {
              if (recurringType === 'split') {
                const perMonthReal = Math.round((amtVal / monthsVal) * 100) / 100;
                return (
                  <div className="text-[9px] font-semibold text-blue-600 bg-blue-50/50 p-2 rounded-md border border-blue-100 flex items-center gap-1">
                    <span>💳 {monthsVal} lançamentos de <strong>R$ {perMonthReal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong> por mês.</span>
                  </div>
                );
              } else {
                return (
                  <div className="text-[9px] font-semibold text-slate-600 bg-slate-100/50 p-2 rounded-md border border-slate-200 flex items-center gap-1">
                    <span>🔄 {monthsVal} lançamentos recorrentes de <strong>R$ {amtVal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong>.</span>
                  </div>
                );
              }
            }
            return null;
          })()}
        </motion.div>
      )}

      {/* Submit Button - Crisp and robust */}
      <Button 
        type="submit" 
        className="w-full bg-blue-600 hover:bg-blue-700 h-11 text-xs font-bold uppercase tracking-wider rounded-lg shadow-md hover:shadow-lg transition-all mt-4"
      >
        {initialData ? 'Atualizar Lançamento' : 'Confirmar Lançamento'}
      </Button>
    </form>
  );
}
