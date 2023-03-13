/*
 * This file is a temporary workaround for TypeScript environments that don't support `exports` field of `package.json`.
 * More about this field: https://www.typescriptlang.org/docs/handbook/esm-node.html#packagejson-exports-imports-and-self-referencing
 *
 * TypeScript supports this field if the `moduleResolution` compiler option is set to `node16`,
 * which is not always possible.
 * When the default TypeScript configuration supports `node16`, this file should be removed in favor of `exports`.
 */

export * from './dist/index_browser'
