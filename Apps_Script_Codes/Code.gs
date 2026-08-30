const APP_TITLE = '주간업무추진사항';
const MENU_NAME = '주간업무 관리';
const TIMEZONE = 'Asia/Seoul';

const CONTROL_SHEET_NAME = '운영설정';
const RAW_SHEET_NAME = '제출원본';
const SHEET_TITLE = '주간업무추진사항';
const CONTENT_COLUMNS = 6;
const SPREADSHEET_ID_KEY = 'BOUND_SPREADSHEET_ID';
const TABLE_ROW_METADATA_KEY = 'WEEKLY_TABLE_ROWS';
const RERENDER_PROGRESS_KEY = 'WEEKLY_RERENDER_PROGRESS';
const RENDER_DIRTY_PREFIX = 'WEEKLY_RENDER_DIRTY_';
const RENDER_REV_PREFIX = 'WEEKLY_RENDER_REV_';
const RENDER_LAYOUT_REV = '2026-04-07-block-breathing-v1';
const WEEKLY_SHEET_LAYOUT = {
  labelColumnWidth: 66,
  contentColumnWidth: 110,
  titleRowHeight: 22,
  metaRowHeight: 18,
  dividerRowHeight: 1,
  titleFontSize: 13,
  metaFontSize: 11,
  departmentFontSize: 9,
  contentFontSize: 9,
  tableFontSize: 8,
  contentCharsPerLine: 68,
  tableCharsPerColumn: 8,
  contentLineHeightPx: 9,
  contentMinRowHeightPx: 9,
  contentMaxRowHeightPx: 68,
  emptyContentRowHeightPx: 7,
  tableLineHeightPx: 5,
  tableMinRowHeightPx: 5,
  tableMaxRowHeightPx: 36,
  titleMinFontSize: 9,
  metaMinFontSize: 8,
  titleMinRowHeightPx: 20,
  metaMinRowHeightPx: 16,
  bodyMinRowHeightPx: 8,
  tableOverflowFontMin: 6,
  tableOverflowRowMin: 4,
};

const PDF_PAGE_LAYOUT = {
  widthInches: 8.27,
  heightInches: 11.69,
  topMarginInches: 0.30,
  bottomMarginInches: 0.12,
  leftMarginInches: 0.01,
  rightMarginInches: 0.01,
  targetFillRatio: 0.965,
  expandThresholdRatio: 0,
  minShrinkScale: 0.68,
  maxExpandScale: 1,
};

const AUTO_FIT_WEEKLY_SHEET_TO_SINGLE_PAGE = false;

const CONTROL_LAYOUT = {
  meetingTitle: 'B3',
  year: 'B4',
  targetDate: 'B5',
  generateFlag: 'B6',
  pdfLink: 'B7',
  departmentHeader: 'D3',
  departmentRange: 'D4:D21',
  helperRange: 'F3:H11',
};

const RAW_HEADERS = [
  '기준시트',
  '기준일자',
  '부서',
  '내용HTML',
  '내용구조JSON',
  '내용텍스트',
  '최종수정시각',
];

const DEFAULT_DEPARTMENTS = [
  '말씀 및 기도',
  '교장(교감)',
  '교무기획부',
  '교육연구부',
  '생활안전부',
  '창체활동부',
  '과학정보부',
  '인성상담부',
  '통합지원부',
  '진로진학부',
  '행정실',
];

function onOpen() {
  rememberSpreadsheetId_();
  SpreadsheetApp.getUi()
    .createMenu(MENU_NAME)
    .addItem('시트 초기화', 'menuInitializeWorkbook')
    .addItem('선택 날짜 시트 생성', 'menuGenerateWeeklySheet')
    .addToUi();

  ensureBaseSheets_();
  updateControlSheetLinks_();
}

function doGet() {
  rememberSpreadsheetId_();
  ensureBaseSheets_();
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle(APP_TITLE)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function onEdit(e) {
  if (!e || !e.range) return;

  const sheet = e.range.getSheet();
  if (sheet.getName() !== CONTROL_SHEET_NAME) return;

  const a1 = e.range.getA1Notation();

  if (a1 === CONTROL_LAYOUT.generateFlag && String(e.value) === 'TRUE') {
    try {
      const result = createWeeklySheetFromControl_();
      toast_(result.sheetName + ' 시트를 준비했습니다.');
    } catch (error) {
      toast_(error.message);
    } finally {
      sheet.getRange(CONTROL_LAYOUT.generateFlag).setValue(false);
    }
    return;
  }

  if (a1 === CONTROL_LAYOUT.targetDate) {
    updateControlSheetLinks_();
  }
}

function menuInitializeWorkbook() {
  const ui = SpreadsheetApp.getUi();
  const response = ui.alert(
    '시트 초기화',
    '운영설정 시트를 초기화합니다. 기존의 모든 주간 시트와 백엔드 데이터가 **영구히 삭제**되며 보관되지 않습니다. 계속할까요?',
    ui.ButtonSet.YES_NO
  );
  if (response !== ui.Button.YES) return;

  ensureBaseSheets_(true);
  updateControlSheetLinks_();
  ui.alert('초기화가 완료되었습니다. 운영설정 시트에서 연도와 부서를 입력해 주세요.');
}

function menuGenerateWeeklySheet() {
  try {
    const result = createWeeklySheetFromControl_();
    SpreadsheetApp.getUi().alert(result.sheetName + ' 시트를 생성했습니다.');
  } catch (error) {
    SpreadsheetApp.getUi().alert('생성 실패: ' + error.message);
  }
}

function menuRefreshLinks() {
  // 사용되지 않음
}

function getFormConfig() {
  ensureBaseSheets_();

  const config = readControlConfig_();
  
  const ss = getSpreadsheet_();
  const availableDates = ss.getSheets()
    .map(function(s) { return s.getName(); })
    .filter(function(name) { return parseSheetNameDate_(name) !== null; })
    .sort(function(a, b) { return b.localeCompare(a); });

  return {
    success: true,
    appTitle: APP_TITLE,
    meetingTitle: config.meetingTitle,
    activeSheetName: config.activeSheetName,
    activeDateLabel: config.activeDateLabel,
    availableDates: availableDates,
    departments: config.departments,
    hasActiveSheet: Boolean(availableDates.length > 0),
  };
}

function getDepartmentEntry(targetSheetName, department) {
  ensureBaseSheets_();

  const targetDepartment = cleanText_(department);
  const sheetName = cleanText_(targetSheetName);

  if (!sheetName) {
    return { success: false, message: '작성 날짜를 먼저 선택해 주세요.' };
  }
  if (!targetDepartment) {
    return { success: false, message: '부서를 먼저 선택해 주세요.' };
  }

  const rawSheet = getOrCreateSheet_(getSpreadsheet_(), RAW_SHEET_NAME);
  const row = findRawRow_(rawSheet, sheetName, targetDepartment);
  if (row < 0) {
    return {
      success: true,
      htmlContent: '',
      plainText: '',
      updatedAt: '',
      message: '저장된 내용이 없습니다.',
    };
  }

  const values = rawSheet.getRange(row, 1, 1, RAW_HEADERS.length).getValues()[0];
  return {
    success: true,
    htmlContent: String(values[3] || ''),
    plainText: String(values[5] || ''),
    updatedAt: String(values[6] || ''),
  };
}

function submitWeeklyUpdate(formData) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) {
    return { success: false, message: '동시에 제출이 많습니다. 잠시 후 다시 시도해 주세요.' };
  }

  try {
    ensureBaseSheets_();

    const config = readControlConfig_();
    const targetSheetName = cleanText_(formData.targetSheetName) || config.activeSheetName;
    const targetDateLabel = targetSheetName ? formatWeeklyDateLabel_(parseSheetNameDate_(targetSheetName)) : '';
    
    formData.activeSheetName = targetSheetName;
    const payload = sanitizeSubmission_(formData || {}, config);
    const validationError = validateSubmission_(payload, config);
    if (validationError) {
      return { success: false, message: validationError };
    }

    const ss = getSpreadsheet_();
    const rawSheet = getOrCreateSheet_(ss, RAW_SHEET_NAME);
    const timestamp = Utilities.formatDate(new Date(), TIMEZONE, 'yyyy-MM-dd HH:mm:ss');
    const rowData = [
      targetSheetName,
      targetDateLabel,
      payload.department,
      payload.htmlContent,
      JSON.stringify(payload.blocks),
      payload.plainText,
      timestamp,
    ];

    const targetRow = findRawRow_(rawSheet, targetSheetName, payload.department);
    const isUpdate = targetRow > 0;
    if (isUpdate) {
      rawSheet.getRange(targetRow, 1, 1, rowData.length).setValues([rowData]);
    } else {
      rawSheet.appendRow(rowData);
    }

    SpreadsheetApp.flush();

    const savedRowIndex = findRawRow_(rawSheet, targetSheetName, payload.department);
    if (savedRowIndex < 0) {
      return {
        success: false,
        message: 'rawSheet 저장에 실패했습니다. 잠시 후 다시 시도해 주세요. (raw-save-failed)',
      };
    }
    const savedPlainText = cleanText_(String(rawSheet.getRange(savedRowIndex, 6).getValue() || ''));

    sortRawSheet_(rawSheet);
    
    renderWeeklySheet_(targetSheetName);
    SpreadsheetApp.flush();
    updateControlSheetLinks_();

    return {
      success: true,
      message: (isUpdate ? '기존 부서 내용을 수정했습니다.' : '부서 내용을 저장했습니다.') +
        (savedPlainText ? ' [저장확인: ' + savedPlainText.slice(0, 20) + '...]' : ''),
      updatedAt: timestamp,
      sheetName: targetSheetName,
    };
  } catch (error) {
    return { success: false, message: '오류가 발생했습니다: ' + error.message };
  } finally {
    lock.releaseLock();
  }
}

function ensureBaseSheets_(forceSetup) {
  const ss = getSpreadsheet_();
  
  if (forceSetup) {
      PropertiesService.getScriptProperties().deleteAllProperties();
      PropertiesService.getUserProperties().deleteAllProperties();

      const sheets = ss.getSheets();
      sheets.forEach(s => {
          const name = s.getName();
          if (parseSheetNameDate_(name) !== null) {
              ss.deleteSheet(s);
          }
      });
  }

  const controlSheet = getOrCreateSheet_(ss, CONTROL_SHEET_NAME);
  const rawSheet = getOrCreateSheet_(ss, RAW_SHEET_NAME);

  if (forceSetup || isControlSheetEmpty_(controlSheet)) {
    setupControlSheet_(controlSheet, forceSetup);
  }
  if (forceSetup || isRawSheetEmpty_(rawSheet)) {
    setupRawSheet_(rawSheet, !forceSetup);
  } else {
    rawSheet.hideSheet();
  }
}

function createWeeklySheetFromControl_() {
  const ss = getSpreadsheet_();
  const config = readControlConfig_();
  const date = coerceDate_(config.targetDate);

  if (!date) {
    throw new Error('운영설정 시트의 생성할 날짜를 먼저 선택해 주세요.');
  }
  if (!config.departments.length) {
    throw new Error('운영설정 시트에 올해 부서를 한 개 이상 입력해 주세요.');
  }

  const sheetName = formatSheetName_(date);
  const sheet = getOrCreateSheet_(ss, sheetName);
  
  const controlSheet = ss.getSheetByName(CONTROL_SHEET_NAME);
  if (controlSheet) {
    const targetIndex = controlSheet.getIndex() + 1;
    ss.setActiveSheet(sheet);
    ss.moveActiveSheet(targetIndex);
  }

  activateSheet_(sheetName, date);
  renderWeeklySheet_(sheetName);
  updateControlSheetLinks_();

  return {
    success: true,
    sheetName,
    pdfUrl: getPdfExportUrl_(ss.getSheetByName(sheetName)),
  };
}

function rerenderActiveSheet_() {
  const config = readControlConfig_();
  if (!config.activeSheetName) {
    throw new Error('선택된 날짜 시트가 없습니다. 먼저 날짜별 시트를 생성해 주세요.');
  }

  renderWeeklySheet_(config.activeSheetName);
  updateControlSheetLinks_();
  return { success: true, sheetName: config.activeSheetName };
}

function activateSheet_(sheetName, date) {
  const controlSheet = getSpreadsheet_().getSheetByName(CONTROL_SHEET_NAME);
  controlSheet.getRange(CONTROL_LAYOUT.targetDate).setValue(date);
}

function setupControlSheet_(sheet, resetDepartmentsToDefault) {
  const existingConfig = readControlConfigSafe_(sheet);
  const year = resetDepartmentsToDefault ? getCurrentYear_() : (existingConfig.year || getCurrentYear_());
  const targetDate = resetDepartmentsToDefault ? '' : (existingConfig.targetDate || '');
  const meetingTitle = resetDepartmentsToDefault ? '교무회의' : (existingConfig.meetingTitle || '교무회의');
  const departments = resetDepartmentsToDefault
    ? DEFAULT_DEPARTMENTS
    : existingConfig.departments.length
      ? existingConfig.departments
      : DEFAULT_DEPARTMENTS;

  sheet.getRange('B6:B10').clearDataValidations().clearNote().clearContent();

  sheet.clear();
  sheet.setHiddenGridlines(true);
  sheet.setFrozenRows(3);
  sheet.setColumnWidths(1, 1, 132);
  sheet.setColumnWidths(2, 1, 220);
  sheet.setColumnWidths(3, 1, 28);
  sheet.setColumnWidths(4, 1, 190);
  sheet.setColumnWidths(5, 1, 28);
  sheet.setColumnWidths(6, 1, 60);
  sheet.setColumnWidths(7, 1, 280);
  sheet.setColumnWidths(8, 1, 20);

  sheet.getRange('A1:D1').merge();
  sheet.getRange('A1').setValue(APP_TITLE + ' 운영설정');
  sheet.getRange('A1')
    .setFontSize(16)
    .setFontWeight('bold')
    .setFontFamily('Malgun Gothic')
    .setBackground('#183153')
    .setFontColor('#ffffff')
    .setHorizontalAlignment('center');

  sheet.getRange('A2:D2').merge();
  sheet.getRange('A2')
    .setValue('연도별 부서를 입력하고, 날짜를 선택한 뒤 메뉴를 통해 주간 시트를 생성하세요.')
    .setFontFamily('Malgun Gothic')
    .setFontColor('#43526b')
    .setBackground('#edf4ff');

  const labels = [
    ['회의 종류', meetingTitle],
    ['운영 연도', year],
    ['선택한 날짜(생성 기준)', targetDate],
    ['시트 생성 실행', false],
    ['A4 PDF 링크', ''],
  ];

  sheet.getRange(3, 1, labels.length, 2).setValues(labels);
  sheet.getRange('A3:A7')
    .setBackground('#e7ecf7')
    .setFontWeight('bold')
    .setFontFamily('Malgun Gothic');
  sheet.getRange('B3:B7').setFontFamily('Malgun Gothic');

  sheet.getRange(CONTROL_LAYOUT.targetDate).setNumberFormat('yyyy-mm-dd');
  sheet.getRange(CONTROL_LAYOUT.generateFlag).insertCheckboxes();
  sheet.getRange(CONTROL_LAYOUT.generateFlag).setValue(false);

  sheet.getRange(CONTROL_LAYOUT.departmentHeader)
    .setValue('당해연도 부서명')
    .setBackground('#e7ecf7')
    .setFontWeight('bold')
    .setFontFamily('Malgun Gothic');
    
  const departmentRange = sheet.getRange(CONTROL_LAYOUT.departmentRange);
  departmentRange.setValues(expandColumnValues_(departments, departmentRange.getNumRows()));
  departmentRange.setFontFamily('Malgun Gothic');
  departmentRange.setBackground('#ffffff');
  departmentRange.setBorder(true, true, true, true, true, true, '#d7dee8', SpreadsheetApp.BorderStyle.SOLID);
  
  const helperData = [
    ['사용 흐름', '', ''],
    ['1', 'B4에 연도를 적고 D열 부서 목록을 최신화', ''],
    ['2', '빨간 테두리 B5를 더블 클릭해 날짜를 선택 (주간업무 회의일 등)', ''],
    ['3', '상단 메뉴 또는 B6 체크박스로 시트 생성', ''],
    ['4', '웹앱에서 "날짜 선택" 후 부서명을 골라 내용 저장', ''],
    ['5', 'B7 링크를 클릭해 A4 PDF 출력', ''],
    ['', '', ''],
    ['참고', '부서명 빈칸은 무시되며, 기본 11개 설정값이 적용됩니다.', ''],
    ['', '', '']
  ];
  sheet.getRange(CONTROL_LAYOUT.helperRange).setValues(helperData);
  sheet.getRange(CONTROL_LAYOUT.helperRange)
    .setFontFamily('Malgun Gothic')
    .setFontColor('#465467')
    .setVerticalAlignment('middle');
  sheet.getRange('F3:F11').setFontWeight('bold');
  sheet.getRange('G10').setWrap(true);

  const yearRule = SpreadsheetApp.newDataValidation()
    .requireNumberBetween(2000, 2999)
    .setAllowInvalid(false)
    .build();
  sheet.getRange(CONTROL_LAYOUT.year).setDataValidation(yearRule);

  const dateRule = SpreadsheetApp.newDataValidation()
    .requireDate()
    .setAllowInvalid(false)
    .build();
  sheet.getRange(CONTROL_LAYOUT.targetDate).setDataValidation(dateRule);

  formatControlSheetTextLayout_(sheet);
  applyTargetDateFocusStyle_(sheet);
  updateControlSheetLinks_();
}

function setupRawSheet_(sheet, preserveData) {
  const existingRows = preserveData && sheet.getLastRow() > 1
    ? sheet.getRange(2, 1, sheet.getLastRow() - 1, RAW_HEADERS.length).getValues()
    : [];

  if (sheet.getMaxColumns() < RAW_HEADERS.length) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), RAW_HEADERS.length - sheet.getMaxColumns());
  }
  if (sheet.getMaxRows() < 2) {
    sheet.insertRowsAfter(sheet.getMaxRows(), 2 - sheet.getMaxRows());
  }

  sheet.clear();
  sheet.getRange(1, 1, 1, RAW_HEADERS.length).setValues([RAW_HEADERS]);
  sheet.getRange(1, 1, 1, RAW_HEADERS.length)
    .setFontWeight('bold')
    .setBackground('#eef2f7')
    .setFontFamily('Malgun Gothic');
  sheet.setFrozenRows(1);
  sheet.setColumnWidths(1, RAW_HEADERS.length, 180);

  if (existingRows.length) {
    sheet.getRange(2, 1, existingRows.length, RAW_HEADERS.length).setValues(existingRows);
  }
  sheet.hideSheet();
}

function readControlConfig_() {
  const sheet = getSpreadsheet_().getSheetByName(CONTROL_SHEET_NAME);
  return readControlConfigSafe_(sheet);
}

function readControlConfigSafe_(sheet) {
  if (!sheet) {
    return {
      meetingTitle: '',
      year: getCurrentYear_(),
      targetDate: new Date(),
      activeSheetName: '',
      activeDateLabel: '',
      activeSheetExists: false,
      departments: [],
    };
  }

  const meetingTitle = cleanText_(sheet.getRange(CONTROL_LAYOUT.meetingTitle).getDisplayValue()) || '교무회의';
  const year = parseInt(sheet.getRange(CONTROL_LAYOUT.year).getDisplayValue(), 10) || getCurrentYear_();
  const targetDate = coerceDate_(sheet.getRange(CONTROL_LAYOUT.targetDate).getValue());
  const selectedSheetName = targetDate ? formatSheetName_(targetDate) : '';
  const activeSheetExists = Boolean(selectedSheetName && getSpreadsheet_().getSheetByName(selectedSheetName));
  const departments = sheet
    .getRange(CONTROL_LAYOUT.departmentRange)
    .getDisplayValues()
    .map(function (row) {
      return cleanText_(row[0]);
    })
    .filter(Boolean);
  const activeDate = targetDate || null;

  return {
    meetingTitle,
    year,
    targetDate,
    activeSheetName: activeSheetExists ? selectedSheetName : '',
    activeDateLabel: activeDate ? formatWeeklyDateLabel_(activeDate) : '',
    activeSheetExists,
    departments,
  };
}

function renderWeeklySheet_(sheetName) {
  const ss = getSpreadsheet_();
  const config = readControlConfig_();
  const date = parseSheetNameDate_(sheetName) || coerceDate_(config.targetDate) || new Date();
  const sheet = getOrCreateSheet_(ss, sheetName);
  const entryMap = getEntryMapForSheet_(sheetName);
  const tableRows = [];

  initializeWeeklySheetLayout_(sheet, config, date);

  let row = 4;
  config.departments.forEach(function (department) {
    const entry = entryMap[department];
    const blocks = entry ? entry.blocks : [];
    const styledTextBlocks = entry ? entry.styledTextBlocks : [];
    row = renderDepartmentSection_(sheet, row, department, blocks, tableRows, styledTextBlocks);
  });

  const lastUsedRow = Math.max(row - 1, 4);
  const currentMaxRows = sheet.getMaxRows();
  if (currentMaxRows > lastUsedRow) {
    sheet.deleteRows(lastUsedRow + 1, currentMaxRows - lastUsedRow);
  }

  sheet.addDeveloperMetadata(TABLE_ROW_METADATA_KEY, tableRows.join(','));

  if (AUTO_FIT_WEEKLY_SHEET_TO_SINGLE_PAGE) {
    fitWeeklySheetToSinglePage_(sheet, lastUsedRow);
  }
  markSheetRendered_(sheetName);
}

function initializeWeeklySheetLayout_(sheet, config, date) {
  const neededRows = 140;
  if (sheet.getMaxRows() < neededRows) {
    sheet.insertRowsAfter(sheet.getMaxRows(), neededRows - sheet.getMaxRows());
  }
  if (sheet.getMaxColumns() < 7) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), 7 - sheet.getMaxColumns());
  }
  if (sheet.getMaxColumns() > 7) {
    sheet.deleteColumns(8, sheet.getMaxColumns() - 7);
  }

  sheet.getRange(1, 1, sheet.getMaxRows(), 7).breakApart();
  sheet.clear();
  sheet.getDeveloperMetadata().forEach(function (metadata) {
    metadata.remove();
  });
  sheet.setHiddenGridlines(true);
  sheet.setFrozenRows(2);
  sheet.setColumnWidth(1, WEEKLY_SHEET_LAYOUT.labelColumnWidth);
  sheet.setColumnWidths(2, 6, WEEKLY_SHEET_LAYOUT.contentColumnWidth);
  sheet.getRange(1, 1, sheet.getMaxRows(), 7).setFontFamily('Malgun Gothic');

  sheet.getRange('A1:G1').merge();
  sheet.getRange('A1')
    .setValue(SHEET_TITLE)
    .setFontSize(WEEKLY_SHEET_LAYOUT.titleFontSize)
    .setFontWeight('bold')
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle');
  sheet.setRowHeight(1, WEEKLY_SHEET_LAYOUT.titleRowHeight);

  sheet.getRange('A2:D2').merge();
  sheet.getRange('E2:G2').merge();
  sheet.getRange('A2')
    .setValue('회의종류 :: ' + config.meetingTitle)
    .setFontSize(WEEKLY_SHEET_LAYOUT.metaFontSize)
    .setHorizontalAlignment('left')
    .setVerticalAlignment('middle');
  sheet.getRange('E2')
    .setValue(formatWeeklyDateLabel_(date))
    .setFontSize(WEEKLY_SHEET_LAYOUT.metaFontSize)
    .setHorizontalAlignment('right')
    .setVerticalAlignment('middle');
  sheet.setRowHeight(2, WEEKLY_SHEET_LAYOUT.metaRowHeight);
  sheet.setRowHeight(3, WEEKLY_SHEET_LAYOUT.dividerRowHeight);

  sheet.getRange('A2:G2').setBorder(false, false, true, false, false, false, '#7a7a7a', SpreadsheetApp.BorderStyle.SOLID);
  sheet.getRange('A1:G2').setBackground('#ffffff');
}

function renderDepartmentSection_(sheet, startRow, department, blocks, tableRows, styledTextBlocks) {
  const sectionStart = startRow;
  let row = startRow;
  const styledLineState = {
    lines: flattenStyledTextLines_(styledTextBlocks),
    cursor: 0,
  };

  const consolidated = [];
  (blocks || []).forEach(function(b) {
    if (!b) return;
    const last = consolidated[consolidated.length - 1];
    if (b.type === 'text' && last && last.type === 'text') {
      last.lines = normalizeTextLinesRich_(last.lines.concat(b.lines));
    } else if (b.type === 'text' || b.type === 'table') {
      const copy = JSON.parse(JSON.stringify(b));
      consolidated.push(copy);
    }
  });

  if (consolidated.length === 0) {
    consolidated.push({ type: 'text', lines: ['없음'] });
  }

  consolidated.forEach(function(block) {
    if (block.type === 'table') {
      row = renderTableBlock_(sheet, row, block, tableRows);
    } else {
      row = renderTextBlock_(sheet, row, block.lines, consumeStyledLinesForBlock_(styledLineState, block.lines));
    }
  });

  const sectionEnd = Math.max(row - 1, sectionStart);
  
  const labelRange = sheet.getRange(sectionStart, 1, sectionEnd - sectionStart + 1, 1);
  labelRange.merge();
  labelRange
    .setValue(department)
    .setBackground('#d7c2e5')
    .setFontWeight('bold')
    .setFontSize(WEEKLY_SHEET_LAYOUT.departmentFontSize)
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle')
    .setWrap(false)
    .setWrapStrategy(SpreadsheetApp.WrapStrategy.CLIP)
    .setBorder(true, true, true, true, true, true, '#8d8d8d', SpreadsheetApp.BorderStyle.SOLID);

  sheet
    .getRange(sectionStart, 1, sectionEnd - sectionStart + 1, 7)
    .setBorder(true, true, true, true, null, null, '#8d8d8d', SpreadsheetApp.BorderStyle.SOLID);

  return sectionEnd + 1;
}

function renderTextBlock_(sheet, startRow, lines, styledLines) {
  const safeLines = normalizeTextLinesRich_(lines);
  if (safeLines.length === 0) safeLines.push('* 없음');
  
  const lineModels = buildRenderableLineModels_(safeLines, styledLines);
  const combinedText = lineModels.map(function (line) { return line.text; }).join('\n');
  const row = startRow;
  const normalizedText = cleanText_(combinedText);
  const isLegacyEmptyPlaceholder = normalizedText === '?놁쓬' || normalizedText === '없음';
  const isEmptyPlaceholder = isLegacyEmptyPlaceholder || normalizedText === '* ?놁쓬' || normalizedText === '* 없음';
  const displayText = isLegacyEmptyPlaceholder ? '* 없음' : combinedText;

  const richSpec = buildSheetRichTextSpec_(isLegacyEmptyPlaceholder
    ? [{ text: '* ?놁쓬', boldRanges: [] }]
    : lineModels);
  const range = sheet.getRange(row, 2, 1, CONTENT_COLUMNS);
  const valueCell = range.getCell(1, 1);
  range.merge();
  if (richSpec.boldRanges.length) {
    valueCell.setRichTextValue(buildRichTextValueFromSpec_(richSpec));
  } else {
    valueCell.setValue(richSpec.text);
  }
  range
    .setWrap(true)
    .setFontSize(WEEKLY_SHEET_LAYOUT.contentFontSize)
    .setHorizontalAlignment('left')
    .setVerticalAlignment('middle')
    .setBorder(true, true, true, true, false, false, '#b6b6b6', SpreadsheetApp.BorderStyle.SOLID);
  
  if (isEmptyPlaceholder) {
    sheet.setRowHeight(row, WEEKLY_SHEET_LAYOUT.emptyContentRowHeightPx);
  } else {
    sheet.setRowHeight(
      row,
      estimateTextRowHeight_(
        richSpec.text,
        WEEKLY_SHEET_LAYOUT.contentCharsPerLine,
        WEEKLY_SHEET_LAYOUT.contentLineHeightPx,
        WEEKLY_SHEET_LAYOUT.contentMinRowHeightPx,
        WEEKLY_SHEET_LAYOUT.contentMaxRowHeightPx
      )
    );
  }
  return row + 1;
}

function renderTableBlock_(sheet, startRow, block, tableRows) {
  let row = startRow;
  const headerRows = Math.max(0, Number(block.headerRows || 0));
  const rows = Array.isArray(block.rows) ? block.rows : [];
  const normalizedRows = rows.map(function (sourceRow) {
    return normalizeTableRow_(sourceRow);
  });

  normalizedRows.forEach(function (normalizedRow, rowIndex) {
    const spans = buildColumnSpans_(CONTENT_COLUMNS, normalizedRow.length);
    let column = 2;

    normalizedRow.forEach(function (cellText, cellIndex) {
      const span = spans[cellIndex];
      const range = sheet.getRange(row, column, 1, span);
      if (span > 1) {
        range.merge();
      }
      
      const paddedCellText = cellText ? String(cellText) : '';
      range
        .setValue(paddedCellText)
        .setWrap(true)
        .setFontSize(WEEKLY_SHEET_LAYOUT.tableFontSize)
        .setHorizontalAlignment('center')
        .setVerticalAlignment('middle')
        .setBorder(true, true, true, true, true, true, '#8f9bad', SpreadsheetApp.BorderStyle.SOLID);

      if (rowIndex < headerRows) {
        range.setBackground('#eef2f8').setFontWeight('bold');
      } else {
        range.setBackground('#ffffff').setFontWeight('normal');
      }
      column += span;
    });

    if (Array.isArray(tableRows)) {
      tableRows.push(row);
    }
    sheet.setRowHeight(row, estimateTableRowHeight_(normalizedRow, spans));
    row += 1;
  });

  return row;
}

function getEntryMapForSheet_(sheetName) {
  const rawSheet = getSpreadsheet_().getSheetByName(RAW_SHEET_NAME);
  const entryMap = {};
  if (!rawSheet || rawSheet.getLastRow() < 2) return entryMap;

  const targetSheetName = cleanText_(sheetName);
  const values = rawSheet.getRange(2, 1, rawSheet.getLastRow() - 1, RAW_HEADERS.length).getValues();
  
  values.forEach(function (row) {
    let rowSheetName = row[0];
    if (Object.prototype.toString.call(rowSheetName) === '[object Date]') {
      rowSheetName = formatSheetName_(rowSheetName);
    } else {
      rowSheetName = cleanText_(rowSheetName);
    }

    if (rowSheetName !== targetSheetName) return;

    const department = cleanText_(row[2]);
    if (!department) return;

    entryMap[department] = {
      htmlContent: String(row[3] || ''),
      blocks: parseBlocksJson_(row[4], row[5]),
      styledTextBlocks: parseStyledTextBlocksFromHtml_(String(row[3] || '')),
      plainText: String(row[5] || ''),
      updatedAt: String(row[6] || ''),
    };
  });

  return entryMap;
}

function sanitizeSubmission_(raw, config) {
  const department = cleanText_(raw.department);
  const plainText = cleanText_(raw.plainText);
  const blocks = sanitizeBlocks_(raw.blocks);
  const htmlContent = sanitizeHtml_(raw.htmlContent);
  const resolvedBlocks = blocks.length ? blocks : plainTextToBlocks_(plainText);
  const resolvedPlainText = plainText || blocksToPlainText_(resolvedBlocks);

  return {
    department,
    blocks: resolvedBlocks,
    htmlContent,
    plainText: resolvedPlainText,
    activeSheetName: raw.activeSheetName || config.activeSheetName,
  };
}

function validateSubmission_(payload, config) {
  if (!payload.activeSheetName) {
    return '작성할 날짜 시트를 먼저 선택해 주세요 (시트가 없으면 운영설정에서 생성).';
  }
  if (!config.departments.length) {
    return '운영설정 시트의 부서 목록을 먼저 입력해 주세요.';
  }
  if (!payload.department) {
    return '부서를 선택해 주세요.';
  }
  if (config.departments.indexOf(payload.department) === -1) {
    return '운영설정 시트의 부서 목록에 없는 부서입니다.';
  }
  if (!payload.blocks.length && !payload.plainText) {
    return '내용을 입력해 주세요.';
  }
  return '';
}

function sanitizeBlocks_(blocks) {
  if (!Array.isArray(blocks)) return [];

  return blocks
    .map(function (block) {
      if (!block || typeof block !== 'object') return null;

      if (block.type === 'table') {
        const rows = Array.isArray(block.rows)
          ? block.rows
              .slice(0, 20)
              .map(function (row) {
                return normalizeTableRow_(row);
              })
          : [];
        if (!rows.length) return null;

        return {
          type: 'table',
          headerRows: Math.min(Math.max(Number(block.headerRows || 0), 0), rows.length),
          rows: rows,
        };
      }

      const lines = normalizeTextLinesRich_(
        Array.isArray(block.lines)
          ? block.lines.map(function (line) {
              return limitText_(line, 1000);
            })
          : []
      );
      if (!lines.length) return null;

      return {
        type: 'text',
        lines: lines,
      };
    })
    .filter(Boolean);
}

function sanitizeHtml_(html) {
  let value = String(html || '');
  value = value.replace(/<\s*(script|style|iframe|object|embed|meta|link)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '');
  value = value.replace(/<\s*(script|style|iframe|object|embed|meta|link)[^>]*\/?\s*>/gi, '');
  value = value.replace(/\s(style|class|id)\s*=\s*(['"]).*?\2/gi, '');
  value = value.replace(/\s(style|class|id)\s*=\s*[^\s>]+/gi, '');
  value = value.replace(/\son[a-z]+\s*=\s*(['"]).*?\1/gi, '');
  value = value.replace(/\son[a-z]+\s*=\s*[^\s>]+/gi, '');
  value = value.replace(/javascript:/gi, '');
  return value.slice(0, 50000);
}

function parseBlocksJson_(value, fallbackPlainText) {
  if (!value) return plainTextToBlocks_(fallbackPlainText);
  try {
    const parsed = sanitizeBlocks_(JSON.parse(value));
    return parsed.length ? parsed : plainTextToBlocks_(fallbackPlainText);
  } catch (error) {
    return plainTextToBlocks_(fallbackPlainText);
  }
}

function parseStyledTextBlocksFromHtml_(html) {
  const source = String(html || '');
  if (!source) return [];

  const tokens = source.match(/<[^>]+>|[^<]+/g) || [];
  const blocks = [];
  const listStack = [];
  let currentBlock = null;
  let currentLineParts = [];
  let boldDepth = 0;
  let italicDepth = 0;
  let underlineDepth = 0;
  let tableDepth = 0;

  function ensureBlock() {
    if (!currentBlock) {
      currentBlock = { lines: [] };
    }
  }

  function appendText(text, styleState) {
    if (tableDepth > 0) return;
    const decoded = decodeHtmlEntities_(text)
      .replace(/\r/g, '')
      .replace(/\u00a0/g, ' ');
    if (!decoded) return;

    ensureBlock();
    const lastPart = currentLineParts[currentLineParts.length - 1];
    if (
      lastPart &&
      lastPart.bold === styleState.bold &&
      lastPart.italic === styleState.italic &&
      lastPart.underline === styleState.underline
    ) {
      lastPart.text += decoded;
      return;
    }
    currentLineParts.push({
      text: decoded,
      bold: styleState.bold,
      italic: styleState.italic,
      underline: styleState.underline,
    });
  }

  function commitLine(parts) {
    const rawText = parts.map(function (part) { return part.text; }).join('');
    const trimmedStart = rawText.match(/^\s*/)[0].length;
    const trimmedEnd = rawText.length - rawText.replace(/\s*$/, '').length;
    const text = rawText.trim();
    if (!text) return;

    let offset = 0;
    const boldRanges = [];
    const italicRanges = [];
    const underlineRanges = [];
    parts.forEach(function (part) {
      const partStart = offset;
      const partEnd = offset + part.text.length;
      pushStyledRangeIfNeeded_(part.bold, partStart, partEnd, trimmedStart, trimmedEnd, rawText.length, boldRanges);
      pushStyledRangeIfNeeded_(part.italic, partStart, partEnd, trimmedStart, trimmedEnd, rawText.length, italicRanges);
      pushStyledRangeIfNeeded_(part.underline, partStart, partEnd, trimmedStart, trimmedEnd, rawText.length, underlineRanges);
      offset = partEnd;
    });

    currentBlock.lines.push({
      text: text,
      boldRanges: mergeBoldRanges_(boldRanges),
      italicRanges: mergeBoldRanges_(italicRanges),
      underlineRanges: mergeBoldRanges_(underlineRanges),
    });
  }

  function flushCurrentLine() {
    if (!currentBlock || !currentLineParts.length) {
      currentLineParts = [];
      return;
    }
    commitLine(currentLineParts);
    currentLineParts = [];
  }

  function flushBlock() {
    flushCurrentLine();
    if (currentBlock && currentBlock.lines.length) {
      blocks.push(currentBlock);
    }
    currentBlock = null;
  }

  tokens.forEach(function (token) {
    if (token.charAt(0) !== '<') {
      appendText(token, {
        bold: boldDepth > 0,
        italic: italicDepth > 0,
        underline: underlineDepth > 0,
      });
      return;
    }

    const tagMatch = token.match(/^<\s*(\/)?\s*([a-z0-9]+)/i);
    if (!tagMatch) return;

    const isClosing = Boolean(tagMatch[1]);
    const tag = String(tagMatch[2] || '').toLowerCase();
    const isSelfClosing = /\/\s*>$/.test(token);

    if (tag === 'table') {
      if (isClosing) {
        tableDepth = Math.max(0, tableDepth - 1);
      } else {
        flushBlock();
        tableDepth += 1;
      }
      return;
    }
    if (tableDepth > 0) {
      return;
    }

    if (tag === 'br') {
      flushCurrentLine();
      return;
    }

    if (tag === 'strong' || tag === 'b') {
      boldDepth += isClosing ? -1 : 1;
      if (boldDepth < 0) boldDepth = 0;
      return;
    }

    if (tag === 'em' || tag === 'i') {
      italicDepth += isClosing ? -1 : 1;
      if (italicDepth < 0) italicDepth = 0;
      return;
    }

    if (tag === 'u') {
      underlineDepth += isClosing ? -1 : 1;
      if (underlineDepth < 0) underlineDepth = 0;
      return;
    }

    if (tag === 'ul' || tag === 'ol') {
      if (isClosing) {
        flushBlock();
        listStack.pop();
      } else {
        flushBlock();
        listStack.push({ type: tag, index: 0 });
      }
      return;
    }

    if (tag === 'li') {
      if (isClosing) {
        flushCurrentLine();
        return;
      }

      flushCurrentLine();
      ensureBlock();

      const listState = listStack[listStack.length - 1];
      let prefix = '- ';
      if (listState && listState.type === 'ol') {
        listState.index += 1;
        prefix = listState.index + '. ';
      }
      currentLineParts.push({ text: prefix, bold: false, italic: false, underline: false });
      return;
    }

    if (isBlockHtmlTag_(tag)) {
      if (isClosing || isSelfClosing) {
        flushBlock();
      }
      return;
    }
  });

  flushBlock();
  return blocks;
}

function isBlockHtmlTag_(tag) {
  return ['p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote'].indexOf(tag) >= 0;
}

function pushStyledRangeIfNeeded_(enabled, partStart, partEnd, trimmedStart, trimmedEnd, rawLength, targetRanges) {
  if (!enabled) return;
  const start = Math.max(trimmedStart, partStart);
  const end = Math.min(rawLength - trimmedEnd, partEnd);
  if (end > start) {
    targetRanges.push({ start: start - trimmedStart, end: end - trimmedStart });
  }
}

function mergeBoldRanges_(ranges) {
  const sorted = (ranges || [])
    .filter(function (range) {
      return range && Number(range.end) > Number(range.start);
    })
    .sort(function (a, b) { return a.start - b.start; });
  const merged = [];

  sorted.forEach(function (range) {
    const last = merged[merged.length - 1];
    if (last && range.start <= last.end) {
      last.end = Math.max(last.end, range.end);
      return;
    }
    merged.push({ start: range.start, end: range.end });
  });

  return merged;
}

function decodeHtmlEntities_(text) {
  return String(text || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, function (_, value) {
      return String.fromCharCode(Number(value));
    })
    .replace(/&#x([0-9a-f]+);/gi, function (_, value) {
      return String.fromCharCode(parseInt(value, 16));
    });
}

function normalizeTableRow_(sourceRow) {
  if (!Array.isArray(sourceRow)) return [];

  const cells = sourceRow
    .map(function (cell) {
      return limitText_(cleanText_(cell), 500);
    });

  if (cells.length === 0) {
    cells.push('');
  }

  if (cells.length <= CONTENT_COLUMNS) {
    return cells;
  }

  const normalized = cells.slice(0, CONTENT_COLUMNS - 1);
  normalized.push(cells.slice(CONTENT_COLUMNS - 1).join(' / '));
  return normalized;
}

function buildColumnSpans_(availableColumns, cellCount) {
  const count = Math.max(1, cellCount || 1);
  const base = Math.floor(availableColumns / count);
  let remainder = availableColumns % count;
  const spans = [];

  for (let i = 0; i < count; i += 1) {
    let span = Math.max(1, base);
    if (remainder > 0) {
      span += 1;
      remainder -= 1;
    }
    spans.push(span);
  }
  return spans;
}

function blocksToPlainText_(blocks) {
  if (!Array.isArray(blocks)) return '';

  return blocks
    .map(function (block) {
      if (block.type === 'table') {
        return (block.rows || [])
          .map(function (row) {
            return row.join(' | ');
          })
          .join('\n');
      }
      return (block.lines || []).join('\n');
    })
    .filter(Boolean)
    .join('\n\n');
}

function sortRawSheet_(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 3) return;
  sheet.getRange(2, 1, lastRow - 1, RAW_HEADERS.length).sort([
    { column: 1, ascending: true },
    { column: 3, ascending: true },
  ]);
}

function updateControlSheetLinks_() {
  const ss = getSpreadsheet_();
  const controlSheet = ss.getSheetByName(CONTROL_SHEET_NAME);
  if (!controlSheet) return;

  applyTargetDateFocusStyle_(controlSheet);
  const targetDate = coerceDate_(controlSheet.getRange(CONTROL_LAYOUT.targetDate).getValue());

  if (!targetDate) {
    controlSheet.getRange(CONTROL_LAYOUT.pdfLink).setValue('B5에서 날짜를 먼저 선택해 주세요.').setNote('');
    return;
  }

  const targetSheetName = formatSheetName_(targetDate);
  const targetSheet = ss.getSheetByName(targetSheetName);
  if (!targetSheet) {
    controlSheet.getRange(CONTROL_LAYOUT.pdfLink).setValue(targetSheetName + ' 시트를 먼저 생성해 주세요.').setNote('');
    return;
  }

  if (shouldRenderForPdfLink_(targetSheetName)) {
    toast_('PDF 링크 생성 중입니다. 잠시만 기다려주세요.');
    renderWeeklySheet_(targetSheetName);
    SpreadsheetApp.flush();
  }

  const pdfUrl = getPdfExportUrl_(targetSheet);
  controlSheet
    .getRange(CONTROL_LAYOUT.pdfLink)
    .setFormula('=HYPERLINK("' + pdfUrl.replace(/"/g, '""') + '","' + targetSheetName + ' A4 PDF 열기")')
    .setNote(pdfUrl);
  toast_('PDF 링크 생성이 완료되었습니다.');
}

function applyTargetDateFocusStyle_(sheet) {
  const targetRange = sheet.getRange(CONTROL_LAYOUT.targetDate);
  targetRange
    .setBackground('#fff7f7')
    .setFontWeight('bold')
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle')
    .setNote('여기를 더블 클릭해 날짜를 선택하세요.')
    .setBorder(true, true, true, true, true, true, '#d93025', SpreadsheetApp.BorderStyle.SOLID_THICK);
}

function fitWeeklySheetToSinglePage_(sheet, lastUsedRow) {
  const safeLastRow = Math.max(4, Number(lastUsedRow || sheet.getLastRow() || 4));
  const maxHeightPx = getPrintableHeightPxForA4_(sheet);
  const targetHeightPx = Math.floor(maxHeightPx * PDF_PAGE_LAYOUT.targetFillRatio);
  let currentHeightPx = sumRowHeights_(sheet, 1, safeLastRow);

  if (currentHeightPx > maxHeightPx) {
    shrinkWeeklySheetToHeight_(sheet, safeLastRow, targetHeightPx);
    currentHeightPx = sumRowHeights_(sheet, 1, safeLastRow);
  }

  if (currentHeightPx < maxHeightPx * PDF_PAGE_LAYOUT.expandThresholdRatio) {
    const expandScale = Math.min(PDF_PAGE_LAYOUT.maxExpandScale, targetHeightPx / Math.max(currentHeightPx, 1));
    expandWeeklySheetLayout_(sheet, safeLastRow, expandScale, targetHeightPx);
    currentHeightPx = sumRowHeights_(sheet, 1, safeLastRow);
  }

  if (currentHeightPx > maxHeightPx) {
    shrinkTableRowsToFit_(sheet, safeLastRow, targetHeightPx);
    currentHeightPx = sumRowHeights_(sheet, 1, safeLastRow);
  }

  hardLimitWeeklySheetHeight_(sheet, safeLastRow, maxHeightPx);
  currentHeightPx = sumRowHeights_(sheet, 1, safeLastRow);

  if (currentHeightPx > maxHeightPx) {
    applyFinalGlobalShrink_(sheet, safeLastRow, targetHeightPx);
  }
}

function shrinkWeeklySheetToHeight_(sheet, lastRow, targetHeightPx) {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const currentHeightPx = sumRowHeights_(sheet, 1, lastRow);
    if (currentHeightPx <= targetHeightPx) {
      return;
    }

    const scale = Math.max(PDF_PAGE_LAYOUT.minShrinkScale, (targetHeightPx / currentHeightPx) * 0.985);
    scaleWeeklySheetFonts_(sheet, lastRow, scale);
    scaleWeeklySheetRowHeights_(sheet, lastRow, scale);
  }
}

function expandWeeklySheetLayout_(sheet, lastRow, scale, targetHeightPx) {
  const tableRows = getTaggedTableRows_(sheet, lastRow);
  const tableRowMap = toRowLookup_(tableRows);
  scaleWeeklySheetFonts_(sheet, lastRow, scale, tableRowMap);

  for (let row = 1; row <= lastRow; row += 1) {
    if (tableRowMap[row]) {
      continue;
    }
    if (isEmptyPlaceholderRow_(sheet, row)) {
      continue;
    }
    const currentHeight = sheet.getRowHeight(row);
    let maxHeight = currentHeight <= 2 ? 4 : 72;
    if (row === 1) maxHeight = 44;
    if (row === 2) maxHeight = 28;
    if (row === 3) maxHeight = 6;
    const nextHeight = Math.min(maxHeight, Math.max(getMinWeeklyRowHeight_(row, currentHeight), Math.ceil(currentHeight * scale)));
    if (nextHeight !== currentHeight) {
      sheet.setRowHeight(row, nextHeight);
    }
  }

  distributeRemainingHeight_(sheet, lastRow, targetHeightPx, tableRowMap);
}

function scaleWeeklySheetFonts_(sheet, lastRow, scale, excludedRowMap) {
  scaleRangeFontSizes_(sheet.getRange(1, 1, 1, 7), scale, WEEKLY_SHEET_LAYOUT.titleMinFontSize);
  scaleRangeFontSizes_(sheet.getRange(2, 1, 1, 7), scale, WEEKLY_SHEET_LAYOUT.metaMinFontSize);

  if (lastRow >= 4) {
    for (let row = 4; row <= lastRow; row += 1) {
      if (excludedRowMap && excludedRowMap[row]) {
        continue;
      }
      scaleRangeFontSizes_(sheet.getRange(row, 2, 1, 6), scale, 9);
    }
  }
}

function hardLimitWeeklySheetHeight_(sheet, lastRow, maxHeightPx) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const overflowPx = sumRowHeights_(sheet, 1, lastRow) - maxHeightPx;
    if (overflowPx <= 0) {
      return;
    }

    let reduced = 0;
    for (let row = lastRow; row >= 4 && reduced < overflowPx; row -= 1) {
      const currentHeight = sheet.getRowHeight(row);
      const minHeight = getMinWeeklyRowHeight_(row, currentHeight);
      if (currentHeight > minHeight) {
        sheet.setRowHeight(row, currentHeight - 1);
        reduced += 1;
      }
    }

    if (reduced === 0) {
      return;
    }
  }
}

function applyFinalGlobalShrink_(sheet, lastRow, targetHeightPx) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const currentHeightPx = sumRowHeights_(sheet, 1, lastRow);
    if (currentHeightPx <= targetHeightPx) {
      return;
    }

    const scale = Math.max(0.92, targetHeightPx / Math.max(currentHeightPx, 1));
    scaleRangeFontSizes_(sheet.getRange(1, 1, 1, 7), scale, WEEKLY_SHEET_LAYOUT.titleMinFontSize);
    scaleRangeFontSizes_(sheet.getRange(2, 1, 1, 7), scale, WEEKLY_SHEET_LAYOUT.metaMinFontSize);
    if (lastRow >= 4) {
      scaleRangeFontSizes_(sheet.getRange(4, 2, lastRow - 3, 6), scale, 6);
    }

    for (let row = 1; row <= lastRow; row += 1) {
      const currentHeight = sheet.getRowHeight(row);
      const nextHeight = Math.max(1, Math.floor(currentHeight * scale));
      if (nextHeight < currentHeight) {
        sheet.setRowHeight(row, nextHeight);
      }
    }
  }
}

function shrinkTableRowsToFit_(sheet, lastRow, targetHeightPx) {
  const tableRows = getTaggedTableRows_(sheet, lastRow);
  if (!tableRows.length) {
    return;
  }

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const currentHeightPx = sumRowHeights_(sheet, 1, lastRow);
    if (currentHeightPx <= targetHeightPx) {
      return;
    }

    tableRows.forEach(function (row) {
      scaleRangeFontSizes_(sheet.getRange(row, 2, 1, CONTENT_COLUMNS), 0.95, WEEKLY_SHEET_LAYOUT.tableOverflowFontMin);
      const currentHeight = sheet.getRowHeight(row);
      const nextHeight = Math.max(
        WEEKLY_SHEET_LAYOUT.tableOverflowRowMin,
        Math.floor(currentHeight * 0.94)
      );
      if (nextHeight < currentHeight) {
        sheet.setRowHeight(row, nextHeight);
      }
    });
  }
}

function getTaggedTableRows_(sheet, lastRow) {
  const metadata = sheet.getDeveloperMetadata().filter(function (item) {
    return item.getKey() === TABLE_ROW_METADATA_KEY;
  });
  if (!metadata.length) {
    return [];
  }

  const raw = String(metadata[0].getValue() || '');
  return raw
    .split(',')
    .map(function (row) { return Number(row); })
    .filter(function (row) { return row >= 4 && row <= lastRow; })
    .sort(function (a, b) { return a - b; });
}

function distributeRemainingHeight_(sheet, lastRow, targetHeightPx, excludedRowMap) {
  const remainingPx = Math.max(0, Number(targetHeightPx || 0) - sumRowHeights_(sheet, 1, lastRow));
  if (remainingPx < 8) {
    return;
  }

  const adjustableRows = [];
  for (let row = 4; row <= lastRow; row += 1) {
    if (excludedRowMap && excludedRowMap[row]) {
      continue;
    }
    if (isEmptyPlaceholderRow_(sheet, row)) {
      continue;
    }
    if (sheet.getRowHeight(row) > 6) {
      adjustableRows.push(row);
    }
  }

  if (!adjustableRows.length) {
    return;
  }

  const extraPerRow = Math.floor(remainingPx / adjustableRows.length);
  let remainder = remainingPx - (extraPerRow * adjustableRows.length);

  adjustableRows.forEach(function (row) {
    const bonus = extraPerRow + (remainder > 0 ? 1 : 0);
    if (remainder > 0) {
      remainder -= 1;
    }
    if (bonus > 0) {
      sheet.setRowHeight(row, sheet.getRowHeight(row) + bonus);
    }
  });
}

function toRowLookup_(rows) {
  const lookup = {};
  (rows || []).forEach(function (row) {
    lookup[row] = true;
  });
  return lookup;
}

function isEmptyPlaceholderRow_(sheet, row) {
  if (row < 4) {
    return false;
  }
  const value = cleanText_(sheet.getRange(row, 2).getDisplayValue());
  return value === '* 없음' || value === '* ?놁쓬';
}

function scaleRangeFontSizes_(range, scale, minFontSize) {
  const fontSizes = range.getFontSizes();
  const scaledFontSizes = fontSizes.map(function (row) {
    return row.map(function (fontSize) {
      const safeFontSize = Number(fontSize) || minFontSize;
      return Math.max(minFontSize, Math.round(safeFontSize * scale));
    });
  });
  range.setFontSizes(scaledFontSizes);
}

function scaleWeeklySheetRowHeights_(sheet, lastRow, scale) {
  for (let row = 1; row <= lastRow; row += 1) {
    const currentHeight = sheet.getRowHeight(row);
    const nextHeight = Math.max(getMinWeeklyRowHeight_(row, currentHeight), Math.round(currentHeight * scale));
    if (nextHeight !== currentHeight) {
      sheet.setRowHeight(row, nextHeight);
    }
  }
}

function getMinWeeklyRowHeight_(row, currentHeight) {
  if (row === 1) return WEEKLY_SHEET_LAYOUT.titleMinRowHeightPx;
  if (row === 2) return WEEKLY_SHEET_LAYOUT.metaMinRowHeightPx;
  if (row === 3) return 1;
  if (currentHeight <= 2) return 2;
  return WEEKLY_SHEET_LAYOUT.bodyMinRowHeightPx;
}

function getPrintableHeightPxForA4_(sheet) {
  const printableWidthInches = PDF_PAGE_LAYOUT.widthInches - PDF_PAGE_LAYOUT.leftMarginInches - PDF_PAGE_LAYOUT.rightMarginInches;
  const printableHeightInches = PDF_PAGE_LAYOUT.heightInches - PDF_PAGE_LAYOUT.topMarginInches - PDF_PAGE_LAYOUT.bottomMarginInches;
  const totalWidthPx = sumColumnWidths_(sheet, 1, 7);
  return Math.floor(totalWidthPx * (printableHeightInches / printableWidthInches));
}

function sumColumnWidths_(sheet, startColumn, columnCount) {
  let total = 0;
  for (let column = startColumn; column < startColumn + columnCount; column += 1) {
    total += sheet.getColumnWidth(column);
  }
  return total;
}

function sumRowHeights_(sheet, startRow, endRow) {
  let total = 0;
  for (let row = startRow; row <= endRow; row += 1) {
    total += sheet.getRowHeight(row);
  }
  return total;
}

function formatControlSheetTextLayout_(sheet) {
  const wrap = SpreadsheetApp.WrapStrategy.WRAP;

  sheet.setColumnWidth(1, 132);
  sheet.setColumnWidth(2, 220);
  sheet.setColumnWidth(3, 28);
  sheet.setColumnWidth(4, 190);
  sheet.setColumnWidth(5, 28);
  sheet.setColumnWidth(6, 60);
  sheet.setColumnWidth(7, 280);
  sheet.setColumnWidth(8, 20);

  sheet.getRange('A2:D2')
    .setWrapStrategy(wrap)
    .setVerticalAlignment('middle');
  sheet.getRange('A3:A7')
    .setWrapStrategy(wrap)
    .setVerticalAlignment('middle');
  sheet.getRange('B3:B7')
    .setWrapStrategy(wrap)
    .setVerticalAlignment('middle');
  sheet.getRange(CONTROL_LAYOUT.departmentHeader)
    .setWrapStrategy(wrap)
    .setVerticalAlignment('middle');
  sheet.getRange(CONTROL_LAYOUT.departmentRange)
    .setWrapStrategy(wrap)
    .setVerticalAlignment('middle');

  sheet.autoResizeRows(2, 18);
  applyMinRowHeight_(sheet, 2, 18, 24);
}

function getPdfExportUrl_(sheet) {
  const ss = getSpreadsheet_();
  return 'https://docs.google.com/spreadsheets/d/' + ss.getId() + '/export?format=pdf' +
    '&gid=' + sheet.getSheetId() +
    '&size=A4' +
    '&portrait=true' +
    '&fitw=true' +
    '&sheetnames=false' +
    '&printtitle=false' +
    '&pagenumbers=false' +
    '&gridlines=false' +
    '&fzr=false' +
    '&horizontal_alignment=CENTER' +
    '&top_margin=' + PDF_PAGE_LAYOUT.topMarginInches.toFixed(2) +
    '&bottom_margin=' + PDF_PAGE_LAYOUT.bottomMarginInches.toFixed(2) +
    '&left_margin=' + PDF_PAGE_LAYOUT.leftMarginInches.toFixed(2) +
    '&right_margin=' + PDF_PAGE_LAYOUT.rightMarginInches.toFixed(2);
}

function getOrCreateSheet_(ss, sheetName) {
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
  }
  return sheet;
}

function findRawRow_(sheet, sheetName, department) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;

  const targetSheetName = cleanText_(sheetName);
  const targetDept = cleanText_(department);
  const values = sheet.getRange(2, 1, lastRow - 1, 3).getValues();

  for (let i = 0; i < values.length; i += 1) {
    let rowSheetName = values[i][0];
    if (Object.prototype.toString.call(rowSheetName) === '[object Date]') {
      rowSheetName = formatSheetName_(rowSheetName);
    } else {
      rowSheetName = cleanText_(rowSheetName);
    }

    if (rowSheetName === targetSheetName && cleanText_(values[i][2]) === targetDept) {
      return i + 2;
    }
  }
  return -1;
}

function isControlSheetEmpty_(sheet) {
  return cleanText_(sheet.getRange('A1').getDisplayValue()) !== APP_TITLE + ' 운영설정';
}

function isRawSheetEmpty_(sheet) {
  return cleanText_(sheet.getRange(1, 1).getDisplayValue()) !== RAW_HEADERS[0];
}

function coerceDate_(value) {
  if (Object.prototype.toString.call(value) === '[object Date]' && !Number.isNaN(value.getTime())) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }
  if (!value) return null;

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
}

function parseSheetNameDate_(sheetName) {
  const match = String(sheetName || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;

  const parsed = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatSheetName_(date) {
  return Utilities.formatDate(date, TIMEZONE, 'yyyy-MM-dd');
}

function formatWeeklyDateLabel_(date) {
  const safeDate = coerceDate_(date) || new Date();
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  return safeDate.getFullYear() + '년 ' +
    (safeDate.getMonth() + 1) + '월 ' +
    safeDate.getDate() + '일 (' +
    days[safeDate.getDay()] + ')';
}

function estimateTextRowHeight_(text, charsPerLine, lineHeightPx, minHeightPx, maxHeightPx) {
  const lines = estimateWrappedLineCount_(text, charsPerLine);
  const safeLineHeight = Number(lineHeightPx) || 11;
  const safeMinHeight = Number(minHeightPx) || 11;
  const safeMaxHeight = Number(maxHeightPx) || 78;
  return Math.min(safeMaxHeight, Math.max(safeMinHeight, lines * safeLineHeight));
}

function estimateTableRowHeight_(row, spans) {
  const maxLines = row.reduce(function (currentMax, cellText, index) {
    const span = spans[index] || 1;
    const charsPerLine = span * WEEKLY_SHEET_LAYOUT.tableCharsPerColumn;
    return Math.max(currentMax, estimateWrappedLineCount_(cellText, charsPerLine));
  }, 1);

  return Math.min(
    WEEKLY_SHEET_LAYOUT.tableMaxRowHeightPx,
    Math.max(WEEKLY_SHEET_LAYOUT.tableMinRowHeightPx, maxLines * WEEKLY_SHEET_LAYOUT.tableLineHeightPx)
  );
}

function estimateWrappedLineCount_(text, charsPerLine) {
  const safeText = String(text || '');
  const safeCharsPerLine = Math.max(1, Number(charsPerLine) || 1);
  return safeText.split('\n').reduce(function (count, line) {
    return count + Math.max(1, Math.ceil(line.length / safeCharsPerLine));
  }, 0);
}

function expandColumnValues_(values, rowCount) {
  const result = [];
  for (let i = 0; i < rowCount; i += 1) {
    result.push([values[i] || '']);
  }
  return result;
}

function cleanText_(value) {
  return String(value == null ? '' : value)
    .replace(/\r/g, '')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function limitText_(value, maxLength) {
  return String(value == null ? '' : value).slice(0, maxLength);
}

function markSheetRendered_(sheetName) {
  const props = PropertiesService.getScriptProperties();
  const key = cleanText_(sheetName);
  if (!key) return;
  props.setProperty(RENDER_REV_PREFIX + key, RENDER_LAYOUT_REV);
  props.deleteProperty(RENDER_DIRTY_PREFIX + key);
}

function markSheetDirty_(sheetName) {
  const props = PropertiesService.getScriptProperties();
  const key = cleanText_(sheetName);
  if (!key) return;
  props.setProperty(RENDER_DIRTY_PREFIX + key, '1');
}

function shouldRenderForPdfLink_(sheetName) {
  const props = PropertiesService.getScriptProperties();
  const key = cleanText_(sheetName);
  if (!key) return true;

  const dirty = props.getProperty(RENDER_DIRTY_PREFIX + key) === '1';
  const rev = props.getProperty(RENDER_REV_PREFIX + key) || '';
  return dirty || rev !== RENDER_LAYOUT_REV;
}

function getCurrentYear_() {
  return Number(Utilities.formatDate(new Date(), TIMEZONE, 'yyyy'));
}

function toast_(message) {
  getSpreadsheet_().toast(message, MENU_NAME, 5);
}

function applyMinRowHeight_(sheet, startRow, rowCount, minHeight) {
  for (let row = startRow; row < startRow + rowCount; row += 1) {
    if (sheet.getRowHeight(row) < minHeight) {
      sheet.setRowHeight(row, minHeight);
    }
  }
}

function verifyRenderedDepartment_(sheetName, department, plainText) {
  const rawSheet = getSpreadsheet_().getSheetByName(RAW_SHEET_NAME);
  if (!rawSheet) {
    return { ok: false, reason: 'raw-sheet-not-found' };
  }

  const row = findRawRow_(rawSheet, sheetName, department);
  if (row < 0) {
    return { ok: false, reason: 'raw-data-not-found' };
  }

  const savedText = cleanText_(String(rawSheet.getRange(row, 6).getValue() || ''));
  if (!savedText) {
    return { ok: false, reason: 'raw-data-empty' };
  }

  const weeklySheet = getSpreadsheet_().getSheetByName(sheetName);
  if (!weeklySheet) {
    return { ok: false, reason: 'sheet-not-found' };
  }

  return { ok: true };
}

function getSpreadsheet_() {
  const active = SpreadsheetApp.getActiveSpreadsheet();
  if (active) {
    rememberSpreadsheetId_(active);
    return active;
  }

  const scriptProperties = PropertiesService.getScriptProperties();
  const rememberedId = scriptProperties.getProperty(SPREADSHEET_ID_KEY);
  if (rememberedId) {
    return SpreadsheetApp.openById(rememberedId);
  }

  throw new Error('대상 스프레드시트를 찾지 못했습니다. 스프레드시트를 한 번 열고 메뉴를 다시 실행해 주세요.');
}

function rememberSpreadsheetId_(ss) {
  const spreadsheet = ss || SpreadsheetApp.getActiveSpreadsheet();
  if (!spreadsheet) return;
  PropertiesService.getScriptProperties().setProperty(SPREADSHEET_ID_KEY, spreadsheet.getId());
}

function normalizeCompareText_(value) {
  return cleanText_(String(value || ''))
    .replace(/[|•·\-:()\[\]{}.,]/g, '')
    .replace(/\s+/g, '')
    .toLowerCase();
}

function plainTextToBlocks_(plainText) {
  const lines = normalizeTextLinesRich_(String(plainText || '').split(/\n+/));

  return lines.length ? [{ type: 'text', lines: lines }] : [];
}

function flattenStyledTextLines_(styledTextBlocks) {
  const flattened = [];

  (styledTextBlocks || []).forEach(function (block) {
    (block && Array.isArray(block.lines) ? block.lines : []).forEach(function (line) {
      const text = cleanText_(line && line.text);
      if (!text) return;

      flattened.push({
        text: text,
        boldRanges: mergeBoldRanges_(Array.isArray(line && line.boldRanges) ? line.boldRanges : []),
        italicRanges: mergeBoldRanges_(Array.isArray(line && line.italicRanges) ? line.italicRanges : []),
        underlineRanges: mergeBoldRanges_(Array.isArray(line && line.underlineRanges) ? line.underlineRanges : []),
      });
    });
  });

  return flattened;
}

function consumeStyledLinesForBlock_(styledLineState, fallbackLines) {
  const safeFallbackLines = normalizeTextLinesRich_(fallbackLines);
  if (!safeFallbackLines.length) return null;

  const state = styledLineState || { lines: [], cursor: 0 };
  const sourceLines = Array.isArray(state.lines) ? state.lines : [];
  let cursor = Math.max(0, Number(state.cursor) || 0);
  const consumed = [];

  safeFallbackLines.forEach(function (fallbackLine) {
    const expected = normalizeCompareText_(fallbackLine);
    let matchIndex = -1;
    const lookaheadLimit = Math.min(sourceLines.length, cursor + 12);

    for (let index = cursor; index < lookaheadLimit; index += 1) {
      if (normalizeCompareText_(sourceLines[index] && sourceLines[index].text) === expected) {
        matchIndex = index;
        break;
      }
    }

    if (matchIndex >= 0) {
      const matched = sourceLines[matchIndex];
      consumed.push({
        text: matched.text,
        boldRanges: mergeBoldRanges_(matched.boldRanges || []),
        italicRanges: mergeBoldRanges_(matched.italicRanges || []),
        underlineRanges: mergeBoldRanges_(matched.underlineRanges || []),
      });
      cursor = matchIndex + 1;
      return;
    }

    consumed.push({
      text: fallbackLine,
      boldRanges: [],
      italicRanges: [],
      underlineRanges: [],
    });
  });

  state.cursor = cursor;
  return consumed;
}

function formatSheetDisplayText_(text) {
  return String(text || '').replace(/\(([^()\n]+)\)/g, function (_, innerText) {
    const protectedInner = String(innerText || '').replace(/ /g, '\u00a0');
    return '(\u2060' + protectedInner + '\u2060)';
  });
}

function buildRenderableLineModels_(fallbackLines, styledLines) {
  if (!Array.isArray(styledLines) || !styledLines.length) {
    return (fallbackLines || []).map(function (line) {
      return { text: line, boldRanges: [] };
    });
  }

  const models = styledLines
    .map(function (line) {
      const text = cleanText_(line && line.text);
      if (!text) return null;
      const boldRanges = Array.isArray(line && line.boldRanges)
        ? line.boldRanges
            .map(function (range) {
              return {
                start: Math.max(0, Math.min(text.length, Number(range.start) || 0)),
                end: Math.max(0, Math.min(text.length, Number(range.end) || 0)),
              };
            })
            .filter(function (range) { return range.end > range.start; })
        : [];
      const italicRanges = Array.isArray(line && line.italicRanges)
        ? line.italicRanges
            .map(function (range) {
              return {
                start: Math.max(0, Math.min(text.length, Number(range.start) || 0)),
                end: Math.max(0, Math.min(text.length, Number(range.end) || 0)),
              };
            })
            .filter(function (range) { return range.end > range.start; })
        : [];
      const underlineRanges = Array.isArray(line && line.underlineRanges)
        ? line.underlineRanges
            .map(function (range) {
              return {
                start: Math.max(0, Math.min(text.length, Number(range.start) || 0)),
                end: Math.max(0, Math.min(text.length, Number(range.end) || 0)),
              };
            })
            .filter(function (range) { return range.end > range.start; })
        : [];
      return {
        text: text,
        boldRanges: mergeBoldRanges_(boldRanges),
        italicRanges: mergeBoldRanges_(italicRanges),
        underlineRanges: mergeBoldRanges_(underlineRanges),
      };
    })
    .filter(Boolean);

  return models.length ? models : (fallbackLines || []).map(function (line) {
    return { text: line, boldRanges: [], italicRanges: [], underlineRanges: [] };
  });
}

function buildSheetRichTextSpec_(lineModels) {
  const lines = Array.isArray(lineModels) ? lineModels : [];
  let text = '';
  const boldRanges = [];
  const italicRanges = [];
  const underlineRanges = [];
  let offset = 0;

  lines.forEach(function (line, index) {
    const formatted = formatLineModelForSheet_(line);
    if (index > 0) {
      text += '\n';
      offset += 1;
    }
    text += formatted.text;
    formatted.boldRanges.forEach(function (range) {
      boldRanges.push({
        start: offset + range.start,
        end: offset + range.end,
      });
    });
    formatted.italicRanges.forEach(function (range) {
      italicRanges.push({
        start: offset + range.start,
        end: offset + range.end,
      });
    });
    formatted.underlineRanges.forEach(function (range) {
      underlineRanges.push({
        start: offset + range.start,
        end: offset + range.end,
      });
    });
    offset += formatted.text.length;
  });

  return {
    text: text,
    boldRanges: mergeBoldRanges_(boldRanges),
    italicRanges: mergeBoldRanges_(italicRanges),
    underlineRanges: mergeBoldRanges_(underlineRanges),
  };
}

function formatLineModelForSheet_(line) {
  const text = String((line && line.text) || '');
  const boldRanges = Array.isArray(line && line.boldRanges) ? line.boldRanges : [];
  const italicRanges = Array.isArray(line && line.italicRanges) ? line.italicRanges : [];
  const underlineRanges = Array.isArray(line && line.underlineRanges) ? line.underlineRanges : [];
  const indexMap = [];
  let formattedText = '';
  let parenDepth = 0;

  for (let i = 0; i < text.length; i += 1) {
    indexMap[i] = formattedText.length;
    const ch = text.charAt(i);

    if (ch === '(') {
      formattedText += '(\u2060';
      parenDepth += 1;
      continue;
    }
    if (ch === ')') {
      formattedText += '\u2060)';
      parenDepth = Math.max(0, parenDepth - 1);
      continue;
    }
    if (parenDepth > 0 && ch === ' ') {
      formattedText += '\u00a0';
      continue;
    }
    formattedText += ch;
  }
  indexMap[text.length] = formattedText.length;

  return {
    text: formattedText,
    boldRanges: mergeBoldRanges_((boldRanges || []).map(function (range) {
      return {
        start: indexMap[Math.max(0, Math.min(text.length, Number(range.start) || 0))],
        end: indexMap[Math.max(0, Math.min(text.length, Number(range.end) || 0))],
      };
    })),
    italicRanges: mergeBoldRanges_((italicRanges || []).map(function (range) {
      return {
        start: indexMap[Math.max(0, Math.min(text.length, Number(range.start) || 0))],
        end: indexMap[Math.max(0, Math.min(text.length, Number(range.end) || 0))],
      };
    })),
    underlineRanges: mergeBoldRanges_((underlineRanges || []).map(function (range) {
      return {
        start: indexMap[Math.max(0, Math.min(text.length, Number(range.start) || 0))],
        end: indexMap[Math.max(0, Math.min(text.length, Number(range.end) || 0))],
      };
    })),
  };
}

function buildRichTextValueFromSpec_(spec) {
  const richText = SpreadsheetApp.newRichTextValue().setText(String((spec && spec.text) || ''));
  const segments = buildStyledSegmentsFromSpec_(spec);
  if (!segments.length) {
    return richText.build();
  }

  segments.forEach(function (segment) {
    const style = SpreadsheetApp.newTextStyle()
      .setBold(Boolean(segment.bold))
      .setItalic(Boolean(segment.italic))
      .setUnderline(Boolean(segment.underline))
      .build();
    if (segment.end > segment.start) {
      richText.setTextStyle(segment.start, segment.end, style);
    }
  });
  return richText.build();
}

function buildStyledSegmentsFromSpec_(spec) {
  const text = String((spec && spec.text) || '');
  const boundaries = new Set([0, text.length]);
  ['boldRanges', 'italicRanges', 'underlineRanges'].forEach(function (key) {
    (Array.isArray(spec && spec[key]) ? spec[key] : []).forEach(function (range) {
      boundaries.add(Math.max(0, Math.min(text.length, Number(range.start) || 0)));
      boundaries.add(Math.max(0, Math.min(text.length, Number(range.end) || 0)));
    });
  });

  const points = Array.from(boundaries).sort(function (a, b) { return a - b; });
  const segments = [];

  for (let i = 0; i < points.length - 1; i += 1) {
    const start = points[i];
    const end = points[i + 1];
    if (end <= start) continue;

    const segment = {
      start: start,
      end: end,
      bold: isStyleRangeActive_(spec && spec.boldRanges, start, end),
      italic: isStyleRangeActive_(spec && spec.italicRanges, start, end),
      underline: isStyleRangeActive_(spec && spec.underlineRanges, start, end),
    };
    if (segment.bold || segment.italic || segment.underline) {
      segments.push(segment);
    }
  }

  return segments;
}

function isStyleRangeActive_(ranges, start, end) {
  return (Array.isArray(ranges) ? ranges : []).some(function (range) {
    return Number(range.start) <= start && Number(range.end) >= end;
  });
}

function normalizeTextLines_(lines) {
  const source = Array.isArray(lines)
    ? lines
        .map(function (line) { return normalizeBulletLine_(line); })
        .filter(Boolean)
    : [];
  const normalized = [];

  for (let i = 0; i < source.length; i += 1) {
    const current = source[i];
    const next = source[i + 1];

    if (isStandaloneBulletLine_(current) && next && !isStandaloneBulletLine_(next)) {
      normalized.push(normalizeStandaloneBulletMarker_(current) + ' ' + next);
      i += 1;
      continue;
    }

    normalized.push(current);
  }

  return normalized;
}

function normalizeBulletLine_(value) {
  const line = cleanText_(value);
  if (!line) return '';
  return line.replace(/^[•◦▪‣]\s*/, '- ');
}

function isStandaloneBulletLine_(value) {
  return /^[*•◦▪‣-]$/.test(String(value || '')) || /^\d+[.)]$/.test(String(value || ''));
}

function normalizeStandaloneBulletMarker_(value) {
  return /^[•◦▪‣]$/.test(String(value || '')) ? '-' : String(value || '');
}

function normalizeTextLinesRich_(lines) {
  const source = Array.isArray(lines)
    ? lines
        .map(function (line) { return normalizeBulletLineRich_(line); })
        .filter(Boolean)
    : [];
  const normalized = [];

  for (let i = 0; i < source.length; i += 1) {
    const current = source[i];
    const next = source[i + 1];

    if (isStandaloneBulletLineRich_(current) && next && !isStandaloneBulletLineRich_(next)) {
      normalized.push(normalizeStandaloneBulletMarkerRich_(current) + ' ' + next);
      i += 1;
      continue;
    }

    normalized.push(current);
  }

  if (!normalized.some(isExplicitListLineRich_)) {
    return normalized;
  }

  const rebuilt = [];
  let currentLine = '';

  normalized.forEach(function (line) {
    if (isExplicitListLineRich_(line)) {
      if (currentLine) {
        rebuilt.push(currentLine);
      }
      currentLine = line;
      return;
    }

    if (!currentLine) {
      rebuilt.push(line);
      return;
    }

    currentLine = joinTextLineFragmentsRich_(currentLine, line);
  });

  if (currentLine) {
    rebuilt.push(currentLine);
  }

  return rebuilt;
}

function normalizeBulletLineRich_(value) {
  const line = cleanText_(value);
  if (!line) return '';
  return line.replace(/^[•◦▪‣]\s*/u, '- ');
}

function isStandaloneBulletLineRich_(value) {
  return /^[*•◦▪‣-]$/u.test(String(value || '')) || /^\d+[.)]$/.test(String(value || ''));
}

function normalizeStandaloneBulletMarkerRich_(value) {
  return /^[•◦▪‣]$/u.test(String(value || '')) ? '-' : String(value || '');
}

function isExplicitListLineRich_(value) {
  return /^(?:[*-]|•)\s+/u.test(String(value || '')) || /^\d+[.)]\s+/.test(String(value || ''));
}

function joinTextLineFragmentsRich_(current, fragment) {
  const safeCurrent = String(current || '');
  const safeFragment = String(fragment || '');
  if (!safeCurrent) return safeFragment;
  if (!safeFragment) return safeCurrent;

  if (
    startsWithAttachedFragmentRich_(safeFragment) ||
    endsWithAttachedFragmentRich_(safeCurrent) ||
    startsWithKoreanParticleRich_(safeFragment)
  ) {
    return safeCurrent + safeFragment;
  }

  return safeCurrent + ' ' + safeFragment;
}

function startsWithAttachedFragmentRich_(value) {
  return /^[([{~\/.,!?%)]/u.test(String(value || ''));
}

function endsWithAttachedFragmentRich_(value) {
  return /[([{~\/]$/u.test(String(value || ''));
}

function startsWithKoreanParticleRich_(value) {
  return /^(은|는|이|가|을|를|의|에|와|과|도|만|뿐|로|으로|부터|까지|에게|께|한테|랑|처럼|보다|엔|에는|에도|에서|이라|라고)/.test(String(value || ''));
}

function menuRerenderAllWeeklySheets() {
  const result = rerenderAllWeeklySheets_();
  if (result.completed) {
    SpreadsheetApp.getUi().alert(result.count + '개의 기존 주간 시트를 다시 렌더링했습니다.');
  } else {
    SpreadsheetApp.getUi().alert(
      result.processed + '개 처리 완료, ' +
      result.remaining + '개 남음. 시간 초과를 피하기 위해 다음 실행에서 이어서 진행합니다.'
    );
  }
}

function rerenderAllWeeklySheets_() {
  const ss = getSpreadsheet_();
  const scriptProperties = PropertiesService.getScriptProperties();
  const sheetNames = ss.getSheets()
    .map(function (sheet) { return sheet.getName(); })
    .filter(function (name) { return parseSheetNameDate_(name) !== null; })
    .sort();

  const startIndex = Math.max(0, Number(scriptProperties.getProperty(RERENDER_PROGRESS_KEY) || 0));
  const startedAt = Date.now();
  let index = startIndex;

  while (index < sheetNames.length) {
    renderWeeklySheet_(sheetNames[index]);
    index += 1;

    if ((Date.now() - startedAt) > 240000) {
      break;
    }
  }

  SpreadsheetApp.flush();
  updateControlSheetLinks_();

  if (index >= sheetNames.length) {
    scriptProperties.deleteProperty(RERENDER_PROGRESS_KEY);
  } else {
    scriptProperties.setProperty(RERENDER_PROGRESS_KEY, String(index));
  }

  return {
    success: true,
    count: sheetNames.length,
    sheetNames: sheetNames,
    processed: index - startIndex,
    remaining: Math.max(0, sheetNames.length - index),
    completed: index >= sheetNames.length,
  };
}

function onOpen() {
  rememberSpreadsheetId_();
  SpreadsheetApp.getUi()
    .createMenu(MENU_NAME)
    .addItem('시트 초기화', 'menuInitializeWorkbook')
    .addItem('선택 날짜 시트 생성', 'menuGenerateWeeklySheet')
    .addItem('기존 주간 시트 다시 렌더링', 'menuRerenderAllWeeklySheets')
    .addToUi();

  ensureBaseSheets_();
  updateControlSheetLinks_();
}

function shouldOmitEmptyDepartment_(department) {
  return cleanText_(department) === cleanText_(DEFAULT_DEPARTMENTS[0] || '');
}

function renderDepartmentSection_(sheet, startRow, department, blocks, tableRows, styledTextBlocks) {
  const sectionStart = startRow;
  let row = startRow;
  const styledLineState = {
    lines: flattenStyledTextLines_(styledTextBlocks),
    cursor: 0,
  };

  const consolidated = [];
  (blocks || []).forEach(function(b) {
    if (!b) return;
    const last = consolidated[consolidated.length - 1];
    if (b.type === 'text' && last && last.type === 'text') {
      last.lines = normalizeTextLinesRich_(last.lines.concat(b.lines));
    } else if (b.type === 'text' || b.type === 'table') {
      const copy = JSON.parse(JSON.stringify(b));
      consolidated.push(copy);
    }
  });

  if (consolidated.length === 0) {
    if (shouldOmitEmptyDepartment_(department)) {
      return startRow;
    }
    consolidated.push({ type: 'text', lines: ['* 없음'] });
  }

  consolidated.forEach(function(block) {
    if (block.type === 'table') {
      row = renderTableBlock_(sheet, row, block, tableRows);
    } else {
      row = renderTextBlock_(sheet, row, block.lines, consumeStyledLinesForBlock_(styledLineState, block.lines));
    }
  });

  const sectionEnd = Math.max(row - 1, sectionStart);

  const labelRange = sheet.getRange(sectionStart, 1, sectionEnd - sectionStart + 1, 1);
  labelRange.merge();
  labelRange
    .setValue(department)
    .setBackground('#d7c2e5')
    .setFontWeight('bold')
    .setFontSize(WEEKLY_SHEET_LAYOUT.departmentFontSize)
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle')
    .setWrap(false)
    .setWrapStrategy(SpreadsheetApp.WrapStrategy.CLIP)
    .setBorder(true, true, true, true, true, true, '#8d8d8d', SpreadsheetApp.BorderStyle.SOLID);

  sheet
    .getRange(sectionStart, 1, sectionEnd - sectionStart + 1, 7)
    .setBorder(true, true, true, true, null, null, '#8d8d8d', SpreadsheetApp.BorderStyle.SOLID);

  return sectionEnd + 1;
}

function menuRerenderSelectedWeeklySheet() {
  const result = rerenderActiveSheet_();
  SpreadsheetApp.getUi().alert(result.sheetName + ' 시트를 다시 렌더링했습니다.');
}

function onOpen() {
  rememberSpreadsheetId_();
  SpreadsheetApp.getUi()
    .createMenu(MENU_NAME)
    .addItem('시트 초기화', 'menuInitializeWorkbook')
    .addItem('선택 날짜 시트 생성', 'menuGenerateWeeklySheet')
    .addItem('선택된 날짜의 주간시트 다시 랜더링', 'menuRerenderSelectedWeeklySheet')
    .addItem('기존 주간 시트 모두 다시 랜더링', 'menuRerenderAllWeeklySheets')
    .addToUi();

  ensureBaseSheets_();
  updateControlSheetLinks_();
}
