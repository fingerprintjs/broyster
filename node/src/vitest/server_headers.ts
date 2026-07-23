export const contentSecurityPolicy =
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' http://* https://*; connect-src 'self' http://* https://*; worker-src blob:"

/**
 * Default headers for the Vitest browser server. Permissive on purpose: the
 * remote browser loads the test page from a public tunnel origin while the
 * Vitest websocket and assets are served from the same origin.
 */
export const defaultBrowserTestServerHeaders: Record<string, string> = {
  'Content-Security-Policy': contentSecurityPolicy,
  'Access-Control-Allow-Origin': '*',
  'Cross-Origin-Resource-Policy': 'cross-origin',
}
