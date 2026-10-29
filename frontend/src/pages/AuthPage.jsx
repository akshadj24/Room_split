import React, { useState, useEffect } from 'react';
import { 
  Mail, 
  Lock, 
  User, 
  ArrowRight, 
  CheckCircle2, 
  AlertCircle, 
  Eye, 
  EyeOff, 
  ShieldCheck, 
  Sparkles, 
  Home, 
  Users,
  Shield,
  Zap,
  Check
} from 'lucide-react';
import { authApi } from '../services/api';
import brandLogoImg from '../assets/brand_logo.png';
import roomIllustrationImg from '../assets/room_illustration.png';

export function getInviteTokenFromPathOrQuery() {
  if (typeof window === 'undefined') return null;
  // 1. Path format: /invite/{token}
  const match = window.location.pathname.match(/\/invite\/([^\/?#]+)/i);
  if (match && match[1]) {
    return decodeURIComponent(match[1]).trim();
  }
  // 2. Query param format: ?token=... or ?invite=...
  const urlParams = new URLSearchParams(window.location.search);
  const fromQuery = urlParams.get('token') || urlParams.get('invite');
  if (fromQuery) {
    return fromQuery.trim();
  }
  return null;
}

export default function AuthPage({ onAuthSuccess, initialMode = 'register', inviteToken = null }) {
  const initialToken = inviteToken || getInviteTokenFromPathOrQuery() || '';
  const [mode, setMode] = useState(initialMode);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rawInviteToken, setRawInviteToken] = useState(initialToken);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Auto-detect invite token from URL path /invite/{token} or query params
  useEffect(() => {
    const tokenFound = inviteToken || getInviteTokenFromPathOrQuery();
    if (tokenFound) {
      setRawInviteToken(tokenFound);
    }
  }, [inviteToken]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');
    setLoading(true);

    try {
      // 1. Read token from state or current URL path
      const tokenToAccept = (rawInviteToken || getInviteTokenFromPathOrQuery() || '').trim();

      let loginRes;
      if (mode === 'register') {
        if (!name.trim()) throw new Error('Please enter your full name');
        if (!email.trim()) throw new Error('Please enter your email');
        if (password.length < 6) throw new Error('Password must be at least 6 characters');

        await authApi.register(name, email, password);
        setSuccessMsg('Account created! Signing in...');
        loginRes = await authApi.login(email, password);
      } else if (mode === 'login') {
        if (!email.trim() || !password) throw new Error('Please enter your email and password');
        loginRes = await authApi.login(email, password);
      } else if (mode === 'invite') {
        if (!tokenToAccept) throw new Error('Please enter or paste your invitation token');
        const existingToken = localStorage.getItem('roomsplit_token');
        if (!existingToken) {
          setError('Please create an account or sign in first to accept this invitation.');
          setMode('register');
          setLoading(false);
          return;
        }
        loginRes = { access_token: existingToken };
      }

      const jwtToken = loginRes.access_token;
      localStorage.setItem('roomsplit_token', jwtToken);

      // 2. Automatically call POST /api/v1/invitations/{token}/accept with the user's JWT token
      if (tokenToAccept) {
        setSuccessMsg('Accepting household invitation...');
        try {
          const household = await authApi.acceptInvitation(tokenToAccept, jwtToken);
          console.log('[DEBUG AuthPage] Successfully joined household:', household);
        } catch (invErr) {
          const errMsg = invErr.message || 'Invalid or expired invitation token';
          if (errMsg.toLowerCase().includes('already a member')) {
            console.log('[DEBUG AuthPage] User is already a member, continuing to dashboard...');
          } else {
            // 4. On failure (expired/invalid token) → show error message
            setError(`Could not join household: ${errMsg}`);
            setSuccessMsg('');
            setLoading(false);
            return;
          }
        }
      }

      // 3. On success → redirect to dashboard
      setSuccessMsg('Redirecting to your dashboard...');
      if (typeof window !== 'undefined' && window.history && window.history.replaceState) {
        window.history.replaceState({}, '', '/');
      }

      const user = await authApi.getMe();
      setTimeout(() => {
        if (onAuthSuccess) {
          onAuthSuccess(user);
        }
      }, 400);
    } catch (err) {
      setError(err.message || 'Authentication failed. Please check credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#090d18',
      color: '#ffffff',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '40px 24px',
      position: 'relative',
      overflow: 'hidden',
      fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif"
    }}>
      {/* Background ambient auroras */}
      <div style={{
        position: 'absolute',
        top: '-10%',
        right: '-5%',
        width: '600px',
        height: '600px',
        background: 'radial-gradient(circle, rgba(168, 85, 247, 0.16) 0%, rgba(99, 102, 241, 0.08) 50%, transparent 70%)',
        filter: 'blur(80px)',
        pointerEvents: 'none'
      }} />
      <div style={{
        position: 'absolute',
        bottom: '-15%',
        left: '-10%',
        width: '700px',
        height: '700px',
        background: 'radial-gradient(circle, rgba(56, 189, 248, 0.12) 0%, rgba(139, 92, 246, 0.08) 50%, transparent 70%)',
        filter: 'blur(90px)',
        pointerEvents: 'none'
      }} />

      {/* Decorative top-right 3-dots */}
      <div style={{
        position: 'absolute',
        top: '36px',
        right: '48px',
        display: 'flex',
        gap: '10px',
        alignItems: 'center',
        opacity: 0.8
      }}>
        <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#34d399', boxShadow: '0 0 10px #34d399' }} />
        <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#fbbf24', boxShadow: '0 0 10px #fbbf24' }} />
        <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#f472b6', boxShadow: '0 0 10px #f472b6' }} />
      </div>

      {/* Main Two-Column Layout Container */}
      <div style={{
        width: '100%',
        maxWidth: '1120px',
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
        gap: '60px',
        alignItems: 'center',
        position: 'relative',
        zIndex: 1
      }}>
        
        {/* LEFT COLUMN: Hero Brand & 3D Illustration */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {/* Logo & Brand Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '32px' }}>
            <img 
              src={brandLogoImg} 
              alt="RoomSplit Logo" 
              style={{
                width: '56px',
                height: '56px',
                borderRadius: '16px',
                boxShadow: '0 8px 24px rgba(99, 102, 241, 0.35)',
                objectFit: 'contain'
              }} 
            />
            <div>
              <div style={{ fontSize: '32px', fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.1 }}>
                <span>Room</span>
                <span style={{
                  background: 'linear-gradient(135deg, #a78bfa 0%, #f472b6 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent'
                }}>
                  Split
                </span>
              </div>
              <p style={{ fontSize: '13.5px', color: '#94a3b8', marginTop: '3px' }}>
                AI-powered roommate expense harmony
              </p>
            </div>
          </div>

          {/* Big Punchy Headline */}
          <h1 style={{
            fontSize: '44px',
            fontWeight: 800,
            lineHeight: 1.15,
            letterSpacing: '-0.03em',
            marginBottom: '16px',
            color: '#ffffff'
          }}>
            Less awkward math, more{' '}
            <span style={{
              background: 'linear-gradient(135deg, #818cf8 0%, #c084fc 40%, #f472b6 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent'
            }}>
              roommate harmony.
            </span>
          </h1>

          <p style={{
            fontSize: '16px',
            color: '#94a3b8',
            lineHeight: 1.6,
            marginBottom: '32px',
            maxWidth: '460px'
          }}>
            Split bills, track expenses, and keep everyone on the same page — easily.
          </p>

          {/* 3D Isometric Room & Floating Bill Graphic */}
          <div style={{ position: 'relative', width: 'fit-content', marginBottom: '36px' }}>
            {/* Ambient decorative glowing dots */}
            <div style={{
              position: 'absolute',
              top: '-12px',
              left: '-16px',
              width: '12px',
              height: '12px',
              borderRadius: '50%',
              background: '#34d399',
              boxShadow: '0 0 14px #34d399'
            }} />
            <div style={{
              position: 'absolute',
              top: '18px',
              right: '-18px',
              width: '10px',
              height: '10px',
              borderRadius: '50%',
              background: '#fbbf24',
              boxShadow: '0 0 12px #fbbf24'
            }} />
            <div style={{
              position: 'absolute',
              bottom: '-14px',
              left: '42%',
              width: '10px',
              height: '10px',
              borderRadius: '50%',
              background: '#38bdf8',
              boxShadow: '0 0 12px #38bdf8'
            }} />

            <div style={{
              borderRadius: '24px',
              overflow: 'hidden',
              background: 'radial-gradient(ellipse at center, rgba(30, 41, 59, 0.4) 0%, rgba(15, 23, 42, 0.9) 100%)',
              boxShadow: '0 20px 50px -10px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              display: 'inline-block'
            }}>
              <img 
                src={roomIllustrationImg} 
                alt="RoomSplit 3D Room and Bill" 
                style={{
                  display: 'block',
                  maxWidth: '380px',
                  width: '100%',
                  height: 'auto',
                  borderRadius: '24px'
                }} 
              />
            </div>
          </div>

          {/* Bottom 3 Feature Pills */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '16px',
            maxWidth: '480px'
          }}>
            {/* Feature 1 */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{
                width: '36px',
                height: '36px',
                borderRadius: '50%',
                background: 'rgba(16, 185, 129, 0.15)',
                border: '1px solid rgba(16, 185, 129, 0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <Shield size={18} color="#34d399" />
              </div>
              <div>
                <div style={{ fontSize: '14px', fontWeight: 700, color: '#ffffff' }}>Fair Splits</div>
                <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>No more confusion</div>
              </div>
            </div>

            {/* Feature 2 */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{
                width: '36px',
                height: '36px',
                borderRadius: '50%',
                background: 'rgba(139, 92, 246, 0.15)',
                border: '1px solid rgba(139, 92, 246, 0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <Users size={18} color="#a78bfa" />
              </div>
              <div>
                <div style={{ fontSize: '14px', fontWeight: 700, color: '#ffffff' }}>Stay Organized</div>
                <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>All in one place</div>
              </div>
            </div>

            {/* Feature 3 */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{
                width: '36px',
                height: '36px',
                borderRadius: '50%',
                background: 'rgba(245, 158, 11, 0.15)',
                border: '1px solid rgba(245, 158, 11, 0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <Sparkles size={18} color="#fbbf24" />
              </div>
              <div>
                <div style={{ fontSize: '14px', fontWeight: 700, color: '#ffffff' }}>Powered by AI</div>
                <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>Smarter suggestions</div>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: The Auth Glass Card */}
        <div style={{
          background: 'rgba(18, 24, 43, 0.82)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: '28px',
          boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.75), inset 0 1px 0 rgba(255, 255, 255, 0.12)',
          padding: '38px 34px',
          maxWidth: '480px',
          width: '100%',
          margin: '0 auto'
        }}>
          
          {/* Top Segmented Tabs (Sign In / Register) */}
          <div style={{
            display: 'flex',
            background: 'rgba(11, 16, 31, 0.8)',
            borderRadius: '9999px',
            padding: '5px',
            marginBottom: '30px',
            border: '1px solid rgba(255, 255, 255, 0.08)'
          }}>
            <button
              type="button"
              onClick={() => { setMode('login'); setError(''); setSuccessMsg(''); }}
              style={{
                flex: 1,
                padding: '11px 20px',
                borderRadius: '9999px',
                fontSize: '14.5px',
                fontWeight: mode === 'login' ? 700 : 500,
                color: mode === 'login' ? '#ffffff' : '#94a3b8',
                background: mode === 'login' 
                  ? 'linear-gradient(135deg, #60a5fa 0%, #a855f7 50%, #ec4899 100%)' 
                  : 'transparent',
                border: 'none',
                cursor: 'pointer',
                boxShadow: mode === 'login' ? '0 4px 18px rgba(168, 85, 247, 0.45)' : 'none',
                transition: 'all 0.25s ease'
              }}
            >
              Sign In
            </button>

            <button
              type="button"
              onClick={() => { setMode('register'); setError(''); setSuccessMsg(''); }}
              style={{
                flex: 1,
                padding: '11px 20px',
                borderRadius: '9999px',
                fontSize: '14.5px',
                fontWeight: mode === 'register' ? 700 : 500,
                color: mode === 'register' ? '#ffffff' : '#94a3b8',
                background: mode === 'register' 
                  ? 'linear-gradient(135deg, #60a5fa 0%, #a855f7 50%, #ec4899 100%)' 
                  : 'transparent',
                border: 'none',
                cursor: 'pointer',
                boxShadow: mode === 'register' ? '0 4px 18px rgba(168, 85, 247, 0.45)' : 'none',
                transition: 'all 0.25s ease'
              }}
            >
              Register
            </button>
          </div>

          {/* Feedback alerts */}
          {error && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '12px 14px',
              borderRadius: '12px',
              background: 'rgba(244, 63, 94, 0.12)',
              border: '1px solid rgba(244, 63, 94, 0.3)',
              color: '#fda4af',
              fontSize: '13.5px',
              marginBottom: '20px'
            }}>
              <AlertCircle size={17} style={{ flexShrink: 0 }} />
              <span>{error}</span>
            </div>
          )}

          {successMsg && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '12px 14px',
              borderRadius: '12px',
              background: 'rgba(16, 185, 129, 0.12)',
              border: '1px solid rgba(16, 185, 129, 0.3)',
              color: '#6ee7b7',
              fontSize: '13.5px',
              marginBottom: '20px'
            }}>
              <CheckCircle2 size={17} style={{ flexShrink: 0 }} />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Invite detected banner */}
          {rawInviteToken && (
            <div style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '12px',
              padding: '14px 16px',
              borderRadius: '16px',
              background: 'rgba(99, 102, 241, 0.15)',
              border: '1px solid rgba(99, 102, 241, 0.35)',
              color: '#c7d2fe',
              fontSize: '13.5px',
              marginBottom: '20px'
            }}>
              <Sparkles size={18} color="#818cf8" style={{ flexShrink: 0, marginTop: '2px' }} />
              <div>
                <strong style={{ color: '#ffffff', display: 'block', marginBottom: '2px' }}>
                  Household Invitation Active
                </strong>
                {mode === 'register' 
                  ? 'Complete your registration below to automatically join the household!'
                  : 'Sign in with your account below to accept this invitation and join!'}
              </div>
            </div>
          )}

          {/* Auth Form */}
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            
            {/* Full Name field (Register mode) */}
            {mode === 'register' && (
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#e2e8f0', marginBottom: '8px' }}>
                  Your Full Name
                </label>
                <div style={{ position: 'relative' }}>
                  <User size={18} color="#64748b" style={{ position: 'absolute', left: '16px', top: '15px' }} />
                  <input
                    type="text"
                    required
                    placeholder="Alex Morgan"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    style={{
                      width: '100%',
                      background: 'rgba(11, 16, 31, 0.85)',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      color: '#ffffff',
                      padding: '14px 16px 14px 46px',
                      borderRadius: '12px',
                      fontSize: '15px',
                      outline: 'none',
                      transition: 'border-color 0.2s, box-shadow 0.2s'
                    }}
                    onFocus={(e) => {
                      e.target.style.borderColor = 'rgba(99, 102, 241, 0.8)';
                      e.target.style.boxShadow = '0 0 0 3px rgba(99, 102, 241, 0.2)';
                    }}
                    onBlur={(e) => {
                      e.target.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                      e.target.style.boxShadow = 'none';
                    }}
                  />
                </div>
              </div>
            )}

            {/* Email Address */}
            {mode !== 'invite' && (
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#e2e8f0', marginBottom: '8px' }}>
                  Email Address
                </label>
                <div style={{ position: 'relative' }}>
                  <Mail size={18} color="#64748b" style={{ position: 'absolute', left: '16px', top: '15px' }} />
                  <input
                    type="email"
                    required
                    placeholder="alex@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    style={{
                      width: '100%',
                      background: 'rgba(11, 16, 31, 0.85)',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      color: '#ffffff',
                      padding: '14px 16px 14px 46px',
                      borderRadius: '12px',
                      fontSize: '15px',
                      outline: 'none',
                      transition: 'border-color 0.2s, box-shadow 0.2s'
                    }}
                    onFocus={(e) => {
                      e.target.style.borderColor = 'rgba(99, 102, 241, 0.8)';
                      e.target.style.boxShadow = '0 0 0 3px rgba(99, 102, 241, 0.2)';
                    }}
                    onBlur={(e) => {
                      e.target.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                      e.target.style.boxShadow = 'none';
                    }}
                  />
                </div>
              </div>
            )}

            {/* Password */}
            {mode !== 'invite' && (
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#e2e8f0', marginBottom: '8px' }}>
                  Password
                </label>
                <div style={{ position: 'relative' }}>
                  <Lock size={18} color="#64748b" style={{ position: 'absolute', left: '16px', top: '15px' }} />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    style={{
                      width: '100%',
                      background: 'rgba(11, 16, 31, 0.85)',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      color: '#ffffff',
                      padding: '14px 46px 14px 46px',
                      borderRadius: '12px',
                      fontSize: '15px',
                      outline: 'none',
                      transition: 'border-color 0.2s, box-shadow 0.2s'
                    }}
                    onFocus={(e) => {
                      e.target.style.borderColor = 'rgba(99, 102, 241, 0.8)';
                      e.target.style.boxShadow = '0 0 0 3px rgba(99, 102, 241, 0.2)';
                    }}
                    onBlur={(e) => {
                      e.target.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                      e.target.style.boxShadow = 'none';
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    style={{
                      position: 'absolute',
                      right: '14px',
                      top: '14px',
                      background: 'none',
                      border: 'none',
                      color: '#64748b',
                      cursor: 'pointer',
                      padding: '2px'
                    }}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>
            )}

            {/* Invitation flow */}
            {mode === 'invite' && (
              <div style={{ padding: '16px', borderRadius: '12px', background: 'rgba(99, 102, 241, 0.08)', border: '1px solid rgba(99, 102, 241, 0.25)' }}>
                <div style={{ fontSize: '14px', fontWeight: 700, color: '#ffffff', marginBottom: '6px' }}>
                  Accept Household Invitation
                </div>
                <p style={{ fontSize: '12.5px', color: '#94a3b8', marginBottom: '14px' }}>
                  Paste the invitation link code sent by your roommate to join their household.
                </p>
                <input
                  type="text"
                  required
                  placeholder="Paste invite token here..."
                  value={rawInviteToken}
                  onChange={(e) => setRawInviteToken(e.target.value.replace(/.*\/invite\//, ''))}
                  style={{
                    width: '100%',
                    background: 'rgba(11, 16, 31, 0.85)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    color: '#ffffff',
                    padding: '12px 14px',
                    borderRadius: '10px',
                    fontSize: '14px',
                    outline: 'none'
                  }}
                />
              </div>
            )}

            {/* Big Gradient Action Button */}
            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%',
                padding: '15px 24px',
                borderRadius: '9999px',
                background: 'linear-gradient(90deg, #60a5fa 0%, #a855f7 50%, #f472b6 100%)',
                color: '#ffffff',
                border: 'none',
                fontWeight: 700,
                fontSize: '16px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                boxShadow: '0 8px 28px rgba(168, 85, 247, 0.45)',
                marginTop: '6px',
                transition: 'transform 0.15s, box-shadow 0.15s',
                opacity: loading ? 0.7 : 1
              }}
              onMouseEnter={(e) => {
                if (!loading) {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 12px 34px rgba(168, 85, 247, 0.6)';
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 8px 28px rgba(168, 85, 247, 0.45)';
              }}
            >
              {loading ? (
                <span>Please wait...</span>
              ) : mode === 'register' ? (
                <>
                  <span>{rawInviteToken ? 'Create Account & Join Household' : 'Create Account'}</span>
                  <ArrowRight size={18} />
                </>
              ) : mode === 'login' ? (
                <>
                  <span>{rawInviteToken ? 'Sign In & Join Household' : 'Sign In'}</span>
                  <ArrowRight size={18} />
                </>
              ) : (
                <>
                  <span>Join Household</span>
                  <CheckCircle2 size={18} />
                </>
              )}
            </button>
          </form>

          {/* Three Feature Checks row */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginTop: '28px',
            fontSize: '12px',
            color: '#94a3b8'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <ShieldCheck size={15} color="#34d399" />
              <span>JWT + Argon2</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Sparkles size={15} color="#c084fc" />
              <span>AI Engine</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Home size={15} color="#38bdf8" />
              <span>Multi-tenant</span>
            </div>
          </div>

          {/* Bottom Switcher prompt */}
          <div style={{
            marginTop: '24px',
            textAlign: 'center',
            fontSize: '13.5px',
            color: '#94a3b8'
          }}>
            {mode === 'register' ? (
              <span>
                Already registered?{' '}
                <button
                  type="button"
                  onClick={() => { setMode('login'); setError(''); setSuccessMsg(''); }}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#818cf8',
                    fontWeight: 700,
                    cursor: 'pointer',
                    padding: 0
                  }}
                >
                  Sign in here
                </button>
              </span>
            ) : (
              <span>
                Don't have an account?{' '}
                <button
                  type="button"
                  onClick={() => { setMode('register'); setError(''); setSuccessMsg(''); }}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#818cf8',
                    fontWeight: 700,
                    cursor: 'pointer',
                    padding: 0
                  }}
                >
                  Sign up free
                </button>
              </span>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
