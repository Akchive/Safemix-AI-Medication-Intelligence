"use client";
import { useEffect, useState } from "react";
import { collection, getDocs, addDoc, query, orderBy, limit } from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import { useAuth } from "@/components/providers/AuthProvider";
import { Users, Loader2, Eye, EyeOff } from "lucide-react";
import { setUserRole, type SafeMixRole } from "@/app/actions/adminClaims";

interface UserProfile {
  uid: string;
  language?: string;
  state?: string;
  tier?: string;
  abhaIdHash?: string;
  consentVersion?: string;
  createdAt?: number;
  phoneNumberHash?: string;
  role?: SafeMixRole;
}

const ROLES: SafeMixRole[] = ["patient", "caregiver", "doctor", "reviewer", "admin"];

export default function AdminUsersPage() {
  const { user } = useAuth();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [unmasked, setUnmasked] = useState<Set<string>>(new Set());
  const [updatingRoleUid, setUpdatingRoleUid] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const snap = await getDocs(query(collection(db, "users"), orderBy("createdAt", "desc"), limit(100)));
        setUsers(snap.docs.map((d) => ({ uid: d.id, ...d.data() } as UserProfile)));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const unmask = async (uid: string) => {
    setUnmasked((prev) => new Set(prev).add(uid));
    if (!user?.uid) return;
    await addDoc(collection(db, "audits"), {
      action: "user_unmask",
      reviewerUid: user.uid,
      targetUid: uid,
      at: Date.now(),
    });
  };

  const updateRole = async (uid: string, role: SafeMixRole) => {
    try {
      setUpdatingRoleUid(uid);
      await setUserRole(uid, role);
      setUsers((prev) => prev.map((u) => (u.uid === uid ? { ...u, role } : u)));
      if (user?.uid) {
        await addDoc(collection(db, "audits"), {
          action: "role_update",
          reviewerUid: user.uid,
          targetUid: uid,
          role,
          at: Date.now(),
        });
      }
    } finally {
      setUpdatingRoleUid(null);
    }
  };

  const mask = (s: string | undefined) => (s ? s.slice(0, 4) + "***" : "-");

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-manrope font-bold text-2xl text-[#1a2820] flex items-center gap-2">
          <Users className="w-5 h-5 text-[#5E7464]" /> Users
        </h1>
        <p className="text-sm text-[#7a9080] mt-0.5">PII is masked by default. Unmasking and role updates are audit logged.</p>
      </div>

      {loading ? (
        <Loader2 className="w-6 h-6 animate-spin text-[#5E7464]" />
      ) : users.length === 0 ? (
        <div className="bg-white border border-[#e0e8e2] rounded-2xl p-10 text-center text-[#9ab0a0] text-sm">No users yet.</div>
      ) : (
        <div className="bg-white border border-[#e0e8e2] rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-[#F8F8F4]">
              <tr className="text-left text-[10px] uppercase tracking-widest text-[#9ab0a0]">
                <th className="px-4 py-3">UID</th>
                <th className="px-4 py-3">Phone</th>
                <th className="px-4 py-3">ABHA</th>
                <th className="px-4 py-3">Lang</th>
                <th className="px-4 py-3">State</th>
                <th className="px-4 py-3">Tier</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const isUnmasked = unmasked.has(u.uid);
                return (
                  <tr key={u.uid} className="border-t border-[#f0f4f1]">
                    <td className="px-4 py-3 font-mono text-[11px] text-[#52615a]">{isUnmasked ? u.uid : u.uid.slice(0, 8) + "..."}</td>
                    <td className="px-4 py-3 text-[#52615a]">{isUnmasked ? u.phoneNumberHash ?? "-" : mask(u.phoneNumberHash)}</td>
                    <td className="px-4 py-3 text-[#52615a]">{isUnmasked ? u.abhaIdHash ?? "-" : mask(u.abhaIdHash)}</td>
                    <td className="px-4 py-3 text-[#52615a]">{u.language ?? "-"}</td>
                    <td className="px-4 py-3 text-[#52615a]">{u.state ?? "-"}</td>
                    <td className="px-4 py-3 text-[#52615a]">{u.tier ?? "free"}</td>
                    <td className="px-4 py-3">
                      <select
                        value={u.role ?? "patient"}
                        onChange={(e) => updateRole(u.uid, e.target.value as SafeMixRole)}
                        disabled={updatingRoleUid === u.uid}
                        className="px-2 py-1 rounded-lg border border-[#e0e8e2] bg-white text-xs"
                      >
                        {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <button onClick={() => unmask(u.uid)} disabled={isUnmasked} className="text-xs font-semibold text-[#5E7464] flex items-center gap-1 disabled:opacity-50">
                        {isUnmasked ? <><EyeOff className="w-3 h-3" /> Unmasked</> : <><Eye className="w-3 h-3" /> Unmask</>}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
