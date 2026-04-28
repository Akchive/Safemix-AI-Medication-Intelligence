/**
 * QR Token — HMAC-SHA256 signed JWT for Doctor Share.
 * Replaces the old base64(JSON) approach which was forgeable.
 * Uses the `jose` library (browser + Node/Edge compatible).
 */
import { SignJWT, jwtVerify, type JWTPayload } from "jose";

export interface DoctorTokenPayload extends JWTPayload {
  uid: string;
  sub: "doctor-share";
  /** Unique share ID — maps to doctor_snapshots/{jti} in Firestore */
  jti: string;
  /** Expiry epoch (ms) — for UI countdown (same as `exp * 1000`) */
  expiry: number;
  /** Issue time epoch (ms) */
  issued: number;
}

function getSecret(): Uint8Array {
  const secret = process.env.NEXT_PUBLIC_QR_SECRET;
  if (!secret) throw new Error("NEXT_PUBLIC_QR_SECRET is not configured in .env.local");
  return new TextEncoder().encode(secret);
}

/**
 * Generate a signed HS256 JWT for the doctor portal.
 * @param uid  Firebase user UID
 * @param durationMs  How long the token is valid for (ms)
 */
export async function generateDoctorToken(uid: string, durationMs: number): Promise<string> {
  const issued = Date.now();
  const expiry = issued + durationMs;
  const jti = `${uid.slice(0, 8)}_${issued}`; // unique share ID

  return await new SignJWT({
    uid,
    sub: "doctor-share",
    jti,
    expiry,
    issued,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt(Math.floor(issued / 1000))
    .setExpirationTime(Math.floor(expiry / 1000))
    .setJti(jti)
    .sign(getSecret());
}

/**
 * Verify and decode a doctor share token.
 * Throws if signature is invalid or token is expired.
 */
export async function verifyDoctorToken(token: string): Promise<DoctorTokenPayload> {
  const { payload } = await jwtVerify(token, getSecret(), {
    algorithms: ["HS256"],
  });
  return payload as DoctorTokenPayload;
}
