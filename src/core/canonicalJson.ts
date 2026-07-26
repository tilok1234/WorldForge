/**
 * Canonical JSON is the single serialization used for identity hashing and
 * on-disk artifacts (docs/ARCHITECTURE_AND_CONTRACTS.md, "Numeric
 * determinism"): sorted keys in UTF-16 code unit order, two-space indent, LF
 * line endings, one trailing newline, UTF-8 text.
 *
 * Only null, booleans, safe integers, strings, arrays, and plain objects are
 * representable. Floats, NaN, Infinity, negative-zero distinctions, undefined,
 * and class instances are contract violations and throw rather than being
 * silently coerced.
 */

export type CanonicalValue =
  | null
  | boolean
  | number
  | string
  | readonly CanonicalValue[]
  | { readonly [key: string]: CanonicalValue };

export function canonicalJson(value: unknown): string {
  return render(value, "") + "\n";
}

function render(value: unknown, indent: string): string {
  if (value === null) {
    return "null";
  }
  switch (typeof value) {
    case "boolean":
      return value ? "true" : "false";
    case "number": {
      if (!Number.isSafeInteger(value)) {
        throw new Error(
          `canonical JSON allows only safe integers, got: ${String(value)}`,
        );
      }
      return String(value === 0 ? 0 : value);
    }
    case "string":
      return JSON.stringify(value);
    case "object":
      break;
    default:
      throw new Error(`canonical JSON cannot encode a value of type ${typeof value}`);
  }

  const inner = indent + "  ";
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return "[]";
    }
    const items = value.map((item) => inner + render(item, inner));
    return "[\n" + items.join(",\n") + "\n" + indent + "]";
  }

  const proto: unknown = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) {
    throw new Error("canonical JSON allows only plain objects");
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  if (keys.length === 0) {
    return "{}";
  }
  const entries = keys.map((key) => {
    const child = record[key];
    if (child === undefined) {
      throw new Error(`canonical JSON cannot encode undefined (key "${key}")`);
    }
    return inner + JSON.stringify(key) + ": " + render(child, inner);
  });
  return "{\n" + entries.join(",\n") + "\n" + indent + "}";
}
