"use server";

import { mintVendorRegistrationUpload, submitVendorRegistration } from "@/lib/hr/vendor-registration";

export async function submitPublicVendorRegistration(token: string, input: unknown) {
  return submitVendorRegistration(token, input);
}

export async function createPublicVendorUpload(token: string, input: { key: string; fileName: string; mime: string | null; size: number }) {
  return mintVendorRegistrationUpload(token, input);
}
