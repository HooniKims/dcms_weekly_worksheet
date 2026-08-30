import { useLayoutEffect, useRef } from "react";
import { sanitizeEditorHtml } from "../domain/content";

function hasVisibleReportContent(node: ChildNode): boolean {
  if (node.nodeType === Node.TEXT_NODE) {
    return (node.textContent ?? "").replaceAll("\u00a0", " ").trim().length > 0;
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return false;

  const element = node as Element;
  const text = (element.textContent ?? "").replaceAll("\u00a0", " ").trim();
  return text.length > 0 || element.matches("table") || element.querySelector("table") !== null;
}

function removeTrailingEmptyNodes(container: HTMLElement): void {
  while (container.lastChild !== null && !hasVisibleReportContent(container.lastChild)) {
    container.removeChild(container.lastChild);
  }
}

export function SafeHtml({ html, className }: Readonly<{ html: string; className: string }>) {
  const containerRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (container === null) return;
    const documentFragment = new DOMParser().parseFromString(sanitizeEditorHtml(html), "text/html");
    removeTrailingEmptyNodes(documentFragment.body);
    const nodes = Array.from(documentFragment.body.childNodes).map((node) =>
      document.importNode(node, true),
    );
    container.replaceChildren(...nodes);
  }, [html]);

  return <div ref={containerRef} className={className} />;
}
