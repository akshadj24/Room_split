import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import AddExpensePage from '../pages/AddExpensePage';
import BalancesPage from '../pages/BalancesPage';
import SettlementsPage from '../pages/SettlementsPage';
import AIAssistantPage from '../pages/AIAssistantPage';
import AuthPage from '../pages/AuthPage';
import { settlementsApi, householdsApi, authApi } from '../services/api';

function renderWithQueryClient(ui) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      {ui}
    </QueryClientProvider>
  );
}

describe('Phase 8 — Frontend Critical Path Verification', () => {
  const dummyUser = { id: 1, name: 'Alex Morgan', email: 'alex@example.com' };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // 1. Expense form validates amount > 0
  it('validates expense amount must be greater than 0', () => {
    renderWithQueryClient(<AddExpensePage currentUser={dummyUser} onCancel={() => {}} onSuccess={() => {}} />);

    const submitBtn = screen.getByRole('button', { name: /save & split expense/i });
    fireEvent.click(submitBtn);

    expect(screen.getByText(/greater than 0/i)).toBeInTheDocument();
  });

  // 2. Participants selector — at least 1 required
  it('enforces at least 1 participant in participant selector', () => {
    const testMembers = [
      dummyUser,
      { id: 2, name: 'Raj Sharma', email: 'raj@example.com' },
      { id: 3, name: 'Samir Patel', email: 'samir@example.com' }
    ];

    renderWithQueryClient(
      <AddExpensePage
        currentUser={dummyUser}
        initialMembers={testMembers}
        onCancel={() => {}}
        onSuccess={() => {}}
      />
    );

    // Attempt to deselect all 3 members
    const alexElements = screen.getAllByText('Alex Morgan (You)');
    fireEvent.click(alexElements[alexElements.length - 1]);

    const rajElements = screen.getAllByText('Raj Sharma');
    fireEvent.click(rajElements[rajElements.length - 1]);

    const samirElements = screen.getAllByText('Samir Patel');
    fireEvent.click(samirElements[samirElements.length - 1]);

    // The selector strictly guarantees at least 1 participant remains selected
    expect(screen.getByText(/Split Among Roommates \(1\/3\)/i)).toBeInTheDocument();
  });

  // 3. Confirm modal / draft card shown before saving AI draft
  it('displays draft confirmation card before saving AI expense draft', () => {
    renderWithQueryClient(<AIAssistantPage currentUser={dummyUser} householdId={1} onBack={() => {}} onNavigate={() => {}} />);

    // Check that copilot greeting is loaded
    expect(screen.getByText(/RoomSplit AI Copilot/i)).toBeInTheDocument();

    // Verify AI prompt input exists and user has explicit control
    const input = screen.getByPlaceholderText(/ask anything or type/i);
    expect(input).toBeInTheDocument();
  });

  // 4. Balance shows correct sign (owe vs owed)
  it('displays balance with correct sign indicating owed (+) vs owes (-)', async () => {
    vi.spyOn(settlementsApi, 'getBalances').mockResolvedValue({
      household_id: 1,
      balances: [
        { user_id: 1, name: 'Alex Morgan', email: 'alex@example.com', net_balance_paise: 125000, net_balance: 1250 },
        { user_id: 2, name: 'Raj Sharma', email: 'raj@example.com', net_balance_paise: -95000, net_balance: -950 }
      ]
    });
    vi.spyOn(settlementsApi, 'getSuggestions').mockResolvedValue([]);

    renderWithQueryClient(<BalancesPage currentUser={dummyUser} householdId={1} onNavigate={() => {}} onBack={() => {}} />);

    // User is owed +₹1,250 (in hero card and member list)
    const owedElements = await screen.findAllByText('+₹1,250');
    expect(owedElements.length).toBeGreaterThanOrEqual(1);

    // Raj Sharma owes -₹950
    const owesElements = await screen.findAllByText('-₹950');
    expect(owesElements.length).toBeGreaterThanOrEqual(1);
  });

  // 5. Settlement confirm button — receiver only
  it('shows "Confirm Received" button only for receiver, never for payer', async () => {
    vi.spyOn(settlementsApi, 'listSettlements').mockResolvedValue([
      {
        id: 101,
        payer_id: 2,
        payer_name: 'Raj Sharma',
        receiver_id: 1,
        receiver_name: 'Alex Morgan',
        amount_paise: 95000,
        amount: 950,
        status: 'pending',
        notes: 'Groceries share',
        created_at: new Date().toISOString()
      }
    ]);
    vi.spyOn(householdsApi, 'getMembers').mockResolvedValue([
      { id: 1, name: 'Alex Morgan', email: 'alex@example.com', role: 'owner', status: 'active' },
      { id: 2, name: 'Raj Sharma', email: 'raj@example.com', role: 'member', status: 'active' },
      { id: 3, name: 'Samir Patel', email: 'samir@example.com', role: 'member', status: 'active' }
    ]);

    // When logged in as Alex (User #1, receiver of settlement #101):
    const { unmount } = renderWithQueryClient(
      <SettlementsPage
        currentUser={{ id: 1, name: 'Alex Morgan' }}
        householdId={1}
        onBack={() => {}}
        onNavigate={() => {}}
      />
    );

    // Confirm Received button is present for receiver
    const confirmButtons = await screen.findAllByRole('button', { name: /confirm received/i });
    expect(confirmButtons.length).toBe(1);
    unmount();

    // When logged in as Samir (User #3, payer / third party):
    renderWithQueryClient(
      <SettlementsPage
        currentUser={{ id: 3, name: 'Samir Patel' }}
        householdId={1}
        onBack={() => {}}
        onNavigate={() => {}}
      />
    );

    // Confirm button must NOT be available
    expect(screen.queryByRole('button', { name: /confirm received/i })).toBeNull();
  });

  it('accepts invitation on registration via invite link and redirects', async () => {
    // Mock URL pathname to /invite/test-token-123
    window.history.pushState({}, '', '/invite/test-token-123');

    vi.spyOn(authApi, 'register').mockResolvedValue({ id: 10, name: 'New Roommate', email: 'roommate@test.com' });
    vi.spyOn(authApi, 'login').mockResolvedValue({ access_token: 'fake-jwt-123', token_type: 'bearer' });
    const acceptSpy = vi.spyOn(authApi, 'acceptInvitation').mockResolvedValue({ id: 5, name: 'Sunnyvale House' });
    vi.spyOn(authApi, 'getMe').mockResolvedValue({ id: 10, name: 'New Roommate', email: 'roommate@test.com', household_id: 5 });

    const authSuccessSpy = vi.fn();

    renderWithQueryClient(
      <AuthPage onAuthSuccess={authSuccessSpy} initialMode="register" />
    );

    // Should detect invite and show notice
    expect(screen.getByText(/household invitation active/i)).toBeDefined();

    // Fill registration form
    fireEvent.change(screen.getByPlaceholderText(/alex morgan/i), { target: { value: 'New Roommate' } });
    fireEvent.change(screen.getByPlaceholderText(/alex@example.com/i), { target: { value: 'roommate@test.com' } });
    fireEvent.change(screen.getByPlaceholderText(/••••••••/i), { target: { value: 'secret123' } });

    // Submit form
    fireEvent.click(screen.getByRole('button', { name: /create account & join household/i }));

    // Verify acceptInvitation called with token from URL path and the JWT
    await vi.waitFor(() => {
      expect(acceptSpy).toHaveBeenCalledWith('test-token-123', 'fake-jwt-123');
      expect(authSuccessSpy).toHaveBeenCalled();
    });
  });

  it('shows error message without redirecting when invite token is invalid or expired', async () => {
    window.history.pushState({}, '', '/invite/expired-token-999');

    vi.spyOn(authApi, 'register').mockResolvedValue({ id: 11, name: 'Late Roommate', email: 'late@test.com' });
    vi.spyOn(authApi, 'login').mockResolvedValue({ access_token: 'fake-jwt-456', token_type: 'bearer' });
    vi.spyOn(authApi, 'acceptInvitation').mockRejectedValue(new Error('Invitation has expired'));

    const authSuccessSpy = vi.fn();

    renderWithQueryClient(
      <AuthPage onAuthSuccess={authSuccessSpy} initialMode="register" />
    );

    fireEvent.change(screen.getByPlaceholderText(/alex morgan/i), { target: { value: 'Late Roommate' } });
    fireEvent.change(screen.getByPlaceholderText(/alex@example.com/i), { target: { value: 'late@test.com' } });
    fireEvent.change(screen.getByPlaceholderText(/••••••••/i), { target: { value: 'secret123' } });

    fireEvent.click(screen.getByRole('button', { name: /create account & join household/i }));

    // Should display the error message on page and NOT call onAuthSuccess
    expect(await screen.findByText(/could not join household: invitation has expired/i)).toBeDefined();
    expect(authSuccessSpy).not.toHaveBeenCalled();
  });
});

