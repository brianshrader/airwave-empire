/** IIFE entry — bundles catalog + profileCountryLifecycleMktFmtMult for legacy.js / VM harnesses. */
import catalog from '../data/formatLifecycle.v1.json' with { type: 'json' };
import { profileCountryLifecycleMktFmtMult as mult } from './formatLifecycleProfileRuntime.js';

export function profileCountryLifecycleMktFmtMult(marketId, year) {
  return mult(marketId, year, catalog);
}
