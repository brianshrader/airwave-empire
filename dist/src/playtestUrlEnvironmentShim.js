/**
 * Exposes playtestUrlEnvironmentCore on window before legacy.js (classic defer) runs.
 * Loaded as type=module in play.html / play-guest.html ahead of main.js and legacy.js.
 */
import {
  isPlaytestQueryFlagEnabled as coreIsPlaytestQueryFlagEnabled,
  isPlaytestUrlEnvironment as coreIsPlaytestUrlEnvironment,
} from './playtestUrlEnvironmentCore.js';

const viteDev = !!import.meta.env?.DEV;

if (typeof window !== 'undefined') {
  window.wlIsPlaytestUrlEnvironment = (hostname) =>
    coreIsPlaytestUrlEnvironment(hostname, { viteDev });
  window.wlIsPlaytestQueryFlagEnabled = (paramName, search, hostname) =>
    coreIsPlaytestQueryFlagEnabled(paramName, search, hostname, { viteDev });
}
