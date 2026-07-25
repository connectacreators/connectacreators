// Polyfill window and DOM APIs for tests in node environment
const defaultGetComputedStyle = (element?: Element) => ({
  getPropertyValue: (prop: string) => "",
});

if (typeof document === "undefined") {
  (globalThis as any).document = {
    documentElement: {},
  };
}

if (typeof window === "undefined") {
  (globalThis as any).window = {
    getComputedStyle: defaultGetComputedStyle,
  } as any;
}

// Make getComputedStyle available as a global function
if (typeof globalThis.getComputedStyle === "undefined") {
  (globalThis as any).getComputedStyle = (element?: Element) => {
    // Delegate to window.getComputedStyle so it can be mocked in tests
    return (globalThis as any).window.getComputedStyle(element);
  };
}
