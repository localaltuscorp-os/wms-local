"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import { Select } from "@/components/ui/select";
import { fireToast } from "@/lib/toast";
import {
  createCollection,
  uploadOutstandingAttachment,
} from "@/app/(app)/outstanding/actions";
import { AttachmentField } from "./attachment-field";

export function CollectionFormDialog({
  clients,
  responsibles,
  modes,
  trigger,
}: {
  clients: string[];
  responsibles: { id: string; name: string }[];
  modes: { id: string; name: string }[];
  trigger?: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [clientName, setClientName] = useState("");
  const [amount, setAmount] = useState("");
  const [modeId, setModeId] = useState("");
  const [responsibleId, setResponsibleId] = useState("");
  const [comments, setComments] = useState("");
  const [file, setFile] = useState<File | null>(null);

  function reset() {
    setClientName("");
    setAmount("");
    setModeId("");
    setResponsibleId("");
    setComments("");
    setFile(null);
    setError(null);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!clientName) return setError("Pick a client.");
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) return setError("Enter a valid amount.");
    if (!modeId) return setError("Pick a payment mode.");
    if (!responsibleId) return setError("Pick a responsible person.");
    if (!file) return setError("An attachment is required for collections.");

    startTransition(async () => {
      const res = await createCollection({
        clientName,
        amount: amt,
        paymentModeId: modeId,
        responsibleId,
        comments: comments.trim() || undefined,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      // Collection attachment is required — upload it before declaring success.
      const fd = new FormData();
      fd.set("ownerType", "collection");
      fd.set("ownerId", res.id);
      fd.set("file", file);
      const up = await uploadOutstandingAttachment(fd);
      if (!up.ok) {
        fireToast({
          message: `Collection saved, but the attachment failed: ${up.error}`,
          type: "error",
        });
      }
      fireToast({ message: "Collection recorded." });
      reset();
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <Dialog.Trigger asChild>
        {trigger ?? (
          <button
            className="rounded-md py-2.5 px-5 text-[14px] font-medium text-white"
            style={{ background: "linear-gradient(135deg, #E10600, #A80400)" }}
          >
            + Collection
          </button>
        )}
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/30 z-[90]" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[100] -translate-x-1/2 -translate-y-1/2 w-full max-w-lg rounded-xl bg-white border border-[#E2E8F0] p-6 shadow-lg max-h-[calc(100dvh-32px)] overflow-y-auto">
          <Dialog.Title className="font-serif text-xl text-[#0F172A] mb-1">
            Record a collection
          </Dialog.Title>
          <Dialog.Description
            className="text-[15px] text-[#64748B] mb-4"
            style={{ lineHeight: 1.5 }}
          >
            Log a payment received. A receipt or proof attachment is required.
          </Dialog.Description>

          <form onSubmit={onSubmit} className="space-y-5">
            <Section title="Client">
              <Field label="Client" required>
                <Select
                  options={clients.map((c) => ({ value: c, label: c }))}
                  value={clientName}
                  onValueChange={setClientName}
                  placeholder="— Select client —"
                  searchable
                  ariaLabel="Client"
                />
              </Field>
            </Section>

            <Section title="Payment Details">
              <Field label="Amount (₹)" required>
                <input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  className={INPUT_CLASS}
                />
              </Field>
              <Field label="Payment mode" required>
                <Select
                  options={modes.map((m) => ({ value: m.id, label: m.name }))}
                  value={modeId}
                  onValueChange={setModeId}
                  placeholder="— Select mode —"
                  ariaLabel="Payment mode"
                />
              </Field>
            </Section>

            <Section title="Responsible Person">
              <Field label="Responsible person" required>
                <Select
                  options={responsibles.map((r) => ({ value: r.id, label: r.name }))}
                  value={responsibleId}
                  onValueChange={setResponsibleId}
                  placeholder="— Select person —"
                  searchable
                  ariaLabel="Responsible person"
                />
              </Field>
            </Section>

            <Section title="Additional">
              <Field label="Comments">
                <textarea
                  value={comments}
                  onChange={(e) => setComments(e.target.value)}
                  placeholder="Optional notes"
                  maxLength={1000}
                  rows={3}
                  className={INPUT_CLASS}
                />
              </Field>
              <AttachmentField file={file} onChange={setFile} required label="Receipt / proof" />
            </Section>

            {error && (
              <div
                role="alert"
                className="rounded-md border border-[#FECACA] bg-[#FEF2F2] px-3 py-2 text-[14px] text-[#A80400]"
              >
                {error}
              </div>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="px-4 py-2.5 text-[14px] font-medium text-[#64748B]"
                  disabled={pending}
                >
                  Cancel
                </button>
              </Dialog.Close>
              <button
                type="submit"
                disabled={pending}
                className="rounded-md py-2.5 px-5 text-[14px] font-medium text-white disabled:opacity-50"
                style={{ background: "linear-gradient(135deg, #E10600, #A80400)" }}
              >
                {pending ? "Saving…" : "Record collection"}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

const INPUT_CLASS =
  "w-full rounded-md border border-[#CBD5E1] px-3.5 py-2.5 text-[15px] bg-white";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-3">
      <legend className="text-[13px] font-semibold uppercase tracking-wide text-[#64748B]">
        {title}
      </legend>
      {children}
    </fieldset>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-[14px] font-semibold text-[#0F172A] mb-1.5">
        {label}
        {required && <span className="text-[#E10600] ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}
