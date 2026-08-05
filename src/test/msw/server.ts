import { setupServer } from 'msw/node';
import { handlers } from './handlers';

/**
 * The mock PostgREST server used by tests that exercise the data layer.
 *
 * Not started globally in setup.ts: most screen tests still render fixtures
 * synchronously and gain nothing from an interceptor. Tests that need it opt
 * in with `useMockApi()` from ../render.
 */
export const server = setupServer(...handlers);
