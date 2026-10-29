import React from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  Calendar,
  Sparkles,
  ShoppingBag,
  Zap,
  Utensils,
  Home,
  Car,
  Receipt,
  AlertCircle,
  RefreshCw,
  PieChart
} from 'lucide-react';
import { householdsApi } from '../services/api';

const CATEGORY_ICONS = {
  Groceries: ShoppingBag,
  WiFi: Zap,
  Food: Utensils,
  Rent: Home,
  Transport: Car,
  Other: Receipt
};

export default function AnalyticsPage({ currentUser, householdId = 1, onBack }) {
  const {
    data: analytics,
    isLoading,
    isError,
    error,
    refetch
  } = useQuery({
    queryKey: ['analytics', householdId],
    queryFn: () => householdsApi.getAnalytics(householdId),
    enabled: !!householdId,
  });

  const timeRange = analytics?.time_range || 'Current Period';
  const totalSpend = analytics?.total_spend_rupees || 0;
  const categoryBreakdown = analytics?.category_breakdown || [];
  const monthlyHistory = analytics?.monthly_history || [];
  const memberShares = analytics?.member_shares || [];

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
        background: 'radial-gradient(circle, rgba(139, 92, 246, 0.15) 0%, rgba(99, 102, 241, 0.08) 50%, transparent 70%)',
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

          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '8px 16px',
            borderRadius: '9999px',
            background: 'rgba(18, 24, 43, 0.85)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            fontSize: '13px',
            fontWeight: 600,
            color: '#ffffff'
          }}>
            <Calendar size={15} color="#818cf8" />
            <span>{timeRange}</span>
          </div>
        </header>

        {/* Title */}
        <div style={{ marginBottom: '24px' }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '4px 12px',
            borderRadius: '9999px',
            background: 'rgba(139, 92, 246, 0.15)',
            border: '1px solid rgba(139, 92, 246, 0.35)',
            color: '#c084fc',
            fontSize: '12px',
            fontWeight: 700,
            letterSpacing: '0.04em',
            marginBottom: '10px'
          }}>
            <Sparkles size={13} />
            SPENDING INTELLIGENCE
          </div>
          <h1 style={{
            fontSize: '32px',
            fontWeight: 800,
            letterSpacing: '-0.03em',
            margin: '0 0 6px 0',
            color: '#ffffff'
          }}>
            Household Analytics
          </h1>
          <p style={{ fontSize: '14px', color: '#94a3b8', margin: 0 }}>
            Track group burn rate, budget thresholds, and member consumption parity.
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
            marginBottom: '24px'
          }}>
            <div style={{
              width: '40px',
              height: '40px',
              border: '3px solid rgba(139, 92, 246, 0.2)',
              borderTopColor: '#c084fc',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
              margin: '0 auto 16px'
            }} />
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            <div style={{ fontSize: '15px', fontWeight: 600, color: '#e2e8f0' }}>
              Compiling household analytics...
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
                  Unable to load analytics
                </div>
                <div style={{ fontSize: '13px', color: '#94a3b8' }}>
                  {error?.message || 'Failed to connect to analytics service.'}
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
          totalSpend === 0 && categoryBreakdown.length === 0 ? (
            <div style={{
              background: 'rgba(18, 24, 43, 0.85)',
              border: '1px dashed rgba(255, 255, 255, 0.12)',
              borderRadius: '24px',
              padding: '60px 24px',
              textAlign: 'center'
            }}>
              <PieChart size={48} color="#64748b" style={{ margin: '0 auto 16px' }} />
              <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#ffffff', margin: '0 0 8px 0' }}>
                Not enough expense data to generate analytics
              </h3>
              <p style={{ fontSize: '14px', color: '#94a3b8', margin: '0 auto', maxWidth: '380px' }}>
                Log expenses in the Expenses page to visualize category distributions, 6-month trends, and member consumption parity.
              </p>
            </div>
          ) : (
            <>
              {/* 1. TOP METRIC CARDS */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
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
                    ₹{totalSpend.toLocaleString('en-IN')}
                  </div>
                  <div style={{ fontSize: '12px', color: '#34d399', fontWeight: 600, marginTop: '4px' }}>
                    {timeRange}
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
                    Active Categories
                  </span>
                  <div style={{ fontSize: '28px', fontWeight: 800, color: '#38bdf8', marginTop: '6px' }}>
                    {categoryBreakdown.length}
                  </div>
                  <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>
                    across household
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
                    Contributing Members
                  </span>
                  <div style={{ fontSize: '28px', fontWeight: 800, color: '#c084fc', marginTop: '6px' }}>
                    {memberShares.length}
                  </div>
                  <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>
                    active roommates
                  </div>
                </div>
              </div>

              {/* 2. CATEGORY BREAKDOWN PROGRESS & LIST */}
              {categoryBreakdown.length > 0 && (
                <div style={{
                  background: 'rgba(18, 24, 43, 0.85)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '24px',
                  padding: '24px',
                  marginBottom: '24px',
                  boxShadow: '0 20px 40px rgba(0, 0, 0, 0.4)'
                }}>
                  <h3 style={{ fontSize: '18px', fontWeight: 800, margin: '0 0 16px 0', color: '#ffffff' }}>
                    Category Spending Distribution
                  </h3>

                  {/* Segmented Progress Bar */}
                  <div style={{
                    height: '14px',
                    width: '100%',
                    borderRadius: '9999px',
                    background: 'rgba(255, 255, 255, 0.05)',
                    overflow: 'hidden',
                    display: 'flex',
                    marginBottom: '24px'
                  }}>
                    {categoryBreakdown.map((cat, i) => (
                      <div
                        key={i}
                        style={{
                          width: `${cat.percent}%`,
                          height: '100%',
                          backgroundColor: cat.color,
                          transition: 'width 0.4s ease'
                        }}
                        title={`${cat.label}: ${cat.percent}%`}
                      />
                    ))}
                  </div>

                  {/* Itemized Category Cards */}
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                    gap: '12px'
                  }}>
                    {categoryBreakdown.map((cat, i) => {
                      const Icon = CATEGORY_ICONS[cat.category] || Receipt;
                      return (
                        <div
                          key={i}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '14px 18px',
                            borderRadius: '16px',
                            background: 'rgba(11, 16, 31, 0.6)',
                            border: '1px solid rgba(255, 255, 255, 0.06)'
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <div style={{
                              width: '36px',
                              height: '36px',
                              borderRadius: '12px',
                              background: cat.bg,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center'
                            }}>
                              <Icon size={18} color={cat.color} />
                            </div>
                            <div>
                              <div style={{ fontSize: '14px', fontWeight: 700, color: '#ffffff' }}>
                                {cat.label}
                              </div>
                              <div style={{ fontSize: '12px', color: '#94a3b8' }}>
                                {cat.percent}% of total
                              </div>
                            </div>
                          </div>

                          <span style={{ fontSize: '15px', fontWeight: 800, color: '#ffffff' }}>
                            ₹{cat.amount.toLocaleString('en-IN')}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 3. 6-MONTH SPENDING TREND BAR CHART */}
              {monthlyHistory.length > 0 && (
                <div style={{
                  background: 'rgba(18, 24, 43, 0.85)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '24px',
                  padding: '24px',
                  marginBottom: '24px',
                  boxShadow: '0 20px 40px rgba(0, 0, 0, 0.4)'
                }}>
                  <h3 style={{ fontSize: '18px', fontWeight: 800, margin: '0 0 6px 0', color: '#ffffff' }}>
                    6-Month Household Spending Trend
                  </h3>
                  <p style={{ fontSize: '13px', color: '#94a3b8', margin: '0 0 28px 0' }}>
                    Monthly expenditure progression over the last 6 months.
                  </p>

                  <div style={{
                    display: 'flex',
                    alignItems: 'flex-end',
                    justifyContent: 'space-between',
                    height: '180px',
                    padding: '0 16px 24px',
                    borderBottom: '1px solid rgba(255, 255, 255, 0.08)'
                  }}>
                    {monthlyHistory.map((m, idx) => (
                      <div key={idx} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', flex: 1 }}>
                        <span style={{ fontSize: '12px', fontWeight: 700, color: m.current ? '#34d399' : '#94a3b8' }}>
                          ₹{(m.amount / 1000).toFixed(1)}k
                        </span>
                        <div style={{
                          width: '42px',
                          height: `${m.height}%`,
                          borderRadius: '10px 10px 4px 4px',
                          background: m.current
                            ? 'linear-gradient(180deg, #34d399 0%, rgba(16, 185, 129, 0.3) 100%)'
                            : 'linear-gradient(180deg, #6366f1 0%, rgba(99, 102, 241, 0.2) 100%)',
                          boxShadow: m.current ? '0 0 16px rgba(16, 185, 129, 0.4)' : 'none',
                          transition: 'height 0.3s ease'
                        }} />
                        <span style={{ fontSize: '12px', fontWeight: m.current ? 700 : 500, color: m.current ? '#ffffff' : '#94a3b8' }}>
                          {m.month}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 4. MEMBER CONTRIBUTION MATRIX */}
              {memberShares.length > 0 && (
                <div style={{
                  background: 'rgba(18, 24, 43, 0.85)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '24px',
                  padding: '24px',
                  boxShadow: '0 20px 40px rgba(0, 0, 0, 0.4)'
                }}>
                  <h3 style={{ fontSize: '18px', fontWeight: 800, margin: '0 0 6px 0', color: '#ffffff' }}>
                    Roommate Contribution Matrix
                  </h3>
                  <p style={{ fontSize: '13px', color: '#94a3b8', margin: '0 0 20px 0' }}>
                    Comparison between upfront payments made vs fair share consumed.
                  </p>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {memberShares.map((m, idx) => (
                      <div
                        key={idx}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '16px 20px',
                          borderRadius: '16px',
                          background: 'rgba(11, 16, 31, 0.6)',
                          border: '1px solid rgba(255, 255, 255, 0.08)',
                          flexWrap: 'wrap',
                          gap: '12px'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <div style={{
                            width: '36px',
                            height: '36px',
                            borderRadius: '50%',
                            background: `${m.color}25`,
                            color: m.color,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: 700,
                            fontSize: '14px'
                          }}>
                            {m.initial}
                          </div>
                          <div>
                            <div style={{ fontSize: '14.5px', fontWeight: 700, color: '#ffffff' }}>
                              {m.name}
                            </div>
                            <div style={{ fontSize: '12px', color: '#94a3b8' }}>
                              Paid upfront: ₹{m.paid.toLocaleString('en-IN')} • Consumed share: ₹{m.consumed.toLocaleString('en-IN')}
                            </div>
                          </div>
                        </div>

                        <div style={{ textAlign: 'right' }}>
                          <span style={{
                            fontSize: '16px',
                            fontWeight: 800,
                            color: m.net >= 0 ? '#34d399' : '#fb7185'
                          }}>
                            {m.net >= 0 ? `+₹${m.net.toLocaleString('en-IN')}` : `-₹${Math.abs(m.net).toLocaleString('en-IN')}`}
                          </span>
                          <div style={{ fontSize: '11px', color: '#94a3b8' }}>
                            {m.net >= 0 ? 'Net creditor' : 'Net debtor'}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )
        )}
      </div>
    </div>
  );
}
