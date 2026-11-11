import { render } from "preact";
import { App } from "./app.tsx";
import "./styles.css";

void navigator.storage?.persist?.();

const root = document.getElementById("app");
if (root) render(<App />, root);
