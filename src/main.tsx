import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/brand.css";
import "./styles/workspace.css";
import "./styles/week-selector.css";
import "./styles/report.css";
import "./styles/print.css";

const root = document.getElementById("root");
if (root === null) throw new Error("root-element-missing");

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
