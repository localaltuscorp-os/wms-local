"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import * as Dialog from "@radix-ui/react-dialog";
import { useQuery } from "@tanstack/react-query";
import {
  Search, Loader2, CornerDownLeft, CheckSquare, Building2,
  FolderKanban, User, IndianRupee, FileText,
} from "lucide-react";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import { globalSearchAction } from "@/app/(app)/search/actions";
import type { GlobalSearchResult } from "@/lib/queries/global-search";
import { STATUS_LABELS_FALLBACK } from "@/lib/format";

const EMPTY: GlobalSearchResult = {
  tasks: [], clients: [], projects: [], people: [], outstanding: [], documents: [],
};

/**
 * App-wide global search. ⌘/Ctrl+K command palette (cmdk + Radix Dialog) that
 * queries every entity (tasks, clients, projects, people, receivables,
 * documents) via a single GIN-indexed server action, grouped + ranked with
 * archived/inactive below active. Debounced + TanStack-Query-cached.
 */
export function GlobalSearch() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const debounced = useDebounced(query, 180);
  const q = debounced.trim();

  const { data = EMPTY, isFetching } = useQuery({
    queryKey: ["global-search", q],
    queryFn: () => globalSearchAction(q),
    enabled: open && q.length >= 2,
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });

  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  React.useEffect(() => {
    if (open) setQuery("");
  }, [open]);

  function go(href: string) {
    setOpen(false);
    router.push(href as Route);
  }

  const total =
    data.tasks.length + data.clients.length + data.projects.length +
    data.people.length + data.outstanding.length + data.documents.length;

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button
          type="button"
          aria-label="Search"
          className="inline-flex items-center gap-2 rounded-pill border border-hairline bg-surface-soft px-3 h-10 text-ink-subtle transition-colors hover:bg-surface-card hover:border-hairline-strong max-md:h-9 max-md:px-2.5"
        >
          <Search size={16} strokeWidth={2.2} className="shrink-0" />
          <span className="text-[14px] font-medium max-2xl:hidden">Search everything…</span>
          <kbd
            className="ml-2 hidden 2xl:inline-flex items-center gap-0.5 rounded border border-hairline bg-surface-card px-1.5 py-0.5 text-[11px] font-bold text-ink-subtle"
            aria-hidden
          >
            ⌘K
          </kbd>
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay
          className="fixed inset-0 z-[90] data-[state=open]:animate-in data-[state=open]:fade-in-0"
          style={{ background: "rgba(15,23,42,0.40)", backdropFilter: "blur(3px)" }}
        />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed left-1/2 top-[12vh] z-[100] w-[min(640px,calc(100vw-32px))] -translate-x-1/2 overflow-hidden rounded-section border border-hairline-strong bg-surface-card data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"
          style={{ boxShadow: "0 24px 60px -16px rgba(15,23,42,0.40)" }}
        >
          <Dialog.Title className="sr-only">Search</Dialog.Title>
          <Command shouldFilter={false} loop>
            <div className="flex items-center gap-2.5 px-4">
              <Search size={18} strokeWidth={2.2} className="shrink-0 text-ink-subtle" />
              <CommandInput
                autoFocus
                value={query}
                onValueChange={setQuery}
                placeholder="Search tasks, clients, projects, people…"
                className="h-14 !border-b-0 !px-0 text-[16px]"
              />
              {isFetching && <Loader2 size={16} className="shrink-0 animate-spin text-ink-subtle" />}
            </div>
            <CommandList className="max-h-[60vh] overflow-y-auto border-t border-hairline p-2">
              {q.length < 2 ? (
                <CommandEmpty className="px-3 py-6 text-center text-[14px] text-ink-subtle">
                  Type at least 2 characters to search.
                </CommandEmpty>
              ) : total === 0 && !isFetching ? (
                <CommandEmpty className="px-3 py-6 text-center text-[14px] text-ink-subtle">
                  No results for “{q}”.
                </CommandEmpty>
              ) : null}

              {data.tasks.length > 0 && (
                <CommandGroup heading="Tasks">
                  {data.tasks.map((t) => (
                    <Row key={`task-${t.id}`} value={`task-${t.id}`} icon={<CheckSquare size={15} />}
                      onSelect={() => go(`/tasks/${t.id}`)}
                      title={t.title}
                      badge={t.archived ? "Archived" : undefined}
                      lead={t.taskNo != null ? `#${t.taskNo}` : undefined}
                      sub={[t.subject, t.doerName, STATUS_LABELS_FALLBACK[t.status]].filter(Boolean).join(" · ")}
                    />
                  ))}
                </CommandGroup>
              )}

              {data.clients.length > 0 && (
                <CommandGroup heading="Clients">
                  {data.clients.map((c) => (
                    <Row key={`client-${c.id}`} value={`client-${c.id}`} icon={<Building2 size={15} />}
                      onSelect={() => go(`/tasks?client=${encodeURIComponent(c.name)}`)}
                      title={c.name} sub="View tasks for this client" />
                  ))}
                </CommandGroup>
              )}

              {data.projects.length > 0 && (
                <CommandGroup heading="Projects">
                  {data.projects.map((p) => (
                    <Row key={`project-${p.id}`} value={`project-${p.id}`} icon={<FolderKanban size={15} />}
                      onSelect={() => go(`/projects/${p.rootId}`)}
                      title={p.name} sub={p.kind} />
                  ))}
                </CommandGroup>
              )}

              {data.people.length > 0 && (
                <CommandGroup heading="People">
                  {data.people.map((p) => (
                    <Row key={`person-${p.id}`} value={`person-${p.id}`} icon={<User size={15} />}
                      onSelect={() => go(`/tasks?emp=${p.id}`)}
                      title={p.name}
                      badge={p.isActive ? undefined : "Inactive"}
                      sub={[p.email, p.department].filter(Boolean).join(" · ")} />
                  ))}
                </CommandGroup>
              )}

              {data.outstanding.length > 0 && (
                <CommandGroup heading="Receivables">
                  {data.outstanding.map((o) => (
                    <Row key={`os-${o.id}`} value={`os-${o.id}`} icon={<IndianRupee size={15} />}
                      onSelect={() => go(`/outstanding/contracts`)}
                      title={o.clientName} sub={o.status} />
                  ))}
                </CommandGroup>
              )}

              {data.documents.length > 0 && (
                <CommandGroup heading="Documents">
                  {data.documents.map((d) => (
                    <Row key={`doc-${d.id}`} value={`doc-${d.id}`} icon={<FileText size={15} />}
                      onSelect={() => go(d.taskId ? `/tasks/${d.taskId}` : `/documents`)}
                      title={d.title} sub={d.taskId ? "Attached to a task" : "Document"} />
                  ))}
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Row({
  value, icon, title, sub, lead, badge, onSelect,
}: {
  value: string; icon: React.ReactNode; title: string; sub?: string;
  lead?: string; badge?: string; onSelect: () => void;
}) {
  return (
    <CommandItem value={value} onSelect={onSelect} className="flex items-center gap-3 !rounded-chip !py-2.5">
      <span className="shrink-0 text-ink-subtle">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          {lead && <span className="text-[12.5px] font-bold tabular-nums text-ink-subtle">{lead}</span>}
          <span className="truncate text-[15px] font-semibold text-ink-strong">{title}</span>
          {badge && (
            <span className="shrink-0 rounded-full bg-surface-soft px-1.5 py-0.5 text-[10.5px] font-bold uppercase tracking-wide text-ink-subtle">
              {badge}
            </span>
          )}
        </span>
        {sub && <span className="mt-0.5 block truncate text-[12.5px] text-ink-subtle">{sub}</span>}
      </span>
      <CornerDownLeft size={15} strokeWidth={2.2} className="shrink-0 text-ink-subtle" />
    </CommandItem>
  );
}

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = React.useState(value);
  React.useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}
