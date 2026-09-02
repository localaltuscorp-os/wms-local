"use client";

import { usePathname } from "next/navigation";
import { MainNavPill } from "@/components/layout/main-nav-pill";
import { MainNavGroup } from "@/components/layout/main-nav-group";
import {
  ADMIN_TOP_LEVEL,
  ADMIN_GROUPS,
  isAdminNavActive,
} from "./admin-nav-config";

export function AdminTopNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Admin"
      className="flex items-center gap-1 2xl:gap-1.5 max-md:gap-1"
    >
      {ADMIN_TOP_LEVEL.map((it) => (
        <MainNavPill
          key={it.href}
          href={it.href}
          label={it.label}
          Icon={it.Icon}
          active={isAdminNavActive(pathname, it)}
        />
      ))}
      <span aria-hidden className="nav-group-divider" />
      {ADMIN_GROUPS.map((g) => {
        const items = g.items.map((it) => ({
          href: it.href,
          label: it.label,
          Icon: it.Icon,
          active: isAdminNavActive(pathname, it),
        }));
        return (
          <MainNavGroup
            key={g.label}
            label={g.label}
            Icon={g.Icon}
            items={items}
            active={items.some((i) => i.active)}
          />
        );
      })}
    </nav>
  );
}
