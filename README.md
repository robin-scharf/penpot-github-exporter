# Penpot GitHub Exporter

A Penpot plugin that exports assets with export profiles from the current page and uploads them directly to a GitHub repository.

## Features

- **Auto-detect exportable assets**: Finds all elements on the current page that have export profiles configured
- **ZIP export**: Exports all assets as a ZIP file in-memory
- **In-memory extraction**: Uses JSZip to extract assets without filesystem access
- **GitHub integration**: Uploads extracted assets to a specified GitHub repository path

## Workflow

1. Opens plugin UI where you configure GitHub settings
2. Scans the current page for elements with export profiles
3. Exports all found elements as a ZIP
4. Extracts assets from the ZIP in-memory
5. Uploads each asset to your specified GitHub repository

## Prerequisites

- Node.js and npm ([Download](https://nodejs.org/en/download/package-manager))
- A GitHub Personal Access Token with `repo` scope

## Installation

```bash
git clone https://github.com/robin-scharf/penpot-github-exporter.git
cd penpot-github-exporter
npm install
```

## Development

Start the development server:

```bash
npm run dev
```

The plugin will be available at `http://localhost:4400/penpot-github-exporter/`.

### Loading in Penpot

1. Open Penpot and press `Ctrl + Alt + P` to open the Plugin Manager
2. Enter the manifest URL: `http://localhost:4400/penpot-github-exporter/manifest.json`
3. Install and launch the plugin

## Configuration

In the plugin UI, you'll need to provide:

- **GitHub Owner**: Repository owner (username or organization)
- **Repository Name**: Target repository name
- **Target Path**: Path within the repo where assets will be uploaded
- **GitHub Token**: Personal Access Token with repo permissions
- **Branch**: Target branch (defaults to `main`)

## Build

```bash
npm run build
```

Build output will be in the `dist/` folder.

## Deployment

After building, deploy the contents of `dist/` to any static hosting service. See the [Penpot Deployment Guide](https://help.penpot.app/plugins/deployment/) for more details.

### Forking / Custom Deployment

If you fork this repository or deploy to a different path, update the `BASE_PATH` constant in `vite.config.ts`:

```typescript
// Change this when forking/deploying to a different path
const BASE_PATH = '/your-repo-name/';
```

This will automatically update all paths including the generated `manifest.json`.

## Technologies

- TypeScript
- Vite
- JSZip (for ZIP extraction)
- Penpot Plugin API
- GitHub Contents API

## License

MIT License - see [LICENSE](LICENSE) for details.
