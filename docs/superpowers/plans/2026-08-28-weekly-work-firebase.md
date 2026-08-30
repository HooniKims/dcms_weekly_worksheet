# Weekly Work Firebase Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Firebase에서 빠르게 동작하며 기존 A4 결과물을 재현하는 주간업무 웹사이트를 구축한다.

**Architecture:** Vite React SPA가 Firebase Hosting에서 실행되고, Firestore 서울 리전의 선택 주차만 실시간 구독한다. Firebase Auth와 Cloud Functions가 공용 비밀번호 세션, 관리자 작업, 변경 이력, 예약 생성을 담당한다.

**Tech Stack:** React, TypeScript, Vite, Firebase Hosting/Auth/Firestore/Functions, Zod, Vitest, Testing Library, Playwright, Biome

---

### Task 1: 프로젝트와 Firebase 구성

**Files:**
- Create: `package.json`, `vite.config.ts`, `tsconfig*.json`, `biome.json`, `index.html`
- Create: `firebase.json`, `.firebaserc`, `firestore.rules`, `firestore.indexes.json`
- Create: `src/main.tsx`, `src/app/App.tsx`, `src/styles/tokens.css`

- [ ] Vite React TypeScript와 엄격한 TypeScript·Biome·Vitest 구성을 만든다.
- [ ] Firebase 프로젝트 `weekly-work-progress-2026`을 기본 별칭으로 연결한다.
- [ ] Firebase 웹 앱을 등록하고 `.env.example`에 필요한 공개 설정 키 이름을 기록한다.
- [ ] React 개발 도구를 개발 모드에서만 로드한다.
- [ ] `bun run typecheck`, `bun run lint`, `bun run build`가 성공하는지 확인한다.

### Task 2: 도메인 모델과 주차 계산

**Files:**
- Create: `src/domain/schemas.ts`
- Create: `src/domain/week.ts`
- Test: `src/domain/week.test.ts`

- [ ] Given 월요일 기준 시각, When 다음 주차를 계산, Then 7일 뒤 `YYYY-MM-DD`를 반환하는 실패 테스트를 작성한다.
- [ ] Given 월요일 이외의 시각, When 다음 주차를 계산, Then 다음 월요일을 기준으로 그 다음 주를 반환하는 실패 테스트를 작성한다.
- [ ] 테스트가 함수 부재로 실패하는지 실행해 확인한다.
- [ ] `WeekId`, `DepartmentId`, 블록·주차·항목 Zod 스키마와 날짜 계산을 최소 구현한다.
- [ ] 단위 테스트와 타입 검사를 통과시킨다.

### Task 3: Firestore 저장 계약과 규칙

**Files:**
- Create: `src/data/weekRepository.ts`
- Create: `src/data/firebaseWeekRepository.ts`
- Create: `src/data/inMemoryWeekRepository.ts`
- Test: `src/data/weekRepository.contract.test.ts`
- Modify: `firestore.rules`

- [ ] 저장 성공과 버전 충돌을 구분하는 저장 계약 테스트를 작성하고 실패를 확인한다.
- [ ] 인메모리 저장소로 최소 계약을 구현해 테스트를 통과시킨다.
- [ ] Firestore 어댑터를 동일한 계약으로 구현한다.
- [ ] 기여자는 주차·항목 읽기와 버전 일치 업데이트만, 관리자는 설정과 복원까지 허용하는 규칙을 작성한다.
- [ ] Firestore Emulator에서 허용·거부 규칙 통합 테스트를 실행한다.

### Task 4: 디자인 토큰과 프리미티브 쇼케이스

**Files:**
- Create: `src/styles/global.css`, `src/styles/print.css`
- Create: `src/ui/Button.tsx`, `src/ui/Field.tsx`, `src/ui/Surface.tsx`, `src/ui/Status.tsx`
- Create: `src/dev/PrimitiveShowcase.tsx`
- Test: `src/ui/Button.test.tsx`, `src/ui/Field.test.tsx`

- [ ] 접근 가능한 버튼·필드 상태 테스트를 먼저 작성하고 실패를 확인한다.
- [ ] `DESIGN.md` 토큰만 사용해 기본·hover·focus·disabled·error 상태를 구현한다.
- [ ] 375px, 768px, 1280px에서 프리미티브 쇼케이스를 브라우저로 검사한다.

### Task 5: 공용 비밀번호 접속 잠금

**Files:**
- Create: `src/features/access/AccessGate.tsx`
- Create: `src/features/access/accessService.ts`
- Test: `src/features/access/AccessGate.test.tsx`
- Create: `functions/src/unlockSite.ts`

- [ ] 잘못된 비밀번호, 성공, 요청 제한 상태의 컴포넌트 테스트를 작성하고 실패를 확인한다.
- [ ] Zod로 함수 요청·응답을 파싱하는 서비스와 접근 화면을 구현한다.
- [ ] Cloud Function에서 비밀 해시를 검증하고 기여자 커스텀 토큰을 발급한다.
- [ ] App Check와 요청 제한을 적용한다.

### Task 6: 분할형 주간표·편집 화면

**Files:**
- Create: `src/features/workspace/Workspace.tsx`
- Create: `src/features/workspace/WeekNavigator.tsx`
- Create: `src/features/workspace/WeeklyReport.tsx`
- Create: `src/features/editor/DepartmentEditor.tsx`
- Create: `src/features/editor/blocks.ts`
- Test: `src/features/workspace/Workspace.test.tsx`, `src/features/editor/blocks.test.ts`

- [ ] 주차·부서 선택과 주간표·편집 탭 전환 테스트를 작성해 실패를 확인한다.
- [ ] 편집 블록 직렬화·정리 테스트를 작성해 실패를 확인한다.
- [ ] 데스크톱 고정 탐색·본문 스크롤과 모바일 상단 선택 메뉴를 구현한다.
- [ ] 기존 굵게·기울임·밑줄·목록·링크·표 기능을 구현한다.
- [ ] 저장 중·완료·오류·충돌 상태와 선택적 덮어쓰기를 구현한다.

### Task 7: 관리자와 자동 생성 함수

**Files:**
- Create: `src/features/admin/AdminPanel.tsx`
- Create: `functions/src/createWeek.ts`
- Create: `functions/src/revisions.ts`
- Create: `functions/src/index.ts`
- Test: `functions/src/createWeek.test.ts`

- [ ] 다음 주차 생성과 중복 무작업 테스트를 작성해 실패를 확인한다.
- [ ] 월요일 00:05 예약 생성과 관리자 수동 생성이 같은 도메인 함수를 사용하게 구현한다.
- [ ] 부서 스냅샷, 변경 이력, 복원을 구현한다.
- [ ] 관리자 설정·주차 생성·계정 관리 화면을 구현한다.

### Task 8: A4 출력 호환

**Files:**
- Create: `src/features/print/PrintWeeklyReport.tsx`
- Create: `src/features/print/printModel.ts`
- Test: `src/features/print/printModel.test.ts`

- [ ] 현재 시트의 부서 순서·빈 항목·표 행 모델 테스트를 작성하고 실패를 확인한다.
- [ ] 인쇄 전용 React 화면과 `@page` A4 CSS를 구현한다.
- [ ] 대표 주차를 기존 Google Sheet와 브라우저 PDF로 대조한다.

### Task 9: Google Sheet 마이그레이션

**Files:**
- Create: `scripts/migrate-sheet.ts`
- Create: `scripts/migrationSchemas.ts`
- Test: `scripts/migrate-sheet.test.ts`

- [ ] 제출원본 행 파싱, 중복 주차, 실패 행 보고 테스트를 작성하고 실패를 확인한다.
- [ ] Google Sheet 읽기 결과를 Zod로 파싱하고 Firestore batch로 이전하는 스크립트를 구현한다.
- [ ] dry-run 결과를 검토한 뒤 실제 이전을 실행하고 주차·부서 수를 기록한다.

### Task 10: 통합·브라우저·성능 검증

**Files:**
- Create: `playwright.config.ts`
- Create: `e2e/access-and-edit.spec.ts`, `e2e/print.spec.ts`
- Create: `scripts/audit.ts`

- [ ] Emulator에서 접속→부서 수정→주간표 반영 E2E를 작성한다.
- [ ] 관리자 수동 주차 생성과 A4 인쇄 E2E를 작성한다.
- [ ] 프로덕션 빌드를 375px, 768px, 1280px에서 시각 QA한다.
- [ ] React Doctor, React Scan, 모바일·데스크톱 Lighthouse를 실행한다.
- [ ] 모든 테스트·타입·린트·빌드가 통과한 뒤 Firebase Hosting과 Functions 배포 준비 상태를 보고한다.
