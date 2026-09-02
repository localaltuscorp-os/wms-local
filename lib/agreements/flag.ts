/** Agreements module kill-switch. Default ENABLED; set AGREEMENTS_OFF=true to 404 it. */
export function agreementsEnabled(): boolean {
  return process.env.AGREEMENTS_OFF !== "true";
}
