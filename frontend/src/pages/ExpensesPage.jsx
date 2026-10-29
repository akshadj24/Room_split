import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Search,
  Plus,
  ShoppingBag,
  Zap,
  Utensils,
  Home,
  Car,
  Receipt,
  RotateCcw,
  Calendar,
  User,
  Users,
  ChevronRight,
  X,
  Sparkles,
  AlertCircle,
  CheckCircle2,
  RefreshCw
} from 'lucide-react';
import { expensesApi } from '../services/api';

const CATEGORY_MAP = {
  Groceries: { icon: ShoppingBag, color: '#10b981', bg: 'rgba(16, 185, 129, 0.16)' },
  WiFi: { icon: Zap, color: '#06b6d4', bg: 'rgba(6, 182, 212, 0.16)' },
  Food: { icon: Utensils, color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.16)' },
  Rent: { icon: Home, color: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.16)' },
  Transport: { icon: Car, color: '#38bdf8', bg: 'rgba(56, 189, 248, 0.16)' },
  Other: { icon: Receipt, color: '#94a3b8', bg: 'rgba(148, 163, 184, 0.16)' }
};

export default function ExpensesPage({ currentUser, householdId = 1, onBack, onAddExpense }) {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [selectedPayer, setSelectedPayer] = useState('All');
  const [selectedExpense, setSelectedExpense] = useState(null);
  const [actionMessage, setActionMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const {
    data: rawExpenses = [],
    isLoading,
    isError,
    error,
    refetch
  } = useQuery({
    queryKey: ['expenses', householdId],
    queryFn: () => expensesApi.listExpenses(householdId),
    enabled: !!householdId,
  });

  const reverseMutation = useMutation({
    mutationFn: (expenseId) => expensesApi.reverseExpense(expenseId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses', householdId] });
      queryClient.invalidateQueries({ queryKey: ['dashboard', householdId] });
      queryClient.invalidateQueries({ queryKey: ['balances', householdId] });
      setActionMessage('Expense reversed successfully! Audit log and balances updated.');
      setSelectedExpense(null);
      setTimeout(() => setActionMessage(''), 3000);
    },
    onError: (err) => {
      setErrorMessage(err.message || 'Failed to reverse expense.');
      setTimeout(() => setErrorMessage(''), 4000);
    }
  });

  const expenses = rawExpenses.map(e => {
    const isPayer = e.paid_by === currentUser?.id;
    const mySplit = e.splits?.find(s => s.user_id === currentUser?.id);
    let userShareText = '—';
    let isLent = null;

    if (isPayer) {
      const othersSharePaise = e.amount_paise - (mySplit?.share_paise || 0);
      const lentRupees = Math.round(othersSharePaise / 100);
      userShareText = lentRupees > 0 ? `+₹${lentRupees.toLocaleString('en-IN')} you lent` : 'you paid';
      isLent = true;
    } else if (mySplit) {
      const shareRupees = Math.round(mySplit.share_paise / 100);
      userShareText = `-₹${shareRupees.toLocaleString('en-IN')} your share`;
      isLent = false;
    }

    const payerDisplayName = isPayer
      ? 'You'
      : (e.paid_by_name || `Member #${e.paid_by}`);

    return {
      id: e.id,
      category: e.category_name || 'Other',
      description: e.description,
      amountPaise: e.amount_paise,
      amountRupees: e.amount || Math.round(e.amount_paise / 100),
      paidById: e.paid_by,
      paidByName: payerDisplayName,
      expenseDate: e.expense_date,
      splitType: e.split_type,
      status: e.status,
      splits: (e.splits || []).map(s => ({
        userId: s.user_id,
        name: s.user_id === currentUser?.id ? `${currentUser?.name || 'You'} (You)` : (s.user_name || `User #${s.user_id}`),
        shareRupees: s.share || Math.round(s.share_paise / 100),
        isPayer: s.user_id === e.paid_by
      })),
      userShareText,
      isLent
    };
  });

  const uniquePayers = Array.from(new Set(expenses.map(e => e.paidByName)));
  const uniqueCategories = Array.from(new Set(expenses.map(e => e.category)));

  const filteredExpenses = expenses.filter(e => {
    if (selectedCategory !== 'All' && e.category !== selectedCategory) return false;
    if (selectedPayer !== 'All' && e.paidByName !== selectedPayer) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return e.description.toLowerCase().includes(q) || e.category.toLowerCase().includes(q);
    }
    return true;
  });

  const totalHouseholdSpent = expenses.filter(e => e.status === 'active').reduce((acc, curr) => acc + curr.amountRupees, 0);
  const totalYouPaid = expenses.filter(e => e.status === 'active' && e.paidById === currentUser?.id).reduce((acc, curr) => acc + curr.amountRupees, 0);

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#090d18',
      color: '#ffffff',
      padding: '24px 20px 80px',
      position: 'relative',
      overflow: 'hidden',
      fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif"
    }}>
      {/* Background ambient auroras */}
      <div style={{
        position: 'absolute',
        top: '-10%',
        right: '-5%',
        width: '550px',
        height: '550px',
        background: 'radial-gradient(circle, rgba(99, 102, 241, 0.15) 0%, rgba(168, 85, 247, 0.08) 50%, transparent 70%)',
        filter: 'blur(90px)',
        pointerEvents: 'none'
      }} />
      <div style={{
        position: 'absolute',
        bottom: '-15%',
        left: '-10%',
        width: '650px',
        height: '650px',
        background: 'radial-gradient(circle, rgba(6, 182, 212, 0.14) 0%, rgba(236, 72, 153, 0.08) 50%, transparent 70%)',
        filter: 'blur(90px)',
        pointerEvents: 'none'
      }} />

      <div style={{
        maxWidth: '920px',
        margin: '0 auto',
        position: 'relative',
        zIndex: 1
      }}>
        {/* Top Header */}
        <header style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '28px',
          flexWrap: 'wrap',
          gap: '12px'
        }}>
          <button
            type="button"
            onClick={onBack}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 18px',
              borderRadius: '9999px',
              background: 'rgba(18, 24, 43, 0.85)',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              color: '#cbd5e1',
              fontSize: '13.5px',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.2s',
              boxShadow: '0 4px 16px rgba(0, 0, 0, 0.3)'
            }}
          >
            <ArrowLeft size={16} />
            <span>Dashboard</span>
          </button>

          <button
            type="button"
            onClick={onAddExpense}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 20px',
              borderRadius: '9999px',
              background: 'linear-gradient(135deg, #06b6d4 0%, #ec4899 100%)',
              border: 'none',
              color: '#ffffff',
              fontSize: '13.5px',
              fontWeight: 700,
              cursor: 'pointer',
              boxShadow: '0 6px 20px rgba(236, 72, 153, 0.35)'
            }}
          >
            <Plus size={16} />
            <span>Add Expense</span>
          </button>
        </header>

        {/* Title */}
        <div style={{ marginBottom: '24px' }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '4px 12px',
            borderRadius: '9999px',
            background: 'rgba(99, 102, 241, 0.12)',
            border: '1px solid rgba(99, 102, 241, 0.3)',
            color: '#818cf8',
            fontSize: '12px',
            fontWeight: 700,
            letterSpacing: '0.04em',
            marginBottom: '10px'
          }}>
            <Sparkles size={13} />
            TRANSACTION LOG & AUDIT TRAIL
          </div>
          <h1 style={{
            fontSize: '32px',
            fontWeight: 800,
            letterSpacing: '-0.03em',
            margin: '0 0 6px 0',
            color: '#ffffff'
          }}>
            Household Expenses
          </h1>
          <p style={{ fontSize: '14px', color: '#94a3b8', margin: 0 }}>
            Filter, inspect itemized split shares, and reverse entries with zero-corruption counter-entries.
          </p>
        </div>

        {/* Action / Error Banners */}
        {actionMessage && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '14px 18px',
            borderRadius: '16px',
            background: 'rgba(16, 185, 129, 0.15)',
            border: '1px solid rgba(16, 185, 129, 0.4)',
            color: '#6ee7b7',
            fontSize: '13.5px',
            marginBottom: '20px'
          }}>
            <CheckCircle2 size={20} style={{ flexShrink: 0 }} />
            <span>{actionMessage}</span>
          </div>
        )}

        {errorMessage && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '14px 18px',
            borderRadius: '16px',
            background: 'rgba(244, 63, 94, 0.15)',
            border: '1px solid rgba(244, 63, 94, 0.4)',
            color: '#fda4af',
            fontSize: '13.5px',
            marginBottom: '20px'
          }}>
            <AlertCircle size={20} style={{ flexShrink: 0 }} />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* LOADING STATE */}
        {isLoading && (
          <div style={{
            padding: '60px 20px',
            textAlign: 'center',
            background: 'rgba(18, 24, 43, 0.6)',
            borderRadius: '24px',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            marginBottom: '24px'
          }}>
            <div style={{
              width: '40px',
              height: '40px',
              border: '3px solid rgba(99, 102, 241, 0.2)',
              borderTopColor: '#6366f1',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
              margin: '0 auto 16px'
            }} />
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            <div style={{ fontSize: '15px', fontWeight: 600, color: '#e2e8f0' }}>
              Loading household expenses...
            </div>
          </div>
        )}

        {/* ERROR STATE */}
        {isError && (
          <div style={{
            padding: '24px',
            borderRadius: '20px',
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            marginBottom: '24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '16px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <AlertCircle size={24} color="#f87171" />
              <div>
                <div style={{ fontSize: '15px', fontWeight: 700, color: '#fca5a5' }}>
                  Unable to load expenses
                </div>
                <div style={{ fontSize: '13px', color: '#94a3b8' }}>
                  {error?.message || 'Could not reach server to fetch expenses.'}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => refetch()}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 16px',
                borderRadius: '10px',
                background: 'rgba(239, 68, 68, 0.2)',
                border: '1px solid rgba(239, 68, 68, 0.4)',
                color: '#ffffff',
                fontWeight: 600,
                fontSize: '13px',
                cursor: 'pointer'
              }}
            >
              <RefreshCw size={14} />
              <span>Retry</span>
            </button>
          </div>
        )}

        {!isLoading && !isError && (
          <>
            {/* 1. TOP METRICS STRIP */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: '16px',
              marginBottom: '24px'
            }}>
              <div style={{
                background: 'rgba(18, 24, 43, 0.85)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '20px',
                padding: '20px',
                boxShadow: '0 10px 30px rgba(0, 0, 0, 0.3)'
              }}>
                <span style={{ fontSize: '12px', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase' }}>
                  Total Household Spend
                </span>
                <div style={{ fontSize: '28px', fontWeight: 800, color: '#ffffff', marginTop: '6px' }}>
                  ₹{totalHouseholdSpent.toLocaleString('en-IN')}
                </div>
              </div>

              <div style={{
                background: 'rgba(18, 24, 43, 0.85)',
                border: '1px solid rgba(16, 185, 129, 0.3)',
                borderRadius: '20px',
                padding: '20px',
                boxShadow: '0 10px 30px rgba(0, 0, 0, 0.3)'
              }}>
                <span style={{ fontSize: '12px', fontWeight: 600, color: '#34d399', textTransform: 'uppercase' }}>
                  You Personally Paid
                </span>
                <div style={{ fontSize: '28px', fontWeight: 800, color: '#34d399', marginTop: '6px' }}>
                  ₹{totalYouPaid.toLocaleString('en-IN')}
                </div>
              </div>

              <div style={{
                background: 'rgba(18, 24, 43, 0.85)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '20px',
                padding: '20px',
                boxShadow: '0 10px 30px rgba(0, 0, 0, 0.3)'
              }}>
                <span style={{ fontSize: '12px', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase' }}>
                  Logged Expenses
                </span>
                <div style={{ fontSize: '28px', fontWeight: 800, color: '#818cf8', marginTop: '6px' }}>
                  {expenses.length} Records
                </div>
              </div>
            </div>

            {/* 2. SEARCH & FILTER TOOLBAR */}
            <div style={{
              background: 'rgba(18, 24, 43, 0.85)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '20px',
              padding: '16px 20px',
              marginBottom: '24px',
              display: 'flex',
              flexDirection: 'column',
              gap: '14px'
            }}>
              {/* Search Input */}
              <div style={{ position: 'relative' }}>
                <Search size={18} color="#94a3b8" style={{ position: 'absolute', left: '16px', top: '13px' }} />
                <input
                  type="text"
                  placeholder="Search expenses by title or category..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '12px 16px 12px 44px',
                    borderRadius: '14px',
                    background: 'rgba(11, 16, 31, 0.7)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    color: '#ffffff',
                    fontSize: '14px',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              {/* Filters Row */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '12px'
              }}>
                {/* Category Pills */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  {['All', ...uniqueCategories].map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setSelectedCategory(cat)}
                      style={{
                        padding: '6px 14px',
                        borderRadius: '9999px',
                        border: selectedCategory === cat ? '1px solid #818cf8' : '1px solid rgba(255, 255, 255, 0.08)',
                        background: selectedCategory === cat ? 'rgba(99, 102, 241, 0.25)' : 'rgba(11, 16, 31, 0.6)',
                        color: selectedCategory === cat ? '#ffffff' : '#94a3b8',
                        fontSize: '12.5px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        transition: 'all 0.15s'
                      }}
                    >
                      {cat}
                    </button>
                  ))}
                </div>

                {/* Payer Filter */}
                {uniquePayers.length > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '12.5px', color: '#64748b' }}>Paid by:</span>
                    <select
                      value={selectedPayer}
                      onChange={(e) => setSelectedPayer(e.target.value)}
                      style={{
                        padding: '6px 12px',
                        borderRadius: '10px',
                        background: 'rgba(11, 16, 31, 0.8)',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        color: '#ffffff',
                        fontSize: '13px',
                        outline: 'none',
                        cursor: 'pointer'
                      }}
                    >
                      <option value="All">All Roommates</option>
                      {uniquePayers.map(p => (
                        <option key={p} value={p}>{p}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            </div>

            {/* 3. EXPENSES LIST OR EMPTY STATE */}
            {expenses.length === 0 ? (
              <div style={{
                background: 'rgba(18, 24, 43, 0.85)',
                border: '1px dashed rgba(255, 255, 255, 0.12)',
                borderRadius: '24px',
                padding: '60px 24px',
                textAlign: 'center'
              }}>
                <Receipt size={48} color="#64748b" style={{ margin: '0 auto 16px' }} />
                <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#ffffff', margin: '0 0 8px 0' }}>
                  No expenses recorded yet
                </h3>
                <p style={{ fontSize: '14px', color: '#94a3b8', margin: '0 auto 20px', maxWidth: '340px' }}>
                  Your household ledger is currently empty. Tap below to log the first grocery bill, WiFi invoice, or dinner split.
                </p>
                <button
                  type="button"
                  onClick={onAddExpense}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '12px 24px',
                    borderRadius: '9999px',
                    background: 'linear-gradient(135deg, #06b6d4 0%, #ec4899 100%)',
                    border: 'none',
                    color: '#ffffff',
                    fontSize: '14px',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  <Plus size={18} />
                  <span>Add First Expense</span>
                </button>
              </div>
            ) : filteredExpenses.length === 0 ? (
              <div style={{
                background: 'rgba(18, 24, 43, 0.85)',
                border: '1px dashed rgba(255, 255, 255, 0.1)',
                borderRadius: '24px',
                padding: '48px 24px',
                textAlign: 'center'
              }}>
                <Search size={36} color="#64748b" style={{ margin: '0 auto 12px' }} />
                <div style={{ fontSize: '16px', fontWeight: 700, color: '#ffffff' }}>
                  No matching expenses found
                </div>
                <div style={{ fontSize: '13px', color: '#94a3b8', marginTop: '4px' }}>
                  Try adjusting your search terms or clearing the category and payer filters.
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {filteredExpenses.map((exp) => {
                  const meta = CATEGORY_MAP[exp.category] || CATEGORY_MAP.Other;
                  const IconComp = meta.icon;
                  const isReversed = exp.status === 'reversed';

                  return (
                    <div
                      key={exp.id}
                      onClick={() => setSelectedExpense(exp)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '16px 20px',
                        borderRadius: '20px',
                        background: isReversed ? 'rgba(18, 24, 43, 0.45)' : 'rgba(18, 24, 43, 0.85)',
                        border: isReversed ? '1px dashed rgba(244, 63, 94, 0.3)' : '1px solid rgba(255, 255, 255, 0.08)',
                        cursor: 'pointer',
                        transition: 'all 0.18s cubic-bezier(0.16, 1, 0.3, 1)',
                        opacity: isReversed ? 0.65 : 1
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = 'rgba(99, 102, 241, 0.4)';
                        e.currentTarget.style.transform = 'translateY(-2px)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = isReversed ? 'rgba(244, 63, 94, 0.3)' : 'rgba(255, 255, 255, 0.08)';
                        e.currentTarget.style.transform = 'translateY(0)';
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                        <div style={{
                          width: '46px',
                          height: '46px',
                          borderRadius: '50%',
                          background: meta.bg,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0
                        }}>
                          <IconComp size={22} color={meta.color} />
                        </div>

                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{
                              fontSize: '15.5px',
                              fontWeight: 700,
                              color: isReversed ? '#94a3b8' : '#ffffff',
                              textDecoration: isReversed ? 'line-through' : 'none'
                            }}>
                              {exp.description}
                            </span>
                            {isReversed && (
                              <span style={{
                                padding: '2px 8px',
                                borderRadius: '6px',
                                background: 'rgba(244, 63, 94, 0.2)',
                                color: '#fb7185',
                                fontSize: '11px',
                                fontWeight: 700
                              }}>
                                REVERSED
                              </span>
                            )}
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12.5px', color: '#94a3b8', marginTop: '2px' }}>
                            <span>Paid by <strong style={{ color: '#cbd5e1' }}>{exp.paidByName}</strong></span>
                            <span>•</span>
                            <span>{exp.expenseDate}</span>
                            <span>•</span>
                            <span style={{ color: meta.color }}>{exp.category}</span>
                          </div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', textAlign: 'right' }}>
                        <div>
                          <div style={{
                            fontSize: '18px',
                            fontWeight: 800,
                            color: isReversed ? '#94a3b8' : '#ffffff',
                            textDecoration: isReversed ? 'line-through' : 'none'
                          }}>
                            ₹{exp.amountRupees.toLocaleString('en-IN')}
                          </div>
                          <div style={{
                            fontSize: '12px',
                            fontWeight: 600,
                            color: exp.isLent ? '#34d399' : exp.isLent === false ? '#fb7185' : '#64748b'
                          }}>
                            {exp.userShareText}
                          </div>
                        </div>

                        <ChevronRight size={18} color="#64748b" />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* 4. EXPENSE DETAILS & REVERSAL MODAL */}
        {selectedExpense && (
          <div
            onClick={() => setSelectedExpense(null)}
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(0, 0, 0, 0.75)',
              backdropFilter: 'blur(8px)',
              zIndex: 3000,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '20px'
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                background: '#0c111f',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                borderRadius: '24px',
                width: '100%',
                maxWidth: '480px',
                padding: '28px',
                boxShadow: '0 25px 60px rgba(0, 0, 0, 0.8)',
                position: 'relative'
              }}
            >
              <button
                type="button"
                onClick={() => setSelectedExpense(null)}
                style={{
                  position: 'absolute',
                  top: '20px',
                  right: '20px',
                  background: 'rgba(255, 255, 255, 0.08)',
                  border: 'none',
                  borderRadius: '50%',
                  width: '32px',
                  height: '32px',
                  color: '#94a3b8',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer'
                }}
              >
                <X size={16} />
              </button>

              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                <div style={{
                  width: '44px',
                  height: '44px',
                  borderRadius: '50%',
                  background: CATEGORY_MAP[selectedExpense.category]?.bg || CATEGORY_MAP.Other.bg,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <Receipt size={22} color={CATEGORY_MAP[selectedExpense.category]?.color || CATEGORY_MAP.Other.color} />
                </div>
                <div>
                  <h3 style={{ fontSize: '18px', fontWeight: 800, margin: 0, color: '#ffffff' }}>
                    {selectedExpense.description}
                  </h3>
                  <div style={{ fontSize: '12.5px', color: '#94a3b8' }}>
                    {selectedExpense.category} • {selectedExpense.expenseDate}
                  </div>
                </div>
              </div>

              <div style={{
                padding: '16px',
                borderRadius: '16px',
                background: 'rgba(18, 24, 43, 0.8)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                marginBottom: '20px'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ fontSize: '13px', color: '#94a3b8' }}>Total Amount</span>
                  <span style={{ fontSize: '18px', fontWeight: 800, color: '#ffffff' }}>
                    ₹{selectedExpense.amountRupees.toLocaleString('en-IN')}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ fontSize: '13px', color: '#94a3b8' }}>Paid By</span>
                  <span style={{ fontSize: '13.5px', fontWeight: 700, color: '#38bdf8' }}>
                    {selectedExpense.paidByName}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '13px', color: '#94a3b8' }}>Status</span>
                  <span style={{
                    fontSize: '12px',
                    fontWeight: 700,
                    color: selectedExpense.status === 'active' ? '#34d399' : '#fb7185',
                    textTransform: 'uppercase'
                  }}>
                    {selectedExpense.status}
                  </span>
                </div>
              </div>

              {/* Splits List */}
              <div style={{ marginBottom: '24px' }}>
                <div style={{ fontSize: '13px', fontWeight: 700, color: '#94a3b8', marginBottom: '10px' }}>
                  ITEMIZED SPLIT SHARES
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {selectedExpense.splits.map((s, idx) => (
                    <div
                      key={idx}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '10px 14px',
                        borderRadius: '12px',
                        background: 'rgba(255, 255, 255, 0.03)',
                        border: '1px solid rgba(255, 255, 255, 0.06)'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <User size={14} color="#94a3b8" />
                        <span style={{ fontSize: '13.5px', color: '#e2e8f0' }}>{s.name}</span>
                        {s.isPayer && (
                          <span style={{
                            fontSize: '10.5px',
                            fontWeight: 700,
                            padding: '1px 6px',
                            borderRadius: '4px',
                            background: 'rgba(56, 189, 248, 0.15)',
                            color: '#38bdf8'
                          }}>
                            PAYER
                          </span>
                        )}
                      </div>
                      <span style={{ fontSize: '14px', fontWeight: 700, color: '#ffffff' }}>
                        ₹{s.shareRupees.toLocaleString('en-IN')}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Reverse Button (only if active) */}
              {selectedExpense.status === 'active' && (
                <button
                  type="button"
                  disabled={reverseMutation.isPending}
                  onClick={() => reverseMutation.mutate(selectedExpense.id)}
                  style={{
                    width: '100%',
                    padding: '12px',
                    borderRadius: '14px',
                    background: 'rgba(244, 63, 94, 0.15)',
                    border: '1px solid rgba(244, 63, 94, 0.35)',
                    color: '#fb7185',
                    fontSize: '14px',
                    fontWeight: 700,
                    cursor: reverseMutation.isPending ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    transition: 'all 0.2s'
                  }}
                >
                  <RotateCcw size={16} />
                  <span>{reverseMutation.isPending ? 'Reversing...' : 'Reverse Expense (Safe Counter-Entry)'}</span>
                </button>
              )}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
