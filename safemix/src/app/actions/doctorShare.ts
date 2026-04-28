"use server";
/**
 * Doctor-share server actions. The QR signing secret never crosses the
 * network — clients call these and receive only the opaque JWT.
 */
import { generateDoctorToken, verifyDoctorToken, type DoctorTokenPayload } from "@/lib/qrToken";

export async function issueDoctorShareToken(uid: string, durationMs: number) {
  if (!uid) throw new Error("uid required");
  if (durationMs <= 0 || durationMs > 24 * 60 * 60 * 1000) {
    throw new Error("durationMs must be 1ms–24h");
  }
  const token = await generateDoctorToken(uid, durationMs);
  const payload = await verifyDoctorToken(token);
  return { token, payload };
}

export async function decodeDoctorShareToken(token: string): Promise<DoctorTokenPayload> {
  return await verifyDoctorToken(token);
}
