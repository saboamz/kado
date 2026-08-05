import '@testing-library/jest-dom/vitest';
import { beforeEach } from 'vitest';
import { resetMockData } from '../lib/mockTransport';

/**
 * The mock transport keeps module-level state, so a reservation made by one
 * test would otherwise be visible to the next and a suite would pass or fail
 * depending on file order. Reset globally rather than per-suite: an opt-in
 * would eventually be forgotten by exactly the test that needed it.
 */
beforeEach(() => resetMockData());
