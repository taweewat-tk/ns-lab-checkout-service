/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  // coverage-gate.yml อ่าน coverage/coverage-summary.json ซึ่ง reporter ชุด
  // default ของ jest ไม่สร้างให้ ต้องขอ json-summary ตรง ๆ
  coverageReporters: ['text-summary', 'json-summary'],
  collectCoverageFrom: ['src/**/*.ts', '!src/**/__tests__/**'],
};
