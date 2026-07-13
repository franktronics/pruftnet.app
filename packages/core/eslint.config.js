import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

const tsconfigRootDir = dirname(fileURLToPath(import.meta.url))

export default defineConfig([
    globalIgnores([
        'dist',
        'cpp/build/**',
        'cpp/build-*/**',
        'cpp/.mini-test/build/**',
        'src/packet-codec/generated/**',
    ]),
    {
        files: ['**/*.ts'],
        extends: [js.configs.recommended, tseslint.configs.recommended],
        languageOptions: {
            globals: globals.node,
            parserOptions: {
                tsconfigRootDir,
            },
        },
        rules: {
            'no-restricted-imports': [
                'error',
                {
                    patterns: [
                        {
                            group: ['../*'],
                            message:
                                'Use the package #alias for imports outside the current directory.',
                        },
                    ],
                },
            ],
        },
    },
])
