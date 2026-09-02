import { describe, it, expect } from "vitest";
import { parseMapsLink, mapsLinkFor } from "@/lib/attendance/maps-link";

describe("parseMapsLink", () => {
  it("reads the map centre from a copied link", () => {
    expect(parseMapsLink("https://www.google.com/maps/@19.0760,72.8777,17z")).toEqual({
      lat: 19.076,
      lng: 72.8777,
    });
  });

  it("prefers the PLACE pin over the viewport centre when a URL carries both", () => {
    // The `@` here is where the map was looking; !3d/!4d is the pin itself.
    const url =
      "https://www.google.com/maps/place/Altus/@19.1000,72.9000,17z/data=!3m1!4b1!4m5!3m4!1s0x0:0x0!8m2!3d19.0760!4d72.8777";
    expect(parseMapsLink(url)).toEqual({ lat: 19.076, lng: 72.8777 });
  });

  it("reads an explicit ?q= pin", () => {
    expect(parseMapsLink("https://maps.google.com/?q=28.6139,77.2090")).toEqual({
      lat: 28.6139,
      lng: 77.209,
    });
  });

  it("reads the older ?ll= parameter", () => {
    expect(parseMapsLink("https://maps.google.com/?ll=12.9716,77.5946&z=15")).toEqual({
      lat: 12.9716,
      lng: 77.5946,
    });
  });

  it("accepts bare coordinates pasted directly", () => {
    expect(parseMapsLink("19.0760, 72.8777")).toEqual({ lat: 19.076, lng: 72.8777 });
  });

  it("handles southern / western hemispheres", () => {
    expect(parseMapsLink("https://www.google.com/maps/@-33.8688,151.2093,12z")).toEqual({
      lat: -33.8688,
      lng: 151.2093,
    });
  });

  describe("returns null rather than guessing", () => {
    it("for a short link, which carries no coordinates", () => {
      // Deliberately NOT resolved: that would be an outbound request to a third
      // party on every save. Better to ask for the full link.
      expect(parseMapsLink("https://maps.app.goo.gl/AbCdEfGh")).toBeNull();
    });

    it("for empty or missing input", () => {
      expect(parseMapsLink("")).toBeNull();
      expect(parseMapsLink(null)).toBeNull();
      expect(parseMapsLink(undefined)).toBeNull();
    });

    it("for out-of-range values", () => {
      expect(parseMapsLink("100.0, 20.0")).toBeNull();
      expect(parseMapsLink("20.0, 200.0")).toBeNull();
    });

    it("for 0,0 — the classic failed-parse result, not a client site", () => {
      expect(parseMapsLink("0, 0")).toBeNull();
      expect(parseMapsLink("https://www.google.com/maps/@0,0,17z")).toBeNull();
    });
  });
});

describe("mapsLinkFor", () => {
  it("round-trips through parseMapsLink", () => {
    const link = mapsLinkFor(19.076, 72.8777);
    expect(parseMapsLink(link)).toEqual({ lat: 19.076, lng: 72.8777 });
  });
});
