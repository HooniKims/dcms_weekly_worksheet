import type { DepartmentSnapshot } from "./models";

function normalizedDepartmentName(name: string): string {
  return name
    .normalize("NFKC")
    .toLocaleLowerCase("ko-KR")
    .replaceAll(/\s+/g, "")
    .replace(/(부서|부)$/u, "");
}

function bigrams(value: string): ReadonlySet<string> {
  if (value.length < 2) return new Set([value]);
  return new Set(
    Array.from({ length: value.length - 1 }, (_, index) => value.slice(index, index + 2)),
  );
}

function similarity(left: string, right: string): number {
  if (left === right) return 1;
  if (left.includes(right) || right.includes(left)) return 0.8;
  const leftBigrams = bigrams(left);
  const rightBigrams = bigrams(right);
  const overlap = [...leftBigrams].filter((bigram) => rightBigrams.has(bigram)).length;
  return (2 * overlap) / (leftBigrams.size + rightBigrams.size);
}

export function findClosestDepartmentId(
  sourceName: string,
  departments: readonly DepartmentSnapshot[],
): string | undefined {
  const source = normalizedDepartmentName(sourceName);
  return departments.reduce<Readonly<{ id: string; score: number }> | undefined>(
    (best, department) => {
      const score = similarity(source, normalizedDepartmentName(department.name));
      return best === undefined || score > best.score ? { id: department.id, score } : best;
    },
    undefined,
  )?.id;
}
