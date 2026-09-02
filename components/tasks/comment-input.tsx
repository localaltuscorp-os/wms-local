"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Send } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { addComment } from "@/app/(app)/tasks/actions";
import { fireToast } from "@/lib/toast";

interface Props {
  taskId: string;
  /** Current user, used to render the composer avatar. */
  me: { name: string; avatarUrl: string | null };
}

/**
 * Editorial-document comment composer.  Avatar on the left, autosizing
 * textarea on the right, Post enabled only when there's a body.  Lives
 * at the bottom of the left column, intentionally NOT in a glass card —
 * it's part of the document, not a panel.
 */
export function CommentInput({ taskId, me }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
  const canSubmit = body.trim().length > 0 && !pending;

  function post() {
    setError(null);
    if (!body.trim()) {
      setError("Comment cannot be empty.");
      return;
    }
    startTransition(async () => {
      const result = await addComment(taskId, { body });
      if (!result.ok) {
        if (result.error === "forbidden") {
          setError("You don't have permission to comment.");
        } else {
          setError(result.message ?? "Comment failed.");
        }
        return;
      }
      fireToast({ message: "Comment posted." });
      setBody("");
      router.refresh();
    });
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    post();
  }

  return (
    <form
      onSubmit={submit}
      className="mt-10 pt-6 border-t border-hairline"
      aria-label="Add a comment"
    >
      <div className="flex items-start gap-3">
        <Avatar name={me.name} avatarUrl={me.avatarUrl} size={36} />
        <div className="flex-1 min-w-0">
          <div
            className="relative rounded-2xl bg-white transition-all"
            style={{
              border: focused
                ? "1px solid rgba(225, 6, 0, 0.45)"
                : "1px solid var(--color-hairline-strong)",
              boxShadow: focused
                ? "0 0 0 4px rgba(225, 6, 0, 0.06), 0 4px 14px -8px rgba(15,23,42,0.10)"
                : "0 1px 2px rgba(15, 23, 42, 0.03)",
            }}
          >
            <textarea
              id="ci-body"
              rows={2}
              maxLength={4000}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              onKeyDown={(e) => {
                // ⌘/Ctrl + Enter posts without reaching for the mouse.
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                  e.preventDefault();
                  if (canSubmit) post();
                }
              }}
              placeholder="Add a comment, ask a question, or leave a note for the team…  (⌘↵ to post)"
              className="w-full resize-y bg-transparent px-4 pt-3 pb-2 text-[16px] text-ink outline-none placeholder:text-ink-subtle"
              style={{ lineHeight: 1.55, minHeight: 72 }}
            />
            <div className="flex items-center justify-between gap-3 px-3 pb-2.5 pt-1">
              <span className="text-[12.5px] text-ink-subtle tabular-nums">
                {body.length > 0 ? `${body.length} / 4000` : ""}
              </span>
              <button
                type="submit"
                disabled={!canSubmit}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-[14px] font-semibold text-white transition-all disabled:cursor-not-allowed"
                style={{
                  background: canSubmit
                    ? "linear-gradient(135deg, #ff3845, var(--color-altus-red) 45%, var(--color-altus-red-deep))"
                    : "rgba(15, 23, 42, 0.12)",
                  color: canSubmit ? "#ffffff" : "var(--color-ink-subtle)",
                  boxShadow: canSubmit
                    ? "0 6px 16px -8px rgba(225, 6, 0, 0.55)"
                    : "none",
                  letterSpacing: "0.01em",
                }}
              >
                <Send size={14} strokeWidth={2.4} />
                {pending ? "Posting…" : "Post"}
              </button>
            </div>
          </div>
          {error && (
            <p
              className="text-[13px] mt-2"
              style={{ color: "var(--color-red-deep)" }}
            >
              {error}
            </p>
          )}
        </div>
      </div>
    </form>
  );
}
