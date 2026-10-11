import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";

async function start() {
  if (import.meta.env.MODE === "demo") {
    // The public demo has no server: answer /api calls from a bundled snapshot, in the browser.
    const { createDemoFetch } = await import("./demo/api");
    const data = await (await fetch(new URL("demo-data.json", document.baseURI))).json();
    const demo = createDemoFetch(data);
    const real = window.fetch.bind(window);
    window.fetch = (input, init) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      return url.includes("/api/") ? demo(input, init) : real(input, init);
    };
  }
  createRoot(document.getElementById("root")!).render(<App />);
}

void start();