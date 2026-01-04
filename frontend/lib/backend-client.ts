/**
 * Backend API client wrapper for consistent API calls.
 * Centralizes backend URL configuration and authentication headers.
 */

const BACKEND_URL = process.env.BACKEND_API_URL || 'http://localhost:3001';
const BACKEND_SECRET = process.env.BACKEND_SECRET || 'dev-secret';

interface FetchOptions extends Omit<RequestInit, 'headers'> {
    headers?: Record<string, string>;
}

/**
 * Makes an authenticated request to the backend API.
 * Automatically includes authorization headers and handles common error patterns.
 */
export async function backendFetch(
    endpoint: string,
    options: FetchOptions = {}
): Promise<Response> {
    const url = endpoint.startsWith('http')
        ? endpoint
        : `${BACKEND_URL}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;

    const headers: Record<string, string> = {
        'Authorization': `Bearer ${BACKEND_SECRET}`,
        ...options.headers,
    };

    // Add Content-Type for JSON bodies
    if (options.body && typeof options.body === 'string') {
        headers['Content-Type'] = headers['Content-Type'] || 'application/json';
    }

    return fetch(url, {
        ...options,
        headers,
    });
}

/**
 * Helper to get the backend URL for building URLs with query params
 */
export function getBackendUrl(): string {
    return BACKEND_URL;
}
