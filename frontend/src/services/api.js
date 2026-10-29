const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ||
  "http://localhost:8000/api/v1";

export async function apiRequest(endpoint, { method = 'GET', data, token } = {}) {
  const headers = {
    'Content-Type': 'application/json',
  };

  const storedToken = token || localStorage.getItem('roomsplit_token') || localStorage.getItem('token');
  if (storedToken) {
    headers['Authorization'] = `Bearer ${storedToken}`;
  }

  const config = {
    method,
    headers,
  };

  if (data && method !== 'GET') {
    config.body = JSON.stringify(data);
  }

  console.log(`[API REQUEST] ${method} ${endpoint}`, {
    url: `${API_BASE_URL}${endpoint}`,
    authorizationHeader: headers['Authorization'] ? `Bearer ${storedToken.substring(0, 15)}...` : 'NONE (Missing JWT!)',
    body: config.body || null,
  });

  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, config);
    const result = await response.json().catch(() => ({}));

    console.log(`[API RESPONSE] ${method} ${endpoint} (Status ${response.status}):`, result);

    if (!response.ok) {
      const errorMsg = result.detail || 'An unexpected error occurred';
      throw new Error(typeof errorMsg === 'string' ? errorMsg : JSON.stringify(errorMsg));
    }

    return result;
  } catch (err) {
    console.error(`[API ERROR] ${method} ${endpoint}:`, err.message || err);
    throw err;
  }
}

export const authApi = {
  register: (name, email, password) =>
    apiRequest('/auth/register', { method: 'POST', data: { name, email, password } }),

  login: (email, password) =>
    apiRequest('/auth/login', { method: 'POST', data: { email, password } }),

  getMe: () =>
    apiRequest('/auth/me', { method: 'GET' }),

  logout: () =>
    apiRequest('/auth/logout', { method: 'POST' }),

  acceptInvitation: (inviteToken, jwtToken) =>
    apiRequest(`/invitations/${inviteToken}/accept`, { method: 'POST', token: jwtToken }),
};

export const householdsApi = {
  createHousehold: (name, currency = 'INR') =>
    apiRequest('/households', { method: 'POST', data: { name, currency } }),

  getHousehold: (householdId) =>
    apiRequest(`/households/${householdId}`, { method: 'GET' }),

  getDashboard: (householdId) =>
    apiRequest(`/households/${householdId}/dashboard`, { method: 'GET' }),

  getAnalytics: (householdId) =>
    apiRequest(`/households/${householdId}/analytics`, { method: 'GET' }),

  getMembers: (householdId) =>
    apiRequest(`/households/${householdId}/members`, { method: 'GET' }),

  createInvitation: (householdId) =>
    apiRequest(`/households/${householdId}/invitations`, { method: 'POST' }),

  getCategories: (householdId) =>
    apiRequest(`/households/${householdId}/categories`, { method: 'GET' }),
};

export const expensesApi = {
  listExpenses: (householdId) =>
    apiRequest(`/households/${householdId}/expenses`, { method: 'GET' }),

  createExpense: (householdId, data) =>
    apiRequest(`/households/${householdId}/expenses`, { method: 'POST', data }),

  getExpenseDetail: (expenseId) =>
    apiRequest(`/expenses/${expenseId}`, { method: 'GET' }),

  editExpense: (expenseId, data) =>
    apiRequest(`/expenses/${expenseId}`, { method: 'PATCH', data }),

  reverseExpense: (expenseId) =>
    apiRequest(`/expenses/${expenseId}/reverse`, { method: 'POST' }),
};

export const settlementsApi = {
  getBalances: (householdId) =>
    apiRequest(`/households/${householdId}/balances`, { method: 'GET' }),

  getBreakdown: (householdId, memberId) =>
    apiRequest(`/households/${householdId}/balances/${memberId}/breakdown`, { method: 'GET' }),

  getSuggestions: (householdId) =>
    apiRequest(`/households/${householdId}/settlements/suggestions`, { method: 'GET' }),

  recordSettlement: (householdId, data) =>
    apiRequest(`/households/${householdId}/settlements`, { method: 'POST', data }),

  confirmSettlement: (settlementId) =>
    apiRequest(`/settlements/${settlementId}/confirm`, { method: 'PATCH' }),

  cancelSettlement: (settlementId) =>
    apiRequest(`/settlements/${settlementId}/cancel`, { method: 'PATCH' }),

  listSettlements: (householdId) =>
    apiRequest(`/households/${householdId}/settlements`, { method: 'GET' }),
};

export const aiApi = {
  chat: (householdId, message, conversationHistory = []) =>
    apiRequest(`/households/${householdId}/ai/chat`, {
      method: 'POST',
      data: { message, conversation_history: conversationHistory },
    }),
};
