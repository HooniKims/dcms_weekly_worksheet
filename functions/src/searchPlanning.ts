/// <reference lib="es2022.intl" />

import { Buffer } from "node:buffer";

export type DepartmentRecord = {
  readonly id: string;
  readonly name: string;
  readonly order: number;
  readonly active: boolean;
  readonly omitWhenEmpty: boolean;
};

export type WeekRecord = {
  readonly id: string;
  readonly dateLabel: string;
  readonly archivedAt?: unknown;
  readonly departmentSnapshot: readonly DepartmentRecord[];
};

export type EntryRecord = {
  readonly weekId: string;
  readonly departmentId: string;
  readonly plainText: string;
};

export type SearchIndexRecord<TUpdatedAt> = {
  readonly weekId: string;
  readonly dateLabel: string;
  readonly departmentId: string;
  readonly departmentName: string;
  readonly plainText: string;
  readonly normalizedText: string;
  readonly grams: readonly string[];
  readonly updatedAt: TUpdatedAt;
};

type BuildIndexRecordInput<TUpdatedAt> = {
  readonly weekId: string;
  readonly dateLabel: string;
  readonly department: DepartmentRecord;
  readonly plainText: string;
  readonly updatedAt: TUpdatedAt;
};

type RebuildInput<TUpdatedAt> = {
  readonly weeks: readonly WeekRecord[];
  readonly entries: readonly EntryRecord[];
  readonly existingIds: readonly string[];
  readonly updatedAt: TUpdatedAt;
};

type PlannedUpsert<TUpdatedAt> = {
  readonly id: string;
  readonly record: SearchIndexRecord<TUpdatedAt>;
};

export type SearchIndexPlan<TUpdatedAt> = {
  readonly upserts: readonly PlannedUpsert<TUpdatedAt>[];
  readonly deleteIds: readonly string[];
};

export type SearchIndexCounts = {
  readonly indexed: number;
  readonly deleted: number;
};

export type SearchIndexOperation<TUpdatedAt> =
  | {
      readonly kind: "upsert";
      readonly id: string;
      readonly record: SearchIndexRecord<TUpdatedAt>;
    }
  | { readonly kind: "delete"; readonly id: string };

export type SearchIndexExecution<TUpdatedAt> = {
  readonly batches: readonly (readonly SearchIndexOperation<TUpdatedAt>[])[];
  readonly counts: SearchIndexCounts;
};

const SEARCH_INDEX_BATCH_LIMIT = 450;
export const MAX_SEARCHABLE_PLAIN_TEXT_GRAPHEMES = 8_000;
export const MAX_SEARCHABLE_PLAIN_TEXT_UTF8_BYTES = 32_000;

const graphemeSegmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });

function graphemes(value: string): readonly string[] {
  return Array.from(graphemeSegmenter.segment(value), ({ segment }) => segment);
}

export function truncateSearchablePlainText(value: string): string {
  const selected: string[] = [];
  let utf8Bytes = 0;
  for (const grapheme of graphemes(value).slice(0, MAX_SEARCHABLE_PLAIN_TEXT_GRAPHEMES)) {
    const nextBytes = utf8Bytes + Buffer.byteLength(grapheme, "utf8");
    if (nextBytes > MAX_SEARCHABLE_PLAIN_TEXT_UTF8_BYTES) break;
    selected.push(grapheme);
    utf8Bytes = nextBytes;
  }
  return selected.join("");
}

function displayName(value: string): string {
  return value.normalize("NFKC").replace(/\s+/gu, " ").trim();
}

function orderedSnapshotDepartments(
  departments: readonly DepartmentRecord[],
): readonly DepartmentRecord[] {
  return departments.slice().sort((left, right) => left.order - right.order);
}

export function normalizeSearchText(value: string): string {
  return displayName(value).toLowerCase();
}

export function searchGrams(value: string): readonly string[] {
  const characters = graphemes(normalizeSearchText(value));
  const grams: string[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < characters.length - 1; index += 1) {
    const first = characters[index];
    const second = characters[index + 1];
    if (first === undefined || second === undefined) continue;
    const gram = `${first}${second}`;
    if (seen.has(gram)) continue;
    seen.add(gram);
    grams.push(gram);
  }
  return grams;
}

export function normalizeActiveDepartments(
  departments: readonly DepartmentRecord[],
): readonly DepartmentRecord[] {
  return departments
    .filter(({ active }) => active)
    .sort((left, right) => left.order - right.order)
    .map((department, order) => ({
      id: department.id,
      name: displayName(department.name),
      order,
      active: true,
      omitWhenEmpty: department.omitWhenEmpty,
    }));
}

export function searchIndexId(weekId: string, departmentId: string): string {
  return `${weekId}__${departmentId}`;
}

export function buildIndexRecord<TUpdatedAt>(
  input: BuildIndexRecordInput<TUpdatedAt>,
): SearchIndexRecord<TUpdatedAt> {
  const departmentName = displayName(input.department.name);
  const plainText = truncateSearchablePlainText(input.plainText);
  const normalizedText = normalizeSearchText(`${departmentName} ${plainText}`);
  return {
    weekId: input.weekId,
    dateLabel: input.dateLabel,
    departmentId: input.department.id,
    departmentName,
    plainText,
    normalizedText,
    grams: searchGrams(normalizedText),
    updatedAt: input.updatedAt,
  };
}

export function planSearchIndexRebuild<TUpdatedAt>(
  input: RebuildInput<TUpdatedAt>,
): SearchIndexPlan<TUpdatedAt> {
  const entryText = new Map(
    input.entries.map((entry) => [
      searchIndexId(entry.weekId, entry.departmentId),
      entry.plainText,
    ]),
  );
  const activeWeeks = input.weeks.filter((week) => week.archivedAt == null);
  const upserts = activeWeeks.flatMap((week) =>
    orderedSnapshotDepartments(week.departmentSnapshot).map((department) => {
      const id = searchIndexId(week.id, department.id);
      return {
        id,
        record: buildIndexRecord({
          weekId: week.id,
          dateLabel: week.dateLabel,
          department,
          plainText: entryText.get(id) ?? "",
          updatedAt: input.updatedAt,
        }),
      };
    }),
  );
  const plannedIds = new Set(upserts.map(({ id }) => id));
  return {
    upserts,
    deleteIds: input.existingIds.filter((id) => !plannedIds.has(id)),
  };
}

export function chunkSearchIndexPlan<TUpdatedAt>(
  plan: SearchIndexPlan<TUpdatedAt>,
): SearchIndexExecution<TUpdatedAt> {
  const upserts = plan.upserts.map(
    ({ id, record }): SearchIndexOperation<TUpdatedAt> => ({ kind: "upsert", id, record }),
  );
  const deletes = plan.deleteIds.map(
    (id): SearchIndexOperation<TUpdatedAt> => ({ kind: "delete", id }),
  );
  const operations: readonly SearchIndexOperation<TUpdatedAt>[] = [...upserts, ...deletes];
  const batches: (readonly SearchIndexOperation<TUpdatedAt>[])[] = [];
  for (let offset = 0; offset < operations.length; offset += SEARCH_INDEX_BATCH_LIMIT) {
    batches.push(operations.slice(offset, offset + SEARCH_INDEX_BATCH_LIMIT));
  }
  return {
    batches,
    counts: { indexed: plan.upserts.length, deleted: plan.deleteIds.length },
  };
}
