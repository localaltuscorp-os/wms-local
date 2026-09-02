"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { X, Download, FileText, ExternalLink } from "lucide-react";

export interface ViewerDoc {
  title: string;
  fileName: string;
  mimeType: string | null;
  signedUrl: string | null;
}

/**
 * Full-screen document viewer — PDFs in an iframe, images inline, everything
 * else a graceful download card. Portaled to <body> so no ancestor transform
 * (display-scale zoom lesson) can clip it. Esc / backdrop close.
 */
export function DocViewer({ doc, onClose }: { doc: ViewerDoc; onClose: () => void }) {
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  if (!mounted) return null;

  const url = doc.signedUrl;
  const isPdf = (doc.mimeType ?? "").includes("pdf") || /\.pdf$/i.test(doc.fileName);
  const isImage = (doc.mimeType ?? "").startsWith("image/") || /\.(png|jpe?g|gif|webp|bmp|tiff?)$/i.test(doc.fileName);

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex flex-col"
      style={{ background: "rgba(15,23,42,0.72)", backdropFilter: "blur(6px)" }}
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      {/* top bar */}
      <div className="flex items-center gap-3 px-5 py-3 text-white">
        <FileText size={18} strokeWidth={2.2} className="shrink-0 opacity-90" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] font-bold">{doc.title}</div>
          <div className="truncate text-[12px] font-medium text-white/70">{doc.fileName}</div>
        </div>
        {url && (
          <a
            href={url}
            download={doc.fileName}
            className="inline-flex items-center gap-1.5 rounded-pill bg-white/15 px-3.5 py-1.5 text-[13px] font-bold text-white hover:bg-white/25"
          >
            <Download size={14} strokeWidth={2.4} /> Download
          </a>
        )}
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25"
          aria-label="Close"
        >
          <X size={18} strokeWidth={2.4} />
        </button>
      </div>

      {/* body */}
      <div className="min-h-0 flex-1 p-4 pt-0">
        <div className="h-full w-full overflow-hidden rounded-[18px] bg-white/5" style={{ boxShadow: "0 30px 80px -30px rgba(0,0,0,0.6)" }}>
          {!url ? (
            <CenterCard>
              <p className="text-[15px] font-semibold">This file couldn&apos;t be loaded right now.</p>
              <p className="mt-1 text-[13px] text-white/60">Try again in a moment.</p>
            </CenterCard>
          ) : isImage ? (
            <div className="flex h-full w-full items-center justify-center overflow-auto p-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt={doc.title} className="max-h-full max-w-full rounded-lg object-contain" />
            </div>
          ) : isPdf ? (
            <iframe src={url} title={doc.title} className="h-full w-full border-0" />
          ) : (
            <CenterCard>
              <p className="text-[15px] font-semibold">Preview isn&apos;t available for this file type.</p>
              <a
                href={url}
                download={doc.fileName}
                className="mt-4 inline-flex items-center gap-2 rounded-pill bg-white px-4 py-2 text-[13.5px] font-bold text-ink-strong"
              >
                <ExternalLink size={15} strokeWidth={2.4} /> Open / Download
              </a>
            </CenterCard>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function CenterCard({ children }: { children: React.ReactNode }) {
  return <div className="flex h-full w-full flex-col items-center justify-center px-6 text-center text-white">{children}</div>;
}
