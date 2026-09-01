import { ArrowDown, ArrowUp, Plus, Trash } from "@phosphor-icons/react";
import { type FormEvent, useState } from "react";
import type { Department, DepartmentSnapshot } from "../domain/models";

type AdminDepartmentManagerProps = Readonly<{
  departments: readonly DepartmentSnapshot[];
  onSaveDepartments: (departments: readonly Department[]) => Promise<void>;
  onMessage: (message: string) => void;
}>;

function editableDepartments(departments: readonly DepartmentSnapshot[]): Department[] {
  return [...departments]
    .filter((department) => department.active)
    .sort((left, right) => left.order - right.order)
    .map((department) => ({ ...department }));
}

function normalizedName(name: string): string {
  return name.normalize("NFKC").toLocaleLowerCase("ko-KR").replaceAll(/\s+/g, "");
}

function nextDepartmentId(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid !== undefined) return `department-${uuid.toLowerCase()}`;
  return `department-local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function AdminDepartmentManager({
  departments,
  onSaveDepartments,
  onMessage,
}: AdminDepartmentManagerProps) {
  const [items, setItems] = useState(() => editableDepartments(departments));
  const [saving, setSaving] = useState(false);

  function updateName(id: string, name: string): void {
    onMessage("");
    setItems((current) =>
      current.map((department) => (department.id === id ? { ...department, name } : department)),
    );
  }

  function addDepartment(): void {
    onMessage("");
    setItems((current) => [
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
    onMessage("");
    setItems((current) => {
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
    onMessage("");
    setItems((current) => current.filter((department) => department.id !== id));
  }

  function validatedDepartments(): readonly Department[] | undefined {
    if (items.length === 0) {
      onMessage("최소 한 개의 부서가 필요합니다.");
      return undefined;
    }
    if (items.some((department) => department.name.trim().length === 0)) {
      onMessage("부서 이름을 입력해 주세요.");
      return undefined;
    }
    const names = items.map((department) => normalizedName(department.name));
    if (new Set(names).size !== names.length) {
      onMessage("같은 부서 이름은 한 번만 사용할 수 있습니다.");
      return undefined;
    }
    return items.map((department, order) => ({
      ...department,
      name: department.name.trim(),
      order,
      active: true,
    }));
  }

  async function save(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const next = validatedDepartments();
    if (next === undefined) return;
    onMessage("");
    setSaving(true);
    try {
      await onSaveDepartments(next);
      setItems([...next]);
      onMessage("부서 목록을 저장했습니다.");
    } catch {
      onMessage("부서 목록을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="admin-section" onSubmit={(event) => void save(event)}>
      <fieldset className="department-manager-fields" disabled={saving}>
        <div className="admin-section-heading">
          <div>
            <h3>부서 관리</h3>
            <p className="form-help">저장하면 이 주차와 이후에 새로 만드는 주차에 적용됩니다.</p>
          </div>
          <button className="ghost-button compact" type="button" onClick={addDepartment}>
            <Plus size={16} /> 부서 추가
          </button>
        </div>
        <ol className="department-editor-list" aria-label="부서 순서">
          {items.map((department, index) => (
            <li key={department.id} className="department-editor-row">
              <span className="department-order" aria-hidden="true">
                {index + 1}
              </span>
              <input
                aria-label={`부서 이름 ${index + 1}`}
                value={department.name}
                onChange={(event) => updateName(department.id, event.target.value)}
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
                  disabled={index === items.length - 1}
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
          {saving ? "부서 목록 저장 중…" : "부서 목록 저장"}
        </button>
      </fieldset>
    </form>
  );
}
