import { describe, expect, it } from "vitest";
import {
  FEEDINGS_SYNC_FETCH_SELECT,
  PATTERNS_SYNC_FETCH_SELECT,
  SESSION_SYNC_FETCH_FIELD_MAP,
  SESSION_SYNC_FETCH_SELECT,
  WALKS_SYNC_FETCH_SELECT,
} from "../src/features/app/storage";

describe("syncFetch sessions projection shape", () => {
  it("projection exactly matches mapped session fields", () => {
    const selectedFields = SESSION_SYNC_FETCH_SELECT.split(",").map((field) => field.trim());
    const expectedFields = ["id", "dog_id", "date", ...Object.values(SESSION_SYNC_FETCH_FIELD_MAP), "deleted_at"];

    expect(new Set(selectedFields).size).toBe(selectedFields.length);
    expect([...selectedFields].sort()).toEqual([...expectedFields].sort());
  });

  it("walk projection includes sync merge metadata", () => {
    const selectedFields = WALKS_SYNC_FETCH_SELECT.split(",").map((field) => field.trim());
    const expectedFields = ["id", "dog_id", "date", "duration", "walk_type", "revision", "updated_at", "deleted_at"];

    expect(new Set(selectedFields).size).toBe(selectedFields.length);
    expect([...selectedFields].sort()).toEqual([...expectedFields].sort());
  });

  it("pattern/feedings projection includes sync merge metadata", () => {
    const patternFields = PATTERNS_SYNC_FETCH_SELECT.split(",").map((field) => field.trim());
    const feedingFields = FEEDINGS_SYNC_FETCH_SELECT.split(",").map((field) => field.trim());

    expect(new Set(patternFields).size).toBe(patternFields.length);
    expect(patternFields).toEqual(["id", "dog_id", "date", "type", "revision", "updated_at", "deleted_at"]);

    expect(new Set(feedingFields).size).toBe(feedingFields.length);
    expect(feedingFields).toEqual(["id", "dog_id", "date", "food_type", "amount", "revision", "updated_at", "deleted_at"]);
  });
});
