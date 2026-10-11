// Loaded before every test file. UI tests wait for the DOM with testing-library's `findBy*` / `waitFor`;
// their 1 s default is too tight when the machine is also running a crawler and OpenSearch.
export {}; // a module, so top-level await is allowed

if (typeof document !== "undefined") {
  const { configure } = await import("@testing-library/react");
  configure({ asyncUtilTimeout: 5000 });
}
