import { ArrowDown, ArrowsClockwise, ArrowUp, Plus, Trash } from "@phosphor-icons/react";
import { type FormEvent, useState } from "react";
import type { Department, DepartmentSnapshot } from "../domain/models";
import { type WeekId, weekIdSchema } from "../domain/week";

type AdminDialogProps = Readonly<{
  onClose: () => void;
  onSignIn: (password: string) => Promise<void>;
  onCreateWeek: (weekId: WeekId) => Promise<void>;
  onSaveDepartments: (departments: readonly Department[]) => Promise<void>;
  onRebuildSearchIndex: () => Promise<void>;
  selectedWeekLabel: string;
  departments: readonly DepartmentSnapshot[];
  demo: boolean;
}>;

type BusyAction = "sign-in" | "create-week" | "save-departments" | "rebuild-search" | null;

function toEditableDepartments(departments: readonly DepartmentSnapshot[]): Department[] {
  return [...departments]
    .filter((department) => department.active)
    .sort((left, right) => left.order - right.order)
    .map((department) => ({ ...department }));
}

function normalizedDepartmentName(name: string): string {
  return name.normalize("NFKC").toLocaleLowerCase("ko-KR").replaceAll(/\s+/g, "");
}

function nextDepartmentId(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid !== undefined) return `department-${uuid.toLowerCase()}`;
  return `department-local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function AdminDialog({
  onClose,
  onSignIn,
  onCreateWeek,
  onSaveDepartments,
  onRebuildSearchIndex,
  selectedWeekLabel,
  departments,
  demo,
}: AdminDialogProps) {
  const [signedIn, setSignedIn] = useState(false);
  const [password, setPassword] = useState("");
  const [date, setDate] = useState("");
  const [editableDepartments, setEditableDepartments] = useState(() =>
    toEditableDepartments(departments),
  );
  const [message, setMessage] = useState("");
  const [busyAction, setBusyAction] = useState<BusyAction>(null);

  async function signIn(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setMessage("");
    setBusyAction("sign-in");
    try {
      await onSignIn(password);
      setEditableDepartments(toEditableDepartments(departments));
      setSignedIn(true);
    } catch {
      setMessage("관리자 비밀번호를 확인해 주세요.");
    } finally {
      setBusyAction(null);
    }
  }

  async function createWeek(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const parsed = weekIdSchema.safeParse(date);
    if (!parsed.success) return;
    setMessage("");
    setBusyAction("create-week");
    try {
      await onCreateWeek(parsed.data);
      setMessage(`${date} 주차를 준비했습니다.`);
    } catch {
      setMessage("주차를 만들지 못했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setBusyAction(null);
    }
  }

  function updateDepartmentName(id: string, name: string): void {
    setMessage("");
    setEditableDepartments((current) =>
      current.map((department) => (department.id === id ? { ...department, name } : department)),
    );
  }

  function addDepartment(): void {
    setMessage("");
    setEditableDepartments((current) => [
      ...current,
      {
        id: nextDepartmentId(),
        name: "",
        order: current.length,
        active: true,
        omitWhenEmpty: false,
      },
    ]);
  }

  function moveDepartment(id: string, direction: -1 | 1): void {
    setMessage("");
    setEditableDepartments((current) => {
      const index = current.findIndex((department) => department.id === id);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= current.length) return current;
      const next = [...current];
      const item = next[index];
      const targetItem = next[target];
      if (item === undefined || targetItem === undefined) return current;
      next[index] = targetItem;
      next[target] = item;
      return next;
    });
  }

  function removeDepartment(id: string): void {
    setMessage("");
    setEditableDepartments((current) => current.filter((department) => department.id !== id));
  }

  function validDepartments(): readonly Department[] | undefined {
    if (editableDepartments.length === 0) {
      setMessage("최소 한 개의 부서가 필요합니다.");
      return undefined;
    }
    if (editableDepartments.some((department) => department.name.trim().length === 0)) {
      setMessage("부서 이름을 입력해 주세요.");
      return undefined;
    }
    const names = editableDepartments.map((department) =>
      normalizedDepartmentName(department.name),
    );
    if (new Set(names).size !== names.length) {
      setMessage("같은 부서 이름은 한 번만 사용할 수 있습니다.");
      return undefined;
    }
    return editableDepartments.map((department, order) => ({
      ...department,
      name: department.name.trim(),
      order,
      active: true,
    }));
  }

  async function saveDepartments(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const next = validDepartments();
    if (next === undefined) return;
    setMessage("");
    setBusyAction("save-departments");
    try {
      await onSaveDepartments(next);
      setEditableDepartments([...next]);
      setMessage("부서 목록을 저장했습니다.");
    } catch {
      setMessage("부서 목록을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setBusyAction(null);
    }
  }

  async function rebuildSearchIndex(): Promise<void> {
    if (!window.confirm("모든 주차의 검색 색인을 다시 만들까요?")) return;
    setMessage("");
    setBusyAction("rebuild-search");
    try {
      await onRebuildSearchIndex();
      setMessage("검색 색인을 다시 만들었습니다.");
    } catch {
      setMessage("검색 색인을 다시 만들지 못했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <dialog className="dialog-backdrop" aria-labelledby="admin-title" open>
      <section className="admin-dialog">
        <div className="dialog-heading">
          <div>
            <p className="eyebrow">ADMIN</p>
            <h2 id="admin-title">관리자 도구</h2>
          </div>
          <button className="ghost-button compact" type="button" onClick={onClose}>
            닫기
          </button>
        </div>
        {!signedIn ? (
          <form className="admin-form" onSubmit={(event) => void signIn(event)}>
            <label htmlFor="admin-password">관리자 비밀번호</label>
            <input
              id="admin-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              required
            />
            {demo && (
              <p className="demo-hint">
                개발 미리보기 관리자 비밀번호: {import.meta.env.VITE_LOCAL_ADMIN_PASSWORD}
              </p>
            )}
            <button className="primary-button" type="submit" disabled={busyAction === "sign-in"}>
              {busyAction === "sign-in" ? "관리자 확인 중…" : "관리자 확인"}
            </button>
          </form>
        ) : (
          <div className="admin-tools">
            <p className="admin-success">관리자 권한이 확인되었습니다.</p>
            <p className="admin-week-context">선택한 주차: {selectedWeekLabel}</p>
            <form className="admin-form admin-section" onSubmit={(event) => void createWeek(event)}>
              <h3>새 주차 만들기</h3>
              <label htmlFor="week-date">새 주차 기준일</label>
              <input
                id="week-date"
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
                required
              />
              <button
                className="primary-button"
                type="submit"
                disabled={busyAction === "create-week"}
              >
                {busyAction === "create-week" ? "주차 생성 중…" : "주차 생성하기"}
              </button>
              <p className="form-help">새 주차는 관리자가 날짜를 직접 선택해 생성합니다.</p>
            </form>
            <form className="admin-section" onSubmit={(event) => void saveDepartments(event)}>
              <fieldset
                className="department-manager-fields"
                disabled={busyAction === "save-departments"}
              >
                <div className="admin-section-heading">
                  <div>
                    <h3>부서 관리</h3>
                    <p className="form-help">
                      저장하면 이 주차와 이후에 새로 만드는 주차에 적용됩니다.
                    </p>
                  </div>
                  <button className="ghost-button compact" type="button" onClick={addDepartment}>
                    <Plus size={16} /> 부서 추가
                  </button>
                </div>
                <ol className="department-editor-list" aria-label="부서 순서">
                  {editableDepartments.map((department, index) => (
                    <li key={department.id} className="department-editor-row">
                      <span className="department-order" aria-hidden="true">
                        {index + 1}
                      </span>
                      <input
                        aria-label={`부서 이름 ${index + 1}`}
                        value={department.name}
                        onChange={(event) =>
                          updateDepartmentName(department.id, event.target.value)
                        }
                      />
                      <div className="department-row-actions">
                        <button
                          className="icon-button static"
                          type="button"
                          aria-label={`위로 이동 ${department.name}`}
                          onClick={() => moveDepartment(department.id, -1)}
                          disabled={index === 0}
                        >
                          <ArrowUp size={16} />
                        </button>
                        <button
                          className="icon-button static"
                          type="button"
                          aria-label={`아래로 이동 ${department.name}`}
                          onClick={() => moveDepartment(department.id, 1)}
                          disabled={index === editableDepartments.length - 1}
                        >
                          <ArrowDown size={16} />
                        </button>
                        <button
                          className="icon-button static danger"
                          type="button"
                          aria-label={`${department.name} 삭제`}
                          onClick={() => removeDepartment(department.id)}
                        >
                          <Trash size={16} />
                        </button>
                      </div>
                    </li>
                  ))}
                </ol>
                <button className="primary-button" type="submit">
                  {busyAction === "save-departments" ? "부서 목록 저장 중…" : "부서 목록 저장"}
                </button>
              </fieldset>
            </form>
            <section className="admin-section admin-repair" aria-labelledby="search-rebuild-title">
              <h3 id="search-rebuild-title">검색 색인 복구</h3>
              <p className="form-help">검색 결과가 누락될 때만 모든 주차의 색인을 다시 만드세요.</p>
              <button
                className="ghost-button"
                type="button"
                onClick={() => void rebuildSearchIndex()}
                disabled={busyAction === "rebuild-search"}
              >
                <ArrowsClockwise size={17} />
                {busyAction === "rebuild-search" ? "검색 색인 생성 중…" : "검색 색인 다시 만들기"}
              </button>
            </section>
          </div>
        )}
        {message.length > 0 && (
          <p className="dialog-message" role="status">
            {message}
          </p>
        )}
      </section>
    </dialog>
  );
}
