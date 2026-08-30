import { describe, expect, it } from "vitest";
import { planEntryTrigger, planSnapshotIndexAction } from "./entryPlanning.js";

describe("entry write planning", () => {
  it("refreshes create, update, and delete while archiving only one update revision", () => {
    // Given
    const events = [
      { beforeVersion: null, afterExists: true },
      { beforeVersion: 3, afterExists: true },
      { beforeVersion: 4, afterExists: false },
    ];

    // When
    const plans = events.map(planEntryTrigger);

    // Then
    expect(plans).toEqual([
      { archiveVersions: [], refreshIndex: true },
      { archiveVersions: [3], refreshIndex: true },
      { archiveVersions: [], refreshIndex: true },
    ]);
  });

  it("keeps a name-only index after delete when an inactive snapshot member remains", () => {
    // Given
    const snapshot = [
      {
        id: "department-retained",
        name: "과거 부서",
        order: 0,
        active: false,
        omitWhenEmpty: false,
      },
    ];

    // When
    const action = planSnapshotIndexAction(snapshot, "department-retained", null);

    // Then
    expect(action).toEqual({ kind: "upsert", department: snapshot[0], plainText: "" });
  });

  it("deletes the index only when the department ID is absent from the snapshot", () => {
    // Given
    const snapshot = [
      { id: "department-a", name: "현재 부서", order: 0, active: true, omitWhenEmpty: false },
    ];

    // When
    const action = planSnapshotIndexAction(snapshot, "department-removed", null);

    // Then
    expect(action).toEqual({ kind: "delete" });
  });
});
