# Workspace access, department administration, and search design

## Goal

Make the weekly-work site comfortable for daily desktop entry while preserving historical report fidelity. Users can leave the workspace, open directly into a stable department editor, search all weeks, and navigate to a matching entry. Administrators create weeks manually and manage the department list for the selected week and future weeks.

## Confirmed product rules

- Logging out clears the active shared session and returns to the password screen.
- The default workspace tab is the selected department's editor, not the report.
- The desktop navigation and content columns keep a stable width when dates or departments change.
- Weeks are created only by an administrator. No scheduled weekly creation remains deployed.
- Department edits apply to the currently selected week and become the master list copied into later weeks.
- Other already-existing weeks keep their own department snapshots.
- Renaming or reordering a department preserves its stable ID and existing entries.
- Removing a department is a soft delete: it disappears from the selected week and later newly created weeks, while historical snapshots and saved entry documents remain intact.
- Search is available to ordinary authenticated users across all weeks. A query requires at least two characters and matches department names or entry plain text.
- Selecting a result opens that week, selects that department, and shows the editor.

## Data model

### Master departments

`departments/{departmentId}` remains the master list. Each document keeps `name`, `order`, `active`, and `omitWhenEmpty`. Removed departments are stored with `active: false` rather than deleted.

### Week snapshots

Each `weeks/{weekId}` document keeps `departmentSnapshot`. The workspace navigation, mobile selector, report, and editor use the selected week's active snapshot, not the current master collection. This keeps older weeks stable.

Saving department administration performs one privileged operation:

1. Preserve the IDs of retained departments.
2. Assign stable IDs to newly added departments.
3. Normalize active department order to consecutive integers.
4. Mark omitted master departments inactive.
5. Replace only the selected week's snapshot with the active ordered list.
6. Leave every other existing week and every entry document unchanged.

Later manual week creation copies only active master departments into its snapshot.

### Search index

`searchIndex/{weekId}__{departmentId}` is a derived, read-only-to-clients document containing:

- `weekId`, `dateLabel`, `departmentId`, `departmentName`
- `plainText` and a normalized concatenation of department name plus content
- unique normalized two-character grams used for Firestore `array-contains` candidate lookup
- `updatedAt`

The browser queries by the first normalized two-character gram, filters candidates with an exact normalized substring check, sorts newest week first, and returns at most 50 visible results. This avoids downloading the complete archive on every search while supporting Korean partial matching.

Index documents are maintained by trusted backend code when an entry changes, a week is created, or the selected week's department snapshot is edited. A one-time admin backfill covers all migrated weeks and entries. Empty departments are indexed by name so department-name searches can still navigate to them.

## Repository API

The shared repository gains:

- `logout(): Promise<void>`
- `saveDepartments(weekId, departments): Promise<WorkspaceSnapshot>`
- `search(query): Promise<readonly SearchResult[]>`
- `rebuildSearchIndex(): Promise<void>` for the privileged one-time/admin repair path

Local demo storage implements identical observable behavior, including soft-deleted master departments, week snapshot overrides, and substring search over migrated plus locally saved data.

## UI design

### Header and default editor

The header adds a clearly labeled logout action next to the administrator and print actions. `App` owns logout so it can clear both repository authentication and the local session marker before returning to `LockScreen`.

`Workspace` initializes on the edit tab and selects the first department in the selected week snapshot. Changing a week selects the same department when that ID exists; otherwise it selects the first department of the new week's snapshot. Search result navigation always selects the result department and the edit tab.

### Stable desktop layout

At desktop widths, the header and two-column workspace grid use the full configured workspace width. The navigation column remains fixed, the main column uses the remaining fixed track, and the scroll container reserves its scrollbar gutter. The edit panel, editor shell, and heading fill the main track without content-dependent intrinsic sizing. Mobile continues to use the existing single-column layout.

### Search

A search control sits in the content header. It waits 250 ms after typing, shows loading and empty states, and opens a result panel containing date, department, and a short matching excerpt. The result panel is keyboard accessible. Clearing the query closes it.

### Administrator dialog

After the existing password check, the dialog shows two independent sections:

1. Manual week creation. The obsolete automatic-Monday help copy is removed.
2. Department management for the selected week. Each row has a name input, move-up, move-down, and remove action. An add button appends a new blank department. One save action validates non-empty unique names and at least one remaining department before persisting.

After department save, the workspace snapshot, selected week, navigation, mobile selector, and editor selection refresh immediately. If the selected department was removed, selection moves to the first remaining department.

## Error handling

- Logout always clears the local marker; Firebase sign-out failure is reported without leaving a false ready state.
- Search requires two normalized characters, cancels stale responses, and distinguishes no results from request failure.
- Week creation reports an existing week as a successful selection rather than duplicating it.
- Department validation errors remain in the dialog without discarding the draft.
- Repository/backend failures retain the draft and show an actionable retry message.
- Search index failures never block saving the source entry; backend index maintenance can be repaired through the rebuild operation.

## Security

- Shared contributors can read search index documents but cannot write them.
- Only admin custom-token sessions can create weeks, update the master departments, replace a selected week's snapshot, or rebuild the search index.
- Entry content and soft-deleted data keep their existing Firestore protections.

## Verification

### Automated tests

- `App`: logout clears the session and returns to the password screen.
- `Workspace`: editor is the default tab; changing week keeps or safely replaces department selection; search result navigation opens the matching editor.
- `AdminDialog`: add, rename, reorder, remove, validation, save, and manual week creation.
- Local repository: current-week snapshot update, historical preservation, future week inheritance, soft-delete data preservation, logout, and substring search.
- Search normalization/index helpers: Korean and whitespace cases, minimum length, matching excerpts.
- Functions: no scheduled export; privileged department update and search-index rebuild behavior.

### Manual browser scenarios

- Desktop at 1280 px: switch between a short and long week and verify the editor's left and right edges do not move.
- Start from login, unlock, confirm the first department editor is visible, then logout and confirm the password screen.
- As admin, create a week, rename/add/reorder/remove departments, save, and verify the current week uses the new order.
- Return to an older week and verify its old department snapshot and content remain unchanged.
- Create a later week and verify it inherits the changed master list.
- Search by a partial department name and a partial Korean content phrase; open each result and verify its week, department, and editor content.
- Verify the report and A4 PDF remain unchanged except for the selected week's intentional department snapshot edits.

