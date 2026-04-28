"use server";

import { getAdminAuth } from "@/lib/firebase/admin";

const ALLOWED_ROLES = ["patient", "caregiver", "doctor", "reviewer", "admin"] as const;
export type SafeMixRole = (typeof ALLOWED_ROLES)[number];

function assertRole(role: string): asserts role is SafeMixRole {
  if (!(ALLOWED_ROLES as readonly string[]).includes(role)) {
    throw new Error(`Invalid role: ${role}`);
  }
}

/**
 * Sets Firebase Auth custom claim `role` for the target uid.
 * Caller access is already protected by AdminGuard UI; Firestore/audit trails
 * should be added by the caller if needed.
 */
export async function setUserRole(uid: string, role: string) {
  if (!uid) throw new Error("uid required");
  assertRole(role);

  const adminAuth = getAdminAuth();
  const user = await adminAuth.getUser(uid);
  const prevClaims = user.customClaims ?? {};

  await adminAuth.setCustomUserClaims(uid, {
    ...prevClaims,
    role,
  });

  return { uid, role };
}
