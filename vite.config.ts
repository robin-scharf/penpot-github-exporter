import { defineConfig, Plugin } from 'vite'
import livePreview from 'vite-live-preview'
import { writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'

// Change this when forking/deploying to a different path
const BASE_PATH = '/penpot-github-exporter/'

// Manifest content used for both dev and build
function getManifestContent(basePath: string) {
  return {
    name: 'GitHub Exporter',
    description:
      'Export assets with export profiles and upload them to a GitHub repository',
    code: `${basePath}plugin.js`,
    icon: `${basePath}icon.png`,
    permissions: ['content:read', 'allow:downloads'],
  }
}

// Plugin to generate manifest.json during build
function generateManifest(): Plugin {
  return {
    name: 'generate-manifest',
    writeBundle(options) {
      const outDir = options.dir || 'dist'
      const manifest = getManifestContent(BASE_PATH)

      mkdirSync(outDir, { recursive: true })
      writeFileSync(
        join(outDir, 'manifest.json'),
        JSON.stringify(manifest, null, 2)
      )
    },
  }
}

export default defineConfig({
  base: BASE_PATH,
  plugins: [
    livePreview({
      reload: true,
      config: {
        build: {
          sourcemap: true,
        },
      },
    }),
    generateManifest(),
  ],
  build: {
    rollupOptions: {
      input: {
        plugin: 'src/plugin.ts',
        index: './index.html',
      },
      output: {
        entryFileNames: '[name].js',
      },
    },
  },
  preview: {
    port: 4400,
    cors: true,
  },
})
