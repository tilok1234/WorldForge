import { createHash } from "node:crypto";
import { canonicalJson } from "./canonicalJson.js";

export function sha256Hex(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

export function sha256HexBytes(data: Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}

/** Hash of a value's canonical JSON bytes. Every contract identity uses this. */
export function canonicalSha256(value: unknown): string {
  return sha256Hex(canonicalJson(value));
}
