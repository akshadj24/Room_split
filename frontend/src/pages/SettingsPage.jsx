import React, { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  ArrowLeft,
  Copy,
  Check,
  Users,
  Settings,
  LogOut,
  Sparkles,
  Link2,
  DollarSign,
  AlertCircle,
  RefreshCw
} from 'lucide-react';
import { householdsApi } from '../services/api';

const MEMBER_COLORS = ['#818cf8', '#34d399', '#c084fc', '#38bdf8', '#f59e0b', '#ec4899'];

export default function SettingsPage({ currentUser, householdId = 1, onBack, onLogout }) {
  const [copied, setCopied] = useState(false);
  const [inviteUrl, setInviteUrl] = useState('');
  const [householdName, setHouseholdName] = useState('');
  const [currency, setCurrency] = useState('INR');
  const [monthlyBudget, setMonthlyBudget] = useState('45000');
  const [saveMessage, setSaveMessage] = useState('');
  const [memberStatusOverrides, setMemberStatusOverrides] = useState({});

  const {
    data: householdData,
    isLoading: householdLoading,
    isError: householdError,
    error: householdErr,
    refetch: refetchHousehold
  } = useQuery({
    queryKey: ['household', householdId],
    queryFn: () => householdsApi.getHousehold(householdId),
    enabled: !!householdId,
  });

  const {
    data: rawMembers = [],
    isLoading: membersLoading,
    isError: membersError,
    error: membersErr,
    refetch: refetchMembers
  } = useQuery({
    queryKey: ['members', householdId],
    queryFn: async () => {
      console.log(`[DEBUG SettingsPage] Fetching GET /api/v1/households/${householdId}/members`);
      const res = await householdsApi.getMembers(householdId);
      console.log(`[DEBUG SettingsPage] Received members:`, res);
      return res;
    },
    enabled: !!householdId,
  });

  useEffect(() => {
    if (householdData) {
      setHouseholdName(householdData.name || '');
      setCurrency(householdData.currency || 'INR');
    }
  }, [householdData]);

  const inviteMutation = useMutation({
    mutationFn: async () => {
      console.log(`[DEBUG SettingsPage] Requesting POST /api/v1/households/${householdId}/invitations`);
      const res = await householdsApi.createInvitation(householdId);
      console.log(`[DEBUG SettingsPage] Invitation generated:`, res);
      return res;
    },
    onSuccess: (data) => {
      setInviteUrl(data.invite_url);
    },
    onError: (err) => {
      console.error('[DEBUG SettingsPage] Failed to generate invite token:', err);
    }
  });

  useEffect(() => {
    if (householdId) {
      setInviteUrl('');
      inviteMutation.mutate();
    }
  }, [householdId]);

  // Ensure current logged-in user (owner) always appears in the list
  const memberListToDisplay = React.useMemo(() => {
    const list = Array.isArray(rawMembers) ? [...rawMembers] : [];
    if (currentUser && currentUser.id) {
      const exists = list.some(m => Number(m.id) === Number(currentUser.id));
      if (!exists) {
        list.unshift({
          id: currentUser.id,
          name: currentUser.name,
          email: currentUser.email,
          role: currentUser.role || 'owner',
          status: 'active'
        });
      }
    }
    return list;
  }, [rawMembers, currentUser]);

  const members = memberListToDisplay.map((m, idx) => {
    const isCurrentUser = Number(m.id) === Number(currentUser?.id);
    const roleNormalized = (m.role || 'member').toLowerCase();
    return {
      id: m.id,
      name: isCurrentUser ? `${m.name} (You)` : m.name,
      email: m.email,
      role: roleNormalized,
      inCountry: memberStatusOverrides[m.id] !== undefined ? memberStatusOverrides[m.id] : (m.status === 'active'),
      initial: m.name ? m.name[0].toUpperCase() : 'M',
      color: MEMBER_COLORS[idx % MEMBER_COLORS.length]
    };
  });

  const handleCopyLink = () => {
    if (!inviteUrl) return;
    navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const toggleInCountry = (memberId) => {
    setMemberStatusOverrides(prev => ({
      ...prev,
      [memberId]: !prev[memberId]
    }));
  };

  const handleSaveSettings = (e) => {
    e.preventDefault();
    setSaveMessage('Household settings successfully saved!');
    setTimeout(() => setSaveMessage(''), 2500);
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
        background: 'radial-gradient(circle, rgba(99, 102, 241, 0.16) 0%, rgba(139, 92, 246, 0.08) 50%, transparent 70%)',
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
              transition: 'all 0.2s',
              boxShadow: '0 4px 16px rgba(0, 0, 0, 0.3)'
            }}
          >
            <ArrowLeft size={16} />
            <span>Dashboard</span>
          </button>

          <button
            type="button"
            onClick={onLogout}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 16px',
              borderRadius: '9999px',
              background: 'rgba(244, 63, 94, 0.15)',
              border: '1px solid rgba(244, 63, 94, 0.35)',
              color: '#fb7185',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            <LogOut size={15} />
            <span>Sign Out</span>
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
            background: 'rgba(99, 102, 241, 0.12)',
            border: '1px solid rgba(99, 102, 241, 0.3)',
            color: '#818cf8',
            fontSize: '12px',
            fontWeight: 700,
            letterSpacing: '0.04em',
            marginBottom: '10px'
          }}>
            <Settings size={13} />
            HOUSEHOLD CONFIGURATION
          </div>
          <h1 style={{
            fontSize: '32px',
            fontWeight: 800,
            letterSpacing: '-0.03em',
            margin: '0 0 6px 0',
            color: '#ffffff'
          }}>
            Household Settings
          </h1>
          <p style={{ fontSize: '14px', color: '#94a3b8', margin: 0 }}>
            Manage room invitation links, roommate active presence, and default currencies.
          </p>
        </div>

        {saveMessage && (
          <div style={{
            padding: '14px 18px',
            borderRadius: '16px',
            background: 'rgba(16, 185, 129, 0.15)',
            border: '1px solid rgba(16, 185, 129, 0.4)',
            color: '#6ee7b7',
            fontSize: '13.5px',
            marginBottom: '20px'
          }}>
            {saveMessage}
          </div>
        )}

        {/* 1. SECURE INVITE LINK CARD */}
        <div style={{
          background: 'rgba(18, 24, 43, 0.85)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: '24px',
          padding: '24px',
          marginBottom: '24px',
          boxShadow: '0 20px 40px rgba(0, 0, 0, 0.4)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <Link2 size={18} color="#818cf8" />
            <h3 style={{ fontSize: '17px', fontWeight: 700, margin: 0, color: '#ffffff' }}>
              Household Invite Link
            </h3>
          </div>
          <p style={{ fontSize: '13px', color: '#94a3b8', margin: '0 0 16px 0' }}>
            Share this link with roommates. Anyone with this link can join {householdName || 'your household'} directly.
          </p>

          {inviteMutation.isError ? (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: 'rgba(244, 63, 94, 0.12)',
              border: '1px solid rgba(244, 63, 94, 0.35)',
              padding: '12px 18px',
              borderRadius: '14px',
              gap: '12px',
              flexWrap: 'wrap'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#fb7185', fontSize: '13px' }}>
                <AlertCircle size={16} />
                <span>Failed to generate invite: {inviteMutation.error?.message || 'Unknown error'}</span>
              </div>
              <button
                type="button"
                onClick={() => inviteMutation.mutate()}
                disabled={inviteMutation.isPending}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 14px',
                  borderRadius: '9999px',
                  background: 'rgba(244, 63, 94, 0.25)',
                  border: '1px solid #fb7185',
                  color: '#ffffff',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                <RefreshCw size={12} className={inviteMutation.isPending ? 'spin' : ''} />
                <span>Retry</span>
              </button>
            </div>
          ) : (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              background: 'rgba(11, 16, 31, 0.8)',
              padding: '8px 10px 8px 18px',
              borderRadius: '14px',
              border: '1px solid rgba(255, 255, 255, 0.1)'
            }}>
              <span style={{
                flex: 1,
                fontSize: '13.5px',
                color: inviteUrl ? '#38bdf8' : '#cbd5e1',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                fontWeight: inviteUrl ? 600 : 400
              }}>
                {inviteUrl || (inviteMutation.isPending ? 'Generating invitation link...' : 'Preparing link...')}
              </span>

              <button
                type="button"
                onClick={() => inviteMutation.mutate()}
                disabled={inviteMutation.isPending}
                title="Generate fresh invite link"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '8px 12px',
                  borderRadius: '9999px',
                  background: 'rgba(255, 255, 255, 0.06)',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  color: '#cbd5e1',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
              >
                <RefreshCw size={12} />
                <span>New</span>
              </button>

              <button
                type="button"
                onClick={handleCopyLink}
                disabled={!inviteUrl}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '8px 16px',
                  borderRadius: '9999px',
                  background: copied ? 'rgba(16, 185, 129, 0.25)' : 'rgba(99, 102, 241, 0.25)',
                  border: copied ? '1px solid #34d399' : '1px solid #818cf8',
                  color: copied ? '#34d399' : '#ffffff',
                  fontSize: '12.5px',
                  fontWeight: 600,
                  cursor: inviteUrl ? 'pointer' : 'not-allowed',
                  transition: 'all 0.2s'
                }}
              >
                {copied ? <Check size={14} /> : <Copy size={14} />}
                <span>{copied ? 'Copied!' : 'Copy Link'}</span>
              </button>
            </div>
          )}
        </div>

        {/* 2. ROOMMATE ROSTER & IN-COUNTRY STATUS */}
        <div style={{
          background: 'rgba(18, 24, 43, 0.85)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: '24px',
          padding: '24px',
          marginBottom: '24px',
          boxShadow: '0 20px 40px rgba(0, 0, 0, 0.4)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <Users size={18} color="#818cf8" />
            <h3 style={{ fontSize: '17px', fontWeight: 700, margin: 0, color: '#ffffff' }}>
              Household Roommates ({members.length})
            </h3>
          </div>
          <p style={{ fontSize: '13px', color: '#94a3b8', margin: '0 0 20px 0' }}>
            Active household members participating in expense splits and settlements.
          </p>

          {membersError && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: 'rgba(244, 63, 94, 0.12)',
              border: '1px solid rgba(244, 63, 94, 0.35)',
              padding: '12px 18px',
              borderRadius: '16px',
              marginBottom: '16px',
              color: '#fb7185',
              fontSize: '13px',
              gap: '12px',
              flexWrap: 'wrap'
            }}>
              <span>Failed to load roommates: {membersErr?.message || 'Network error'}</span>
              <button
                type="button"
                onClick={() => refetchMembers()}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '5px 12px',
                  borderRadius: '9999px',
                  background: 'rgba(255, 255, 255, 0.1)',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  color: '#ffffff',
                  fontSize: '12px',
                  cursor: 'pointer'
                }}
              >
                <RefreshCw size={12} />
                <span>Retry</span>
              </button>
            </div>
          )}

          {membersLoading ? (
            <div style={{ textAlign: 'center', padding: '24px 0', color: '#94a3b8', fontSize: '14px' }}>
              Loading household roommates...
            </div>
          ) : members.length === 0 ? (
            <div style={{
              padding: '24px',
              borderRadius: '16px',
              background: 'rgba(11, 16, 31, 0.6)',
              border: '1px dashed rgba(255, 255, 255, 0.1)',
              textAlign: 'center',
              color: '#94a3b8',
              fontSize: '13.5px'
            }}>
              No other roommates in this household yet. Send the invite link above!
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {members.map(member => (
                <div
                  key={member.id}
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
                      width: '42px',
                      height: '42px',
                      borderRadius: '50%',
                      background: `${member.color}25`,
                      color: member.color,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 700,
                      fontSize: '15px'
                    }}>
                      {member.initial}
                    </div>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '15px', fontWeight: 700, color: '#ffffff' }}>
                          {member.name}
                        </span>
                        <span style={{
                          fontSize: '11px',
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          letterSpacing: '0.04em',
                          padding: '2px 8px',
                          borderRadius: '9999px',
                          background: member.role === 'owner' ? 'rgba(99, 102, 241, 0.2)' : 'rgba(148, 163, 184, 0.15)',
                          border: member.role === 'owner' ? '1px solid rgba(129, 140, 248, 0.4)' : '1px solid rgba(148, 163, 184, 0.3)',
                          color: member.role === 'owner' ? '#818cf8' : '#94a3b8'
                        }}>
                          {member.role}
                        </span>
                      </div>
                      <div style={{ fontSize: '12.5px', color: '#94a3b8', marginTop: '3px' }}>
                        {member.email}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <div style={{ textAlign: 'right' }}>
                      <span style={{
                        display: 'inline-block',
                        fontSize: '11.5px',
                        fontWeight: 700,
                        color: member.inCountry ? '#34d399' : '#fbbf24',
                        background: member.inCountry ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                        padding: '2px 8px',
                        borderRadius: '9999px',
                        border: member.inCountry ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(245, 158, 11, 0.3)'
                      }}>
                        {member.inCountry ? 'Active In House' : 'Away / Out of Town'}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => toggleInCountry(member.id)}
                      style={{
                        padding: '6px 12px',
                        borderRadius: '9999px',
                        background: 'rgba(255, 255, 255, 0.08)',
                        border: '1px solid rgba(255, 255, 255, 0.12)',
                        color: '#cbd5e1',
                        fontSize: '12px',
                        cursor: 'pointer'
                      }}
                    >
                      Toggle Status
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 3. HOUSEHOLD DETAILS & BUDGET FORM */}
        <form onSubmit={handleSaveSettings} style={{
          background: 'rgba(18, 24, 43, 0.85)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: '24px',
          padding: '24px',
          boxShadow: '0 20px 40px rgba(0, 0, 0, 0.4)'
        }}>
          <h3 style={{ fontSize: '17px', fontWeight: 700, margin: '0 0 16px 0', color: '#ffffff' }}>
            General Household Preferences
          </h3>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: '16px',
            marginBottom: '20px'
          }}>
            <div>
              <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 600, color: '#94a3b8', marginBottom: '8px' }}>
                Household Name
              </label>
              <input
                type="text"
                value={householdName}
                onChange={(e) => setHouseholdName(e.target.value)}
                placeholder="e.g. Baker St House"
                style={{
                  width: '100%',
                  padding: '12px 16px',
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

            <div>
              <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 600, color: '#94a3b8', marginBottom: '8px' }}>
                Base Currency
              </label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  borderRadius: '14px',
                  background: 'rgba(11, 16, 31, 0.7)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  color: '#ffffff',
                  fontSize: '14px',
                  outline: 'none',
                  cursor: 'pointer',
                  boxSizing: 'border-box'
                }}
              >
                <option value="INR">INR (₹)</option>
                <option value="USD">USD ($)</option>
                <option value="EUR">EUR (€)</option>
                <option value="GBP">GBP (£)</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              type="submit"
              style={{
                padding: '12px 24px',
                borderRadius: '9999px',
                background: 'linear-gradient(135deg, #06b6d4 0%, #ec4899 100%)',
                border: 'none',
                color: '#ffffff',
                fontSize: '14px',
                fontWeight: 700,
                cursor: 'pointer',
                boxShadow: '0 4px 16px rgba(236, 72, 153, 0.35)'
              }}
            >
              Save Preferences
            </button>
          </div>
        </form>

      </div>
    </div>
  );
}
