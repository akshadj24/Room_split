import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Home,
  Receipt,
  Scale,
  Handshake,
  BarChart2,
  PieChart,
  Utensils,
  ShoppingBag,
  Wifi,
  Car,
  Film,
  ArrowUpRight,
  ArrowDownLeft,
  Calendar,
  Plus,
  ChevronRight,
  CheckCircle2,
  User,
  Bell,
  Sparkles,
  CreditCard
} from 'lucide-react';
import {
  householdsApi,
  expensesApi,
  settlementsApi
} from '../services/api';

const CATEGORY_ICONS = {
  Food: Utensils,
  Dining: Utensils,
  Groceries: ShoppingBag,
  Grocery: ShoppingBag,
  WiFi: Wifi,
  Internet: Wifi,
  Utilities: Wifi,
  Rent: Home,
  Transport: Car,
  Travel: Car,
  Entertainment: Film,
  Other: Receipt,
};

const CATEGORY_COLORS = {
  Food: { color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.16)' },
  Dining: { color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.16)' },
  Groceries: { color: '#10b981', bg: 'rgba(16, 185, 129, 0.16)' },
  Grocery: { color: '#10b981', bg: 'rgba(16, 185, 129, 0.16)' },
  WiFi: { color: '#06b6d4', bg: 'rgba(6, 182, 212, 0.16)' },
  Internet: { color: '#06b6d4', bg: 'rgba(6, 182, 212, 0.16)' },
  Utilities: { color: '#06b6d4', bg: 'rgba(6, 182, 212, 0.16)' },
  Rent: { color: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.16)' },
  Transport: { color: '#38bdf8', bg: 'rgba(56, 189, 248, 0.16)' },
  Travel: { color: '#38bdf8', bg: 'rgba(56, 189, 248, 0.16)' },
  Entertainment: { color: '#ec4899', bg: 'rgba(236, 72, 153, 0.16)' },
  Other: { color: '#94a3b8', bg: 'rgba(148, 163, 184, 0.16)' },
};

const MEMBER_COLORS = [
  '#818cf8',
  '#34d399',
  '#c084fc',
  '#38bdf8',
  '#f59e0b',
  '#ec4899',
];

export default function DashboardPage({
  currentUser,
  householdId = 1,
  onNavigate,
  onLogout
}) {
  const [hoveredCard, setHoveredCard] = useState(null);

  // 1. Dashboard summary data (Household, Balances, Monthly spend)
  const { data: dashboardData } = useQuery({
    queryKey: ['dashboard', householdId],
    queryFn: () => householdsApi.getDashboard(householdId),
    enabled: !!householdId,
  });

  // 2. Real list of expenses for "Recent Expenses"
  const { data: rawExpenses = [], isLoading: expensesLoading } = useQuery({
    queryKey: ['expenses', householdId],
    queryFn: () => expensesApi.listExpenses(householdId),
    enabled: !!householdId,
  });

  // 3. Real net balances for members
  const { data: balanceResponse } = useQuery({
    queryKey: ['balances', householdId],
    queryFn: () => settlementsApi.getBalances(householdId),
    enabled: !!householdId,
  });

  // 4. Real transfer suggestions
  const { data: suggestions = [] } = useQuery({
    queryKey: ['settlement-suggestions', householdId],
    queryFn: () => settlementsApi.getSuggestions(householdId),
    enabled: !!householdId,
  });

  // 5. Real household members
  const { data: rawMembers = [] } = useQuery({
    queryKey: ['members', householdId],
    queryFn: () => householdsApi.getMembers(householdId),
    enabled: !!householdId,
  });

  // 6. Real spend analytics (6-month history and category breakdown)
  const { data: analyticsData } = useQuery({
    queryKey: ['analytics', householdId],
    queryFn: () => householdsApi.getAnalytics(householdId),
    enabled: !!householdId,
  });

  const household = dashboardData?.household || {
    id: householdId,
    name: "RoomSplit Home",
    currency: 'INR'
  };

  const balance = dashboardData?.balance || {
    net_balance: 0,
    total_owed_to_you: 0,
    total_you_owe: 0
  };

  const monthlySpend = dashboardData?.monthly_spend || {
    total: 0,
    change_percent: 0
  };

  // Get last 5 expenses
  const recentExpenses = [...rawExpenses]
    .sort((a, b) => new Date(b.created_at || b.expense_date) - new Date(a.created_at || a.expense_date))
    .slice(0, 5);

  // Member balances summary for "Who Owes Who"
  const memberBalances = balanceResponse?.balances || [];

  // Monthly spending history from analytics
  const monthlyHistory = analyticsData?.monthly_history || [];
  const maxMonthAmount = Math.max(...monthlyHistory.map(m => m.amount || 0), 1);

  // Category breakdown from analytics
  const categoryBreakdown = analyticsData?.category_breakdown || [];

  // Greeting
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Morning';
    if (hour < 17) return 'Afternoon';
    return 'Evening';
  };

  const firstName = currentUser?.name ? currentUser.name.split(' ')[0] : 'Roommate';

  // Format currency
  const formatINR = (amt) => {
    const num = Number(amt) || 0;
    return `₹${num.toLocaleString('en-IN')}`;
  };

  // Format dates
  const formatDate = (dateStr) => {
    if (!dateStr) return 'Recently';
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    } catch {
      return dateStr;
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#090d18',
      color: '#ffffff',
      padding: '28px 36px 64px',
      fontFamily: "'Plus Jakarta Sans', system-ui, -apple-system, sans-serif",
      position: 'relative',
      overflowX: 'hidden'
    }}>
      {/* Responsive layout styles */}
      <style>{`
        .rs-grid-top {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 20px;
          margin-bottom: 24px;
        }

        .rs-grid-middle {
          display: grid;
          grid-template-columns: minmax(0, 1.35fr) minmax(0, 1fr);
          gap: 20px;
          margin-bottom: 24px;
          align-items: stretch;
        }

        .rs-grid-bottom {
          display: grid;
          grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr);
          gap: 20px;
          align-items: stretch;
        }

        @media (max-width: 960px) {
          .rs-grid-top {
            grid-template-columns: 1fr;
          }
          .rs-grid-middle {
            grid-template-columns: 1fr;
          }
          .rs-grid-bottom {
            grid-template-columns: 1fr;
          }
        }
      `}</style>

      {/* Background ambient gradient glow */}
      <div style={{
        position: 'absolute',
        top: '-120px',
        right: '-100px',
        width: '560px',
        height: '560px',
        background: 'radial-gradient(circle, rgba(168, 85, 247, 0.12) 0%, rgba(236, 72, 153, 0.05) 50%, transparent 70%)',
        filter: 'blur(90px)',
        pointerEvents: 'none',
        zIndex: 0
      }} />

      <div style={{ maxWidth: '1180px', margin: '0 auto', position: 'relative', zIndex: 1 }}>

        {/* ============================================================== */}
        {/* HEADER: GREETING & HOUSEHOLD CONTROLS                          */}
        {/* ============================================================== */}
        <header style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '28px',
          flexWrap: 'wrap',
          gap: '16px'
        }}>
          <div>
            <div style={{
              fontSize: '13px',
              color: '#94a3b8',
              fontWeight: 600,
              letterSpacing: '0.04em',
              textTransform: 'uppercase'
            }}>
              Good {getGreeting()}
            </div>
            <h1 style={{
              fontSize: '28px',
              fontWeight: 800,
              letterSpacing: '-0.02em',
              color: '#ffffff',
              margin: '3px 0 0',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              <span>Welcome back, {firstName}</span>
              <span style={{ fontSize: '24px' }}>👋</span>
            </h1>
          </div>

          {/* Right Header Actions */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {/* Household Selector Pill */}
            <div
              onClick={() => onNavigate && onNavigate('settings')}
              title="Household Settings"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 16px',
                borderRadius: '9999px',
                background: 'rgba(18, 22, 38, 0.85)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                fontSize: '13.5px',
                fontWeight: 600,
                color: '#ffffff',
                cursor: 'pointer',
                transition: 'all 0.2s',
                boxShadow: '0 4px 14px rgba(0, 0, 0, 0.3)'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'rgba(168, 85, 247, 0.4)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
              }}
            >
              <Home size={15} color="#c084fc" />
              <span>{household.name || 'RoomSplit'} • {household.currency || 'INR'}</span>
            </div>

            {/* + Add Expense Action Button */}
            <button
              type="button"
              onClick={() => onNavigate && onNavigate('add-expense')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '9px 18px',
                borderRadius: '9999px',
                background: 'linear-gradient(135deg, #a855f7 0%, #ec4899 100%)',
                color: '#ffffff',
                border: 'none',
                fontSize: '13.5px',
                fontWeight: 700,
                cursor: 'pointer',
                boxShadow: '0 4px 18px rgba(168, 85, 247, 0.35)',
                transition: 'transform 0.2s, box-shadow 0.2s'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-1px)';
                e.currentTarget.style.boxShadow = '0 6px 24px rgba(168, 85, 247, 0.5)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 4px 18px rgba(168, 85, 247, 0.35)';
              }}
            >
              <Plus size={16} strokeWidth={2.6} />
              <span>Add Expense</span>
            </button>
          </div>
        </header>

        {/* ============================================================== */}
        {/* 1. TOP ROW — 3 SUMMARY CARDS                                   */}
        {/* ============================================================== */}
        <section className="rs-grid-top">
          {/* CARD 1: YOU OWE (Red Tint) */}
          <div
            onClick={() => onNavigate && onNavigate('settlements')}
            style={{
              background: 'linear-gradient(135deg, rgba(244, 63, 94, 0.08) 0%, rgba(19, 22, 38, 0.95) 100%)',
              border: '1px solid rgba(244, 63, 94, 0.22)',
              borderRadius: '22px',
              padding: '24px 26px',
              cursor: 'pointer',
              transition: 'all 0.25s ease',
              position: 'relative',
              overflow: 'hidden',
              boxShadow: hoveredCard === 'owe' ? '0 12px 32px rgba(244, 63, 94, 0.18)' : '0 8px 24px rgba(0, 0, 0, 0.3)',
              transform: hoveredCard === 'owe' ? 'translateY(-2px)' : 'translateY(0)'
            }}
            onMouseEnter={() => setHoveredCard('owe')}
            onMouseLeave={() => setHoveredCard(null)}
          >
            {/* Ambient Background Accent */}
            <div style={{
              position: 'absolute',
              top: '-30px',
              right: '-30px',
              width: '120px',
              height: '120px',
              background: 'radial-gradient(circle, rgba(244, 63, 94, 0.15) 0%, transparent 70%)',
              pointerEvents: 'none'
            }} />

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
              <span style={{
                fontSize: '12px',
                fontWeight: 700,
                color: '#f87171',
                textTransform: 'uppercase',
                letterSpacing: '0.05em'
              }}>
                You Owe
              </span>
              <div style={{
                width: '36px',
                height: '36px',
                borderRadius: '12px',
                background: 'rgba(244, 63, 94, 0.14)',
                border: '1px solid rgba(244, 63, 94, 0.25)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#f43f5e'
              }}>
                <ArrowUpRight size={18} strokeWidth={2.4} />
              </div>
            </div>

            <div style={{
              fontSize: '32px',
              fontWeight: 800,
              color: '#ffffff',
              letterSpacing: '-0.02em',
              marginBottom: '8px'
            }}>
              {formatINR(balance.total_you_owe)}
            </div>

            <div style={{
              fontSize: '12.5px',
              color: balance.total_you_owe > 0 ? '#fca5a5' : '#94a3b8',
              display: 'flex',
              alignItems: 'center',
              gap: '4px'
            }}>
              <span>{balance.total_you_owe > 0 ? 'Total amount owed to others' : 'All squared up! You owe nothing.'}</span>
              {balance.total_you_owe > 0 && <ChevronRight size={14} color="#fca5a5" />}
            </div>
          </div>

          {/* CARD 2: YOU'RE OWED (Green Tint) */}
          <div
            onClick={() => onNavigate && onNavigate('balances')}
            style={{
              background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.08) 0%, rgba(19, 22, 38, 0.95) 100%)',
              border: '1px solid rgba(16, 185, 129, 0.22)',
              borderRadius: '22px',
              padding: '24px 26px',
              cursor: 'pointer',
              transition: 'all 0.25s ease',
              position: 'relative',
              overflow: 'hidden',
              boxShadow: hoveredCard === 'owed' ? '0 12px 32px rgba(16, 185, 129, 0.18)' : '0 8px 24px rgba(0, 0, 0, 0.3)',
              transform: hoveredCard === 'owed' ? 'translateY(-2px)' : 'translateY(0)'
            }}
            onMouseEnter={() => setHoveredCard('owed')}
            onMouseLeave={() => setHoveredCard(null)}
          >
            {/* Ambient Background Accent */}
            <div style={{
              position: 'absolute',
              top: '-30px',
              right: '-30px',
              width: '120px',
              height: '120px',
              background: 'radial-gradient(circle, rgba(16, 185, 129, 0.15) 0%, transparent 70%)',
              pointerEvents: 'none'
            }} />

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
              <span style={{
                fontSize: '12px',
                fontWeight: 700,
                color: '#34d399',
                textTransform: 'uppercase',
                letterSpacing: '0.05em'
              }}>
                You're Owed
              </span>
              <div style={{
                width: '36px',
                height: '36px',
                borderRadius: '12px',
                background: 'rgba(16, 185, 129, 0.14)',
                border: '1px solid rgba(16, 185, 129, 0.25)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#10b981'
              }}>
                <ArrowDownLeft size={18} strokeWidth={2.4} />
              </div>
            </div>

            <div style={{
              fontSize: '32px',
              fontWeight: 800,
              color: '#ffffff',
              letterSpacing: '-0.02em',
              marginBottom: '8px'
            }}>
              {formatINR(balance.total_owed_to_you)}
            </div>

            <div style={{
              fontSize: '12.5px',
              color: balance.total_owed_to_you > 0 ? '#6ee7b7' : '#94a3b8',
              display: 'flex',
              alignItems: 'center',
              gap: '4px'
            }}>
              <span>{balance.total_owed_to_you > 0 ? 'Total roommates owe to you' : 'No pending balances owed to you.'}</span>
              {balance.total_owed_to_you > 0 && <ChevronRight size={14} color="#6ee7b7" />}
            </div>
          </div>

          {/* CARD 3: THIS MONTH (Blue Tint) */}
          <div
            onClick={() => onNavigate && onNavigate('analytics')}
            style={{
              background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.08) 0%, rgba(19, 22, 38, 0.95) 100%)',
              border: '1px solid rgba(99, 102, 241, 0.22)',
              borderRadius: '22px',
              padding: '24px 26px',
              cursor: 'pointer',
              transition: 'all 0.25s ease',
              position: 'relative',
              overflow: 'hidden',
              boxShadow: hoveredCard === 'month' ? '0 12px 32px rgba(99, 102, 241, 0.18)' : '0 8px 24px rgba(0, 0, 0, 0.3)',
              transform: hoveredCard === 'month' ? 'translateY(-2px)' : 'translateY(0)'
            }}
            onMouseEnter={() => setHoveredCard('month')}
            onMouseLeave={() => setHoveredCard(null)}
          >
            {/* Ambient Background Accent */}
            <div style={{
              position: 'absolute',
              top: '-30px',
              right: '-30px',
              width: '120px',
              height: '120px',
              background: 'radial-gradient(circle, rgba(99, 102, 241, 0.15) 0%, transparent 70%)',
              pointerEvents: 'none'
            }} />

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
              <span style={{
                fontSize: '12px',
                fontWeight: 700,
                color: '#818cf8',
                textTransform: 'uppercase',
                letterSpacing: '0.05em'
              }}>
                This Month
              </span>
              <div style={{
                width: '36px',
                height: '36px',
                borderRadius: '12px',
                background: 'rgba(99, 102, 241, 0.14)',
                border: '1px solid rgba(99, 102, 241, 0.25)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#818cf8'
              }}>
                <Calendar size={18} strokeWidth={2.4} />
              </div>
            </div>

            <div style={{
              fontSize: '32px',
              fontWeight: 800,
              color: '#ffffff',
              letterSpacing: '-0.02em',
              marginBottom: '8px'
            }}>
              {formatINR(monthlySpend.total)}
            </div>

            <div style={{
              fontSize: '12.5px',
              color: '#94a3b8',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}>
              {monthlySpend.change_percent !== undefined && monthlySpend.change_percent !== 0 ? (
                <span style={{
                  color: monthlySpend.change_percent > 0 ? '#f472b6' : '#34d399',
                  fontWeight: 600
                }}>
                  {monthlySpend.change_percent > 0 ? '+' : ''}{monthlySpend.change_percent}% vs last month
                </span>
              ) : (
                <span>Total household spending this month</span>
              )}
              <ChevronRight size={14} color="#94a3b8" />
            </div>
          </div>
        </section>

        {/* ============================================================== */}
        {/* 2. MIDDLE SECTION — TWO COLUMNS                                */}
        {/* ============================================================== */}
        <section className="rs-grid-middle">
          {/* ---------------- LEFT: RECENT EXPENSES (LAST 5) ------------- */}
          <div style={{
            background: '#131625',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '24px',
            padding: '24px 26px',
            boxShadow: '0 16px 36px rgba(0, 0, 0, 0.35)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            transition: 'border-color 0.2s ease, box-shadow 0.2s ease'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = 'rgba(168, 85, 247, 0.3)';
            e.currentTarget.style.boxShadow = '0 16px 36px rgba(168, 85, 247, 0.12)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.08)';
            e.currentTarget.style.boxShadow = '0 16px 36px rgba(0, 0, 0, 0.35)';
          }}
          >
            <div>
              {/* Header */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '18px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{
                    width: '34px',
                    height: '34px',
                    borderRadius: '10px',
                    background: 'rgba(168, 85, 247, 0.15)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#c084fc'
                  }}>
                    <Receipt size={17} strokeWidth={2.3} />
                  </div>
                  <div>
                    <h2 style={{ fontSize: '16px', fontWeight: 700, color: '#ffffff', margin: 0 }}>
                      Recent Expenses
                    </h2>
                    <span style={{ fontSize: '11.5px', color: '#94a3b8' }}>
                      Last 5 transactions recorded
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => onNavigate && onNavigate('expenses')}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#c084fc',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '3px',
                    padding: '4px 8px',
                    borderRadius: '8px',
                    transition: 'background 0.2s'
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(168, 85, 247, 0.1)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                >
                  <span>View All</span>
                  <ChevronRight size={15} />
                </button>
              </div>

              {/* Expense List or Empty State */}
              {recentExpenses.length === 0 ? (
                <div style={{
                  padding: '36px 16px',
                  textAlign: 'center',
                  background: 'rgba(255, 255, 255, 0.02)',
                  borderRadius: '16px',
                  border: '1px dashed rgba(255, 255, 255, 0.1)',
                  margin: '8px 0'
                }}>
                  <div style={{
                    width: '46px',
                    height: '46px',
                    borderRadius: '50%',
                    background: 'rgba(168, 85, 247, 0.1)',
                    color: '#c084fc',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 auto 12px'
                  }}>
                    <Receipt size={22} />
                  </div>
                  <h3 style={{ fontSize: '14.5px', fontWeight: 600, color: '#ffffff', marginBottom: '4px' }}>
                    No expenses recorded yet
                  </h3>
                  <p style={{ fontSize: '12.5px', color: '#94a3b8', maxWidth: '280px', margin: '0 auto 16px' }}>
                    Add your first shared grocery, utility or meal expense to get started.
                  </p>
                  <button
                    type="button"
                    onClick={() => onNavigate && onNavigate('add-expense')}
                    style={{
                      background: 'rgba(168, 85, 247, 0.18)',
                      border: '1px solid rgba(168, 85, 247, 0.4)',
                      color: '#ffffff',
                      padding: '8px 18px',
                      borderRadius: '9999px',
                      fontSize: '12.5px',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    + Add Expense
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {recentExpenses.map((exp) => {
                    const catName = exp.category_name || exp.category?.name || 'Other';
                    const CatIcon = CATEGORY_ICONS[catName] || Receipt;
                    const catTheme = CATEGORY_COLORS[catName] || CATEGORY_COLORS.Other;
                    const isPayer = exp.paid_by === currentUser?.id;
                    const payerText = isPayer ? 'You paid' : `Paid by ${exp.paid_by_name || 'Roommate'}`;

                    return (
                      <div
                        key={exp.id}
                        onClick={() => onNavigate && onNavigate('expenses')}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '12px 14px',
                          borderRadius: '16px',
                          background: 'rgba(255, 255, 255, 0.02)',
                          border: '1px solid rgba(255, 255, 255, 0.05)',
                          cursor: 'pointer',
                          transition: 'all 0.2s ease'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                          e.currentTarget.style.borderColor = 'rgba(168, 85, 247, 0.3)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = 'rgba(255, 255, 255, 0.02)';
                          e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.05)';
                        }}
                      >
                        {/* Left: Category Icon + Description + Who Paid */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
                          <div style={{
                            width: '40px',
                            height: '40px',
                            borderRadius: '12px',
                            background: catTheme.bg,
                            color: catTheme.color,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0
                          }}>
                            <CatIcon size={19} />
                          </div>

                          <div style={{ minWidth: 0 }}>
                            <div style={{
                              fontSize: '14px',
                              fontWeight: 600,
                              color: '#ffffff',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis'
                            }}>
                              {exp.description || 'Expense'}
                            </div>
                            <div style={{
                              fontSize: '11.5px',
                              color: '#94a3b8',
                              marginTop: '2px',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px'
                            }}>
                              <span style={{ color: isPayer ? '#34d399' : '#cbd5e1', fontWeight: isPayer ? 600 : 400 }}>
                                {payerText}
                              </span>
                              <span>•</span>
                              <span>{formatDate(exp.expense_date)}</span>
                            </div>
                          </div>
                        </div>

                        {/* Right: Amount */}
                        <div style={{ textAlign: 'right', flexShrink: 0, paddingLeft: '12px' }}>
                          <div style={{
                            fontSize: '15px',
                            fontWeight: 700,
                            color: '#ffffff'
                          }}>
                            {formatINR(exp.amount)}
                          </div>
                          <div style={{
                            fontSize: '11px',
                            color: catTheme.color,
                            fontWeight: 500,
                            marginTop: '2px'
                          }}>
                            {catName}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* ---------------- RIGHT: WHO OWES WHO ------------------------ */}
          <div style={{
            background: '#131625',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '24px',
            padding: '24px 26px',
            boxShadow: '0 16px 36px rgba(0, 0, 0, 0.35)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            transition: 'border-color 0.2s ease, box-shadow 0.2s ease'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = 'rgba(168, 85, 247, 0.3)';
            e.currentTarget.style.boxShadow = '0 16px 36px rgba(168, 85, 247, 0.12)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.08)';
            e.currentTarget.style.boxShadow = '0 16px 36px rgba(0, 0, 0, 0.35)';
          }}
          >
            <div>
              {/* Header */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '18px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{
                    width: '34px',
                    height: '34px',
                    borderRadius: '10px',
                    background: 'rgba(236, 72, 153, 0.15)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#f472b6'
                  }}>
                    <Scale size={17} strokeWidth={2.3} />
                  </div>
                  <div>
                    <h2 style={{ fontSize: '16px', fontWeight: 700, color: '#ffffff', margin: 0 }}>
                      Who Owes Who
                    </h2>
                    <span style={{ fontSize: '11.5px', color: '#94a3b8' }}>
                      Quick balance summary & settlements
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => onNavigate && onNavigate('balances')}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#c084fc',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '3px',
                    padding: '4px 8px',
                    borderRadius: '8px',
                    transition: 'background 0.2s'
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(168, 85, 247, 0.1)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                >
                  <span>Balances</span>
                  <ChevronRight size={15} />
                </button>
              </div>

              {/* Suggested Transfers / Member Standings or Empty State */}
              {suggestions.length === 0 && memberBalances.length <= 1 ? (
                <div style={{
                  padding: '36px 16px',
                  textAlign: 'center',
                  background: 'rgba(255, 255, 255, 0.02)',
                  borderRadius: '16px',
                  border: '1px dashed rgba(255, 255, 255, 0.1)',
                  margin: '8px 0'
                }}>
                  <div style={{
                    width: '46px',
                    height: '46px',
                    borderRadius: '50%',
                    background: 'rgba(16, 185, 129, 0.1)',
                    color: '#10b981',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 auto 12px'
                  }}>
                    <CheckCircle2 size={24} />
                  </div>
                  <h3 style={{ fontSize: '14.5px', fontWeight: 600, color: '#ffffff', marginBottom: '4px' }}>
                    All settled up!
                  </h3>
                  <p style={{ fontSize: '12.5px', color: '#94a3b8', maxWidth: '280px', margin: '0 auto 16px' }}>
                    No outstanding balances or pending payments among roommates.
                  </p>
                  <button
                    type="button"
                    onClick={() => onNavigate && onNavigate('settlements')}
                    style={{
                      background: 'rgba(16, 185, 129, 0.18)',
                      border: '1px solid rgba(16, 185, 129, 0.4)',
                      color: '#ffffff',
                      padding: '8px 18px',
                      borderRadius: '9999px',
                      fontSize: '12.5px',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    Settlements History
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {/* Priority 1: Show actionable transfer suggestions */}
                  {suggestions.length > 0 ? (
                    suggestions.map((sug, idx) => {
                      const isYouPayer = sug.from_user_id === currentUser?.id;
                      const isYouReceiver = sug.to_user_id === currentUser?.id;
                      const fromName = isYouPayer ? 'You' : sug.from_user_name;
                      const toName = isYouReceiver ? 'You' : sug.to_user_name;
                      const fromInitial = fromName[0]?.toUpperCase() || 'R';
                      const color = isYouReceiver ? '#34d399' : '#f87171';

                      return (
                        <div
                          key={`sug-${idx}`}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '12px 14px',
                            borderRadius: '16px',
                            background: 'rgba(255, 255, 255, 0.02)',
                            border: '1px solid rgba(255, 255, 255, 0.05)',
                            transition: 'all 0.2s ease'
                          }}
                        >
                          {/* Member Initial + Transfer Description */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <div style={{
                              width: '38px',
                              height: '38px',
                              borderRadius: '12px',
                              background: isYouReceiver ? 'rgba(16, 185, 129, 0.2)' : 'rgba(244, 63, 94, 0.2)',
                              color: color,
                              fontWeight: 700,
                              fontSize: '14px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0
                            }}>
                              {fromInitial}
                            </div>

                            <div>
                              <div style={{ fontSize: '13.5px', fontWeight: 600, color: '#ffffff' }}>
                                <span>{fromName}</span>
                                <span style={{ color: '#94a3b8', fontWeight: 400, margin: '0 5px' }}>owes</span>
                                <span style={{ color: toName === 'You' ? '#34d399' : '#ffffff' }}>{toName}</span>
                              </div>
                              <div style={{ fontSize: '14.5px', fontWeight: 700, color: color, marginTop: '2px' }}>
                                {formatINR(sug.amount)}
                              </div>
                            </div>
                          </div>

                          {/* Settle Button */}
                          <button
                            type="button"
                            onClick={() => onNavigate && onNavigate('settlements')}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px',
                              padding: '7px 14px',
                              borderRadius: '9999px',
                              background: isYouPayer
                                ? 'linear-gradient(135deg, #a855f7 0%, #ec4899 100%)'
                                : 'rgba(255, 255, 255, 0.06)',
                              border: isYouPayer ? 'none' : '1px solid rgba(255, 255, 255, 0.12)',
                              color: '#ffffff',
                              fontSize: '12px',
                              fontWeight: 600,
                              cursor: 'pointer',
                              transition: 'all 0.2s'
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.opacity = '0.9';
                              e.currentTarget.style.transform = 'scale(1.02)';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.opacity = '1';
                              e.currentTarget.style.transform = 'scale(1)';
                            }}
                          >
                            <Handshake size={14} />
                            <span>{isYouPayer ? 'Pay Now' : 'Settle'}</span>
                          </button>
                        </div>
                      );
                    })
                  ) : (
                    /* Priority 2: If no direct suggestions, show member net balances */
                    memberBalances.map((mb, idx) => {
                      const isMe = mb.user_id === currentUser?.id;
                      const initial = mb.name ? mb.name[0].toUpperCase() : 'M';
                      const net = mb.net_balance !== undefined ? mb.net_balance : Math.round(mb.net_balance_paise / 100);
                      const memberColor = MEMBER_COLORS[idx % MEMBER_COLORS.length];

                      return (
                        <div
                          key={mb.user_id}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '12px 14px',
                            borderRadius: '16px',
                            background: 'rgba(255, 255, 255, 0.02)',
                            border: '1px solid rgba(255, 255, 255, 0.05)',
                            transition: 'all 0.2s ease'
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <div style={{
                              width: '38px',
                              height: '38px',
                              borderRadius: '12px',
                              background: `${memberColor}26`,
                              color: memberColor,
                              fontWeight: 700,
                              fontSize: '14px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0
                            }}>
                              {initial}
                            </div>

                            <div>
                              <div style={{ fontSize: '13.5px', fontWeight: 600, color: '#ffffff' }}>
                                {mb.name} {isMe && <span style={{ color: '#94a3b8', fontSize: '11.5px' }}>(You)</span>}
                              </div>
                              <div style={{
                                fontSize: '12px',
                                fontWeight: 600,
                                color: net > 0 ? '#34d399' : net < 0 ? '#f87171' : '#94a3b8',
                                marginTop: '2px'
                              }}>
                                {net > 0 ? `Gets back ${formatINR(net)}` : net < 0 ? `Owes ${formatINR(Math.abs(net))}` : 'Settled up'}
                              </div>
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => onNavigate && onNavigate('settlements')}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px',
                              padding: '7px 14px',
                              borderRadius: '9999px',
                              background: 'rgba(255, 255, 255, 0.06)',
                              border: '1px solid rgba(255, 255, 255, 0.12)',
                              color: '#ffffff',
                              fontSize: '12px',
                              fontWeight: 600,
                              cursor: 'pointer',
                              transition: 'all 0.2s'
                            }}
                          >
                            <Handshake size={14} />
                            <span>Settle</span>
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          </div>
        </section>

        {/* ============================================================== */}
        {/* 3. BOTTOM SECTION: BAR CHART & CATEGORY BREAKDOWN              */}
        {/* ============================================================== */}
        <section className="rs-grid-bottom">
          {/* ---------------- LEFT: MONTHLY SPENDING BAR CHART ----------- */}
          <div style={{
            background: '#131625',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '24px',
            padding: '24px 26px',
            boxShadow: '0 16px 36px rgba(0, 0, 0, 0.35)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            transition: 'border-color 0.2s ease, box-shadow 0.2s ease'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = 'rgba(168, 85, 247, 0.3)';
            e.currentTarget.style.boxShadow = '0 16px 36px rgba(168, 85, 247, 0.12)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.08)';
            e.currentTarget.style.boxShadow = '0 16px 36px rgba(0, 0, 0, 0.35)';
          }}
          >
            <div>
              {/* Header */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '20px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{
                    width: '34px',
                    height: '34px',
                    borderRadius: '10px',
                    background: 'rgba(99, 102, 241, 0.15)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#818cf8'
                  }}>
                    <BarChart2 size={17} strokeWidth={2.3} />
                  </div>
                  <div>
                    <h2 style={{ fontSize: '16px', fontWeight: 700, color: '#ffffff', margin: 0 }}>
                      Monthly Spending
                    </h2>
                    <span style={{ fontSize: '11.5px', color: '#94a3b8' }}>
                      Last 6 months spending history
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => onNavigate && onNavigate('analytics')}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#c084fc',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '3px',
                    padding: '4px 8px',
                    borderRadius: '8px',
                    transition: 'background 0.2s'
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(168, 85, 247, 0.1)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                >
                  <span>Analytics</span>
                  <ChevronRight size={15} />
                </button>
              </div>

              {/* Bar Chart Canvas */}
              {monthlyHistory.length === 0 ? (
                <div style={{
                  padding: '36px 16px',
                  textAlign: 'center',
                  background: 'rgba(255, 255, 255, 0.02)',
                  borderRadius: '16px',
                  color: '#94a3b8',
                  fontSize: '13px'
                }}>
                  No historical spending data available yet.
                </div>
              ) : (
                <div style={{
                  display: 'flex',
                  alignItems: 'flex-end',
                  justifyContent: 'space-between',
                  height: '170px',
                  padding: '16px 8px 4px',
                  background: 'rgba(255, 255, 255, 0.02)',
                  borderRadius: '16px',
                  border: '1px solid rgba(255, 255, 255, 0.04)',
                  gap: '8px'
                }}>
                  {monthlyHistory.map((item, idx) => {
                    const isCurrent = !!item.current;
                    const amt = Number(item.amount) || 0;
                    // Calculate bar height percentage, bounded between 8% and 100%
                    const percent = maxMonthAmount > 0 ? Math.max((amt / maxMonthAmount) * 100, 8) : 8;

                    return (
                      <div
                        key={idx}
                        style={{
                          flex: 1,
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          height: '100%',
                          justifyContent: 'flex-end',
                          gap: '8px'
                        }}
                      >
                        {/* Amount tooltip text above bar */}
                        <span style={{
                          fontSize: '10.5px',
                          fontWeight: isCurrent ? 700 : 500,
                          color: isCurrent ? '#f472b6' : '#94a3b8',
                          whiteSpace: 'nowrap'
                        }}>
                          {amt > 0 ? `₹${Math.round(amt)}` : '—'}
                        </span>

                        {/* Bar Pillar */}
                        <div style={{
                          width: '100%',
                          maxWidth: '38px',
                          height: `${percent}%`,
                          borderRadius: '8px 8px 3px 3px',
                          background: isCurrent
                            ? 'linear-gradient(180deg, #ec4899 0%, #8b5cf6 100%)'
                            : 'linear-gradient(180deg, rgba(99, 102, 241, 0.6) 0%, rgba(99, 102, 241, 0.2) 100%)',
                          boxShadow: isCurrent ? '0 4px 16px rgba(236, 72, 153, 0.35)' : 'none',
                          transition: 'height 0.4s ease, transform 0.2s ease',
                          cursor: 'pointer'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.transform = 'scaleY(1.05)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.transform = 'scaleY(1)';
                        }}
                        />

                        {/* Month Label */}
                        <span style={{
                          fontSize: '11px',
                          fontWeight: isCurrent ? 700 : 500,
                          color: isCurrent ? '#ffffff' : '#64748b'
                        }}>
                          {item.month}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* ---------------- RIGHT: CATEGORY BREAKDOWN ------------------ */}
          <div style={{
            background: '#131625',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '24px',
            padding: '24px 26px',
            boxShadow: '0 16px 36px rgba(0, 0, 0, 0.35)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            transition: 'border-color 0.2s ease, box-shadow 0.2s ease'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = 'rgba(168, 85, 247, 0.3)';
            e.currentTarget.style.boxShadow = '0 16px 36px rgba(168, 85, 247, 0.12)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.08)';
            e.currentTarget.style.boxShadow = '0 16px 36px rgba(0, 0, 0, 0.35)';
          }}
          >
            <div>
              {/* Header */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '18px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{
                    width: '34px',
                    height: '34px',
                    borderRadius: '10px',
                    background: 'rgba(245, 158, 11, 0.15)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#fbbf24'
                  }}>
                    <PieChart size={17} strokeWidth={2.3} />
                  </div>
                  <div>
                    <h2 style={{ fontSize: '16px', fontWeight: 700, color: '#ffffff', margin: 0 }}>
                      Category Breakdown
                    </h2>
                    <span style={{ fontSize: '11.5px', color: '#94a3b8' }}>
                      Current month spend distribution
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => onNavigate && onNavigate('analytics')}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#c084fc',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '3px',
                    padding: '4px 8px',
                    borderRadius: '8px',
                    transition: 'background 0.2s'
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(168, 85, 247, 0.1)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                >
                  <span>View All</span>
                  <ChevronRight size={15} />
                </button>
              </div>

              {/* Category Segmented Bar + Item List or Empty State */}
              {categoryBreakdown.length === 0 ? (
                <div style={{
                  padding: '36px 16px',
                  textAlign: 'center',
                  background: 'rgba(255, 255, 255, 0.02)',
                  borderRadius: '16px',
                  border: '1px dashed rgba(255, 255, 255, 0.1)',
                  margin: '8px 0'
                }}>
                  <div style={{
                    width: '46px',
                    height: '46px',
                    borderRadius: '50%',
                    background: 'rgba(245, 158, 11, 0.1)',
                    color: '#fbbf24',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 auto 12px'
                  }}>
                    <ShoppingBag size={22} />
                  </div>
                  <h3 style={{ fontSize: '14.5px', fontWeight: 600, color: '#ffffff', marginBottom: '4px' }}>
                    No expenses this month
                  </h3>
                  <p style={{ fontSize: '12.5px', color: '#94a3b8', maxWidth: '280px', margin: '0 auto 16px' }}>
                    Category breakdown will automatically generate as you and your roommates record expenses.
                  </p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  {/* Proportional Segmented Progress Bar */}
                  <div style={{
                    display: 'flex',
                    height: '10px',
                    borderRadius: '9999px',
                    overflow: 'hidden',
                    background: 'rgba(255, 255, 255, 0.05)',
                    gap: '2px'
                  }}>
                    {categoryBreakdown.map((cat, idx) => (
                      <div
                        key={idx}
                        title={`${cat.label}: ${cat.percent}%`}
                        style={{
                          width: `${Math.max(cat.percent, 3)}%`,
                          background: cat.color || '#818cf8',
                          transition: 'width 0.4s ease'
                        }}
                      />
                    ))}
                  </div>

                  {/* Category Items List */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {categoryBreakdown.slice(0, 4).map((cat, idx) => {
                      const CatIcon = CATEGORY_ICONS[cat.category] || Receipt;

                      return (
                        <div
                          key={idx}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '8px 12px',
                            borderRadius: '12px',
                            background: 'rgba(255, 255, 255, 0.02)',
                            fontSize: '13px'
                          }}
                        >
                          {/* Dot / Icon + Category Name */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div style={{
                              width: '28px',
                              height: '28px',
                              borderRadius: '8px',
                              background: `${cat.color}22`,
                              color: cat.color,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center'
                            }}>
                              <CatIcon size={14} />
                            </div>
                            <span style={{ fontWeight: 600, color: '#ffffff' }}>
                              {cat.label}
                            </span>
                          </div>

                          {/* Percent & Amount */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <span style={{
                              fontSize: '11px',
                              fontWeight: 700,
                              color: cat.color,
                              background: `${cat.color}1a`,
                              padding: '2px 7px',
                              borderRadius: '9999px'
                            }}>
                              {cat.percent}%
                            </span>
                            <span style={{ fontWeight: 700, color: '#ffffff' }}>
                              {formatINR(cat.amount)}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>

      </div>
    </div>
  );
}
