import { describe, it, expect } from "vitest";
import {
  buildTemplateComponents,
  templateNameForKind,
} from "@/lib/whatsapp/templates";

describe("templateNameForKind", () => {
  it("maps each NotificationKind to a vp_* template", () => {
    expect(templateNameForKind("task_assigned")).toBe("vp_assigned");
    expect(templateNameForKind("approved")).toBe("vp_approved");
    expect(templateNameForKind("overdue_digest")).toBe("vp_overdue_digest");
  });
});

describe("buildTemplateComponents", () => {
  it("emits body component with positional parameters", () => {
    const c = buildTemplateComponents("task_assigned", {
      actorName: "Apeksha",
      taskSubject: "KYC 4471",
      body: "Tue 12 Nov",
      shortId: "abc1234567",
    });
    expect(c).toEqual([
      {
        type: "body",
        parameters: [
          { type: "text", text: "Apeksha" },
          { type: "text", text: "KYC 4471" },
          { type: "text", text: "Tue 12 Nov" },
          { type: "text", text: "abc1234567" },
        ],
      },
    ]);
  });

  it("emits 2-param body for vp_overdue_digest", () => {
    const c = buildTemplateComponents("overdue_digest", {
      actorName: "",
      taskSubject: "",
      body: "",
      shortId: "",
      digestCount: 5,
      digestPreview: "KYC 4471, Site visit, Disbursal",
    });
    const first = c[0] as { type: string; parameters: { text: string }[] };
    const params = first.parameters;
    expect(params).toHaveLength(2);
    expect(params[0]!.text).toBe("5");
    expect(params[1]!.text).toBe("KYC 4471, Site visit, Disbursal");
  });
});
