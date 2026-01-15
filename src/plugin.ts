// Open the plugin UI
penpot.ui.open("GitHub Exporter", `?theme=${penpot.theme}`, {
  width: 350,
  height: 580,
});

console.log("[Plugin] GitHub Exporter plugin loaded");

// Handle messages from the UI
penpot.ui.onMessage<{ type: string }>(async (message) => {
  console.log("[Plugin] Received message:", message.type);

  if (message.type === "start-export") {
    await exportAssets();
  }
});

// Export assets and send back to UI as base64
async function exportAssets() {
  console.log("[Plugin] Starting asset export...");

  try {
    sendProgress(8, "Finding exportable elements...");

    const page = penpot.currentPage;
    if (!page) {
      penpot.ui.sendMessage({ type: "no-assets" });
      return;
    }

    // Get all shapes on the page
    const allShapes = page.findShapes();
    console.log("[Plugin] Found total shapes:", allShapes.length);

    // Filter to only those with export settings
    const nodes = allShapes.filter(shape => {
      return shape.exports && shape.exports.length > 0;
    });

    console.log("[Plugin] Shapes with exports:", nodes.length);

    if (!nodes || nodes.length === 0) {
      penpot.ui.sendMessage({ type: "no-assets" });
      return;
    }

    sendProgress(10, `Found ${nodes.length} elements with export profiles`);

    // Export each shape using its export profiles
    sendProgress(15, "Exporting assets...");

    const assets: Record<string, string> = {}; // filename -> base64
    let exportIndex = 0;
    const totalExports = nodes.reduce((sum, shape) => sum + shape.exports.length, 0);

    for (const shape of nodes) {
      for (const exportConfig of shape.exports) {
        try {
          // Export the shape with its configured settings
          const exportData = await shape.export(exportConfig);

          if (exportData) {
            // Generate filename from shape name and export config
            const suffix = exportConfig.suffix || "";
            const scale = exportConfig.scale || 1;
            const type = exportConfig.type || "png";
            const scaleSuffix = scale !== 1 ? `@${scale}x` : "";
            const filename = `${sanitizeFilename(shape.name)}${suffix}${scaleSuffix}.${type}`;

            // Convert to base64
            assets[filename] = uint8ArrayToBase64(exportData);
            console.log("[Plugin] Exported:", filename, "size:", exportData.length);
          }
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : "Unknown error";
          console.log("[Plugin] Export error for", shape.name, ":", errorMsg);
          // Continue with other exports instead of failing completely
        }

        exportIndex++;
        const percent = 15 + (exportIndex / totalExports) * 30;
        sendProgress(percent, `Exporting ${exportIndex}/${totalExports}: ${shape.name}`);
      }
    }

    if (Object.keys(assets).length === 0) {
      penpot.ui.sendMessage({ type: "no-assets" });
      return;
    }

    sendProgress(48, `Exported ${Object.keys(assets).length} files`);
    console.log("[Plugin] Total assets exported:", Object.keys(assets).length);

    // Send assets back to UI for upload (UI handles GitHub API to avoid sandbox restrictions)
    penpot.ui.sendMessage({
      type: "assets-ready",
      assets,
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.log("[Plugin] Export error:", errorMessage);
    penpot.ui.sendMessage({ type: "no-assets" });
  }
}

// Sanitize filename to be safe for file systems and URLs
function sanitizeFilename(name: string): string {
  return name
    .replace(/[<>:"/\\|?*]/g, "_")
    .replace(/\s+/g, "_")
    .toLowerCase();
}

// Base64 encoding without btoa (not available in plugin sandbox)
function uint8ArrayToBase64(bytes: Uint8Array): string {
  const base64Chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let result = "";
  const len = bytes.length;

  for (let i = 0; i < len; i += 3) {
    const b1 = bytes[i];
    const b2 = i + 1 < len ? bytes[i + 1] : 0;
    const b3 = i + 2 < len ? bytes[i + 2] : 0;

    result += base64Chars[b1 >> 2];
    result += base64Chars[((b1 & 0x03) << 4) | (b2 >> 4)];
    result += i + 1 < len ? base64Chars[((b2 & 0x0f) << 2) | (b3 >> 6)] : "=";
    result += i + 2 < len ? base64Chars[b3 & 0x3f] : "=";
  }

  return result;
}

// Helper to send progress updates
function sendProgress(percent: number, message: string) {
  penpot.ui.sendMessage({
    type: "export-progress",
    percent,
    message,
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

console.log("[Plugin] Plugin initialization complete");
