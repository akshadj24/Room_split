import React from 'react';
import {
  Home,
  Receipt,
  Scale,
  Handshake,
  BarChart2,
  Sparkles,
  Settings,
  LogOut,
  User
} from 'lucide-react';
import brandLogoImg from '../assets/brand_logo.png';

export default function Sidebar({
  activeView = 'dashboard',
  onNavigate,
  currentUser,
  onLogout
}) {
  const NAV_ITEMS = [
    { id: 'dashboard', label: 'Dashboard', icon: Home },
    { id: 'expenses', label: 'Expenses', icon: Receipt },
    { id: 'balances', label: 'Balances', icon: Scale },
    { id: 'settlements', label: 'Settlements', icon: Handshake },
    { id: 'analytics', label: 'Analytics', icon: BarChart2 },
    { id: 'ai', label: 'AI Assistant', icon: Sparkles },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  const isItemActive = (itemId) => {
    if (itemId === 'dashboard') return activeView === 'dashboard';
    if (itemId === 'expenses') return activeView === 'expenses' || activeView === 'add-expense';
    if (itemId === 'balances') return activeView === 'balances';
    if (itemId === 'settlements') return activeView === 'settlements';
    if (itemId === 'analytics') return activeView === 'analytics';
    if (itemId === 'ai') return activeView === 'ai';
    if (itemId === 'settings') return activeView === 'settings';
    return false;
  };

  const userName = currentUser?.name || 'Roommate';
  const userEmail = currentUser?.email || 'Member';
  const userInitial = userName.trim() ? userName.trim()[0].toUpperCase() : 'U';

  return (
    <>
      {/* Responsive Styles for Desktop Sidebar & Mobile Bottom Tab Bar */}
      <style>{`
        .rs-desktop-sidebar {
          width: 250px;
          min-width: 250px;
          background-color: #0c101d;
          border-right: 1px solid rgba(255, 255, 255, 0.07);
          display: flex;
          flex-direction: column;
          justifyContent: space-between;
          padding: 24px 16px 20px;
          box-sizing: border-box;
          font-family: 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif;
          position: sticky;
          top: 0;
          height: 100vh;
          z-index: 50;
        }

        .rs-mobile-tab-bar {
          display: none;
        }

        @media (max-width: 768px) {
          .rs-desktop-sidebar {
            display: none !important;
          }
          .rs-mobile-tab-bar {
            display: flex !important;
            position: fixed;
            bottom: 0;
            left: 0;
            right: 0;
            height: 64px;
            background: rgba(12, 16, 29, 0.96);
            backdrop-filter: blur(20px);
            -webkit-backdrop-filter: blur(20px);
            border-top: 1px solid rgba(255, 255, 255, 0.08);
            z-index: 1000;
            align-items: center;
            justify-content: space-around;
            padding: 0 4px;
            box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.4);
          }
        }
      `}</style>

      {/* ============================================================== */}
      {/* 1. DESKTOP FIXED SIDEBAR NAVIGATION                            */}
      {/* ============================================================== */}
      <aside className="rs-desktop-sidebar">
        {/* Top: App Logo + RoomSplit Branding */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <div
            onClick={() => onNavigate && onNavigate('dashboard')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: '4px 8px',
              cursor: 'pointer',
              userSelect: 'none'
            }}
          >
            {/* Logo Squircle with Gradient Glow */}
            <div style={{
              width: '40px',
              height: '40px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, #a855f7 0%, #ec4899 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 16px rgba(168, 85, 247, 0.4)',
              overflow: 'hidden',
              flexShrink: 0
            }}>
              <img
                src={brandLogoImg}
                alt="RoomSplit Logo"
                style={{
                  width: '26px',
                  height: '26px',
                  objectFit: 'contain',
                  filter: 'brightness(1.1)'
                }}
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                }}
              />
            </div>

            <div>
              <div style={{
                fontSize: '19px',
                fontWeight: 800,
                letterSpacing: '-0.02em',
                lineHeight: 1.15,
                background: 'linear-gradient(135deg, #ffffff 60%, #cbd5e1 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                display: 'inline-block'
              }}>
                RoomSplit
              </div>
              <div style={{
                fontSize: '11px',
                color: '#94a3b8',
                fontWeight: 500,
                letterSpacing: '0.02em'
              }}>
                Shared Living, Simple
              </div>
            </div>
          </div>

          {/* Navigation Items List */}
          <nav style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '6px'
          }}>
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = isItemActive(item.id);

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onNavigate && onNavigate(item.id)}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '11px 14px',
                    borderRadius: '14px',
                    border: active ? '1px solid rgba(168, 85, 247, 0.35)' : '1px solid transparent',
                    background: active
                      ? 'linear-gradient(135deg, rgba(168, 85, 247, 0.18) 0%, rgba(236, 72, 153, 0.12) 100%)'
                      : 'transparent',
                    color: active ? '#ffffff' : '#94a3b8',
                    fontSize: '14px',
                    fontWeight: active ? 600 : 500,
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    outline: 'none',
                    textAlign: 'left',
                    boxShadow: active ? '0 4px 18px rgba(168, 85, 247, 0.2)' : 'none',
                    position: 'relative'
                  }}
                  onMouseEnter={(e) => {
                    if (!active) {
                      e.currentTarget.style.color = '#ffffff';
                      e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                      e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.08)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!active) {
                      e.currentTarget.style.color = '#94a3b8';
                      e.currentTarget.style.background = 'transparent';
                      e.currentTarget.style.borderColor = 'transparent';
                    }
                  }}
                >
                  <Icon
                    size={19}
                    strokeWidth={active ? 2.4 : 1.9}
                    color={active ? '#f472b6' : '#94a3b8'}
                    style={{ flexShrink: 0, transition: 'color 0.2s ease' }}
                  />
                  <span style={{ flex: 1 }}>{item.label}</span>

                  {/* Active Accent Dot on Right */}
                  {active && (
                    <div style={{
                      width: '6px',
                      height: '6px',
                      borderRadius: '50%',
                      background: 'linear-gradient(135deg, #a855f7 0%, #ec4899 100%)',
                      boxShadow: '0 0 10px #ec4899',
                      flexShrink: 0
                    }} />
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Bottom Section: Current User Profile + Logout Button */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
          paddingTop: '16px',
          borderTop: '1px solid rgba(255, 255, 255, 0.07)'
        }}>
          {/* User Profile Card */}
          <div
            onClick={() => onNavigate && onNavigate('settings')}
            title="Manage Profile & Settings"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: '9px 10px',
              borderRadius: '14px',
              background: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid rgba(255, 255, 255, 0.05)',
              cursor: 'pointer',
              transition: 'all 0.2s ease'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)';
              e.currentTarget.style.borderColor = 'rgba(168, 85, 247, 0.3)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)';
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.05)';
            }}
          >
            {/* Avatar Circle with Purple/Pink Gradient */}
            <div style={{
              width: '38px',
              height: '38px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, #a855f7 0%, #ec4899 100%)',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 700,
              fontSize: '15px',
              boxShadow: '0 2px 10px rgba(168, 85, 247, 0.3)',
              flexShrink: 0
            }}>
              {userInitial}
            </div>

            {/* Name + Email/Role */}
            <div style={{ overflow: 'hidden', flex: 1 }}>
              <div style={{
                fontSize: '13.5px',
                fontWeight: 600,
                color: '#ffffff',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis'
              }}>
                {userName}
              </div>
              <div style={{
                fontSize: '11px',
                color: '#64748b',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis'
              }}>
                {userEmail}
              </div>
            </div>
          </div>

          {/* Logout Button */}
          <button
            type="button"
            onClick={onLogout}
            title="Log out of RoomSplit"
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '9px 12px',
              borderRadius: '12px',
              border: '1px solid rgba(244, 63, 94, 0.15)',
              background: 'rgba(244, 63, 94, 0.05)',
              color: '#f87171',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              outline: 'none',
              justifyContent: 'center'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(244, 63, 94, 0.15)';
              e.currentTarget.style.borderColor = 'rgba(244, 63, 94, 0.4)';
              e.currentTarget.style.color = '#ffffff';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(244, 63, 94, 0.05)';
              e.currentTarget.style.borderColor = 'rgba(244, 63, 94, 0.15)';
              e.currentTarget.style.color = '#f87171';
            }}
          >
            <LogOut size={16} strokeWidth={2.2} />
            <span>Log Out</span>
          </button>
        </div>
      </aside>

      {/* ============================================================== */}
      {/* 2. MOBILE BOTTOM TAB BAR                                       */}
      {/* ============================================================== */}
      <nav className="rs-mobile-tab-bar" aria-label="Mobile Navigation">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = isItemActive(item.id);

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onNavigate && onNavigate(item.id)}
              title={item.label}
              style={{
                background: 'none',
                border: 'none',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '3px',
                padding: '6px 8px',
                color: active ? '#ffffff' : '#64748b',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                position: 'relative',
                flex: 1
              }}
            >
              <div style={{
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '32px',
                height: '32px',
                borderRadius: '10px',
                background: active
                  ? 'linear-gradient(135deg, rgba(168, 85, 247, 0.25) 0%, rgba(236, 72, 153, 0.2) 100%)'
                  : 'transparent'
              }}>
                <Icon
                  size={active ? 20 : 18}
                  strokeWidth={active ? 2.4 : 1.9}
                  color={active ? '#f472b6' : '#94a3b8'}
                />
              </div>

              <span style={{
                fontSize: '10px',
                fontWeight: active ? 700 : 500,
                color: active ? '#ffffff' : '#94a3b8',
                lineHeight: 1
              }}>
                {item.label === 'AI Assistant' ? 'AI' : item.label}
              </span>

              {active && (
                <div style={{
                  position: 'absolute',
                  top: '2px',
                  width: '4px',
                  height: '4px',
                  borderRadius: '50%',
                  background: '#ec4899',
                  boxShadow: '0 0 8px #ec4899'
                }} />
              )}
            </button>
          );
        })}
      </nav>
    </>
  );
}
