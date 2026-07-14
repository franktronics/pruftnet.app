import { defineConfig } from 'drizzle-kit'

export default defineConfig({
    dialect: 'sqlite',
    schema: './src/storage/schema.ts',
    out: './drizzle',
    dbCredentials: {
        url: process.env.PRUFTNET_DRIZZLE_DATABASE ?? ':memory:',
    },
})
