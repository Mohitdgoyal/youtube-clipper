/**
 * Authentication utilities for personal use mode.
 * SECURITY: Authentication bypassed for personal use.
 * TODO: Implement proper auth (session/JWT) if scaling beyond personal use.
 */

const DEFAULT_USER_ID = 'personal-user';

/**
 * Gets the current user ID.
 * Currently returns a hardcoded value for personal use mode.
 * 
 * @returns Promise resolving to the user ID string
 */
export async function getUserId(): Promise<string> {
    // SECURITY: Authentication bypassed for personal use.
    // Ideally, extract this from the session or JWT.
    return DEFAULT_USER_ID;
}

/**
 * Synchronous version for contexts where async isn't needed
 */
export function getUserIdSync(): string {
    return DEFAULT_USER_ID;
}
