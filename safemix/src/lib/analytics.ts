/**
 * Firebase Analytics helper.
 * Wraps logEvent so we gracefully degrade if analytics fails to init.
 */
import { getApp } from "firebase/app";

let _analytics: any = null;

async function getAnalyticsInstance() {
  if (_analytics) return _analytics;
  try {
    const { getAnalytics, isSupported } = await import("firebase/analytics");
    const supported = await isSupported();
    if (supported) {
      _analytics = getAnalytics(getApp());
    }
  } catch {
    // Analytics not supported in this environment (SSR, test, etc.)
  }
  return _analytics;
}

export async function trackEvent(
  eventName: string,
  params?: Record<string, string | number | boolean>
) {
  try {
    const analytics = await getAnalyticsInstance();
    if (!analytics) return;
    const { logEvent } = await import("firebase/analytics");
    logEvent(analytics, eventName, params);
  } catch {
    // Fail silently — analytics should never break the app
  }
}

export function getAnalyticsContext(params?: {
  language?: string;
  state?: string;
  ageBand?: string;
  deviceClass?: string;
}): Record<string, string> {
  const ramGB = (globalThis as any)?.navigator?.deviceMemory as number | undefined;
  const inferredDeviceClass =
    typeof ramGB === "number" ? (ramGB <= 3 ? "low" : ramGB <= 6 ? "mid" : "high") : "unknown";

  return {
    language: params?.language ?? "unknown",
    state: params?.state ?? "unknown",
    age_band: params?.ageBand ?? "unknown",
    device_class: params?.deviceClass ?? inferredDeviceClass,
  };
}

// Convenience named events
export const AnalyticsEvents = {
  PAGE_VIEW: "page_view",
  INTERACTION_CHECK: "interaction_check",
  MEDICINE_ADDED: "medicine_added",
  QR_GENERATED: "qr_generated",
  ADVERSE_EVENT_REPORTED: "adverse_event_reported",
  SIGN_UP: "sign_up",
  LOGIN: "login",
  ASSISTANT_INVOKED: "assistant_invoked",
  ASSISTANT_VOICE: "assistant_voice",
  DATA_EXPORTED: "data_exported",
  ACCOUNT_DELETED: "account_deleted",
  REVIEWER_DECISION: "reviewer_decision",
  ALTERNATIVES_CLICKED: "alternatives_clicked",
  ALTERNATIVES_SUCCESS: "alternatives_success",
  ALTERNATIVES_FALLBACK: "alternatives_fallback",
  ALTERNATIVES_FAILED: "alternatives_failed",
} as const;
