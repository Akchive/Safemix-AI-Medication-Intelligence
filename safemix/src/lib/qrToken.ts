/**
 * QR Token — HMAC-SHA256 signed JWT for Doctor Share.
 *
 * Security note (PRD §18): the signing secret MUST be server-only. The
 * previous NEXT_PUBLIC_QR_SECRET was bundled into the client and let any user
 * forge tokens for arbitrary UIDs. We now read QR_SECRET (non-public) and
 * import this module only from "use server" actions or server route handlers.
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
  // Prefer server-only secret. Fall back to the legacy NEXT_PUBLIC_ name only
  // for local dev so we don't break running setups, but warn loudly.
  const secret = process.env.QR_SECRET ?? process.env.NEXT_PUBLIC_QR_SECRET;
  if (!secret) throw new Error("QR_SECRET is not configured (set in .env.local, server-only).");
  if (process.env.NEXT_PUBLIC_QR_SECRET && !process.env.QR_SECRET) {
    console.warn(
      "[SafeMix] NEXT_PUBLIC_QR_SECRET is exposed to the client. " +
      "Rename to QR_SECRET in .env.local before deploying."
    );
  }
  return new TextEncoder().encode(secret);
}

export async function generateDoctorToken(uid: string, durationMs: number): Promise<string> {
  const issued = Date.now();
  const expiry = issued + durationMs;
  const jti = `${uid.slice(0, 8)}_${issued}`;

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

export async function verifyDoctorToken(token: string): Promise<DoctorTokenPayload> {
  const { payload } = await jwtVerify(token, getSecret(), {
    algorithms: ["HS256"],
  });
  return payload as DoctorTokenPayload;
}
