import { describe, expect, it } from "vitest";
import {
  SESSION_SYNC_FETCH_FIELD_MAP,
  SESSION_SYNC_FETCH_SELECT,
  WALKS_SYNC_FETCH_SELECT,
} from "../src/features/app/storage";

describe("syncFetch sessions projection shape", () => {
  it("projection exactly matches mapped session fields", () => {
    const selectedFields = SESSION_SYNC_FETCH_SELECT.split(",").map((field) => field.trim());
    const expectedFields = ["id", "dog_id", "date", ...Object.values(SESSION_SYNC_FETCH_FIELD_MAP)];

    expect(new Set(selectedFields).size).toBe(selectedFields.length);
    expect([...selectedFields].sort()).toEqual([...expectedFields].sort());
  });

  it("walk projection includes sync merge metadata", () => {
    const selectedFields = WALKS_SYNC_FETCH_SELECT.split(",").map((field) => field.trim());
    const expectedFields = ["id", "dog_id", "date", "duration", "walk_type", "revision", "updated_at"];

    expect(new Set(selectedFields).size).toBe(selectedFields.length);
    expect([...selectedFields].sort()).toEqual([...expectedFields].sort());
  });
});
