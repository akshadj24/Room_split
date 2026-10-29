import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Clock,
  XCircle,
  AlertCircle,
  Sparkles,
  ShieldAlert,
  Send,
  Home,
  CreditCard,
  Check,
  X,
  RefreshCw
} from 'lucide-react';
import { settlementsApi, householdsApi } from '../services/api';

const MEMBER_COLORS = [
  { color: '#818cf8', bg: 'rgba(99, 102, 241, 0.22)' },
  { color: '#34d399', bg: 'rgba(16, 185, 129, 0.22)' },
  { color: '#c084fc', bg: 'rgba(192, 132, 252, 0.22)' },
  { color: '#38bdf8', bg: 'rgba(56, 189, 248, 0.22)' },
  { color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.22)' },
  { color: '#ec4899', bg: 'rgba(236, 72, 153, 0.22)' }
];

export default function SettlementsPage({ currentUser, householdId = 1, onBack, onNavigate }) {
  const queryClient = useQueryClient();
  const [payerId, setPayerId] = useState(currentUser?.id || 1);
  const [receiverId, setReceiverId] = useState('');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('UPI');
  const [notes, setNotes] = useState('');
  const [actionMessage, setActionMessage] = useState('');
  const [error, setError] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');

  const {
    data: rawSettlements = [],
    isLoading: settlementsLoading,
    isError: settlementsError,
    error: settlementsErr,
    refetch: refetchSettlements
  } = useQuery({
    queryKey: ['settlements', householdId],
    queryFn: () => settlementsApi.listSettlements(householdId),
    enabled: !!householdId,
  });

  const {
    data: rawMembers = [],
    isLoading: membersLoading
  } = useQuery({
    queryKey: ['members', householdId],
    queryFn: () => householdsApi.getMembers(householdId),
    enabled: !!householdId,
  });

  const members = rawMembers.map((m, idx) => ({
    id: m.id,
    name: m.id === currentUser?.id ? `${m.name} (You)` : m.name,
    initial: m.name ? m.name[0].toUpperCase() : 'M',
    color: MEMBER_COLORS[idx % MEMBER_COLORS.length].color,
    bg: MEMBER_COLORS[idx % MEMBER_COLORS.length].bg,
  }));

  // Auto-set receiver if unset
  React.useEffect(() => {
    if (!receiverId && members.length > 0) {
      const other = members.find(m => m.id !== payerId);
      if (other) setReceiverId(other.id);
    }
  }, [members, payerId, receiverId]);

  const recordMutation = useMutation({
    mutationFn: (data) => settlementsApi.recordSettlement(householdId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settlements', householdId] });
      queryClient.invalidateQueries({ queryKey: ['balances', householdId] });
      queryClient.invalidateQueries({ queryKey: ['dashboard', householdId] });
      setActionMessage('Repayment recorded! Waiting for receiver to confirm.');
      setAmount('');
      setNotes('');
      setError('');
      setTimeout(() => setActionMessage(''), 3500);
    },
    onError: (err) => {
      setError(err.message || 'Failed to record repayment.');
    }
  });

  const confirmMutation = useMutation({
    mutationFn: (settlementId) => settlementsApi.confirmSettlement(settlementId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settlements', householdId] });
      queryClient.invalidateQueries({ queryKey: ['balances', householdId] });
      queryClient.invalidateQueries({ queryKey: ['dashboard', householdId] });
      setActionMessage('Payment confirmed! Balances have been updated.');
      setError('');
      setTimeout(() => setActionMessage(''), 3500);
    },
    onError: (err) => {
      setError(err.message || 'Failed to confirm settlement.');
    }
  });

  const cancelMutation = useMutation({
    mutationFn: (settlementId) => settlementsApi.cancelSettlement(settlementId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settlements', householdId] });
      queryClient.invalidateQueries({ queryKey: ['balances', householdId] });
      queryClient.invalidateQueries({ queryKey: ['dashboard', householdId] });
      setActionMessage('Settlement request cancelled.');
      setError('');
      setTimeout(() => setActionMessage(''), 3500);
    },
    onError: (err) => {
      setError(err.message || 'Failed to cancel settlement.');
    }
  });

  const handleCreateSettlement = async (e) => {
    e.preventDefault();
    setError('');
    setActionMessage('');

    const numAmount = parseFloat(amount) || 0;
    if (numAmount <= 0) {
      setError('Please enter a valid repayment amount greater than 0.');
      return;
    }

    if (payerId === receiverId) {
      setError('Payer and Receiver cannot be the same roommate.');
      return;
    }

    recordMutation.mutate({
      payer_id: payerId,
      receiver_id: receiverId,
      amount_paise: Math.round(numAmount * 100),
      notes: notes.trim() ? `${notes.trim()} (${method})` : `Direct payment via ${method}`
    });
  };

  const settlements = rawSettlements.map(st => {
    const isPayer = st.payer_id === currentUser?.id;
    const isReceiver = st.receiver_id === currentUser?.id;
    const payerName = isPayer ? 'You' : (st.payer_name || `Member #${st.payer_id}`);
    const receiverName = isReceiver ? 'You' : (st.receiver_name || `Member #${st.receiver_id}`);
    const payerInitial = payerName[0]?.toUpperCase() || 'P';
    const receiverInitial = receiverName[0]?.toUpperCase() || 'R';
    const amountRupees = st.amount !== undefined ? st.amount : Math.round(st.amount_paise / 100);

    return {
      id: st.id,
      payerId: st.payer_id,
      payerName,
      payerInitial,
      receiverId: st.receiver_id,
      receiverName,
      receiverInitial,
      amountPaise: st.amount_paise,
      amountRupees,
      status: st.status,
      method: st.method || 'Direct Payment',
      notes: st.notes || '',
      createdAt: st.created_at ? new Date(st.created_at).toLocaleDateString() : 'Recently'
    };
  });

  const filteredSettlements = settlements.filter(s => {
    if (filterStatus === 'all') return true;
    return s.status === filterStatus;
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
      {/* Ambient background glows */}
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
        </header>

        {/* Title */}
        <div style={{ marginBottom: '28px' }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '4px 12px',
            borderRadius: '9999px',
            background: 'rgba(236, 72, 153, 0.12)',
            border: '1px solid rgba(236, 72, 153, 0.3)',
            color: '#f472b6',
            fontSize: '12px',
            fontWeight: 700,
            letterSpacing: '0.04em',
            marginBottom: '10px'
          }}>
            <Sparkles size={13} />
            TWO-WAY REPAYMENT ENGINE
          </div>
          <h1 style={{
            fontSize: '32px',
            fontWeight: 800,
            letterSpacing: '-0.03em',
            margin: '0 0 6px 0',
            color: '#ffffff'
          }}>
            Settlements & Repayments
          </h1>
          <p style={{ fontSize: '14px', color: '#94a3b8', margin: 0 }}>
            Record peer-to-peer repayments and confirm receipts with zero-trust receiver verification.
          </p>
        </div>

        {/* Action Messages */}
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

        {error && (
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
            <span>{error}</span>
          </div>
        )}

        {/* 1. RECORD SETTLEMENT CARD */}
        <div style={{
          background: 'rgba(18, 24, 43, 0.85)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: '24px',
          padding: '24px',
          marginBottom: '32px',
          boxShadow: '0 20px 40px rgba(0, 0, 0, 0.4)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '18px' }}>
            <CreditCard size={18} color="#f472b6" />
            <h3 style={{ fontSize: '16px', fontWeight: 700, margin: 0, color: '#ffffff' }}>
              Record a Repayment
            </h3>
          </div>

          <form onSubmit={handleCreateSettlement}>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '16px',
              marginBottom: '16px'
            }}>
              {/* Payer Select */}
              <div>
                <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 600, color: '#94a3b8', marginBottom: '6px' }}>
                  Who Paid?
                </label>
                <select
                  value={payerId}
                  onChange={(e) => setPayerId(Number(e.target.value))}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: '12px',
                    background: 'rgba(11, 16, 31, 0.8)',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    color: '#ffffff',
                    fontSize: '14px',
                    outline: 'none',
                    cursor: 'pointer'
                  }}
                >
                  {members.map(m => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              </div>

              {/* Receiver Select */}
              <div>
                <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 600, color: '#94a3b8', marginBottom: '6px' }}>
                  Who Received?
                </label>
                <select
                  value={receiverId}
                  onChange={(e) => setReceiverId(Number(e.target.value))}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: '12px',
                    background: 'rgba(11, 16, 31, 0.8)',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    color: '#ffffff',
                    fontSize: '14px',
                    outline: 'none',
                    cursor: 'pointer'
                  }}
                >
                  {members.filter(m => m.id !== payerId).map(m => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              </div>

              {/* Amount */}
              <div>
                <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 600, color: '#94a3b8', marginBottom: '6px' }}>
                  Amount (₹)
                </label>
                <input
                  type="number"
                  placeholder="e.g. 500"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: '12px',
                    background: 'rgba(11, 16, 31, 0.8)',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    color: '#ffffff',
                    fontSize: '14px',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              {/* Payment Method */}
              <div>
                <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 600, color: '#94a3b8', marginBottom: '6px' }}>
                  Payment Method
                </label>
                <select
                  value={method}
                  onChange={(e) => setMethod(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: '12px',
                    background: 'rgba(11, 16, 31, 0.8)',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    color: '#ffffff',
                    fontSize: '14px',
                    outline: 'none',
                    cursor: 'pointer'
                  }}
                >
                  <option value="UPI">UPI / GPay / PhonePe</option>
                  <option value="Cash">Cash</option>
                  <option value="Bank Transfer">Bank Transfer / IMPS</option>
                  <option value="Card">Card</option>
                </select>
              </div>
            </div>

            {/* Notes */}
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 600, color: '#94a3b8', marginBottom: '6px' }}>
                Notes / Reference (Optional)
              </label>
              <input
                type="text"
                placeholder="e.g. Settling weekend groceries share"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: '12px',
                  background: 'rgba(11, 16, 31, 0.8)',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  color: '#ffffff',
                  fontSize: '14px',
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="submit"
                disabled={recordMutation.isPending}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '12px 24px',
                  borderRadius: '9999px',
                  background: 'linear-gradient(135deg, #06b6d4 0%, #ec4899 100%)',
                  border: 'none',
                  color: '#ffffff',
                  fontSize: '14px',
                  fontWeight: 700,
                  cursor: recordMutation.isPending ? 'not-allowed' : 'pointer',
                  boxShadow: '0 4px 16px rgba(236, 72, 153, 0.35)'
                }}
              >
                <Send size={16} />
                <span>{recordMutation.isPending ? 'Recording...' : 'Record Payment'}</span>
              </button>
            </div>
          </form>
        </div>

        {/* 2. SETTLEMENTS LIST HEADER & FILTER */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '16px',
          flexWrap: 'wrap',
          gap: '12px'
        }}>
          <h3 style={{ fontSize: '18px', fontWeight: 700, margin: 0, color: '#ffffff' }}>
            Settlement History & Pending Confirmations
          </h3>

          <div style={{ display: 'flex', gap: '8px' }}>
            {['all', 'pending', 'confirmed'].map((status) => (
              <button
                key={status}
                type="button"
                onClick={() => setFilterStatus(status)}
                style={{
                  padding: '6px 14px',
                  borderRadius: '9999px',
                  border: filterStatus === status ? '1px solid #f472b6' : '1px solid rgba(255, 255, 255, 0.08)',
                  background: filterStatus === status ? 'rgba(236, 72, 153, 0.25)' : 'rgba(11, 16, 31, 0.6)',
                  color: filterStatus === status ? '#ffffff' : '#94a3b8',
                  fontSize: '12.5px',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                {status.charAt(0).toUpperCase() + status.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* LOADING STATE */}
        {settlementsLoading && (
          <div style={{
            padding: '40px 20px',
            textAlign: 'center',
            background: 'rgba(18, 24, 43, 0.6)',
            borderRadius: '24px',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            marginBottom: '24px'
          }}>
            <div style={{
              width: '36px',
              height: '36px',
              border: '3px solid rgba(236, 72, 153, 0.2)',
              borderTopColor: '#f472b6',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
              margin: '0 auto 12px'
            }} />
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            <div style={{ fontSize: '14px', fontWeight: 600, color: '#e2e8f0' }}>
              Loading settlements...
            </div>
          </div>
        )}

        {/* ERROR STATE */}
        {settlementsError && (
          <div style={{
            padding: '20px',
            borderRadius: '16px',
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            marginBottom: '24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <AlertCircle size={20} color="#f87171" />
              <div style={{ fontSize: '13.5px', color: '#fca5a5' }}>
                Failed to load settlements: {settlementsErr?.message}
              </div>
            </div>
            <button
              type="button"
              onClick={() => refetchSettlements()}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                borderRadius: '8px',
                background: 'rgba(239, 68, 68, 0.2)',
                border: '1px solid rgba(239, 68, 68, 0.4)',
                color: '#ffffff',
                fontWeight: 600,
                fontSize: '12px',
                cursor: 'pointer'
              }}
            >
              <RefreshCw size={13} />
              <span>Retry</span>
            </button>
          </div>
        )}

        {/* 3. SETTLEMENTS LIST */}
        {!settlementsLoading && !settlementsError && (
          settlements.length === 0 ? (
            <div style={{
              background: 'rgba(18, 24, 43, 0.85)',
              border: '1px dashed rgba(255, 255, 255, 0.12)',
              borderRadius: '24px',
              padding: '48px 24px',
              textAlign: 'center'
            }}>
              <CheckCircle2 size={40} color="#34d399" style={{ margin: '0 auto 12px' }} />
              <h3 style={{ fontSize: '17px', fontWeight: 700, color: '#ffffff', margin: '0 0 6px 0' }}>
                No settlements recorded yet
              </h3>
              <p style={{ fontSize: '13.5px', color: '#94a3b8', margin: '0 auto', maxWidth: '360px' }}>
                When roommates pay each other back for household expenses, record repayments above to keep balances square.
              </p>
            </div>
          ) : filteredSettlements.length === 0 ? (
            <div style={{
              background: 'rgba(18, 24, 43, 0.85)',
              border: '1px dashed rgba(255, 255, 255, 0.1)',
              borderRadius: '24px',
              padding: '36px 24px',
              textAlign: 'center',
              color: '#94a3b8',
              fontSize: '14px'
            }}>
              No settlements found matching the filter "{filterStatus}".
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {filteredSettlements.map((st) => {
                const isPending = st.status === 'pending';
                const isConfirmed = st.status === 'confirmed';
                const isReceiver = st.receiverId === currentUser?.id;

                return (
                  <div
                    key={st.id}
                    style={{
                      background: 'rgba(18, 24, 43, 0.85)',
                      border: isPending
                        ? '1.5px solid rgba(245, 158, 11, 0.4)'
                        : '1px solid rgba(255, 255, 255, 0.08)',
                      borderRadius: '20px',
                      padding: '20px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: '16px'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                      <div style={{
                        width: '44px',
                        height: '44px',
                        borderRadius: '50%',
                        background: isConfirmed ? 'rgba(16, 185, 129, 0.2)' : 'rgba(245, 158, 11, 0.2)',
                        color: isConfirmed ? '#34d399' : '#fbbf24',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 700,
                        fontSize: '15px'
                      }}>
                        {st.payerInitial}
                      </div>

                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '15.5px', fontWeight: 700, color: '#ffffff' }}>
                            {st.payerName} <span style={{ color: '#94a3b8', fontWeight: 500 }}>paid</span> {st.receiverName}
                          </span>

                          <span style={{
                            padding: '2px 8px',
                            borderRadius: '6px',
                            background: isConfirmed
                              ? 'rgba(16, 185, 129, 0.15)'
                              : isPending
                              ? 'rgba(245, 158, 11, 0.15)'
                              : 'rgba(244, 63, 94, 0.15)',
                            color: isConfirmed
                              ? '#34d399'
                              : isPending
                              ? '#fbbf24'
                              : '#fb7185',
                            fontSize: '11px',
                            fontWeight: 700,
                            textTransform: 'uppercase'
                          }}>
                            {st.status}
                          </span>
                        </div>

                        <div style={{ fontSize: '12.5px', color: '#94a3b8', marginTop: '2px' }}>
                          {st.notes ? `${st.notes} • ` : ''}{st.createdAt}
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                      <span style={{
                        fontSize: '20px',
                        fontWeight: 800,
                        color: isConfirmed ? '#34d399' : '#ffffff'
                      }}>
                        ₹{st.amountRupees.toLocaleString('en-IN')}
                      </span>

                      {/* Security Rule: Receiver only can confirm pending settlements */}
                      {isPending && isReceiver && (
                        <button
                          type="button"
                          disabled={confirmMutation.isPending}
                          onClick={() => confirmMutation.mutate(st.id)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '8px 16px',
                            borderRadius: '9999px',
                            background: 'rgba(16, 185, 129, 0.2)',
                            border: '1px solid rgba(16, 185, 129, 0.4)',
                            color: '#34d399',
                            fontSize: '13px',
                            fontWeight: 700,
                            cursor: 'pointer'
                          }}
                        >
                          <Check size={14} />
                          <span>Confirm Received</span>
                        </button>
                      )}

                      {isPending && !isReceiver && (
                        <span style={{
                          fontSize: '12px',
                          color: '#f59e0b',
                          fontStyle: 'italic'
                        }}>
                          Awaiting {st.receiverName}'s confirmation
                        </span>
                      )}

                      {isPending && (st.payerId === currentUser?.id || st.receiverId === currentUser?.id) && (
                        <button
                          type="button"
                          disabled={cancelMutation.isPending}
                          onClick={() => cancelMutation.mutate(st.id)}
                          title="Cancel settlement request"
                          style={{
                            background: 'none',
                            border: 'none',
                            color: '#64748b',
                            cursor: 'pointer',
                            padding: '4px'
                          }}
                        >
                          <X size={16} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )
        )}
      </div>
    </div>
  );
}
