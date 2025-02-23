// module.exports = {
//   testEnvironment: 'node',
//   roots: ['<rootDir>/test'],
//   testMatch: ['**/*.test.ts'],
//   transform: {
//     '^.+\\.tsx?$': 'ts-jest'
//   }
// };
module.exports = {
  testEnvironment: 'node',
  verbose: true,
  collectCoverage: true,
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov'],
  testMatch: ['**/*.test.js']
};
