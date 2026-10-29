import React, { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import AuthPage, { getInviteTokenFromPathOrQuery } from './pages/AuthPage';
import DashboardPage from './pages/DashboardPage';
import AddExpensePage from './pages/AddExpensePage';
import BalancesPage from './pages/BalancesPage';
import SettlementsPage from './pages/SettlementsPage';
import ExpensesPage from './pages/ExpensesPage';
import AnalyticsPage from './pages/AnalyticsPage';
import AIAssistantPage from './pages/AIAssistantPage';
import SettingsPage from './pages/SettingsPage';
import Sidebar from './components/Sidebar';
import { authApi, householdsApi } from './services/api';
import { Menu } from 'lucide-react';

function App() {
  const queryClient = useQueryClient();
  const token = localStorage.getItem('roomsplit_token') || localStorage.getItem('token');
  const [activeView, setActiveView] = useState('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [inviteNotification, setInviteNotification] = useState(null);

  const {
    data: currentUser,
    isLoading: authLoading,
    isError: authError,
  } = useQuery({
    queryKey: ['me'],
    queryFn: () => authApi.getMe(),
    enabled: !!token,
    retry: 1,
  });

  const effectiveUser = currentUser || null;
  const currentHouseholdId = effectiveUser?.household_id || 1;

  const { data: household } = useQuery({
    queryKey: ['household', currentHouseholdId],
    queryFn: () => householdsApi.getHousehold(currentHouseholdId),
    enabled: !!token && !!currentHouseholdId,
  });

  // Handle invitation link visited by an already logged-in user
  useEffect(() => {
    const inviteToken = getInviteTokenFromPathOrQuery();
    if (inviteToken && token && currentUser) {
      console.log('[DEBUG App] Logged-in user visited invite route, accepting:', inviteToken);
      authApi.acceptInvitation(inviteToken, token)
        .then((joinedHousehold) => {
          console.log('[DEBUG App] Successfully joined household:', joinedHousehold);
          setInviteNotification({ type: 'success', message: `Successfully joined ${joinedHousehold?.name || 'household'}!` });
          if (typeof window !== 'undefined' && window.history && window.history.replaceState) {
            window.history.replaceState({}, '', '/');
          }
          queryClient.invalidateQueries({ queryKey: ['me'] });
          queryClient.invalidateQueries({ queryKey: ['household'] });
          queryClient.invalidateQueries({ queryKey: ['members'] });
          queryClient.invalidateQueries({ queryKey: ['dashboard'] });
          setActiveView('dashboard');
          setTimeout(() => setInviteNotification(null), 5000);
        })
        .catch((err) => {
          const errMsg = err.message || '';
          if (errMsg.toLowerCase().includes('already a member')) {
            console.log('[DEBUG App] User already member of this household, redirecting...');
            if (typeof window !== 'undefined' && window.history && window.history.replaceState) {
              window.history.replaceState({}, '', '/');
            }
          } else {
            console.error('[DEBUG App] Invite accept error:', err);
            setInviteNotification({ type: 'error', message: `Could not join household: ${errMsg}` });
            if (typeof window !== 'undefined' && window.history && window.history.replaceState) {
              window.history.replaceState({}, '', '/');
            }
            setTimeout(() => setInviteNotification(null), 6000);
          }
        });
    }
  }, [token, currentUser]);

  const handleLogout = () => {
    localStorage.removeItem('roomsplit_token');
    localStorage.removeItem('token');
    queryClient.clear();
    setActiveView('auth');
    setSidebarOpen(false);
  };

  const handleAuthSuccess = () => {
    if (typeof window !== 'undefined' && window.history && window.history.replaceState) {
      window.history.replaceState({}, '', '/');
    }
    queryClient.invalidateQueries({ queryKey: ['me'] });
    queryClient.invalidateQueries({ queryKey: ['household'] });
    queryClient.invalidateQueries({ queryKey: ['members'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    setActiveView('dashboard');
  };

  // If token is present and validating session
  if (token && authLoading) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#090d18',
        color: '#94a3b8'
      }}>
        <div style={{ textAlign: 'center' }}>
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
          <p>Connecting to RoomSplit...</p>
        </div>
      </div>
    );
  }

  // Not logged in or session invalid -> Auth View
  if (!token || authError || activeView === 'auth') {
    return <AuthPage onAuthSuccess={handleAuthSuccess} />;
  }

  // Authenticated Application with Toggleable Hamburger Sidebar
  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#090d18',
      color: '#ffffff',
      display: 'flex',
      position: 'relative'
    }}>
      {/* Floating Invite Feedback Notification */}
      {inviteNotification && (
        <div style={{
          position: 'fixed',
          top: '24px',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 9999,
          background: inviteNotification.type === 'error' ? 'rgba(244, 63, 94, 0.95)' : 'rgba(16, 185, 129, 0.95)',
          color: '#ffffff',
          padding: '10px 22px',
          borderRadius: '9999px',
          boxShadow: '0 12px 32px rgba(0, 0, 0, 0.5)',
          fontSize: '13.5px',
          fontWeight: 600,
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          backdropFilter: 'blur(10px)'
        }}>
          <span>{inviteNotification.message}</span>
          <button
            type="button"
            onClick={() => setInviteNotification(null)}
            style={{
              background: 'none',
              border: 'none',
              color: '#ffffff',
              cursor: 'pointer',
              padding: 0,
              fontSize: '15px',
              fontWeight: 700,
              lineHeight: 1
            }}
          >
            ✕
          </button>
        </div>
      )}

      {/* 1. LEFT SIDEBAR */}
      <Sidebar
        activeView={activeView}
        onNavigate={(viewId) => setActiveView(viewId)}
        currentUser={effectiveUser}
        onLogout={handleLogout}
      />

      {/* 2. ACTIVE MAIN APPLICATION VIEW */}
      <main className="rs-main-content" style={{
        flex: 1,
        minHeight: '100vh',
        overflowY: 'auto',
        position: 'relative',
        backgroundColor: '#090d18'
      }}>
        <style>{`
          @media (max-width: 768px) {
            .rs-main-content {
              padding-bottom: 76px !important;
            }
          }
        `}</style>
        {activeView === 'dashboard' && (
          <DashboardPage
            currentUser={effectiveUser}
            householdId={currentHouseholdId}
            onLogout={handleLogout}
            onNavigate={(target) => setActiveView(target)}
          />
        )}

        {activeView === 'add-expense' && (
          <AddExpensePage
            currentUser={effectiveUser}
            householdId={currentHouseholdId}
            onCancel={() => setActiveView('dashboard')}
            onSuccess={() => setActiveView('expenses')}
          />
        )}

        {activeView === 'balances' && (
          <BalancesPage
            currentUser={effectiveUser}
            householdId={currentHouseholdId}
            onBack={() => setActiveView('dashboard')}
            onNavigate={(target) => setActiveView(target)}
          />
        )}

        {activeView === 'settlements' && (
          <SettlementsPage
            currentUser={effectiveUser}
            householdId={currentHouseholdId}
            onBack={() => setActiveView('dashboard')}
            onNavigate={(target) => setActiveView(target)}
          />
        )}

        {activeView === 'expenses' && (
          <ExpensesPage
            currentUser={effectiveUser}
            householdId={currentHouseholdId}
            onBack={() => setActiveView('dashboard')}
            onAddExpense={() => setActiveView('add-expense')}
          />
        )}

        {activeView === 'analytics' && (
          <AnalyticsPage
            currentUser={effectiveUser}
            householdId={currentHouseholdId}
            onBack={() => setActiveView('dashboard')}
          />
        )}

        {activeView === 'ai' && (
          <AIAssistantPage
            currentUser={effectiveUser}
            householdId={currentHouseholdId}
            onBack={() => setActiveView('dashboard')}
            onNavigate={(target) => setActiveView(target)}
          />
        )}

        {activeView === 'settings' && (
          <SettingsPage
            currentUser={effectiveUser}
            householdId={currentHouseholdId}
            onBack={() => setActiveView('dashboard')}
            onLogout={handleLogout}
          />
        )}
      </main>
    </div>
  );
}

export default App;
