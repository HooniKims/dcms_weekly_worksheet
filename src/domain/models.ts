import { z } from "zod";
import { weekIdSchema } from "./week";

export const departmentSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  order: z.number().int().nonnegative(),
  active: z.boolean(),
  omitWhenEmpty: z.boolean(),
});

export const entrySchema = z.object({
  departmentId: z.string().min(1),
  htmlContent: z.string(),
  plainText: z.string(),
  version: z.number().int().nonnegative(),
  updatedAt: z.string(),
  updatedByRole: z.enum(["contributor", "admin", "migration"]),
});

export const departmentSnapshotSchema = departmentSchema.pick({
  id: true,
  name: true,
  order: true,
  active: true,
  omitWhenEmpty: true,
});

export const weekSchema = z.object({
  id: weekIdSchema,
  dateLabel: z.string(),
  meetingTitle: z.string(),
  createdBy: z.enum(["scheduler", "admin", "migration"]),
  createdAt: z.string(),
  departmentSnapshot: z.array(departmentSnapshotSchema).default([]),
});

export const searchIndexRecordSchema = z
  .object({
    weekId: weekIdSchema,
    dateLabel: z.string(),
    departmentId: z.string().min(1),
    departmentName: z.string().min(1),
    plainText: z.string(),
    normalizedText: z.string(),
    grams: z.array(z.string()).readonly(),
    updatedAt: z.string(),
  })
  .strict();

export const searchResultSchema = z
  .object({
    weekId: weekIdSchema,
    dateLabel: z.string(),
    departmentId: z.string(),
    departmentName: z.string(),
    excerpt: z.string(),
  })
  .strict();

export type Department = Readonly<z.infer<typeof departmentSchema>>;
export type Entry = Readonly<z.infer<typeof entrySchema>>;
export type DepartmentSnapshot = Readonly<z.infer<typeof departmentSnapshotSchema>>;
export type Week = Readonly<z.infer<typeof weekSchema>>;
export type SearchIndexRecord = Readonly<z.infer<typeof searchIndexRecordSchema>>;
export type SearchResult = Readonly<z.infer<typeof searchResultSchema>>;

export const defaultDepartments: readonly Department[] = [
  "말씀 및 기도",
  "교장(교감)",
  "교무기획부",
  "교육연구부",
  "생활안전부",
  "창체활동부",
  "과학정보부",
  "인성상담부",
  "통합지원부",
  "진로진학부",
  "행정실",
].map((name, order) => ({
  id: `department-${String(order + 1).padStart(2, "0")}`,
  name,
  order,
  active: true,
  omitWhenEmpty: order === 0,
}));
