import { describe, it, expect } from "vitest";
import {
  isAuthenticatorAlreadyRegistered,
  ALREADY_REGISTERED_CODE,
} from "@/lib/webauthn/errors";

describe("isAuthenticatorAlreadyRegistered", () => {
  it("is true for the @simplewebauthn 'previously registered' WebAuthnError", () => {
    // Shape of @simplewebauthn/browser's WebAuthnError for an excluded-credential hit.
    const err = Object.assign(new Error("The authenticator was previously registered"), {
      code: ALREADY_REGISTERED_CODE,
    });
    expect(isAuthenticatorAlreadyRegistered(err)).toBe(true);
  });

  it("is false for a passthrough (NotAllowedError / cancel) WebAuthnError", () => {
    const err = Object.assign(new Error("cancelled"), {
      code: "ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY",
    });
    expect(isAuthenticatorAlreadyRegistered(err)).toBe(false);
  });

  it("is false for a bare DOMException-like cancel", () => {
    expect(isAuthenticatorAlreadyRegistered({ name: "NotAllowedError" })).toBe(false);
  });

  it("is false for null / undefined / strings / plain errors", () => {
    expect(isAuthenticatorAlreadyRegistered(null)).toBe(false);
    expect(isAuthenticatorAlreadyRegistered(undefined)).toBe(false);
    expect(isAuthenticatorAlreadyRegistered("nope")).toBe(false);
    expect(isAuthenticatorAlreadyRegistered(new Error("plain"))).toBe(false);
  });

  it("exposes the exact @simplewebauthn code string", () => {
    expect(ALREADY_REGISTERED_CODE).toBe("ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED");
  });
});
