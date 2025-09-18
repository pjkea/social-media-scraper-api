import js from '@eslint/js';
import globals from 'globals';

export default [
    // Base configuration
    js.configs.recommended,

    // Global settings
    {
        languageOptions: {
            globals: {
                ...globals.node,
                ...globals.es2022,
                ...globals.jest,
                ...globals.browser,
                window: 'readonly',
                document: 'readonly'
            },
            ecmaVersion: 2022,
            sourceType: 'commonjs'
        },

        // Files to lint
        files: ['src/**/*.js', 'scripts/**/*.js', 'tests/**/*.js'],

        // Custom rules
        rules: {
            // Error prevention
            'no-console': 'warn',
            'no-unused-vars': ['error', {
                argsIgnorePattern: '^_',
                varsIgnorePattern: '^_'
            }],
            'no-undef': 'error',
            'no-unreachable': 'error',

            // Code style
            'prefer-const': 'error',
            'no-var': 'error',
            'eqeqeq': ['error', 'always'],
            'curly': ['error', 'all'],

            // Node.js specific
            'no-process-exit': 'warn',
            'no-path-concat': 'error',

            // Promise handling
            'no-async-promise-executor': 'error',
            'require-atomic-updates': 'warn',

            // Best practices
            'consistent-return': 'warn',
            'default-case': 'warn',
            'dot-notation': 'warn',
            'guard-for-in': 'warn',
            'no-alert': 'error',
            'no-caller': 'error',
            'no-eval': 'error',
            'no-extend-native': 'error',
            'no-extra-bind': 'warn',
            'no-fallthrough': 'error',
            'no-floating-decimal': 'warn',
            'no-implied-eval': 'error',
            'no-lone-blocks': 'warn',
            'no-loop-func': 'warn',
            'no-multi-spaces': 'warn',
            'no-multi-str': 'warn',
            'no-new': 'warn',
            'no-new-func': 'error',
            'no-new-wrappers': 'warn',
            'no-octal-escape': 'error',
            'no-proto': 'error',
            'no-return-assign': 'error',
            'no-script-url': 'error',
            'no-self-compare': 'error',
            'no-sequences': 'error',
            'no-throw-literal': 'error',
            'no-with': 'error',
            'radix': 'warn',
            'vars-on-top': 'warn',
            'wrap-iife': ['warn', 'any'],
            'yoda': 'warn'
        }
    },

    // Test files specific configuration
    {
        files: ['tests/**/*.js', '**/*.test.js', '**/*.spec.js'],
        languageOptions: {
            globals: {
                ...globals.jest,
                describe: 'readonly',
                it: 'readonly',
                test: 'readonly',
                expect: 'readonly',
                beforeEach: 'readonly',
                afterEach: 'readonly',
                beforeAll: 'readonly',
                afterAll: 'readonly'
            }
        },
        rules: {
            // Allow console in tests
            'no-console': 'off',
            // Allow unused vars in tests (often have unused parameters)
            'no-unused-vars': ['warn', {
                argsIgnorePattern: '^_',
                varsIgnorePattern: '^_'
            }]
        }
    },

    // Script files configuration
    {
        files: ['scripts/**/*.js'],
        rules: {
            // Allow console in scripts
            'no-console': 'off',
            // Allow process.exit in scripts
            'no-process-exit': 'off'
        }
    },

    // Ignore patterns
    {
        ignores: [
            'node_modules/**',
            'coverage/**',
            'logs/**',
            'sessions/**',
            'dist/**',
            'build/**',
            '.env*',
            '*.config.js',
            'swagger.config.js'
        ]
    }
];