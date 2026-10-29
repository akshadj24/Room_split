import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  ArrowUpRight,
  ArrowDownLeft,
  CheckCircle2,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Users,
  Receipt,
  Home,
  AlertCircle,
  RefreshCw
} from 'lucide-react';
import { settlementsApi } from '../services/api';

const MEMBER_COLORS = [
  { color: '#818cf8', bg: 'rgba(99, 102, 241, 0.2)' },
  { color: '#34d399', bg: 'rgba(16, 185, 129, 0.2)' },
  { color: '#c084fc', bg: 'rgba(192, 132, 252, 0.2)' },
  { color: '#38bdf8', bg: 'rgba(56, 189, 248, 0.2)' },
  { color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.2)' },
  { color: '#ec4899', bg: 'rgba(236, 72, 153, 0.2)' }
];

export default function BalancesPage({ currentUser, householdId = 1, onNavigate, onBack }) {
  const [expandedMemberId, setExpandedMemberId] = useState(null);

  const {
    data: balanceResponse,
    isLoading,
    isError,
    error,
    refetch
  } = useQuery({
    queryKey: ['balances', householdId],
    queryFn: () => settlementsApi.getBalances(householdId),
    enabled: !!householdId,
  });

  const {
    data: suggestions = []
  } = useQuery({
    queryKey: ['settlement-suggestions', householdId],
    queryFn: () => settlementsApi.getSuggestions(householdId),
    enabled: !!householdId,
  });

  const {
    data: memberBreakdown,
    isLoading: breakdownLoading
  } = useQuery({
    queryKey: ['balance-breakdown', householdId, expandedMemberId],
    queryFn: () => settlementsApi.getBreakdown(householdId, expandedMemberId),
    enabled: !!householdId && !!expandedMemberId,
  });

  const rawBalances = balanceResponse?.balances || [];

  const members = rawBalances.map((mb, idx) => {
    const isMe = mb.user_id === currentUser?.id;
    const initial = mb.name ? mb.name[0].toUpperCase() : 'U';
    const styling = MEMBER_COLORS[idx % MEMBER_COLORS.length];
    const netRupees = mb.net_balance !== undefined ? mb.net_balance : Math.round(mb.net_balance_paise / 100);

    return {
      id: mb.user_id,
      name: isMe ? `${mb.name} (You)` : mb.name,
      initial,
      color: styling.color,
      bg: styling.bg,
      netPaise: mb.net_balance_paise,
      netRupees,
      isOwed: netRupees > 0,
      isMe
    };
  });

  const myBalance = members.find(m => m.isMe);
  const netBalance = myBalance ? myBalance.netRupees : 0;
  const totalOwedToYou = suggestions
    .filter(s => s.to_user_id === currentUser?.id)
    .reduce((acc, s) => acc + (s.amount || Math.round(s.amount_paise / 100)), 0);
  const totalYouOwe = suggestions
    .filter(s => s.from_user_id === currentUser?.id)
    .reduce((acc, s) => acc + (s.amount || Math.round(s.amount_paise / 100)), 0);

  const formattedTransfers = suggestions.map((s, idx) => {
    const isYouPayer = s.from_user_id === currentUser?.id;
    const isYouReceiver = s.to_user_id === currentUser?.id;
    const payerName = isYouPayer ? 'You' : s.from_user_name;
    const receiverName = isYouReceiver ? 'You' : s.to_user_name;
    const payerInitial = payerName[0]?.toUpperCase() || 'P';
    const amount = s.amount !== undefined ? s.amount : Math.round(s.amount_paise / 100);

    return {
      id: `tr-${idx}`,
      payerName,
      payerInitial,
      receiverName,
      amount,
      isYouPayer,
      isYouReceiver
    };
  });

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
        background: 'radial-gradient(circle, rgba(16, 185, 129, 0.15) 0%, rgba(99, 102, 241, 0.08) 50%, transparent 70%)',
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
        maxWidth: '860px',
        margin: '0 auto',
        position: 'relative',
        zIndex: 1
      }}>
        {/* 1. TOP HEADER ROW */}
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
            onClick={() => onNavigate && onNavigate('settlements')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 18px',
              borderRadius: '9999px',
              background: 'linear-gradient(135deg, #06b6d4 0%, #ec4899 100%)',
              border: 'none',
              color: '#ffffff',
              fontSize: '13px',
              fontWeight: 700,
              cursor: 'pointer',
              boxShadow: '0 4px 16px rgba(236, 72, 153, 0.3)'
            }}
          >
            <span>Record Settlement</span>
          </button>
        </header>

        {/* Page Title */}
        <div style={{ marginBottom: '28px' }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '4px 12px',
            borderRadius: '9999px',
            background: 'rgba(16, 185, 129, 0.12)',
            border: '1px solid rgba(16, 185, 129, 0.3)',
            color: '#34d399',
            fontSize: '12px',
            fontWeight: 700,
            letterSpacing: '0.04em',
            marginBottom: '10px'
          }}>
            <Sparkles size={13} />
            HOUSEHOLD BALANCE SHEET
          </div>
          <h1 style={{
            fontSize: '32px',
            fontWeight: 800,
            letterSpacing: '-0.03em',
            margin: '0 0 6px 0',
            color: '#ffffff'
          }}>
            Balances & Debts
          </h1>
          <p style={{ fontSize: '14px', color: '#94a3b8', margin: 0 }}>
            Real-time net standing, transparent expense breakdown, and minimum-transaction settlement routes.
          </p>
        </div>

        {/* LOADING STATE */}
        {isLoading && (
          <div style={{
            padding: '60px 20px',
            textAlign: 'center',
            background: 'rgba(18, 24, 43, 0.6)',
            borderRadius: '24px',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            marginBottom: '28px'
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
              Calculating household net balances...
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
            marginBottom: '28px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '16px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <AlertCircle size={24} color="#f87171" />
              <div>
                <div style={{ fontSize: '15px', fontWeight: 700, color: '#fca5a5' }}>
                  Unable to calculate balances
                </div>
                <div style={{ fontSize: '13px', color: '#94a3b8' }}>
                  {error?.message || 'Failed to reach the balance service.'}
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
            {/* 2. HERO NET STANDING CARD */}
            <div style={{
              background: netBalance > 0
                ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.1) 0%, rgba(18, 24, 43, 0.9) 100%)'
                : netBalance < 0
                ? 'linear-gradient(135deg, rgba(244, 63, 94, 0.1) 0%, rgba(18, 24, 43, 0.9) 100%)'
                : 'linear-gradient(135deg, rgba(56, 189, 248, 0.1) 0%, rgba(18, 24, 43, 0.9) 100%)',
              border: netBalance > 0
                ? '1.5px solid rgba(16, 185, 129, 0.4)'
                : netBalance < 0
                ? '1.5px solid rgba(244, 63, 94, 0.4)'
                : '1.5px solid rgba(56, 189, 248, 0.4)',
              borderRadius: '24px',
              padding: '28px 24px',
              marginBottom: '28px',
              boxShadow: netBalance > 0
                ? '0 0 35px rgba(16, 185, 129, 0.15), 0 20px 40px rgba(0, 0, 0, 0.5)'
                : netBalance < 0
                ? '0 0 35px rgba(244, 63, 94, 0.15), 0 20px 40px rgba(0, 0, 0, 0.5)'
                : '0 0 35px rgba(56, 189, 248, 0.15), 0 20px 40px rgba(0, 0, 0, 0.5)',
              position: 'relative',
              overflow: 'hidden'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '20px' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                    <span style={{
                      fontSize: '12px',
                      fontWeight: 700,
                      letterSpacing: '0.08em',
                      color: netBalance > 0 ? '#34d399' : netBalance < 0 ? '#fb7185' : '#38bdf8'
                    }}>
                      YOUR OVERALL NET BALANCE
                    </span>
                    <span style={{
                      fontSize: '11px',
                      fontWeight: 700,
                      background: netBalance > 0 ? 'rgba(16, 185, 129, 0.2)' : netBalance < 0 ? 'rgba(244, 63, 94, 0.2)' : 'rgba(56, 189, 248, 0.2)',
                      color: netBalance > 0 ? '#6ee7b7' : netBalance < 0 ? '#fda4af' : '#7dd3fc',
                      padding: '2px 8px',
                      borderRadius: '9999px',
                      border: '1px solid rgba(255, 255, 255, 0.1)'
                    }}>
                      {netBalance > 0 ? 'Net Creditor' : netBalance < 0 ? 'Net Debtor' : 'Settled'}
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
                    <span style={{
                      fontSize: '48px',
                      fontWeight: 800,
                      letterSpacing: '-0.03em',
                      color: netBalance > 0 ? '#34d399' : netBalance < 0 ? '#fb7185' : '#38bdf8',
                      lineHeight: 1
                    }}>
                      {netBalance > 0 ? `+₹${netBalance.toLocaleString('en-IN')}` : netBalance < 0 ? `-₹${Math.abs(netBalance).toLocaleString('en-IN')}` : '₹0'}
                    </span>
                    {netBalance > 0 && <ArrowUpRight size={32} color="#34d399" strokeWidth={2.5} />}
                    {netBalance < 0 && <ArrowDownLeft size={32} color="#fb7185" strokeWidth={2.5} />}
                    {netBalance === 0 && <CheckCircle2 size={32} color="#38bdf8" strokeWidth={2.5} />}
                  </div>

                  {/* Sub-Pills */}
                  <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '8px 16px',
                      borderRadius: '9999px',
                      background: 'rgba(11, 16, 31, 0.85)',
                      border: '1px solid rgba(16, 185, 129, 0.25)'
                    }}>
                      <span style={{ fontSize: '11px', color: '#94a3b8' }}>Owed to you:</span>
                      <span style={{ fontSize: '14px', fontWeight: 700, color: '#34d399' }}>
                        ₹{totalOwedToYou.toLocaleString('en-IN')}
                      </span>
                    </div>

                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '8px 16px',
                      borderRadius: '9999px',
                      background: 'rgba(11, 16, 31, 0.85)',
                      border: '1px solid rgba(244, 63, 94, 0.25)'
                    }}>
                      <span style={{ fontSize: '11px', color: '#94a3b8' }}>You owe:</span>
                      <span style={{ fontSize: '14px', fontWeight: 700, color: '#fb7185' }}>
                        ₹{totalYouOwe.toLocaleString('en-IN')}
                      </span>
                    </div>
                  </div>
                </div>

                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '10px 14px',
                  borderRadius: '16px',
                  background: 'rgba(11, 16, 31, 0.8)',
                  border: '1px solid rgba(255, 255, 255, 0.1)'
                }}>
                  <ShieldCheck size={18} color="#38bdf8" />
                  <div>
                    <div style={{ fontSize: '11.5px', color: '#94a3b8' }}>Zero-Sum Invariant</div>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: '#38bdf8' }}>
                      ∑ All Balances = ₹0.00
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* 3. SMART SETTLEMENT TRANSFERS */}
            <div style={{
              background: 'rgba(18, 24, 43, 0.85)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '24px',
              padding: '24px',
              marginBottom: '28px',
              boxShadow: '0 20px 40px rgba(0, 0, 0, 0.4)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '10px',
                    background: 'rgba(99, 102, 241, 0.2)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    <Sparkles size={16} color="#818cf8" />
                  </div>
                  <div>
                    <h3 style={{ fontSize: '16px', fontWeight: 700, margin: 0, color: '#ffffff' }}>
                      Smart Settlement Routes
                    </h3>
                    <span style={{ fontSize: '12px', color: '#94a3b8' }}>
                      Minimum-transaction graph algorithms optimize payments
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => onNavigate && onNavigate('settlements')}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '9999px',
                    background: 'linear-gradient(135deg, #06b6d4 0%, #ec4899 100%)',
                    border: 'none',
                    color: '#ffffff',
                    fontSize: '12.5px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    boxShadow: '0 4px 16px rgba(236, 72, 153, 0.3)'
                  }}
                >
                  Record Repayment
                </button>
              </div>

              {formattedTransfers.length === 0 ? (
                <div style={{
                  padding: '24px',
                  borderRadius: '16px',
                  background: 'rgba(11, 16, 31, 0.6)',
                  border: '1px dashed rgba(255, 255, 255, 0.1)',
                  textAlign: 'center'
                }}>
                  <CheckCircle2 size={24} color="#34d399" style={{ margin: '0 auto 8px' }} />
                  <div style={{ fontSize: '14px', fontWeight: 600, color: '#ffffff' }}>
                    All settled up!
                  </div>
                  <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '2px' }}>
                    No pending transfers required across the household.
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {formattedTransfers.map((item) => (
                    <div
                      key={item.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '16px 20px',
                        borderRadius: '16px',
                        background: 'rgba(11, 16, 31, 0.6)',
                        border: item.isYouReceiver ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(244, 63, 94, 0.3)',
                        flexWrap: 'wrap',
                        gap: '12px'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                        <div style={{
                          width: '36px',
                          height: '36px',
                          borderRadius: '50%',
                          background: item.isYouReceiver ? 'rgba(16, 185, 129, 0.2)' : 'rgba(99, 102, 241, 0.2)',
                          color: item.isYouReceiver ? '#34d399' : '#818cf8',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: 700,
                          fontSize: '14px'
                        }}>
                          {item.payerInitial}
                        </div>

                        <div>
                          <div style={{ fontSize: '14.5px', fontWeight: 700, color: '#ffffff' }}>
                            {item.payerName} <span style={{ color: '#94a3b8', fontWeight: 500 }}>pays</span> {item.receiverName}
                          </div>
                          <div style={{ fontSize: '12px', color: item.isYouReceiver ? '#34d399' : '#fb7185' }}>
                            {item.isYouReceiver ? 'Incoming payment to you' : item.isYouPayer ? 'You owe this payment' : 'Roommate settlement'}
                          </div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                        <span style={{
                          fontSize: '18px',
                          fontWeight: 800,
                          color: item.isYouReceiver ? '#34d399' : '#fb7185'
                        }}>
                          ₹{item.amount.toLocaleString('en-IN')}
                        </span>

                        <button
                          type="button"
                          onClick={() => onNavigate && onNavigate('settlements')}
                          style={{
                            padding: '8px 14px',
                            borderRadius: '9999px',
                            background: 'rgba(255, 255, 255, 0.08)',
                            border: '1px solid rgba(255, 255, 255, 0.15)',
                            color: '#ffffff',
                            fontSize: '12px',
                            fontWeight: 600,
                            cursor: 'pointer'
                          }}
                        >
                          {item.isYouPayer ? 'Settle Now' : 'Details'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 4. PER-MEMBER BALANCES & "WHY DO I OWE" BREAKDOWN */}
            <div style={{
              background: 'rgba(18, 24, 43, 0.85)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '24px',
              padding: '24px',
              boxShadow: '0 20px 40px rgba(0, 0, 0, 0.4)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                <Users size={18} color="#818cf8" />
                <h3 style={{ fontSize: '16px', fontWeight: 700, margin: 0, color: '#ffffff' }}>
                  Roommate Standings & Breakdown
                </h3>
              </div>
              <p style={{ fontSize: '13px', color: '#94a3b8', marginTop: '-8px', marginBottom: '18px' }}>
                Tap any roommate to expand the "Why do I owe?" itemized calculation.
              </p>

              {members.length === 0 ? (
                <div style={{
                  padding: '36px 20px',
                  borderRadius: '16px',
                  background: 'rgba(11, 16, 31, 0.6)',
                  border: '1px dashed rgba(255, 255, 255, 0.1)',
                  textAlign: 'center'
                }}>
                  <Users size={32} color="#64748b" style={{ margin: '0 auto 10px' }} />
                  <div style={{ fontSize: '15px', fontWeight: 700, color: '#ffffff' }}>
                    No members in household
                  </div>
                  <div style={{ fontSize: '13px', color: '#94a3b8', marginTop: '4px' }}>
                    Invite your roommates via the Settings page to begin splitting.
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {members.map((member) => {
                    const isExpanded = expandedMemberId === member.id;
                    const isPositive = member.netRupees > 0;
                    const isZero = member.netRupees === 0;

                    return (
                      <div
                        key={member.id}
                        style={{
                          borderRadius: '16px',
                          background: 'rgba(11, 16, 31, 0.6)',
                          border: isExpanded ? '1.5px solid rgba(99, 102, 241, 0.4)' : '1px solid rgba(255, 255, 255, 0.08)',
                          overflow: 'hidden',
                          transition: 'all 0.2s'
                        }}
                      >
                        <div
                          onClick={() => setExpandedMemberId(isExpanded ? null : member.id)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '16px 20px',
                            cursor: 'pointer',
                            background: isExpanded ? 'rgba(99, 102, 241, 0.08)' : 'transparent'
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <div style={{
                              width: '36px',
                              height: '36px',
                              borderRadius: '50%',
                              background: member.bg,
                              color: member.color,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontWeight: 700,
                              fontSize: '14px'
                            }}>
                              {member.initial}
                            </div>
                            <div>
                              <div style={{ fontSize: '14.5px', fontWeight: 700, color: '#ffffff' }}>
                                {member.name}
                              </div>
                              <div style={{ fontSize: '12px', color: '#94a3b8' }}>
                                {isPositive ? 'Is owed money in total' : isZero ? 'All settled up' : 'Has outstanding balance'}
                              </div>
                            </div>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <span style={{
                              fontSize: '17px',
                              fontWeight: 800,
                              color: isPositive ? '#34d399' : isZero ? '#94a3b8' : '#fb7185'
                            }}>
                              {isPositive ? `+₹${member.netRupees.toLocaleString('en-IN')}` : isZero ? '₹0' : `-₹${Math.abs(member.netRupees).toLocaleString('en-IN')}`}
                            </span>

                            {isExpanded ? (
                              <ChevronUp size={18} color="#94a3b8" />
                            ) : (
                              <ChevronDown size={18} color="#94a3b8" />
                            )}
                          </div>
                        </div>

                        {/* Expandable Breakdown Drawer */}
                        {isExpanded && (
                          <div style={{
                            padding: '16px 20px 20px',
                            borderTop: '1px solid rgba(255, 255, 255, 0.08)',
                            background: 'rgba(11, 16, 31, 0.9)'
                          }}>
                            <div style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px',
                              fontSize: '12px',
                              fontWeight: 700,
                              color: '#818cf8',
                              textTransform: 'uppercase',
                              letterSpacing: '0.06em',
                              marginBottom: '12px'
                            }}>
                              <Receipt size={14} />
                              <span>Itemized Split Breakdown</span>
                            </div>

                            {breakdownLoading ? (
                              <div style={{ fontSize: '13px', color: '#94a3b8', padding: '8px 0' }}>
                                Fetching itemized ledger entries...
                              </div>
                            ) : (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                {memberBreakdown?.items && memberBreakdown.items.length > 0 ? (
                                  memberBreakdown.items.map((row) => {
                                    const amount = row.effect_rupees !== undefined ? row.effect_rupees : Math.round(row.effect_paise / 100);
                                    return (
                                      <div
                                        key={row.id}
                                        style={{
                                          display: 'flex',
                                          alignItems: 'center',
                                          justifyContent: 'space-between',
                                          padding: '10px 14px',
                                          borderRadius: '10px',
                                          background: 'rgba(255, 255, 255, 0.03)',
                                          fontSize: '13px'
                                        }}
                                      >
                                        <div>
                                          <span style={{ fontWeight: 600, color: '#ffffff' }}>{row.description}</span>
                                          {row.other_party && (
                                            <span style={{ display: 'block', fontSize: '11.5px', color: '#94a3b8' }}>
                                              {row.other_party} • {row.date || 'Recent'}
                                            </span>
                                          )}
                                        </div>
                                        <span style={{
                                          fontWeight: 700,
                                          color: amount >= 0 ? '#34d399' : '#fb7185'
                                        }}>
                                          {amount >= 0 ? `+₹${amount.toLocaleString('en-IN')}` : `-₹${Math.abs(amount).toLocaleString('en-IN')}`}
                                        </span>
                                      </div>
                                    );
                                  })
                                ) : (
                                  <div style={{ fontSize: '13px', color: '#94a3b8' }}>
                                    No direct ledger entries found for this roommate.
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
