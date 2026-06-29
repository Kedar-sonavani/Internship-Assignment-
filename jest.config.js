/** @type {import('jest').Config} */
module.exports = {
  projects: [
    {
      displayName: 'unit',
      testMatch: ['**/__tests__/unit/**/*.test.js'],
      testEnvironment: 'node'
    },
    {
      displayName: 'property',
      testMatch: ['**/__tests__/property/**/*.test.js'],
      testEnvironment: 'node'
    },
    {
      displayName: 'integration',
      testMatch: ['**/__tests__/integration/**/*.test.js'],
      testEnvironment: 'node',
      preset: '@shelf/jest-mongodb'
    }
  ]
};
