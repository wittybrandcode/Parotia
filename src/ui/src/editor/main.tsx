import { createRoot } from "react-dom/client";
import { EditorApp } from "./EditorApp";
import "./editor.css";

const container = document.getElementById("root");
if (container) {
  createRoot(container).render(<EditorApp />);
}
