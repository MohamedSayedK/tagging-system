import { timingSafeEqual } from "node:crypto";

const LOOPBACK = new Set(["127.0.0.1", "localhost", "::1"]);

/** `BASIC_AUTH` is `user:password`. Throws on anything else so a typo cannot silently disable protection. */
export function parseBasicAuth(setting: string): { user: string; password: string } {
  const i = setting.indexOf(":");
  if (i <= 0 || i === setting.length - 1) throw new Error("BASIC_AUTH must look like user:password");
  return { user: setting.slice(0, i), password: setting.slice(i + 1) };
}

/** The API may listen beyond this machine only when it asks for a password. */
export function assertSafeBinding(host: string, basicAuth: string | undefined): void {
  if (basicAuth !== undefined) parseBasicAuth(basicAuth);
  if (!LOOPBACK.has(host) && basicAuth === undefined) {
    throw new Error(`Refusing to listen on ${host} without a password: set BASIC_AUTH=user:password, or use HOST=127.0.0.1`);
  }
}

/** Does this Authorization header carry the configured credentials? Constant-time on the secret parts. */
export function basicAuthMatches(header: string | undefined, setting: string): boolean {
  if (!header?.startsWith("Basic ")) return false;
  const expected = Buffer.from(setting, "utf8");
  const given = Buffer.from(Buffer.from(header.slice(6), "base64").toString("utf8"), "utf8");
  return given.length === expected.length && timingSafeEqual(given, expected);
}
