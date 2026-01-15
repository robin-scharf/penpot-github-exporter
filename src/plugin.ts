// Open the plugin UI
penpot.ui.open("GitHub Exporter", `?theme=${penpot.theme}`, {
  width: 350,
  height: 580,
});

// Store for GitHub config
let githubConfig: {
  owner: string;
  repo: string;
  path: string;
  branch: string;
  token: string;
  commitMessage: string;
} | null = null;

// Handle messages from the UI
penpot.ui.onMessage<{ type: string; config?: typeof githubConfig }>(async (message) => {
  if (message.type === "start-export") {
    githubConfig = message.config || null;
    await startExport();
  }
});

// Main export function
async function startExport() {
  if (!githubConfig) {
    sendStatus("No configuration provided", "error");
    return;
  }

  try {
    // Step 1: Find all elements with export profiles on current page
    sendProgress(5, "Finding exportable elements...");

    const page = penpot.currentPage;
    if (!page) {
      sendStatus("No active page found", "error");
      penpot.ui.sendMessage({ type: "export-complete", success: false, error: "No active page" });
      return;
    }

    const nodes = page.findAll((n) => {
      return n.exportSettings && n.exportSettings.length > 0;
    });

    if (!nodes || nodes.length === 0) {
      penpot.ui.sendMessage({ type: "no-assets" });
      return;
    }

    sendProgress(10, `Found ${nodes.length} elements with export profiles`);
    sendStatus(`Found ${nodes.length} elements to export`, "info");

    // Step 2: Export as ZIP
    sendProgress(20, "Exporting assets as ZIP...");

    const exportData = await penpot.exportAssets(nodes, {
      format: "zip",
      scale: 1,
    });

    if (!exportData) {
      sendStatus("Export failed - no data returned", "error");
      penpot.ui.sendMessage({ type: "export-complete", success: false, error: "Export failed" });
      return;
    }

    sendProgress(40, "Export complete, extracting files...");

    // Step 3: Extract ZIP using JSZip (loaded dynamically)
    const assets = await extractZip(exportData);

    if (Object.keys(assets).length === 0) {
      sendStatus("No files found in export", "error");
      penpot.ui.sendMessage({ type: "export-complete", success: false, error: "No files in ZIP" });
      return;
    }

    sendProgress(50, `Extracted ${Object.keys(assets).length} files`);

    // Step 4: Upload to GitHub
    sendProgress(55, "Uploading to GitHub...");

    const results = await uploadToGitHub(assets);

    penpot.ui.sendMessage({
      type: "export-complete",
      success: true,
      results,
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    sendStatus(`Error: ${errorMessage}`, "error");
    penpot.ui.sendMessage({
      type: "export-complete",
      success: false,
      error: errorMessage,
    });
  }
}

// Extract ZIP contents using JSZip
async function extractZip(zipData: Uint8Array): Promise<Record<string, Uint8Array>> {
  // Dynamically load JSZip from CDN
  const JSZip = await loadJSZip();
  
  const zip = await JSZip.loadAsync(zipData);
  const assets: Record<string, Uint8Array> = {};

  const files = Object.entries(zip.files);
  
  for (const [path, file] of files) {
    if (file.dir) continue;
    assets[path] = await file.async("uint8array");
  }

  return assets;
}

// Dynamically load JSZip
async function loadJSZip(): Promise<typeof import("jszip")> {
  // Check if already loaded
  if ((globalThis as Record<string, unknown>).JSZip) {
    return (globalThis as Record<string, unknown>).JSZip as typeof import("jszip");
  }

  // Load from CDN
  const response = await fetch("https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js");
  const code = await response.text();
  
  // Execute in global scope
  const fn = new Function(code + "; return JSZip;");
  const JSZip = fn();
  
  // Cache for future use
  (globalThis as Record<string, unknown>).JSZip = JSZip;
  
  return JSZip;
}

// Upload assets to GitHub
async function uploadToGitHub(
  assets: Record<string, Uint8Array>
): Promise<{ path: string; success: boolean; error?: string }[]> {
  if (!githubConfig) {
    throw new Error("No GitHub configuration");
  }

  const { owner, repo, path: basePath, branch, token, commitMessage } = githubConfig;
  const results: { path: string; success: boolean; error?: string }[] = [];
  const entries = Object.entries(assets);
  const total = entries.length;
  let completed = 0;

  for (const [filePath, data] of entries) {
    const targetPath = basePath ? `${basePath}/${filePath}` : filePath;
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${targetPath}`;

    try {
      // Convert Uint8Array to base64
      const content = uint8ArrayToBase64(data);

      // Check if file exists to get SHA for update
      let sha: string | undefined;
      try {
        const existingResponse = await fetch(`${url}?ref=${branch}`, {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/vnd.github.v3+json",
          },
        });
        if (existingResponse.ok) {
          const existingData = await existingResponse.json();
          sha = existingData.sha;
        }
      } catch {
        // File doesn't exist, that's fine
      }

      // Upload/Update file
      const response = await fetch(url, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Accept: "application/vnd.github.v3+json",
        },
        body: JSON.stringify({
          message: `${commitMessage}: ${filePath}`,
          content,
          branch,
          ...(sha ? { sha } : {}),
        }),
      });

      if (response.ok) {
        results.push({ path: targetPath, success: true });
      } else {
        const errorData = await response.json();
        results.push({
          path: targetPath,
          success: false,
          error: errorData.message || `HTTP ${response.status}`,
        });
      }
    } catch (error) {
      results.push({
        path: targetPath,
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }

    completed++;
    const percent = 55 + (completed / total) * 40;
    sendProgress(percent, `Uploading ${completed}/${total}: ${filePath}`);
  }

  sendProgress(100, "Upload complete!");
  return results;
}

// Convert Uint8Array to base64
function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = "";
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// Helper to send progress updates
function sendProgress(percent: number, message: string) {
  penpot.ui.sendMessage({
    type: "export-progress",
    percent,
    message,
  });
}

// Helper to send status updates
function sendStatus(message: string, status: "info" | "success" | "error") {
  penpot.ui.sendMessage({
    type: "export-status",
    message,
    status,
  });
}

// Listen for theme changes
penpot.on("themechange", (theme) => {
  penpot.ui.sendMessage({
    source: "penpot",
    type: "themechange",
    theme,
  });
});
