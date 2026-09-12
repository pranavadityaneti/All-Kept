// Vite's `?raw` import: the file's text as a string, resolved at build time.
declare module '*.html?raw' {
  const text: string;
  export default text;
}
