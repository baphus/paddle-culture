// Resolves extensionless relative imports to .ts so the pure functions under
// test can be imported directly from src/ without a build step or a
// TypeScript runner (node --test strips types natively on Node 22.6+).
//
// Also maps the few bare specifiers whose package "exports" only resolve
// through Next's webpack/turbopack aliasing (next/server, @/…), which the
// plain Node resolver cannot follow.
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);

// next/server is self-referencing itself with an implicit .js lookup that
// only works under Node's ESM rules when pointed at the explicit file.
const nextServerUrl = pathToFileURL(
  require.resolve("next/server.js"),
).href;

export async function resolve(specifier, context, next) {
  if (specifier === "next/server") return next(nextServerUrl, context);

  // "@/x" is Next's alias for "<cwd>/src/x"; rewrite it to a relative
  // specifier so the extensionless .ts lookup below applies to it too.
  if (specifier.startsWith("@/")) {
    return resolveRelative(
      `./${specifier.slice(2)}`,
      pathToFileURL(process.cwd() + "/src/").href,
      context,
      next,
    );
  }

  if (specifier.startsWith(".") || specifier.startsWith("/")) {
    return resolveRelative(specifier, context.parentURL, context, next);
  }
  return next(specifier, context);
}

async function resolveRelative(specifier, parentURL, context, next) {
  const base = parentURL ?? pathToFileURL(process.cwd() + "/");
  for (const candidate of [specifier, `${specifier}.ts`, `${specifier}/index.ts`]) {
    const url = new URL(candidate, base);
    if (url.protocol !== "file:") continue;
    if (existsSync(fileURLToPath(url)))
      return next(candidate, { ...context, parentURL: base });
  }
  return next(specifier, { ...context, parentURL: base });
}
