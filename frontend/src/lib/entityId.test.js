import { describe, it, expect } from "vitest";
import { isEntityId } from "./entityId";

describe("isEntityId", () => {
  it("accepts new lowercase ids", () => {
    for (const id of ["aud-btclnx2w", "vid-x7k29pqa", "img-m4n8cz2d", "job-r8v3k1mx"]) {
      expect(isEntityId(id)).toBe(true);
    }
  });

  it("still accepts legacy uppercase ids so old links keep working", () => {
    for (const id of ["aud-BTCLNX2W", "job-FKMS1O5Y"]) expect(isEntityId(id)).toBe(true);
  });

  it("rejects malformed ids and ordinary route segments", () => {
    for (const s of ["AUD-BTCLNX2W", "aud-btCLnx2w", "aud_btclnx2w", "aud btclnx2w", "aud-btclnx_2w", "aud-btclnx2w!", "aud-btclnx2", "wizard", "complete", ""]) {
      expect(isEntityId(s)).toBe(false);
    }
  });

  it("is pasted into URLs unchanged (no case conversion in the matcher)", () => {
    const path = `/videos/${"aud-BTCLNX2W"}`;
    expect(path.split("/").filter(Boolean).filter(isEntityId)).toEqual(["aud-BTCLNX2W"]);
  });
});
