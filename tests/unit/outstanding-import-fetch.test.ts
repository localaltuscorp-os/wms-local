import { describe, it, expect } from "vitest";
import { sheetCsvUrl } from "@/lib/outstanding/import-fetch";

describe("sheetCsvUrl", () => {
  it("converts a share URL with gid (#gid=) to a csv-export URL with that gid", () => {
    expect(
      sheetCsvUrl(
        "https://docs.google.com/spreadsheets/d/1AbCDef_GHijkl/edit#gid=123456",
      ),
    ).toBe(
      "https://docs.google.com/spreadsheets/d/1AbCDef_GHijkl/export?format=csv&gid=123456",
    );
  });

  it("converts a share URL with gid (?gid=) to a csv-export URL with that gid", () => {
    expect(
      sheetCsvUrl(
        "https://docs.google.com/spreadsheets/d/1AbCDef_GHijkl/edit?gid=987#gid=987",
      ),
    ).toBe(
      "https://docs.google.com/spreadsheets/d/1AbCDef_GHijkl/export?format=csv&gid=987",
    );
  });

  it("omits gid when the share URL has none", () => {
    expect(
      sheetCsvUrl("https://docs.google.com/spreadsheets/d/1AbCDef_GHijkl/edit"),
    ).toBe(
      "https://docs.google.com/spreadsheets/d/1AbCDef_GHijkl/export?format=csv",
    );
  });

  it("extracts the id from a /d/<id>/ URL with no /edit suffix", () => {
    expect(
      sheetCsvUrl("https://docs.google.com/spreadsheets/d/1AbCDef_GHijkl/"),
    ).toBe(
      "https://docs.google.com/spreadsheets/d/1AbCDef_GHijkl/export?format=csv",
    );
  });

  it("returns null for a non-sheets URL", () => {
    expect(sheetCsvUrl("https://example.com/some/random/page")).toBeNull();
    expect(sheetCsvUrl("https://docs.google.com/document/d/1abc/edit")).toBeNull();
    expect(sheetCsvUrl("not a url at all")).toBeNull();
    expect(sheetCsvUrl("")).toBeNull();
  });
});
