/** Page snapshot captured when a session is initialized. */
export interface PageContext {
  url: string;
  hostname: string;
  pathname: string;
  title: string;
  startedAt: number;
}

/**
 * Stable identity uses hostname + optional path pattern, NOT the full URL.
 * Tracking parameters and fragments are retained only for the active session.
 */
export interface PageIdentity {
  hostname: string;
  pathname: string;
}
