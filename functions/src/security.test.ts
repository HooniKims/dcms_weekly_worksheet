import { describe, expect, it } from "vitest";
import { contributorSessionAllowed, planPasswordMaterialization } from "./security.js";

describe("contributor session policy", () => {
  it("allows an administrator without a contributor session version", () => {
    // Given / When
    const allowed = contributorSessionAllowed({ admin: true }, 7);

    // Then
    expect(allowed).toBe(true);
  });

  it("allows only a contributor token matching the canonical session version", () => {
    // Given / When
    const outcomes = [
      contributorSessionAllowed({ role: "contributor", sessionVersion: 7 }, 7),
      contributorSessionAllowed({ role: "contributor", sessionVersion: 6 }, 7),
      contributorSessionAllowed({ role: "contributor" }, 7),
      contributorSessionAllowed({ sessionVersion: 7 }, 7),
    ];

    // Then
    expect(outcomes).toEqual([true, false, false, false]);
  });
});

describe("canonical password record planning", () => {
  it("creates the initial record only when no canonical record exists", () => {
    // Given
    const initial = { hash: "initial", salt: "salt", sessionVersion: 1 };
    const existing = { hash: "existing", salt: "salt", sessionVersion: 4 };

    // When
    const missingPlan = planPasswordMaterialization(null, initial);
    const existingPlan = planPasswordMaterialization(existing, initial);

    // Then
    expect(missingPlan).toEqual({ shouldCreate: true, record: initial });
    expect(existingPlan).toEqual({ shouldCreate: false, record: existing });
  });
});
