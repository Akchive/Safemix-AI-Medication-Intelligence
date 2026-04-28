"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Database, GitBranch, Megaphone, Cpu, FileText, Settings, Users, BarChart3 } from "lucide-react";

const items = [
  { href: "/admin",                 label: "Medicine DB",      icon: Database, exact: true },
  { href: "/admin/interactions",    label: "Interaction Graph", icon: GitBranch },
  { href: "/admin/ai-review-queue", label: "AI Review Queue",   icon: Cpu },
  { href: "/admin/adr-review",      label: "ADR Reports",       icon: FileText },
  { href: "/admin/analytics",       label: "Analytics",         icon: BarChart3 },
  { href: "/admin/content",         label: "Content & Notif.",  icon: Megaphone },
  { href: "/admin/users",           label: "Users",             icon: Users },
  { href: "/admin/settings",        label: "Feature Flags",     icon: Settings },
];

export default function AdminNav() {
  const pathname = usePathname();
  return (
    <div className="bg-white rounded-2xl border border-[#e0e8e2] p-1.5 flex flex-wrap gap-1 mb-6">
      {items.map((i) => {
        const active = i.exact ? pathname === i.href : pathname === i.href || pathname.startsWith(i.href + "/");
        return (
          <Link
            key={i.href}
            href={i.href}
            className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-colors ${
              active ? "bg-[#42594A] text-white" : "text-[#52615a] hover:bg-[#f0f5f1]"
            }`}
          >
            <i.icon className="w-3.5 h-3.5" />
            {i.label}
          </Link>
        );
      })}
    </div>
  );
}
