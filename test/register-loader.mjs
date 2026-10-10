// Registers the TS-resolving loader hooks (see ts-resolve-loader.mjs).
// Used by `npm test`: node --import ./test/register-loader.mjs
import { register } from "node:module";

register("./ts-resolve-loader.mjs", import.meta.url);
