// Text imports of vendored schema files (bun: `import x from "./f.xsd" with { type: "text" }`).
declare module "*.xsd" {
  const content: string;
  export default content;
}
