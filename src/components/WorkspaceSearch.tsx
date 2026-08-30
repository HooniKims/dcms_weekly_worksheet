import { MagnifyingGlass } from "@phosphor-icons/react";
import { type KeyboardEvent, useEffect, useId, useRef, useState } from "react";
import type { SearchResult } from "../domain/models";
import { searchGrams } from "../domain/search";

type SearchState =
  | Readonly<{ status: "idle"; results: readonly SearchResult[] }>
  | Readonly<{ status: "loading"; results: readonly SearchResult[] }>
  | Readonly<{ status: "results"; results: readonly SearchResult[] }>
  | Readonly<{ status: "empty"; results: readonly SearchResult[] }>
  | Readonly<{ status: "error"; results: readonly SearchResult[] }>;

type WorkspaceSearchProps = Readonly<{
  search: (query: string) => Promise<readonly SearchResult[]>;
  onResultSelect: (result: SearchResult) => void;
}>;

const initialState: SearchState = { status: "idle", results: [] };
const searchDelayMilliseconds = 250;

export function WorkspaceSearch({ search, onResultSelect }: WorkspaceSearchProps) {
  const [query, setQuery] = useState("");
  const [state, setState] = useState<SearchState>(initialState);
  const [activeIndex, setActiveIndex] = useState<number>();
  const requestGeneration = useRef(0);
  const resultListId = useId();
  const canSearch = searchGrams(query).length > 0;
  const results = state.status === "results" ? state.results : [];
  const activeResult = activeIndex === undefined ? undefined : results[activeIndex];

  function resultOptionId(result: SearchResult): string {
    return `${resultListId}-option-${result.weekId}-${result.departmentId}`;
  }

  function clearSearch(): void {
    requestGeneration.current += 1;
    setQuery("");
    setState(initialState);
    setActiveIndex(undefined);
  }

  function selectResult(result: SearchResult): void {
    clearSearch();
    onResultSelect(result);
  }

  function changeQuery(nextQuery: string): void {
    requestGeneration.current += 1;
    setState(initialState);
    setActiveIndex(undefined);
    setQuery(nextQuery);
  }

  function moveActiveIndex(delta: number): void {
    if (results.length === 0) return;
    setActiveIndex((current) => {
      const startingIndex = current ?? (delta > 0 ? -1 : results.length);
      return Math.max(0, Math.min(startingIndex + delta, results.length - 1));
    });
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    switch (event.key) {
      case "ArrowDown":
        if (results.length === 0) return;
        event.preventDefault();
        moveActiveIndex(1);
        return;
      case "ArrowUp":
        if (results.length === 0) return;
        event.preventDefault();
        moveActiveIndex(-1);
        return;
      case "Enter":
        if (activeResult === undefined) return;
        event.preventDefault();
        selectResult(activeResult);
        return;
      case "Escape":
        if (query.length === 0 && state.status === "idle") return;
        event.preventDefault();
        clearSearch();
        return;
      default:
        return;
    }
  }

  useEffect(() => {
    const requestId = requestGeneration.current + 1;
    requestGeneration.current = requestId;
    setActiveIndex(undefined);
    if (!canSearch) {
      setState(initialState);
      return;
    }

    const timer = window.setTimeout(() => {
      setState({ status: "loading", results: [] });
      void search(query).then(
        (results) => {
          if (requestId !== requestGeneration.current) return;
          setState(
            results.length > 0 ? { status: "results", results } : { status: "empty", results },
          );
          setActiveIndex(results.length > 0 ? 0 : undefined);
        },
        () => {
          if (requestId !== requestGeneration.current) return;
          setState({ status: "error", results: [] });
          setActiveIndex(undefined);
        },
      );
    }, searchDelayMilliseconds);

    return () => window.clearTimeout(timer);
  }, [canSearch, query, search]);

  return (
    <section className="workspace-search" aria-label="전체 주차 검색">
      <label className="workspace-search-input" htmlFor={resultListId}>
        <MagnifyingGlass aria-hidden="true" size={18} />
        <span>전체 주차 검색</span>
        <input
          id={resultListId}
          type="search"
          role="combobox"
          value={query}
          placeholder="부서명 또는 내용 검색"
          onChange={(event) => changeQuery(event.target.value)}
          onKeyDown={handleKeyDown}
          aria-controls={`${resultListId}-results`}
          aria-autocomplete="list"
          aria-expanded={state.status === "results"}
          aria-activedescendant={
            activeResult === undefined ? undefined : resultOptionId(activeResult)
          }
        />
      </label>
      {!canSearch && query.length > 0 && (
        <p className="workspace-search-help">두 글자 이상 입력하면 모든 주차에서 찾습니다.</p>
      )}
      {state.status === "loading" && <p role="status">검색 중입니다.</p>}
      {state.status === "empty" && <p>검색 결과가 없습니다.</p>}
      {state.status === "error" && (
        <p role="alert">검색 결과를 불러오지 못했습니다. 다시 시도해 주세요.</p>
      )}
      {state.status === "results" && (
        <div className="workspace-search-results" id={`${resultListId}-results`} role="listbox">
          {state.results.map((result, index) => (
            <div key={`${result.weekId}-${result.departmentId}`}>
              <button
                id={resultOptionId(result)}
                type="button"
                role="option"
                aria-label={`${result.dateLabel} ${result.departmentName}`}
                aria-selected={index === activeIndex}
                onClick={() => selectResult(result)}
              >
                <span className="workspace-search-result-meta">
                  <time dateTime={result.weekId}>{result.dateLabel}</time>
                  <strong>{result.departmentName}</strong>
                </span>
                <span>{result.excerpt}</span>
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
