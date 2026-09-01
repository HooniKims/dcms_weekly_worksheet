import { readFileSync } from "node:fs";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { deleteDoc, doc, setDoc, updateDoc } from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";

const emulatorAddress = process.env.FIRESTORE_EMULATOR_HOST;
const rulesDescribe = emulatorAddress === undefined ? describe.skip : describe;

rulesDescribe("week lifecycle Firestore rules", () => {
  let environment: RulesTestEnvironment;

  beforeAll(async () => {
    const [host = "127.0.0.1", port = "8080"] = (emulatorAddress ?? "").split(":");
    environment = await initializeTestEnvironment({
      projectId: "weekly-work-progress-rules-test",
      firestore: {
        host,
        port: Number(port),
        rules: readFileSync("firestore.rules", "utf8"),
      },
    });
  });

  beforeEach(async () => {
    await environment.clearFirestore();
    await environment.withSecurityRulesDisabled(async (context) => {
      const firestore = context.firestore();
      await setDoc(doc(firestore, "settingsPrivate/security"), { sessionVersion: 1 });
      await setDoc(doc(firestore, "weeks/2026-08-31"), {
        dateLabel: "2026년 8월 31일",
        archivedAt: null,
      });
      await setDoc(doc(firestore, "weeks/2026-08-24"), {
        dateLabel: "2026년 8월 24일",
        archivedAt: "2026-09-01T00:00:00.000Z",
      });
      await setDoc(doc(firestore, "weeks/2026-08-24/entries/department-planning"), {
        departmentId: "department-planning",
      });
    });
  });

  afterAll(async () => {
    await environment.cleanup();
  });

  it("allows ordinary active-week edits but denies direct archival and permanent deletion", async () => {
    const firestore = environment
      .authenticatedContext("administrator", { admin: true })
      .firestore();
    const activeWeek = doc(firestore, "weeks/2026-08-31");

    await assertSucceeds(updateDoc(activeWeek, { dateLabel: "2026년 8월 31일 수정" }));
    await assertFails(updateDoc(activeWeek, { archivedAt: "2026-09-01T00:00:00.000Z" }));
    await assertFails(deleteDoc(activeWeek));
  });

  it("denies every direct update to an archived week", async () => {
    const firestore = environment
      .authenticatedContext("administrator", { admin: true })
      .firestore();

    await assertFails(
      updateDoc(doc(firestore, "weeks/2026-08-24"), {
        dateLabel: "휴지통에서 수정한 날짜",
      }),
    );
    await assertFails(deleteDoc(doc(firestore, "weeks/2026-08-24/entries/department-planning")));
  });
});
