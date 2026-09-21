/**
 * Layer rules (CLAUDE.md guardrail 2). Allowed imports per package are listed
 * in specs/architecture.md; everything else fails CI.
 */
const pkg = (name) => `^packages/${name}/`;
const internal = '^packages/';

const onlyMay = (from, allowed) => ({
  name: `${from}-layer`,
  severity: 'error',
  comment: `${from} may import only: ${allowed.join(', ') || 'nothing internal'}`,
  from: { path: pkg(from) },
  to: {
    path: internal,
    pathNot: [pkg(from), ...allowed.map(pkg)],
  },
});

module.exports = {
  forbidden: [
    {
      name: 'not-to-unresolvable',
      severity: 'error',
      comment: 'Imports must resolve; a package importing another it does not declare fails here',
      from: {},
      to: { couldNotResolve: true, pathNot: '\\?url$' },
    },
    { name: 'no-circular', severity: 'error', from: {}, to: { circular: true } },
    onlyMay('core', []),
    onlyMay('geom2d', ['core']),
    onlyMay('platform', []),
    onlyMay('kernel', ['core']),
    onlyMay('kernel-occt', ['kernel', 'core']),
    onlyMay('io-native', ['core']),
    onlyMay('render', ['core', 'geom2d']),
    {
      name: 'ui-uses-kernel-only-via-client',
      severity: 'error',
      comment: 'The UI reaches OCCT only through the CAD worker client (ADR 0001)',
      from: { path: pkg('app') },
      to: { path: pkg('kernel-occt'), pathNot: '^packages/kernel-occt/src/client\\.ts$' },
    },
    {
      name: 'nobody-imports-app',
      severity: 'error',
      from: { path: internal, pathNot: [pkg('app'), pkg('desktop')] },
      to: { path: pkg('app') },
    },
    {
      name: 'no-test-code-in-src',
      severity: 'error',
      from: { path: '^packages/[^/]+/src/', pathNot: '^packages/kernel/src/contract\\.ts$' },
      to: { path: '(^|/)(vitest|@playwright/test|fast-check)(/|$)', dependencyTypesNot: ['type-only'] },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '(^|/)(dist|test|node_modules)/' },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.json' },
    enhancedResolveOptions: { exportsFields: ['exports'], conditionNames: ['import', 'default'], extensions: ['.ts', '.tsx', '.js'] },
  },
};
