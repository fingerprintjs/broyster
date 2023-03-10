/*
 * This file is a temporary workaround for platforms that don't support `exports` field of `package.json`.
 * More about this field: https://nodejs.org/api/packages.html#subpath-exports
 *
 * A not supporting platform is the `karma-typescript` dependency which relies on the `resolve` sub-dependency.
 * A `resolve` issue for supporting `exports`: https://github.com/browserify/resolve/issues/222
 * When the issue is resolved and `karma-typescript` updates the sub-dependency, this file should be removed.
 */

module.exports = require('./dist/index_browser')
