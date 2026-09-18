import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronRight, type LucideIcon } from "lucide-react";
import { MastersTabs } from "./masters-tabs";

const ACCENT_DEEP = "#A80400";

/** The top of every Masters page: the tab strip, a breadcrumb, then the title. */
export function MastersHeader({
  Icon,
  topic,
  title,
  description,
  actions,
}: {
  Icon: LucideIcon;
  /** The topic this master sits under — omitted on the overview. */
  topic?: string;
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <>
      <MastersTabs />
      <header className="mb-6">
        {topic && (
          <nav aria-label="Breadcrumb" className="mb-2 flex items-center gap-1 text-[12px] font-semibold text-slate-500">
            <Link href="/operations/masters" className="hover:text-slate-800">
              Masters
            </Link>
            <ChevronRight className="h-3 w-3" />
            <span>{topic}</span>
          </nav>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <span
            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl"
            style={{ background: "#FEE2E2", color: ACCENT_DEEP }}
          >
            <Icon className="h-5 w-5" />
          </span>
          <div className="mr-auto min-w-0">
            <h1 className="text-[22px] font-black tracking-tight text-slate-900">{title}</h1>
            <p className="text-[13px] text-slate-500">{description}</p>
          </div>
          {actions}
        </div>
      </header>
    </>
  );
}
