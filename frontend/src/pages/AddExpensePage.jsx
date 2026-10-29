import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Utensils,
  ShoppingBag,
  Home,
  Zap,
  Car,
  Receipt,
  Check,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  User,
  Calendar,
  Layers,
  ChevronDown
} from 'lucide-react';
import brandLogoImg from '../assets/brand_logo.png';
import { expensesApi, householdsApi } from '../services/api';

const CATEGORIES = [
  { id: 'Groceries', label: 'Groceries', icon: ShoppingBag, color: '#10b981', bg: 'rgba(16, 185, 129, 0.16)' },
  { id: 'WiFi', label: 'WiFi & Bills', icon: Zap, color: '#06b6d4', bg: 'rgba(6, 182, 212, 0.16)' },
  { id: 'Food', label: 'Food & Dining', icon: Utensils, color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.16)' },
  { id: 'Rent', label: 'Apartment Rent', icon: Home, color: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.16)' },
  { id: 'Transport', label: 'Transport / Cab', icon: Car, color: '#38bdf8', bg: 'rgba(56, 189, 248, 0.16)' },
  { id: 'Other', label: 'General / Other', icon: Receipt, color: '#94a3b8', bg: 'rgba(148, 163, 184, 0.16)' },
];

const MEMBER_COLORS = [
  { color: '#818cf8', bg: 'rgba(99, 102, 241, 0.22)' },
  { color: '#34d399', bg: 'rgba(16, 185, 129, 0.22)' },
  { color: '#c084fc', bg: 'rgba(192, 132, 252, 0.22)' },
  { color: '#38bdf8', bg: 'rgba(56, 189, 248, 0.22)' },
  { color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.22)' },
  { color: '#ec4899', bg: 'rgba(236, 72, 153, 0.22)' }
];

export default function AddExpensePage({ currentUser, householdId = 1, onCancel, onSuccess, initialMembers }) {
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('Groceries');
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().split('T')[0]);
  const [paidBy, setPaidBy] = useState(currentUser?.id || 1);
  const [splitType, setSplitType] = useState('equal'); // 'equal' | 'custom' | 'weighted'

  const {
    data: rawFetchedMembers = [],
    isLoading: membersLoading
  } = useQuery({
    queryKey: ['members', householdId],
    queryFn: () => householdsApi.getMembers(householdId),
    enabled: !!householdId,
  });

  const { data: household } = useQuery({
    queryKey: ['household', householdId],
    queryFn: () => householdsApi.getHousehold(householdId),
    enabled: !!householdId,
  });

  const memberSource = initialMembers || (rawFetchedMembers.length > 0 ? rawFetchedMembers : (currentUser ? [{ id: currentUser.id, name: currentUser.name, email: currentUser.email }] : []));

  const members = memberSource.map((m, idx) => ({
    id: m.id,
    name: m.id === currentUser?.id ? `${m.name} (You)` : m.name,
    initial: m.name ? m.name[0].toUpperCase() : 'M',
    color: MEMBER_COLORS[idx % MEMBER_COLORS.length].color,
    bg: MEMBER_COLORS[idx % MEMBER_COLORS.length].bg,
  }));

  // Selected participants (Default: all selected)
  const [selectedParticipants, setSelectedParticipants] = useState(() => members.map(m => m.id));

  // For custom split: user_id -> custom amount in rupees
  const [customShares, setCustomShares] = useState({});

  // For weighted split: user_id -> weight multiplier
  const [weights, setWeights] = useState({});

  useEffect(() => {
    if (members.length > 0) {
      setSelectedParticipants(prev => {
        const valid = prev.filter(id => members.some(m => m.id === id));
        return valid.length > 0 ? valid : members.map(m => m.id);
      });
      setWeights(prev => {
        const next = { ...prev };
        members.forEach(m => {
          if (!next[m.id]) next[m.id] = 1;
        });
        return next;
      });
      if (!members.some(m => m.id === paidBy)) {
        setPaidBy(members[0].id);
      }
    }
  }, [members.length]);

  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');


  // Auto-calculate split preview
  const numAmount = parseFloat(amount) || 0;
  const numParticipants = selectedParticipants.length;

  const toggleParticipant = (memberId) => {
    if (selectedParticipants.includes(memberId)) {
      if (selectedParticipants.length === 1) return; // Keep at least one
      setSelectedParticipants(selectedParticipants.filter(id => id !== memberId));
    } else {
      setSelectedParticipants([...selectedParticipants, memberId]);
    }
  };

  const selectAllParticipants = () => {
    setSelectedParticipants(members.map(m => m.id));
  };

  // Calculate live preview shares
  const getCalculatedShares = () => {
    if (numAmount <= 0 || numParticipants === 0) return {};

    if (splitType === 'equal') {
      const amountPaise = Math.round(numAmount * 100);
      const ceilShare = Math.floor((amountPaise + numParticipants - 1) / numParticipants);
      const shares = {};

      if (selectedParticipants.includes(paidBy)) {
        selectedParticipants.forEach(uid => {
          if (uid !== paidBy) {
            shares[uid] = ceilShare / 100;
          }
        });
        const othersSum = Object.values(shares).reduce((a, b) => a + b, 0);
        shares[paidBy] = Math.round((numAmount - othersSum) * 100) / 100;
      } else {
        selectedParticipants.slice(0, -1).forEach(uid => {
          shares[uid] = ceilShare / 100;
        });
        const othersSum = Object.values(shares).reduce((a, b) => a + b, 0);
        shares[selectedParticipants[selectedParticipants.length - 1]] = Math.round((numAmount - othersSum) * 100) / 100;
      }
      return shares;
    }

    if (splitType === 'custom') {
      const shares = {};
      selectedParticipants.forEach(uid => {
        shares[uid] = parseFloat(customShares[uid]) || 0;
      });
      return shares;
    }

    if (splitType === 'weighted') {
      const totalWeight = selectedParticipants.reduce((sum, uid) => sum + (parseFloat(weights[uid]) || 1), 0);
      if (totalWeight <= 0) return {};

      const shares = {};
      selectedParticipants.slice(0, -1).forEach(uid => {
        const w = parseFloat(weights[uid]) || 1;
        const s = Math.floor((numAmount * (w / totalWeight)) * 100) / 100;
        shares[uid] = s;
      });
      const othersSum = Object.values(shares).reduce((a, b) => a + b, 0);
      const lastId = selectedParticipants[selectedParticipants.length - 1];
      shares[lastId] = Math.round((numAmount - othersSum) * 100) / 100;
      return shares;
    }

    return {};
  };

  const calculatedShares = getCalculatedShares();

  // Validate custom sums
  const currentTotalAllocated = Object.values(customShares).reduce((sum, val) => sum + (parseFloat(val) || 0), 0);
  const isCustomSumValid = Math.abs(currentTotalAllocated - numAmount) < 0.01;

  const createMutation = useMutation({
    mutationFn: (payload) => expensesApi.createExpense(householdId, payload),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['expenses', householdId] });
      queryClient.invalidateQueries({ queryKey: ['balances', householdId] });
      queryClient.invalidateQueries({ queryKey: ['dashboard', householdId] });
      queryClient.invalidateQueries({ queryKey: ['analytics', householdId] });
      setSuccessMsg('Expense added and split successfully!');
      setTimeout(() => {
        if (onSuccess) onSuccess(res);
      }, 700);
    },
    onError: (err) => {
      setError(err.message || 'Failed to save expense');
    }
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');

    if (numAmount <= 0) {
      setError('Please enter a valid expense amount greater than 0.');
      return;
    }

    if (!description.trim()) {
      setError('Please enter a short description for this expense.');
      return;
    }

    if (selectedParticipants.length === 0) {
      setError('At least one roommate must be selected.');
      return;
    }

    if (splitType === 'custom' && !isCustomSumValid) {
      setError(`Custom shares sum (₹${currentTotalAllocated.toFixed(2)}) must exactly equal the total expense (₹${numAmount.toFixed(2)}).`);
      return;
    }

    const payload = {
      amount_paise: Math.round(numAmount * 100),
      description: description.trim(),
      category: category,
      expense_date: expenseDate,
      paid_by: paidBy,
      split_type: splitType,
      participants: selectedParticipants
    };

    if (splitType === 'custom') {
      const sharesPaise = {};
      selectedParticipants.forEach(uid => {
        sharesPaise[uid] = Math.round((parseFloat(customShares[uid]) || 0) * 100);
      });
      payload.shares = sharesPaise;
    } else if (splitType === 'weighted') {
      const weightsMap = {};
      selectedParticipants.forEach(uid => {
        weightsMap[uid] = parseFloat(weights[uid]) || 1;
      });
      payload.shares = weightsMap;
    }

    createMutation.mutate(payload);
  };


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
        top: '-5%',
        right: '-5%',
        width: '500px',
        height: '500px',
        background: 'radial-gradient(circle, rgba(168, 85, 247, 0.16) 0%, rgba(99, 102, 241, 0.06) 50%, transparent 70%)',
        filter: 'blur(90px)',
        pointerEvents: 'none'
      }} />
      <div style={{
        position: 'absolute',
        bottom: '-10%',
        left: '-10%',
        width: '600px',
        height: '600px',
        background: 'radial-gradient(circle, rgba(6, 182, 212, 0.15) 0%, rgba(236, 72, 153, 0.08) 50%, transparent 70%)',
        filter: 'blur(90px)',
        pointerEvents: 'none'
      }} />

      {/* Decorative ambient dots */}
      <div style={{
        position: 'absolute',
        top: '40px',
        left: '30px',
        width: '8px',
        height: '8px',
        borderRadius: '50%',
        background: '#38bdf8',
        boxShadow: '0 0 10px #38bdf8'
      }} />
      <div style={{
        position: 'absolute',
        top: '100px',
        right: '40px',
        width: '6px',
        height: '6px',
        borderRadius: '50%',
        background: '#f472b6',
        boxShadow: '0 0 8px #f472b6'
      }} />

      <div style={{
        maxWidth: '720px',
        margin: '0 auto',
        position: 'relative',
        zIndex: 1
      }}>
        {/* Top Navigation Row */}
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
            onClick={onCancel}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 16px',
              borderRadius: '9999px',
              background: 'rgba(18, 24, 43, 0.85)',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              color: '#cbd5e1',
              fontSize: '13.5px',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.2s',
              boxShadow: '0 4px 14px rgba(0, 0, 0, 0.3)'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.3)';
              e.currentTarget.style.color = '#ffffff';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.12)';
              e.currentTarget.style.color = '#cbd5e1';
            }}
          >
            <ArrowLeft size={16} />
            <span>Back to Dashboard</span>
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
            <Home size={15} color="#818cf8" />
            <span>{household?.name || 'Household'} • {household?.currency || 'INR'}</span>
          </div>
        </header>

        {/* Page Title & Tagline */}
        <div style={{ marginBottom: '24px', textAlign: 'center' }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '4px 12px',
            borderRadius: '9999px',
            background: 'rgba(6, 182, 212, 0.12)',
            border: '1px solid rgba(6, 182, 212, 0.3)',
            color: '#38bdf8',
            fontSize: '12px',
            fontWeight: 700,
            letterSpacing: '0.04em',
            marginBottom: '10px'
          }}>
            <Sparkles size={13} />
            INSTANT SPLIT ENGINE
          </div>
          <h1 style={{
            fontSize: '32px',
            fontWeight: 800,
            letterSpacing: '-0.03em',
            margin: '0 0 6px 0',
            color: '#ffffff'
          }}>
            Add New Expense
          </h1>
          <p style={{ fontSize: '14px', color: '#94a3b8', margin: 0 }}>
            Enter amount, choose who paid, and let RoomSplit balance the math.
          </p>
        </div>

        {/* Form Container */}
        <form onSubmit={handleSubmit}>
          {/* Status Banners */}
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
              marginBottom: '20px',
              boxShadow: '0 4px 20px rgba(244, 63, 94, 0.15)'
            }}>
              <AlertCircle size={20} style={{ flexShrink: 0 }} />
              <span>{error}</span>
            </div>
          )}

          {successMsg && (
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
              marginBottom: '20px',
              boxShadow: '0 4px 20px rgba(16, 185, 129, 0.15)'
            }}>
              <CheckCircle2 size={20} style={{ flexShrink: 0 }} />
              <span>{successMsg}</span>
            </div>
          )}

          {/* CARD 1: HERO AMOUNT & DETAILS */}
          <div style={{
            background: 'linear-gradient(135deg, rgba(6, 182, 212, 0.08) 0%, rgba(18, 24, 43, 0.88) 100%)',
            border: '1.5px solid rgba(6, 182, 212, 0.35)',
            borderRadius: '24px',
            padding: '28px 24px',
            marginBottom: '20px',
            boxShadow: '0 0 35px rgba(6, 182, 212, 0.12), 0 20px 40px rgba(0, 0, 0, 0.5)',
            position: 'relative',
            overflow: 'hidden'
          }}>
            {/* Amount Hero Input */}
            <div style={{ textAlign: 'center', marginBottom: '24px' }}>
              <span style={{
                fontSize: '12px',
                fontWeight: 700,
                letterSpacing: '0.08em',
                color: '#38bdf8',
                display: 'block',
                marginBottom: '8px'
              }}>
                EXPENSE AMOUNT
              </span>

              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '4px'
              }}>
                <span style={{
                  fontSize: '40px',
                  fontWeight: 800,
                  color: '#38bdf8',
                  lineHeight: 1
                }}>
                  ₹
                </span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  autoFocus
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  style={{
                    width: '260px',
                    background: 'transparent',
                    border: 'none',
                    outline: 'none',
                    fontSize: '48px',
                    fontWeight: 800,
                    color: '#ffffff',
                    textAlign: 'left',
                    letterSpacing: '-0.02em',
                    lineHeight: 1
                  }}
                />
              </div>

              {/* Quick Amount Suggestion Chips */}
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', marginTop: '16px', flexWrap: 'wrap' }}>
                {[100, 250, 500, 1000, 2000].map(val => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setAmount(String((parseFloat(amount) || 0) + val))}
                    style={{
                      padding: '6px 14px',
                      borderRadius: '9999px',
                      background: 'rgba(255, 255, 255, 0.05)',
                      border: '1px solid rgba(255, 255, 255, 0.12)',
                      color: '#cbd5e1',
                      fontSize: '12.5px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      transition: 'all 0.15s'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = 'rgba(6, 182, 212, 0.5)';
                      e.currentTarget.style.color = '#38bdf8';
                      e.currentTarget.style.background = 'rgba(6, 182, 212, 0.1)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.12)';
                      e.currentTarget.style.color = '#cbd5e1';
                      e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                    }}
                  >
                    +₹{val}
                  </button>
                ))}
              </div>
            </div>

            {/* Description & Date Grid */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: '16px',
              marginBottom: '24px'
            }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#94a3b8', marginBottom: '8px' }}>
                  Description
                </label>
                <input
                  type="text"
                  placeholder="e.g. Nature Basket Groceries, WiFi Bill"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    borderRadius: '14px',
                    background: 'rgba(11, 16, 31, 0.7)',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    color: '#ffffff',
                    fontSize: '14px',
                    outline: 'none',
                    boxSizing: 'border-box',
                    transition: 'border-color 0.2s'
                  }}
                  onFocus={(e) => e.currentTarget.style.borderColor = 'rgba(6, 182, 212, 0.6)'}
                  onBlur={(e) => e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.12)'}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#94a3b8', marginBottom: '8px' }}>
                  Expense Date
                </label>
                <input
                  type="date"
                  value={expenseDate}
                  onChange={(e) => setExpenseDate(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    borderRadius: '14px',
                    background: 'rgba(11, 16, 31, 0.7)',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    color: '#ffffff',
                    fontSize: '14px',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                />
              </div>
            </div>

            {/* Category Selector Chips */}
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#94a3b8', marginBottom: '10px' }}>
                Category
              </label>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))',
                gap: '10px'
              }}>
                {CATEGORIES.map(cat => {
                  const isSelected = category === cat.id;
                  const Icon = cat.icon;
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setCategory(cat.id)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '10px 12px',
                        borderRadius: '14px',
                        background: isSelected ? cat.bg : 'rgba(11, 16, 31, 0.6)',
                        border: isSelected ? `1.5px solid ${cat.color}` : '1px solid rgba(255, 255, 255, 0.08)',
                        color: isSelected ? '#ffffff' : '#94a3b8',
                        cursor: 'pointer',
                        textAlign: 'left',
                        transition: 'all 0.15s',
                        boxShadow: isSelected ? `0 0 16px ${cat.color}25` : 'none'
                      }}
                    >
                      <Icon size={16} color={cat.color} />
                      <span style={{ fontSize: '13px', fontWeight: isSelected ? 700 : 500 }}>
                        {cat.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* CARD 2: WHO PAID & WHO'S IN */}
          <div style={{
            background: 'rgba(18, 24, 43, 0.88)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '24px',
            padding: '24px',
            marginBottom: '20px',
            boxShadow: '0 20px 40px rgba(0, 0, 0, 0.45)'
          }}>
            {/* Paid By Selector */}
            <div style={{ marginBottom: '22px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#94a3b8', marginBottom: '10px' }}>
                Paid By
              </label>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                gap: '10px'
              }}>
                {members.map(member => {
                  const isPayer = paidBy === member.id;
                  return (
                    <button
                      key={member.id}
                      type="button"
                      onClick={() => setPaidBy(member.id)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        padding: '10px 14px',
                        borderRadius: '14px',
                        background: isPayer ? 'rgba(99, 102, 241, 0.22)' : 'rgba(11, 16, 31, 0.6)',
                        border: isPayer ? '1.5px solid #818cf8' : '1px solid rgba(255, 255, 255, 0.08)',
                        color: isPayer ? '#ffffff' : '#94a3b8',
                        cursor: 'pointer',
                        transition: 'all 0.15s',
                        boxShadow: isPayer ? '0 0 16px rgba(99, 102, 241, 0.25)' : 'none'
                      }}
                    >
                      <div style={{
                        width: '30px',
                        height: '30px',
                        borderRadius: '50%',
                        background: member.bg,
                        color: member.color,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '13px',
                        fontWeight: 700
                      }}>
                        {member.initial}
                      </div>
                      <span style={{ fontSize: '13.5px', fontWeight: isPayer ? 700 : 500 }}>
                        {member.name}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Split Among Participants ("Who's in" toggle) */}
            <div>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '10px'
              }}>
                <label style={{ fontSize: '13px', fontWeight: 600, color: '#94a3b8' }}>
                  Split Among Roommates ({selectedParticipants.length}/{members.length})
                </label>
                <button
                  type="button"
                  onClick={selectAllParticipants}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#818cf8',
                    fontSize: '12.5px',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  Select all
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {members.map(member => {
                  const isSelected = selectedParticipants.includes(member.id);
                  return (
                    <div
                      key={member.id}
                      onClick={() => toggleParticipant(member.id)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '12px 16px',
                        borderRadius: '14px',
                        background: isSelected ? 'rgba(99, 102, 241, 0.1)' : 'rgba(11, 16, 31, 0.4)',
                        border: isSelected ? '1px solid rgba(99, 102, 241, 0.4)' : '1px solid rgba(255, 255, 255, 0.06)',
                        cursor: 'pointer',
                        transition: 'all 0.15s'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{
                          width: '22px',
                          height: '22px',
                          borderRadius: '6px',
                          background: isSelected ? '#6366f1' : 'transparent',
                          border: isSelected ? 'none' : '2px solid #64748b',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: '#ffffff',
                          transition: 'all 0.15s'
                        }}>
                          {isSelected && <Check size={14} strokeWidth={3} />}
                        </div>

                        <div style={{
                          width: '28px',
                          height: '28px',
                          borderRadius: '50%',
                          background: member.bg,
                          color: member.color,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '12px',
                          fontWeight: 700
                        }}>
                          {member.initial}
                        </div>

                        <span style={{
                          fontSize: '14px',
                          fontWeight: isSelected ? 600 : 400,
                          color: isSelected ? '#ffffff' : '#94a3b8'
                        }}>
                          {member.name}
                        </span>
                      </div>

                      {/* Live calculated share */}
                      {isSelected && (
                        <span style={{
                          fontSize: '14px',
                          fontWeight: 700,
                          color: '#34d399',
                          background: 'rgba(16, 185, 129, 0.12)',
                          padding: '4px 10px',
                          borderRadius: '9999px',
                          border: '1px solid rgba(16, 185, 129, 0.25)'
                        }}>
                          ₹{calculatedShares[member.id] || 0}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* CARD 3: SPLIT TYPE & ENGINE */}
          <div style={{
            background: 'rgba(18, 24, 43, 0.88)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '24px',
            padding: '24px',
            marginBottom: '28px',
            boxShadow: '0 20px 40px rgba(0, 0, 0, 0.45)'
          }}>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#94a3b8', marginBottom: '12px' }}>
              Split Calculation Mode
            </label>

            {/* Split Type Pills */}
            <div style={{
              display: 'flex',
              background: 'rgba(11, 16, 31, 0.8)',
              borderRadius: '9999px',
              padding: '4px',
              marginBottom: '18px',
              border: '1px solid rgba(255, 255, 255, 0.08)'
            }}>
              <button
                type="button"
                onClick={() => setSplitType('equal')}
                style={{
                  flex: 1,
                  padding: '9px 12px',
                  borderRadius: '9999px',
                  background: splitType === 'equal' ? 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)' : 'transparent',
                  color: splitType === 'equal' ? '#ffffff' : '#94a3b8',
                  border: 'none',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  boxShadow: splitType === 'equal' ? '0 4px 14px rgba(99, 102, 241, 0.35)' : 'none'
                }}
              >
                = Equal Split
              </button>
              <button
                type="button"
                onClick={() => setSplitType('custom')}
                style={{
                  flex: 1,
                  padding: '9px 12px',
                  borderRadius: '9999px',
                  background: splitType === 'custom' ? 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)' : 'transparent',
                  color: splitType === 'custom' ? '#ffffff' : '#94a3b8',
                  border: 'none',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  boxShadow: splitType === 'custom' ? '0 4px 14px rgba(99, 102, 241, 0.35)' : 'none'
                }}
              >
                ₹ Custom Amount
              </button>
              <button
                type="button"
                onClick={() => setSplitType('weighted')}
                style={{
                  flex: 1,
                  padding: '9px 12px',
                  borderRadius: '9999px',
                  background: splitType === 'weighted' ? 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)' : 'transparent',
                  color: splitType === 'weighted' ? '#ffffff' : '#94a3b8',
                  border: 'none',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  boxShadow: splitType === 'weighted' ? '0 4px 14px rgba(99, 102, 241, 0.35)' : 'none'
                }}
              >
                % Weighted
              </button>
            </div>

            {/* Custom Mode Inputs */}
            {splitType === 'custom' && (
              <div style={{ marginBottom: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12.5px', marginBottom: '10px' }}>
                  <span style={{ color: '#94a3b8' }}>Assign exact rupees to each participant:</span>
                  <span style={{ color: isCustomSumValid ? '#34d399' : '#fb7185', fontWeight: 700 }}>
                    Allocated: ₹{currentTotalAllocated.toFixed(2)} / ₹{numAmount.toFixed(2)}
                  </span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {members.filter(m => selectedParticipants.includes(m.id)).map(member => (
                    <div key={member.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: '13.5px', color: '#ffffff' }}>{member.name}</span>
                      <div style={{ position: 'relative', width: '130px' }}>
                        <span style={{ position: 'absolute', left: '12px', top: '9px', color: '#64748b', fontSize: '13px' }}>₹</span>
                        <input
                          type="number"
                          step="0.01"
                          placeholder="0.00"
                          value={customShares[member.id] || ''}
                          onChange={(e) => setCustomShares({ ...customShares, [member.id]: e.target.value })}
                          style={{
                            width: '100%',
                            padding: '8px 12px 8px 26px',
                            borderRadius: '10px',
                            background: 'rgba(11, 16, 31, 0.7)',
                            border: '1px solid rgba(255, 255, 255, 0.1)',
                            color: '#ffffff',
                            fontSize: '13.5px',
                            textAlign: 'right',
                            outline: 'none',
                            boxSizing: 'border-box'
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Weighted Mode Inputs */}
            {splitType === 'weighted' && (
              <div style={{ marginBottom: '16px' }}>
                <p style={{ fontSize: '13px', color: '#94a3b8', marginBottom: '12px' }}>
                  Adjust weights (e.g. 2x for double consumption, 1x for normal share):
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {members.filter(m => selectedParticipants.includes(m.id)).map(member => (
                    <div key={member.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: '13.5px', color: '#ffffff' }}>{member.name}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <button
                          type="button"
                          onClick={() => setWeights({ ...weights, [member.id]: Math.max(0.5, (weights[member.id] || 1) - 0.5) })}
                          style={{
                            width: '30px',
                            height: '30px',
                            borderRadius: '8px',
                            background: 'rgba(255, 255, 255, 0.08)',
                            border: 'none',
                            color: '#ffffff',
                            cursor: 'pointer',
                            fontSize: '16px',
                            fontWeight: 700
                          }}
                        >
                          -
                        </button>
                        <span style={{ width: '36px', textAlign: 'center', fontSize: '14px', fontWeight: 700, color: '#38bdf8' }}>
                          {weights[member.id] || 1}x
                        </span>
                        <button
                          type="button"
                          onClick={() => setWeights({ ...weights, [member.id]: (weights[member.id] || 1) + 0.5 })}
                          style={{
                            width: '30px',
                            height: '30px',
                            borderRadius: '8px',
                            background: 'rgba(255, 255, 255, 0.08)',
                            border: 'none',
                            color: '#ffffff',
                            cursor: 'pointer',
                            fontSize: '16px',
                            fontWeight: 700
                          }}
                        >
                          +
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Equal Split Attribution Note */}
            {splitType === 'equal' && (
              <div style={{
                padding: '12px 16px',
                borderRadius: '14px',
                background: 'rgba(16, 185, 129, 0.08)',
                border: '1px solid rgba(16, 185, 129, 0.22)',
                fontSize: '13px',
                color: '#6ee7b7',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <Sparkles size={16} />
                <span>
                  Remainder paise automatically attributed to payer ({members.find(m => m.id === paidBy)?.name || 'Payer'}). Zero rounding error.
                </span>
              </div>
            )}
          </div>

          {/* ACTION BUTTONS (Matching Dashboard Radiant Pill Style) */}
          <div style={{ display: 'flex', gap: '14px', alignItems: 'center' }}>
            <button
              type="button"
              onClick={onCancel}
              style={{
                flex: 1,
                padding: '16px',
                borderRadius: '9999px',
                background: 'rgba(18, 24, 43, 0.85)',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                color: '#cbd5e1',
                fontSize: '15px',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.3)'}
              onMouseLeave={(e) => e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.12)'}
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={createMutation.isPending}
              style={{
                flex: 2,
                padding: '16px 28px',
                borderRadius: '9999px',
                background: 'linear-gradient(135deg, #06b6d4 0%, #ec4899 100%)',
                border: 'none',
                color: '#ffffff',
                fontSize: '16px',
                fontWeight: 700,
                cursor: createMutation.isPending ? 'not-allowed' : 'pointer',
                boxShadow: '0 8px 30px rgba(236, 72, 153, 0.4), 0 0 20px rgba(6, 182, 212, 0.25)',
                transition: 'all 0.2s',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                opacity: createMutation.isPending ? 0.7 : 1
              }}
            >
              <Sparkles size={18} />
              <span>{createMutation.isPending ? 'Splitting...' : 'Save & Split Expense'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
