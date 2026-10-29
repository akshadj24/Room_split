import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  Sparkles,
  Send,
  Bot,
  User,
  Zap,
  Check,
  TrendingUp,
  Receipt,
  Scale,
  ArrowRight,
  Home,
  CheckCircle,
  XCircle,
} from 'lucide-react';
import { aiApi, expensesApi, householdsApi } from '../services/api';

export default function AIAssistantPage({ currentUser, householdId = 1, onBack, onNavigate }) {
  const { data: household } = useQuery({
    queryKey: ['household', householdId],
    queryFn: () => householdsApi.getHousehold(householdId),
    enabled: !!householdId,
  });

  const [messages, setMessages] = useState([
    {
      id: 1,
      sender: 'ai',
      text: `Hello ${currentUser?.name ? currentUser.name.split(' ')[0] : 'there'}! I'm your RoomSplit AI Copilot. Grounded directly in your household records, I can analyze spending, explain balances, compare monthly trends, and draft expenses with confirmation before saving. What would you like to know?`,
      time: 'Just now'
    }
  ]);
  const [inputPrompt, setInputPrompt] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [savingDraftId, setSavingDraftId] = useState(null);

  const SUGGESTIONS = [
    'How much did we spend on groceries this month?',
    'Why do I owe money to my roommates?',
    'I paid ₹800 for groceries, split equally',
    'Compare spending across categories'
  ];

  const handleConfirmDraft = async (msgId, draft) => {
    try {
      setSavingDraftId(msgId);
      await expensesApi.createExpense(householdId, {
        amount_paise: draft.amount_paise,
        paid_by: draft.paid_by_id,
        category_id: draft.category_id || undefined,
        category_name: draft.category_name,
        description: draft.description,
        expense_date: draft.expense_date,
        split_type: draft.split_type || 'equal',
        participants: draft.splits?.map(s => s.user_id) || [],
      });

      // Update message to show confirmed status
      setMessages(prev => prev.map(m => {
        if (m.id === msgId && m.interactiveCard) {
          return {
            ...m,
            interactiveCard: {
              ...m.interactiveCard,
              status: 'confirmed'
            }
          };
        }
        return m;
      }));

      // Add AI confirmation reply
      setMessages(prev => [...prev, {
        id: Date.now(),
        sender: 'ai',
        text: `✅ **Expense Confirmed!** "${draft.description}" for ₹${(draft.amount_paise / 100).toLocaleString()} has been officially saved to the ledger. Household balances have been updated.`,
        time: 'Just now'
      }]);
    } catch (err) {
      alert(`Could not save expense: ${err.message}`);
    } finally {
      setSavingDraftId(null);
    }
  };

  const handleCancelDraft = (msgId) => {
    setMessages(prev => prev.map(m => {
      if (m.id === msgId && m.interactiveCard) {
        return {
          ...m,
          interactiveCard: {
            ...m.interactiveCard,
            status: 'cancelled'
          }
        };
      }
      return m;
    }));
  };

  const handleSend = async (textToSend) => {
    const query = textToSend || inputPrompt;
    if (!query.trim()) return;

    const userMsg = {
      id: Date.now(),
      sender: 'user',
      text: query,
      time: 'Just now'
    };

    setMessages(prev => [...prev, userMsg]);
    setInputPrompt('');
    setIsTyping(true);

    try {
      // Build conversation history for Claude (last 6 messages)
      const history = messages.slice(-6).map(m => ({
        role: m.sender === 'user' ? 'user' : 'assistant',
        content: m.text
      }));

      const res = await aiApi.chat(householdId, query, history);

      let interactiveCard = null;
      if (res.draft_expense) {
        const draft = res.draft_expense;
        interactiveCard = {
          type: 'draft_expense',
          draft: draft,
          title: `Draft Expense: ${draft.description}`,
          amount: `₹${(draft.amount_paise / 100).toLocaleString()}`,
          paidBy: draft.paid_by_name,
          category: draft.category_name,
          splitType: `${draft.split_type === 'equal' ? 'Equal' : 'Custom'} (${draft.splits.length} members)`,
          participants: draft.splits.map(s => `${s.user_name} (₹${(s.share_paise / 100).toLocaleString()})`),
          status: 'pending'
        };
      }

      const aiMsg = {
        id: Date.now() + 1,
        sender: 'ai',
        text: res.reply,
        interactiveCard,
        time: 'Just now'
      };

      setMessages(prev => [...prev, aiMsg]);
    } catch (err) {
      console.warn('AI chat error:', err);
      setMessages(prev => [...prev, {
        id: Date.now() + 1,
        sender: 'ai',
        text: `I encountered an issue connecting to the AI Copilot (${err.message || 'Network error'}). Please try again in a moment.`,
        time: 'Just now'
      }]);
    } finally {
      setIsTyping(false);
    }
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
        top: '-10%',
        right: '-5%',
        width: '550px',
        height: '550px',
        background: 'radial-gradient(circle, rgba(99, 102, 241, 0.16) 0%, rgba(6, 182, 212, 0.08) 50%, transparent 70%)',
        filter: 'blur(90px)',
        pointerEvents: 'none'
      }} />
      <div style={{
        position: 'absolute',
        bottom: '-15%',
        left: '-10%',
        width: '650px',
        height: '650px',
        background: 'radial-gradient(circle, rgba(236, 72, 153, 0.12) 0%, rgba(139, 92, 246, 0.08) 50%, transparent 70%)',
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
          marginBottom: '24px',
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
            <Home size={15} color="#818cf8" />
            <span>{household?.name || 'Household'}</span>
          </div>
        </header>

        {/* Title */}
        <div style={{ marginBottom: '20px' }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '4px 12px',
            borderRadius: '9999px',
            background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.2) 0%, rgba(6, 182, 212, 0.2) 100%)',
            border: '1px solid rgba(99, 102, 241, 0.4)',
            color: '#a5b4fc',
            fontSize: '12px',
            fontWeight: 700,
            letterSpacing: '0.04em',
            marginBottom: '10px'
          }}>
            <Sparkles size={13} color="#38bdf8" />
            ROOMSPLIT AI ASSISTANT
          </div>
          <h1 style={{
            fontSize: '32px',
            fontWeight: 800,
            letterSpacing: '-0.03em',
            margin: '0 0 6px 0',
            color: '#ffffff'
          }}>
            AI Expense Copilot
          </h1>
          <p style={{ fontSize: '14px', color: '#94a3b8', margin: 0 }}>
            Query spending, generate natural language split drafts, and optimize peer settlements.
          </p>
        </div>

        {/* Suggestion Chips */}
        <div style={{
          display: 'flex',
          gap: '8px',
          overflowX: 'auto',
          paddingBottom: '12px',
          marginBottom: '16px'
        }}>
          {SUGGESTIONS.map((s, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => handleSend(s)}
              style={{
                whiteSpace: 'nowrap',
                padding: '8px 14px',
                borderRadius: '9999px',
                background: 'rgba(18, 24, 43, 0.7)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                color: '#cbd5e1',
                fontSize: '12.5px',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.15s'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'rgba(99, 102, 241, 0.5)';
                e.currentTarget.style.color = '#ffffff';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                e.currentTarget.style.color = '#cbd5e1';
              }}
            >
              {s}
            </button>
          ))}
        </div>

        {/* Chat Feed Container */}
        <div style={{
          background: 'rgba(18, 24, 43, 0.85)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: '24px',
          padding: '24px',
          minHeight: '440px',
          maxHeight: '520px',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '18px',
          marginBottom: '20px',
          boxShadow: '0 20px 40px rgba(0, 0, 0, 0.4)'
        }}>
          {messages.map((m) => {
            const isAI = m.sender === 'ai';
            return (
              <div
                key={m.id}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '12px',
                  alignSelf: isAI ? 'flex-start' : 'flex-end',
                  maxWidth: '85%'
                }}
              >
                {isAI && (
                  <div style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '12px',
                    background: 'linear-gradient(135deg, #6366f1 0%, #06b6d4 100%)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    boxShadow: '0 4px 14px rgba(99, 102, 241, 0.35)'
                  }}>
                    <Bot size={20} color="#ffffff" />
                  </div>
                )}

                <div>
                  <div style={{
                    padding: '14px 18px',
                    borderRadius: '18px',
                    background: isAI ? 'rgba(11, 16, 31, 0.75)' : 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                    border: isAI ? '1px solid rgba(255, 255, 255, 0.08)' : 'none',
                    color: '#ffffff',
                    fontSize: '14.5px',
                    lineHeight: 1.5,
                    boxShadow: isAI ? 'none' : '0 4px 16px rgba(99, 102, 241, 0.3)'
                  }}>
                    {m.text}
                  </div>

                  {/* Render Interactive Card if present */}
                  {m.interactiveCard && m.interactiveCard.type === 'draft_expense' && (
                    <div style={{
                      marginTop: '12px',
                      padding: '18px',
                      borderRadius: '16px',
                      background: 'rgba(6, 182, 212, 0.08)',
                      border: '1px solid rgba(6, 182, 212, 0.3)',
                      backdropFilter: 'blur(10px)'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                        <div>
                          <span style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#38bdf8', fontWeight: 700 }}>
                            Proposed Expense Draft (Not Saved)
                          </span>
                          <h4 style={{ margin: '4px 0 0', fontSize: '15px', fontWeight: 700, color: '#ffffff' }}>
                            {m.interactiveCard.title}
                          </h4>
                        </div>
                        <span style={{ fontSize: '20px', fontWeight: 800, color: '#38bdf8' }}>
                          {m.interactiveCard.amount}
                        </span>
                      </div>

                      <div style={{ fontSize: '13px', color: '#94a3b8', marginBottom: '12px', lineHeight: 1.4 }}>
                        <div><strong>Category:</strong> {m.interactiveCard.category || 'Other'}</div>
                        <div><strong>Paid by:</strong> {m.interactiveCard.paidBy}</div>
                        <div><strong>Split Method:</strong> {m.interactiveCard.splitType}</div>
                        {m.interactiveCard.participants && (
                          <div style={{ marginTop: '6px', display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                            {m.interactiveCard.participants.map((p, idx) => (
                              <span key={idx} style={{
                                fontSize: '11.5px',
                                background: 'rgba(255, 255, 255, 0.08)',
                                padding: '2px 8px',
                                borderRadius: '6px',
                                color: '#cbd5e1'
                              }}>
                                {p}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      {m.interactiveCard.status === 'confirmed' ? (
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          color: '#34d399',
                          fontSize: '13px',
                          fontWeight: 600,
                          padding: '8px 12px',
                          background: 'rgba(52, 211, 153, 0.1)',
                          borderRadius: '8px'
                        }}>
                          <CheckCircle size={16} />
                          <span>Saved to Household Ledger</span>
                        </div>
                      ) : m.interactiveCard.status === 'cancelled' ? (
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          color: '#94a3b8',
                          fontSize: '13px',
                          fontWeight: 500,
                          padding: '8px 12px',
                          background: 'rgba(255, 255, 255, 0.05)',
                          borderRadius: '8px'
                        }}>
                          <XCircle size={16} />
                          <span>Draft Cancelled</span>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', gap: '10px', marginTop: '12px' }}>
                          <button
                            type="button"
                            disabled={savingDraftId === m.id}
                            onClick={() => {
                              if (m.interactiveCard.draft) {
                                handleConfirmDraft(m.id, m.interactiveCard.draft);
                              } else {
                                onNavigate && onNavigate('add-expense');
                              }
                            }}
                            style={{
                              flex: 1,
                              padding: '10px 16px',
                              borderRadius: '9999px',
                              background: 'linear-gradient(135deg, #06b6d4 0%, #3b82f6 100%)',
                              border: 'none',
                              color: '#ffffff',
                              fontSize: '13px',
                              fontWeight: 700,
                              cursor: savingDraftId === m.id ? 'not-allowed' : 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '6px',
                              boxShadow: '0 4px 14px rgba(6, 182, 212, 0.35)'
                            }}
                          >
                            <Check size={16} />
                            <span>{savingDraftId === m.id ? 'Saving to Ledger...' : 'Confirm & Save'}</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleCancelDraft(m.id)}
                            style={{
                              padding: '10px 18px',
                              borderRadius: '9999px',
                              background: 'rgba(255, 255, 255, 0.08)',
                              border: '1px solid rgba(255, 255, 255, 0.12)',
                              color: '#94a3b8',
                              fontSize: '13px',
                              fontWeight: 600,
                              cursor: 'pointer'
                            }}
                          >
                            Cancel
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {m.interactiveCard && m.interactiveCard.type === 'settlement_route' && (
                    <div style={{
                      marginTop: '10px',
                      padding: '16px',
                      borderRadius: '16px',
                      background: 'rgba(16, 185, 129, 0.08)',
                      border: '1px solid rgba(16, 185, 129, 0.3)'
                    }}>
                      <span style={{ fontSize: '13px', fontWeight: 700, color: '#34d399', display: 'block', marginBottom: '8px' }}>
                        Direct Settlement Routes:
                      </span>
                      {m.interactiveCard.routes.map((r, i) => (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '4px' }}>
                          <span>{r.from} → {r.to}</span>
                          <strong style={{ color: '#34d399' }}>{r.amount}</strong>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {!isAI && (
                  <div style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '12px',
                    background: 'rgba(255, 255, 255, 0.1)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0
                  }}>
                    <User size={18} color="#cbd5e1" />
                  </div>
                )}
              </div>
            );
          })}

          {isTyping && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#94a3b8', fontSize: '13px' }}>
              <Bot size={16} color="#818cf8" />
              <span>RoomSplit Copilot is calculating...</span>
            </div>
          )}
        </div>

        {/* Input Bar */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            background: 'rgba(18, 24, 43, 0.85)',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            borderRadius: '9999px',
            padding: '8px 10px 8px 20px',
            boxShadow: '0 10px 30px rgba(0, 0, 0, 0.4)'
          }}
        >
          <input
            type="text"
            placeholder="Ask anything or type e.g. 'Paid 450 for coffee split with Raj'..."
            value={inputPrompt}
            onChange={(e) => setInputPrompt(e.target.value)}
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: '#ffffff',
              fontSize: '14.5px'
            }}
          />

          <button
            type="submit"
            disabled={!inputPrompt.trim() || isTyping}
            style={{
              width: '42px',
              height: '42px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #06b6d4 0%, #ec4899 100%)',
              border: 'none',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: (!inputPrompt.trim() || isTyping) ? 'not-allowed' : 'pointer',
              opacity: (!inputPrompt.trim() || isTyping) ? 0.6 : 1,
              boxShadow: '0 4px 14px rgba(236, 72, 153, 0.4)'
            }}
          >
            <Send size={18} />
          </button>
        </form>
      </div>
    </div>
  );
}
