import type { Department, Entry, Week } from "../domain/models";
import { formatKoreanDateWithWeekday } from "../domain/week";
import { SafeHtml } from "./SafeHtml";

type ReportViewProps = Readonly<{
  week: Week;
  departments: readonly Department[];
  entries: readonly Entry[];
}>;

export function ReportView({ week, departments, entries }: ReportViewProps) {
  const reportDepartments =
    week.departmentSnapshot.length > 0 ? week.departmentSnapshot : departments;
  return (
    <article className="report-sheet" aria-label={`${week.dateLabel} 주간표`}>
      <table className="report-form" aria-label={`${week.dateLabel} 주간업무추진사항`}>
        <colgroup>
          <col className="report-label-column" />
          <col />
        </colgroup>
        <thead>
          <tr className="report-title-row">
            <th colSpan={2}>주간업무추진사항</th>
          </tr>
          <tr className="report-meta-row">
            <td colSpan={2}>
              <div className="report-meta-grid">
                <span>회의종류 :: 교무회의</span>
                <time dateTime={week.id}>{formatKoreanDateWithWeekday(week.id)}</time>
              </div>
            </td>
          </tr>
          <tr className="report-divider-row">
            <td colSpan={2} />
          </tr>
        </thead>
        <tbody>
          {reportDepartments.map((department) => {
            const entry = entries.find((item) => item.departmentId === department.id);
            const hasContent = Boolean(entry?.plainText.trim());
            if (department.omitWhenEmpty && !hasContent) return null;
            return (
              <tr
                className={entry?.htmlContent ? "report-row" : "report-row empty"}
                key={department.id}
              >
                <th scope="row">{department.name}</th>
                <td>
                  {entry?.htmlContent ? (
                    <SafeHtml className="report-content" html={entry.htmlContent} />
                  ) : (
                    <div className="report-content">* 없음</div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </article>
  );
}
