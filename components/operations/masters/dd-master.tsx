"use client";

import { useMemo, useState, useTransition } from "react";
import { Plus, X } from "lucide-react";
import { fireToast } from "@/lib/toast";
import { createDdCategory, createDdOption, retireDdOption } from "@/app/(app)/operations/masters/dd/actions";
import type { DdCategory } from "@/lib/queries/dd-options";

interface Props {
  categories: DdCategory[];
  /** Everyone can see the lists; only an admin can add or retire an option. */
  canEdit: boolean;
}

/**
 * DD MASTER's own screen — one tab per category, its options as boxed items
 * below. The tab list comes straight from `categories`: a brand-new category
 * an admin creates through "+ New category" shows up here with no code
 * change, because there is no hardcoded union of category names anywhere in
 * this component.
 */
export function DdMaster({ categories, canEdit }: Props) {
  const [activeKey, setActiveKey] = useState<string>(categories[0]?.listKey ?? "");
  const active = categories.find((c) => c.listKey === activeKey) ?? categories[0] ?? null;

  const [newOption, setNewOption] = useState("");
  const [addingCategory, setAddingCategory] = useState(false);
  const [categoryName, setCategoryName] = useState("");
  const [categoryFirstOption, setCategoryFirstOption] = useState("");
  const [removedNotice, setRemovedNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const canAddOption = useMemo(() => newOption.trim().length > 0, [newOption]);

  function handleAddOption() {
    if (!active || !canAddOption) return;
    const label = newOption.trim();
    startTransition(async () => {
      const res = await createDdOption({ listKey: active.listKey, label });
      if (!res.ok) {
        fireToast({ message: res.error, type: "error" });
        return;
      }
      setNewOption("");
      fireToast({ message: `"${label}" added.`, type: "success" });
    });
  }

  function handleRetire(id: string, label: string, usageCount: number) {
    startTransition(async () => {
      const res = await retireDdOption({ id });
      if (!res.ok) {
        fireToast({ message: res.error, type: "error" });
        return;
      }
      setRemovedNotice(
        usageCount > 0
          ? `Removed "${label}". ${usageCount} existing record${usageCount === 1 ? "" : "s"} already using it keep their value.`
          : `Removed "${label}".`,
      );
    });
  }

  function handleAddCategory() {
    const cat = categoryName.trim();
    const first = categoryFirstOption.trim();
    if (!cat || !first) return;
    startTransition(async () => {
      const res = await createDdCategory({ categoryLabel: cat, firstOptionLabel: first });
      if (!res.ok) {
        fireToast({ message: res.error, type: "error" });
        return;
      }
      setActiveKey(res.listKey);
      setAddingCategory(false);
      setCategoryName("");
      setCategoryFirstOption("");
      fireToast({ message: `"${cat}" added as a new category.`, type: "success" });
    });
  }

  return (
    <div>
      {/* Category tabs */}
      <div className="mb-5 flex flex-wrap items-center gap-2">
        {categories.map((c) => {
          const isActive = c.listKey === active?.listKey;
          return (
            <button
              key={c.listKey}
              type="button"
              onClick={() => {
                setActiveKey(c.listKey);
                setRemovedNotice(null);
              }}
              className={`inline-flex h-9 items-center gap-2 rounded-lg border px-3.5 text-[13px] font-semibold transition-colors ${
                isActive
                  ? "border-transparent text-white"
                  : "border-slate-200 text-slate-600 hover:bg-slate-50"
              }`}
              style={isActive ? { background: "var(--color-altus-red, #A80400)" } : undefined}
            >
              {c.label}
              <span
                className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] ${
                  isActive ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500"
                }`}
              >
                {c.options.filter((o) => o.isActive).length}
              </span>
            </button>
          );
        })}
        {canEdit &&
          (addingCategory ? (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-slate-300 px-3 py-1.5">
              <input
                autoFocus
                value={categoryName}
                onChange={(e) => setCategoryName(e.target.value)}
                placeholder="Category name…"
                maxLength={60}
                className="h-7 w-36 rounded-md border border-slate-200 px-2 text-[13px]"
              />
              <input
                value={categoryFirstOption}
                onChange={(e) => setCategoryFirstOption(e.target.value)}
                placeholder="First option…"
                maxLength={80}
                className="h-7 w-36 rounded-md border border-slate-200 px-2 text-[13px]"
              />
              <button
                type="button"
                disabled={pending || !categoryName.trim() || !categoryFirstOption.trim()}
                onClick={handleAddCategory}
                className="h-7 rounded-md px-2.5 text-[12.5px] font-semibold text-white disabled:opacity-50"
                style={{ background: "var(--color-altus-red, #A80400)" }}
              >
                Create
              </button>
              <button
                type="button"
                onClick={() => {
                  setAddingCategory(false);
                  setCategoryName("");
                  setCategoryFirstOption("");
                }}
                className="grid h-7 w-7 place-items-center rounded-md text-slate-400 hover:bg-slate-100"
                aria-label="Cancel new category"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setAddingCategory(true)}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-dashed border-slate-300 px-3 text-[13px] font-semibold text-slate-500 hover:border-slate-400 hover:text-slate-700"
            >
              <Plus className="h-3.5 w-3.5" />
              New category
            </button>
          ))}
      </div>

      {!active ? (
        <p className="rounded-2xl border border-dashed border-slate-300 px-6 py-12 text-center text-[14px] text-slate-500">
          No categories yet.{canEdit ? " Use “New category” above to create the first one." : ""}
        </p>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          {canEdit && (
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <input
                value={newOption}
                onChange={(e) => setNewOption(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleAddOption();
                }}
                placeholder={`Add ${active.label.toLowerCase()}…`}
                maxLength={80}
                className="h-9 min-w-0 flex-1 rounded-md border border-slate-200 px-3 text-[14px]"
              />
              <button
                type="button"
                disabled={pending || !canAddOption}
                onClick={handleAddOption}
                className="h-9 shrink-0 rounded-md px-4 text-[13.5px] font-semibold text-white disabled:opacity-50"
                style={{ background: "linear-gradient(135deg, #E10600, #A80400)" }}
              >
                Add {active.label}
              </button>
            </div>
          )}

          {removedNotice && (
            <div
              role="alert"
              className="mb-4 flex items-center justify-between gap-3 rounded-md border border-[#FECACA] bg-[#FEF2F2] px-3 py-2 text-[13.5px] text-[#A80400]"
            >
              <span>{removedNotice}</span>
              <button
                type="button"
                onClick={() => setRemovedNotice(null)}
                className="shrink-0 text-[#A80400]/70 hover:text-[#A80400]"
                aria-label="Dismiss"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {active.options.filter((o) => o.isActive).length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center text-[13.5px] text-slate-500">
              No options yet{canEdit ? " — add the first one above." : "."}
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {active.options
                .filter((o) => o.isActive)
                .map((o) => (
                  <div
                    key={o.id}
                    className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2.5"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-[13.5px] font-medium text-slate-800">{o.label}</div>
                      {o.usageCount > 0 && (
                        <div className="text-[11.5px] text-slate-500">
                          {o.usageCount} in use
                        </div>
                      )}
                    </div>
                    {canEdit && (
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => handleRetire(o.id, o.label, o.usageCount)}
                        className="shrink-0 rounded-md px-2.5 py-1 text-[12.5px] font-semibold text-slate-500 hover:bg-red-50 hover:text-[#A80400] disabled:opacity-50"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
