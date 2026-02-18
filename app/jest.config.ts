import type { Config } from "jest";

const config: Config = {
  testEnvironment: "jsdom",
  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      {
        tsconfig: "tsconfig.json",
      },
    ],
  },
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
    "^@ptcg/common$": "<rootDir>/src/lib/ptcg-engine/index.ts",
    "^@ptcg/common/(.*)$": "<rootDir>/src/lib/ptcg-engine/$1",
  },
  testPathIgnorePatterns: [
    "<rootDir>/node_modules/",
    "<rootDir>/.next/",
    "<rootDir>/src/lib/ptcg-engine/",
    "<rootDir>/src/lib/ptcg-sets/",
  ],
  modulePathIgnorePatterns: [
    "<rootDir>/.next/",
  ],
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
};

export default config;
