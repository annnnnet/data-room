module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  // Resolve @data-room/shared to its TypeScript source rather than the
  // built dist/ output, so unit tests exercise the current source and
  // don't require `packages/shared` to be built first. Node and the
  // Nest build (see package.json main/types) resolve the built dist/
  // output instead — see the packaging report for details.
  moduleNameMapper: {
    '^@data-room/shared$': '<rootDir>/../../../packages/shared/src/index.ts',
  },
  collectCoverageFrom: ['**/*.(t|j)s'],
  coverageDirectory: '../coverage',
  testEnvironment: 'node',
};
