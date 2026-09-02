"use client";
import * as React from "react";
import {
  BarChart3,
  Building2,
  ExternalLink,
  Receipt,
  TrendingUp,
  X,
  type LucideIcon,
} from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";
import { fireToast } from "@/lib/toast";
import { useReducedMotion } from "motion/react";
import type {
  DashboardAccent,
  DashboardIconName,
  VisibleDashboard,
} from "@/lib/external-dashboards";

interface Props {
  links: VisibleDashboard[];
}

const ICONS: Record<DashboardIconName, LucideIcon> = {
  Building2,
  Receipt,
  TrendingUp,
};

// Maps each accent token to the live CSS variable our globals expose.
// `var()` is computed at paint, so the .css var doesn't need to exist yet
// when this map is read.
const ACCENT_VARS: Record<DashboardAccent, string> = {
  blue: "var(--color-blue)",
  amber: "var(--color-amber)",
  purple: "var(--color-purple)",
};

export function LiasoningNavPill({ links }: Props) {
  const [open, setOpen] = React.useState(false);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const reduced = useReducedMotion();

  // Mouse-parallax shift — matches MainNavPill's behavior so the new pill
  // feels alive next to its siblings.
  const onMove = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (reduced) return;
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width - 0.5) * 6;
    const y = ((e.clientY - r.top) / r.height - 0.5) * 4;
    el.style.transform = `translate(${x}px, ${y}px)`;
  };
  const onLeave = () => {
    if (triggerRef.current) triggerRef.current.style.transform = "translate(0,0)";
  };

  if (links.length === 0) return null;

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button
          ref={triggerRef}
          type="button"
          aria-label="Reports"
          className={"nav-pill" + (open ? " nav-pill-active" : "")}
          onMouseMove={onMove}
          onMouseLeave={onLeave}
          onClick={() => setOpen(true)}
          style={
            open
              ? {
                  background: "rgb(var(--vp-cyan))",
                  color: "#ffffff",
                  borderColor: "transparent",
                  boxShadow:
                    "0 4px 12px rgb(var(--vp-cyan) / 0.35), 0 0 0 4px rgb(var(--vp-cyan) / 0.18)",
                  transition:
                    "transform 120ms ease-out, background 200ms ease, box-shadow 250ms ease, color 200ms ease",
                }
              : {
                  transition:
                    "transform 120ms ease-out, background 200ms ease, box-shadow 250ms ease, color 200ms ease",
                }
          }
        >
          <BarChart3 size={16} strokeWidth={2.2} />
          <span className="max-md:hidden">Reports</span>
        </button>
      </Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Overlay className="liasoning-dialog-overlay" />
        <Dialog.Content className="liasoning-dialog-content">
          <Dialog.Title className="liasoning-dialog-title">
            External Dashboards
          </Dialog.Title>
          <Dialog.Description className="liasoning-dialog-subtitle">
            Quick access to operations dashboards
          </Dialog.Description>
          <div className="liasoning-header-strip" aria-hidden />
          <Dialog.Close asChild>
            <button
              type="button"
              aria-label="Close"
              className="liasoning-dialog-close"
            >
              <X size={22} strokeWidth={2.4} />
            </button>
          </Dialog.Close>

          <div className="liasoning-cards-grid">
            {links.map((link, idx) => (
              <LiasoningCard
                key={link.id}
                link={link}
                index={idx}
                reduced={!!reduced}
                onLaunched={() => setOpen(false)}
              />
            ))}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function LiasoningCard({
  link,
  index,
  reduced,
  onLaunched,
}: {
  link: VisibleDashboard;
  index: number;
  reduced: boolean;
  onLaunched: () => void;
}) {
  const Icon = ICONS[link.iconName];
  const accent = ACCENT_VARS[link.accent];
  const ref = React.useRef<HTMLAnchorElement>(null);
  const timerRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, []);

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    // Ignore re-clicks while a launch is already in flight — keeps the user
    // from opening 2+ tabs by accident.
    if (timerRef.current !== null) return;

    // Open synchronously inside the user gesture so popup blockers
    // don't de-trust the call. The pulse animates after, independently.
    window.open(link.url, "_blank", "noopener,noreferrer");
    fireToast({ message: `Opening ${link.label}…` });

    const el = ref.current;
    if (reduced || !el) {
      onLaunched();
      return;
    }

    const rect = el.getBoundingClientRect();
    el.style.setProperty("--pulse-x", `${e.clientX - rect.left}px`);
    el.style.setProperty("--pulse-y", `${e.clientY - rect.top}px`);
    el.classList.add("is-launching");

    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      // The anchor may already be unmounted by the time this fires — guard.
      const stillMounted = ref.current;
      if (stillMounted) stillMounted.classList.remove("is-launching");
      onLaunched();
    }, 240);
  };

  return (
    <a
      ref={ref}
      href={link.url}
      target="_blank"
      rel="noopener noreferrer"
      className="liasoning-card"
      style={
        {
          "--liasoning-accent": accent,
          "--i": index,
        } as React.CSSProperties
      }
      onClick={handleClick}
    >
      <span className="liasoning-card-icon" aria-hidden>
        <Icon size={32} strokeWidth={2} />
      </span>
      <span className="liasoning-card-label">{link.label}</span>
      <span className="liasoning-card-desc">{link.description}</span>
      <span className="liasoning-card-footer">
        <span className="liasoning-card-cta">Open in new tab</span>
        <ExternalLink
          size={16}
          className="liasoning-card-arrow"
          aria-hidden
        />
      </span>
    </a>
  );
}
