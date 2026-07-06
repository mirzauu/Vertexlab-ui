/**
 * Centralized API Client Fetch Wrapper
 * Auto-injects Authorization Bearer token, formats base URLs,
 * and intercepts 401 Unauthorized responses to dynamically clear credentials.
 */

const BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

// Deduplication map for active/in-flight GET requests
const inflightRequests = new Map();

const executeRequest = async (endpoint, options = {}) => {
  const token = localStorage.getItem('bearer_token');
  
  // Set default content type if not specified and not FormData
  const headers = {
    'Accept': 'application/json',
    ...options.headers,
  };
  
  // Only auto-inject application/json Content-Type if it is not a FormData upload
  if (!(options.body instanceof FormData) && !headers['Content-Type'] && options.body) {
    headers['Content-Type'] = 'application/json';
  }
  
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  const url = endpoint.startsWith('http') ? endpoint : `${BASE_URL}${endpoint}`;
  
  try {
    const response = await fetch(url, {
      ...options,
      headers,
    });
    
    // Global 401 Interceptor: clear credentials and refresh to force redirect to login
    // Skip reload for login/registration authentication routes
    if (response.status === 401 && !url.includes('/api/v1/auth/')) {
      localStorage.removeItem('bearer_token');
      localStorage.removeItem('organization_id');
      window.location.reload();
    }
    
    return response;
  } catch (error) {
    console.error(`[API ERROR] Failure calling ${url}:`, error);
    throw error;
  }
};

export const api = async (endpoint, options = {}) => {
  const method = (options.method || 'GET').toUpperCase();
  
  // Only deduplicate GET requests that do not specify an AbortSignal
  if (method === 'GET' && !options.signal) {
    const cacheKey = endpoint;
    if (inflightRequests.has(cacheKey)) {
      const existingPromise = inflightRequests.get(cacheKey);
      const response = await existingPromise;
      return response.clone();
    }
    
    const promise = executeRequest(endpoint, options);
    inflightRequests.set(cacheKey, promise);
    
    try {
      const response = await promise;
      return response.clone();
    } finally {
      inflightRequests.delete(cacheKey);
    }
  }
  
  return executeRequest(endpoint, options);
};
