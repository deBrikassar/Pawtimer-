import { describe, expect, it } from "vitest";
import {
  SESSION_SYNC_FETCH_FIELD_MAP,
  SESSION_SYNC_FETCH_SELECT,
} from "../src/features/app/storage";

describe("syncFetch sessions projection shape", () => {
  it("select includes every referenced sessions field", () => {
    const selectedFields = new Set(SESSION_SYNC_FETCH_SELECT.split(",").map((field) => field.trim()));

    expect(selectedFields.has("id")).toBe(true);
    expect(selectedFields.has("dog_id")).toBe(true);
    expect(selectedFields.has("date")).toBe(true);

    Object.values(SESSION_SYNC_FETCH_FIELD_MAP).forEach((field) => {
      expect(selectedFields.has(field)).toBe(true);
    });
  });
});
