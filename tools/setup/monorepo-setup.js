#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🏗️  Setting up ClaudeCluster Monorepo...\n');

// Create necessary directories
const directories = [
  'packages/core/src',
  'packages/worker/src',
  'packages/driver/src',
  'packages/shared/src',
  'tools/setup',
  'tools/scripts',
  'tests',
  'tests/unit',
  'tests/integration',
  'logs',
  'data'
];

directories.forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`✅ Created directory: ${dir}`);
  }
});

// Create TypeScript configuration files
const tsConfigs = [
  {
    path: 'packages/core/tsconfig.json',
    content: fs.readFileSync('packages/core/tsconfig.json', 'utf8')
  },
  {
    path: 'packages/worker/tsconfig.json',
    content: fs.readFileSync('packages/worker/tsconfig.json', 'utf8')
  },
  {
    path: 'packages/driver/tsconfig.json',
    content: fs.readFileSync('packages/driver/tsconfig.json', 'utf8')
  },
  {
    path: 'packages/shared/tsconfig.json',
    content: `{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "resolveJsonModule": true,
    "moduleResolution": "node",
    "allowSyntheticDefaultImports": true
  },
  "include": [
    "src/**/*"
  ],
  "exclude": [
    "node_modules",
    "dist",
    "**/*.test.ts",
    "**/*.spec.ts"
  ]
}`
  }
];

tsConfigs.forEach(({ path: configPath, content }) => {
  if (!fs.existsSync(configPath)) {
    fs.writeFileSync(configPath, content);
    console.log(`✅ Created TypeScript config: ${configPath}`);
  }
});

// Create Jest configuration files
const jestConfigs = [
  {
    path: 'packages/core/jest.config.js',
    content: `module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.ts', '**/?(*.)+(spec|test).ts'],
  transform: {
    '^.+\\.ts$': 'ts-jest'
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts'
  ]
};`
  },
  {
    path: 'packages/worker/jest.config.js',
    content: `module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.ts', '**/?(*.)+(spec|test).ts'],
  transform: {
    '^.+\\.ts$': 'ts-jest'
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts'
  ]
};`
  },
  {
    path: 'packages/driver/jest.config.js',
    content: `module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.ts', '**/?(*.)+(spec|test).ts'],
  transform: {
    '^.+\\.ts$': 'ts-jest'
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts'
  ]
};`
  },
  {
    path: 'packages/shared/jest.config.js',
    content: `module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.ts', '**/?(*.)+(spec|test).ts'],
  transform: {
    '^.+\\.ts$': 'ts-jest'
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts'
  ]
};`
  }
];

jestConfigs.forEach(({ path: configPath, content }) => {
  if (!fs.existsSync(configPath)) {
    fs.writeFileSync(configPath, content);
    console.log(`✅ Created Jest config: ${configPath}`);
  }
});

// Create ESLint configuration
const eslintConfig = {
  path: '.eslintrc.js',
  content: `module.exports = {
  root: true,
  env: {
    node: true,
    es2022: true,
    jest: true
  },
  extends: [
    'eslint:recommended',
    '@typescript-eslint/recommended'
  ],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module'
  },
  plugins: ['@typescript-eslint'],
  rules: {
    '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    '@typescript-eslint/no-explicit-any': 'warn'
  },
  ignorePatterns: ['dist/', 'node_modules/', '*.js']
};`
};

if (!fs.existsSync(eslintConfig.path)) {
  fs.writeFileSync(eslintConfig.path, eslintConfig.content);
  console.log(`✅ Created ESLint config: ${eslintConfig.path}`);
}

// Create Prettier configuration
const prettierConfig = {
  path: '.prettierrc',
  content: `{
  "semi": true,
  "trailingComma": "es5",
  "singleQuote": true,
  "printWidth": 80,
  "tabWidth": 2
}`
};

if (!fs.existsSync(prettierConfig.path)) {
  fs.writeFileSync(prettierConfig.path, prettierConfig.content);
  console.log(`✅ Created Prettier config: ${prettierConfig.path}`);
}

// Create root tsconfig.json
const rootTsConfig = {
  path: 'tsconfig.json',
  content: `{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "lib": ["ES2022"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "moduleResolution": "node",
    "allowSyntheticDefaultImports": true
  },
  "references": [
    { "path": "./packages/core" },
    { "path": "./packages/worker" },
    { "path": "./packages/driver" },
    { "path": "./packages/shared" }
  ]
}`
};

if (!fs.existsSync(rootTsConfig.path)) {
  fs.writeFileSync(rootTsConfig.path, rootTsConfig.content);
  console.log(`✅ Created root TypeScript config: ${rootTsConfig.path}`);
}

// Create .gitignore entries for monorepo
const gitignoreEntries = `

# Monorepo
node_modules/
dist/
coverage/
.nyc_output/
.env
.env.*
!.env.example

# Logs
logs/
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# Runtime data
pids
*.pid
*.seed
*.pid.lock

# Coverage directory used by tools like istanbul
coverage/
*.lcov

# nyc test coverage
.nyc_output

# Dependency directories
node_modules/
jspm_packages/

# Optional npm cache directory
.npm

# Optional eslint cache
.eslintcache

# Output of 'npm pack'
*.tgz

# Yarn Integrity file
.yarn-integrity

# dotenv environment variables file
.env
.env.test

# parcel-bundler cache (https://parceljs.org/)
.cache
.parcel-cache

# next.js build output
.next

# nuxt.js build output
.nuxt

# vuepress build output
.vuepress/dist

# Serverless directories
.serverless

# FuseBox cache
.fusebox/

# DynamoDB Local files
.dynamodb/

# TernJS port file
.tern-port

# Stores VSCode versions used for testing VSCode extensions
.vscode-test
`;

// Append to existing .gitignore
fs.appendFileSync('.gitignore', gitignoreEntries);
console.log('✅ Updated .gitignore with monorepo entries');

// Create monorepo documentation
const monorepoReadme = `# ClaudeCluster Monorepo

This directory contains the monorepo setup for ClaudeCluster, an open-source orchestration framework for Claude Code.

## Structure

\`\`\`
claudecluster/
├── packages/           # Core framework packages
│   ├── core/          # Core types and interfaces
│   ├── worker/        # Worker implementation
│   ├── driver/        # Driver orchestration
│   └── shared/        # Shared utilities and config
├── tools/             # Development tools
│   ├── taskmaster/    # Task Master AI dashboard
│   ├── cli/           # Command line interface
│   └── setup/         # Setup and configuration scripts
└── docs/              # Documentation
\`\`\`

## Quick Start

1. Install dependencies:
   \`\`\`bash
   npm install
   \`\`\`

2. Build all packages:
   \`\`\`bash
   npm run build
   \`\`\`

3. Start development:
   \`\`\`bash
   npm run dev
   \`\`\`

## Available Scripts

- \`npm run build\` - Build all packages
- \`npm run dev\` - Start development mode
- \`npm run test\` - Run tests across all packages
- \`npm run lint\` - Lint all packages
- \`npm run clean\` - Clean build artifacts

## Package Management

This monorepo uses npm workspaces. Packages can depend on each other using workspace references:

\`\`\`json
{
  "dependencies": {
    "@claudecluster/core": "workspace:*"
  }
}
\`\`\`

## Development

- Each package has its own \`package.json\` and build configuration
- Shared dependencies are hoisted to the root
- TypeScript is used across all packages for type safety
- ESLint and Prettier ensure consistent code style
`;

fs.writeFileSync('MONOREPO_README.md', monorepoReadme);
console.log('✅ Created monorepo README');

console.log('\n🎉 Monorepo setup complete!');
console.log('\nNext steps:');
console.log('1. Run: npm install');
console.log('2. Run: npm run build');
console.log('3. Run: npm run dev');
console.log('\nHappy coding in your new monorepo! 🚀');
