import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const storageSource = readFileSync(resolve(process.cwd(), "src/features/app/storage.js"), "utf8");

const extractSessionsSelect = () => {
  const match = storageSource.match(/const sessionsSelect = "([^"]+)";/);
  return (match?.[1] || "").split(",").map((field) => field.trim()).filter(Boolean);
};

const extractMappedSessionColumns = () => {
  const blockMatch = storageSource.match(/sessions:\s*normalizeSessions\(sessRows\.map\(\(r\) => \(\{([\s\S]*?)\}\)\)\)/);
  if (!blockMatch) return [];

  const mappedColumns = [...blockMatch[1].matchAll(/:\s*r\.([a-z0-9_]+)/g)].map(([, column]) => column);
  return mappedColumns.filter((column) => column !== "id" && column !== "date");
};

describe("syncFetch sessions projection shape", () => {
  it("sessionsSelect includes every snake_case field referenced by the session mapper", () => {
    const selectedFields = extractSessionsSelect();
    const mappedColumns = extractMappedSessionColumns();

    expect(selectedFields).toContain("id");
    expect(selectedFields).toContain("dog_id");
    expect(selectedFields).toContain("date");
    expect(new Set(selectedFields).size).toBe(selectedFields.length);

    mappedColumns.forEach((column) => {
      expect(selectedFields).toContain(column);
    });
  });
});
