/** @type {import('jest').Config} */
module.exports = {
  projects: [
    {
      displayName: 'unit',
      testMatch: ['<rootDir>/src/__tests__/unit/**/*.test.js'],
      testEnvironment: 'node'
    },
    {
      displayName: 'property',
      testMatch: ['<rootDir>/src/__tests__/property/**/*.test.js'],
      testEnvironment: 'node'
    },
    {
      displayName: 'integration',
      testMatch: ['<rootDir>/src/__tests__/integration/**/*.test.js'],
      testEnvironment: 'node',
      preset: '@shelf/jest-mongodb'
    }
  ]
};
