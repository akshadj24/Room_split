import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Sidebar from '../components/Sidebar';
import DashboardPage from '../pages/DashboardPage';
import { householdsApi, expensesApi, settlementsApi } from '../services/api';

vi.mock('../services/api', () => ({
  householdsApi: {
    getDashboard: vi.fn(),
    getMembers: vi.fn(),
    getAnalytics: vi.fn(),
  },
  expensesApi: {
    listExpenses: vi.fn(),
  },
  settlementsApi: {
    getBalances: vi.fn(),
    getSuggestions: vi.fn(),
  },
}));

function renderWithClient(ui) {
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

describe('Redesigned Navigation (Sidebar)', () => {
  const mockUser = { id: 1, name: 'Alice Smith', email: 'alice@example.com' };
  const mockNavigate = vi.fn();
  const mockLogout = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders RoomSplit brand, all 7 navigation items, and user profile', () => {
    render(
      <Sidebar
        activeView="dashboard"
        onNavigate={mockNavigate}
        currentUser={mockUser}
        onLogout={mockLogout}
      />
    );

    // Brand
    expect(screen.getByText('RoomSplit')).toBeInTheDocument();

    // 7 Nav items
    expect(screen.getAllByText('Dashboard').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Expenses').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Balances').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Settlements').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Analytics').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/AI/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Settings').length).toBeGreaterThanOrEqual(1);

    // User name + avatar + logout
    expect(screen.getByText('Alice Smith')).toBeInTheDocument();
    expect(screen.getByText('alice@example.com')).toBeInTheDocument();
    expect(screen.getByText('A')).toBeInTheDocument(); // initial
    expect(screen.getByText('Log Out')).toBeInTheDocument();
  });

  it('navigates when clicking nav items and calls onLogout', () => {
    render(
      <Sidebar
        activeView="dashboard"
        onNavigate={mockNavigate}
        currentUser={mockUser}
        onLogout={mockLogout}
      />
    );

    const expensesBtn = screen.getAllByRole('button', { name: /Expenses/i })[0];
    fireEvent.click(expensesBtn);
    expect(mockNavigate).toHaveBeenCalledWith('expenses');

    const logoutBtn = screen.getByRole('button', { name: /Log Out/i });
    fireEvent.click(logoutBtn);
    expect(mockLogout).toHaveBeenCalledTimes(1);
  });
});

describe('Redesigned Dashboard Page', () => {
  const mockUser = { id: 1, name: 'Alex Johnson', email: 'alex@example.com' };
  const mockNavigate = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    householdsApi.getDashboard.mockResolvedValue({
      household: { id: 1, name: "Sunset Villa", currency: "INR" },
      balance: {
        net_balance: 150,
        total_owed_to_you: 350,
        total_you_owe: 200,
      },
      monthly_spend: {
        total: 12500,
        change_percent: 12.5,
      },
    });

    expensesApi.listExpenses.mockResolvedValue([
      {
        id: 101,
        description: 'Supermarket Groceries',
        amount: 2400,
        category_name: 'Groceries',
        paid_by: 1,
        paid_by_name: 'Alex Johnson',
        expense_date: '2026-10-28',
      },
      {
        id: 102,
        description: 'High-speed Fiber WiFi',
        amount: 1200,
        category_name: 'WiFi',
        paid_by: 2,
        paid_by_name: 'Sam Wilson',
        expense_date: '2026-10-27',
      },
    ]);

    settlementsApi.getBalances.mockResolvedValue({
      household_id: 1,
      balances: [
        { user_id: 1, name: 'Alex Johnson', net_balance: 150, net_balance_paise: 15000 },
        { user_id: 2, name: 'Sam Wilson', net_balance: -150, net_balance_paise: -15000 },
      ],
    });

    settlementsApi.getSuggestions.mockResolvedValue([
      {
        from_user_id: 2,
        from_user_name: 'Sam Wilson',
        to_user_id: 1,
        to_user_name: 'Alex Johnson',
        amount: 150,
      },
    ]);

    householdsApi.getMembers.mockResolvedValue([
      { id: 1, name: 'Alex Johnson', email: 'alex@example.com', role: 'owner' },
      { id: 2, name: 'Sam Wilson', email: 'sam@example.com', role: 'member' },
    ]);

    householdsApi.getAnalytics.mockResolvedValue({
      monthly_history: [
        { month: 'May', amount: 8000, current: false },
        { month: 'Jun', amount: 9500, current: false },
        { month: 'Jul', amount: 7200, current: false },
        { month: 'Aug', amount: 11000, current: false },
        { month: 'Sep', amount: 10500, current: false },
        { month: 'Oct', amount: 12500, current: true },
      ],
      category_breakdown: [
        { label: 'Groceries', category: 'Groceries', amount: 6000, percent: 48, color: '#10b981' },
        { label: 'WiFi', category: 'WiFi', amount: 1200, percent: 10, color: '#06b6d4' },
      ],
    });
  });

  it('renders top 3 summary cards: You Owe, You\'re Owed, This Month', async () => {
    renderWithClient(
      <DashboardPage
        currentUser={mockUser}
        householdId={1}
        onNavigate={mockNavigate}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('You Owe')).toBeInTheDocument();
      expect(screen.getByText("You're Owed")).toBeInTheDocument();
      expect(screen.getByText('This Month')).toBeInTheDocument();
      expect(screen.getByText('₹200')).toBeInTheDocument();
      expect(screen.getByText('₹350')).toBeInTheDocument();
      expect(screen.getByText('₹12,500')).toBeInTheDocument();
    });
  });

  it('renders middle section with Recent Expenses and Who Owes Who', async () => {
    renderWithClient(
      <DashboardPage
        currentUser={mockUser}
        householdId={1}
        onNavigate={mockNavigate}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Recent Expenses')).toBeInTheDocument();
      expect(screen.getByText('Who Owes Who')).toBeInTheDocument();
      expect(screen.getByText('Supermarket Groceries')).toBeInTheDocument();
      expect(screen.getByText('You paid')).toBeInTheDocument();
      expect(screen.getByText('High-speed Fiber WiFi')).toBeInTheDocument();
      expect(screen.getByText('Paid by Sam Wilson')).toBeInTheDocument();
      expect(screen.getAllByText(/Sam Wilson/).length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByRole('button', { name: /Settle/i }).length).toBeGreaterThanOrEqual(1);
    });
  });

  it('renders bottom section with Monthly Spending chart and Category Breakdown', async () => {
    renderWithClient(
      <DashboardPage
        currentUser={mockUser}
        householdId={1}
        onNavigate={mockNavigate}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Monthly Spending')).toBeInTheDocument();
      expect(screen.getByText('Category Breakdown')).toBeInTheDocument();
      expect(screen.getByText('May')).toBeInTheDocument();
      expect(screen.getByText('Oct')).toBeInTheDocument();
      expect(screen.getAllByText('Groceries').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('48%')).toBeInTheDocument();
      expect(screen.getByText('10%')).toBeInTheDocument();
    });
  });

  it('renders clean empty states for brand new user with no data', async () => {
    householdsApi.getDashboard.mockResolvedValue({
      household: { id: 1, name: "New Home", currency: "INR" },
      balance: { net_balance: 0, total_owed_to_you: 0, total_you_owe: 0 },
      monthly_spend: { total: 0, change_percent: 0 },
    });
    expensesApi.listExpenses.mockResolvedValue([]);
    settlementsApi.getBalances.mockResolvedValue({ household_id: 1, balances: [] });
    settlementsApi.getSuggestions.mockResolvedValue([]);
    householdsApi.getAnalytics.mockResolvedValue({
      monthly_history: [],
      category_breakdown: [],
    });

    renderWithClient(
      <DashboardPage
        currentUser={mockUser}
        householdId={1}
        onNavigate={mockNavigate}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('No expenses recorded yet')).toBeInTheDocument();
      expect(screen.getByText('All settled up!')).toBeInTheDocument();
      expect(screen.getByText('No expenses this month')).toBeInTheDocument();
    });
  });
});
