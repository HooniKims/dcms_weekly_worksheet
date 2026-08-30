const allowedTags = new Set([
  "A",
  "B",
  "BR",
  "DIV",
  "EM",
  "I",
  "LI",
  "OL",
  "P",
  "STRONG",
  "TABLE",
  "TBODY",
  "TD",
  "TH",
  "THEAD",
  "TR",
  "U",
  "UL",
]);

const allowedAttributes = new Set(["colspan", "rowspan"]);

function cleanElement(element: Element): void {
  for (const child of Array.from(element.children)) {
    if (!allowedTags.has(child.tagName)) {
      if (child.tagName === "SCRIPT" || child.tagName === "STYLE") {
        child.remove();
      } else {
        child.replaceWith(...Array.from(child.childNodes));
      }
      continue;
    }

    for (const attribute of Array.from(child.attributes)) {
      const name = attribute.name.toLowerCase();
      if (child.tagName === "A" && name === "href") {
        const value = attribute.value.trim();
        if (!/^(https?:|mailto:)/i.test(value)) child.removeAttribute(attribute.name);
      } else if (!allowedAttributes.has(name)) {
        child.removeAttribute(attribute.name);
      }
    }
    if (child.tagName === "A" && child.hasAttribute("href")) {
      child.setAttribute("target", "_blank");
      child.setAttribute("rel", "noopener noreferrer");
    }
    cleanElement(child);
  }
}

export function sanitizeEditorHtml(html: string): string {
  const document = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html");
  const root = document.body.firstElementChild;
  if (root === null) return "";
  cleanElement(root);
  return root.innerHTML.trim();
}

export function appendEditorHtml(currentHtml: string, reusableHtml: string): string {
  const current = sanitizeEditorHtml(currentHtml);
  const reusable = sanitizeEditorHtml(reusableHtml);
  if (current.length === 0) return reusable;
  if (reusable.length === 0) return current;
  return `${current}<p><br></p>${reusable}`;
}

export function htmlToPlainText(html: string): string {
  const document = new DOMParser().parseFromString(html, "text/html");
  for (const element of Array.from(document.querySelectorAll("br, p, div, li, tr"))) {
    element.append("\n");
  }
  return (document.body.textContent ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n");
}
