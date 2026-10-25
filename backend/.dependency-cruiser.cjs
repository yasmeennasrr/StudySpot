/**
 * Architecture rules, checked in CI (npm run deps:check). These keep the
 * modular monolith honest (SDS 3, SDS 11 "module boundaries erode"):
 * modules talk only through src/contracts, and the code's dependency graph
 * matches SDS Figure 2.
 * @type {import('dependency-cruiser').IConfiguration}
 */
module.exports = {
  forbidden: [
    {
      name: 'no-reaching-into-other-modules',
      severity: 'error',
      comment:
        'A module may use another module only through src/contracts (interface + token), ' +
        'plus importing its *.module.ts class in @Module({ imports }). Never import its services directly.',
      from: { path: '^src/modules/([^/]+)/' },
      to: {
        path: '^src/modules/',
        pathNot: ['^src/modules/$1/', '^src/modules/[^/]+/[^/]+[.]module[.]ts$'],
      },
    },
    {
      name: 'no-reaching-into-adapters',
      severity: 'error',
      comment: 'Modules use adapters through their contract; only the adapter *.module.ts may be imported.',
      from: { path: '^src/modules/' },
      to: { path: '^src/adapters/', pathNot: '[.]module[.]ts$' },
    },
    {
      name: 'adapters-do-not-know-modules',
      severity: 'error',
      comment: 'Adapters wrap outside services and must not depend on business modules.',
      from: { path: '^src/adapters/' },
      to: { path: '^src/modules/' },
    },
    {
      name: 'contracts-are-pure',
      severity: 'error',
      comment: 'Contracts are interfaces and tokens only; they depend on nothing else in src.',
      from: { path: '^src/contracts/' },
      to: { path: '^src/', pathNot: '^src/contracts/' },
    },
    {
      name: 'common-does-not-know-modules',
      severity: 'error',
      comment: 'Shared API-layer code (guards, filters, pipes) must not depend on a specific module.',
      from: { path: '^src/common/' },
      to: { path: '^src/(modules|adapters|db)/' },
    },
    {
      name: 'no-circular',
      severity: 'error',
      comment: 'Circular imports break NestJS module resolution and hide design problems.',
      from: {},
      to: { circular: true },
    },
    {
      name: 'no-test-code-in-src',
      severity: 'error',
      from: { path: '^src/', pathNot: '[.]spec[.]ts$' },
      to: { path: '^test/' },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '[.]spec[.]ts$' },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.json' },
    enhancedResolveOptions: { exportsFields: ['exports'], conditionNames: ['import', 'require', 'node', 'default'] },
    reporterOptions: {
      archi: {
        collapsePattern: '^src/(modules|adapters)/[^/]+|^src/(contracts|common|db|config|health)',
      },
    },
  },
};
