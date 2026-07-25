/**
 * Authentication utilities for personal use mode.
 * SECURITY: Authentication bypassed for personal use.
 * TODO: Implement proper auth (session/JWT) if scaling beyond personal use.
 */

const DEFAULT_USER_ID = 'personal-user';

/**
 * Gets the current user ID.
 * Currently returns a hardcoded value for personal use mode.
 */
export async function getUserId(): Promise<string> {
    // SECURITY: Authentication bypassed for personal use.
    return DEFAULT_USER_ID;
}
