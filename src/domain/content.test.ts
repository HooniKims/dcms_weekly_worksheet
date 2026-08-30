import { describe, expect, it } from "vitest";
import { appendEditorHtml, htmlToPlainText, sanitizeEditorHtml } from "./content";

describe("editor content", () => {
  it("keeps report formatting while removing executable markup", () => {
    const dirty =
      '<p onclick="steal()"><strong>핵심</strong></p><script>alert(1)</script><a href="javascript:steal()">링크</a><table><tbody><tr><td>셀</td></tr></tbody></table>';
    const safe = sanitizeEditorHtml(dirty);

    expect(safe).toContain("<strong>핵심</strong>");
    expect(safe).toContain("<table>");
    expect(safe).not.toContain("script");
    expect(safe).not.toContain("onclick");
    expect(safe).not.toContain("javascript:");
  });

  it("creates searchable plain text with meaningful line breaks", () => {
    expect(htmlToPlainText("<p>첫째</p><ul><li>둘째</li></ul>")).toBe("첫째\n둘째");
  });

  it("appends reusable rich content with one editable paragraph boundary", () => {
    expect(
      appendEditorHtml(
        "<p><strong>현재</strong></p>",
        '<p><u>이전</u></p><script>alert("x")</script>',
      ),
    ).toBe("<p><strong>현재</strong></p><p><br></p><p><u>이전</u></p>");
    expect(appendEditorHtml("", "<p>이전</p>")).toBe("<p>이전</p>");
  });
});
