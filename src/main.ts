import "./style.css";

console.log("[UI] GitHub Exporter UI loaded");

// Get the current theme from the URL
const searchParams = new URLSearchParams(window.location.search);
document.body.dataset.theme = searchParams.get("theme") ?? "light";

// DOM Elements
const form = document.getElementById("config-form") as HTMLFormElement;
const exportBtn = document.getElementById("export-btn") as HTMLButtonElement;
const statusEl = document.getElementById("status") as HTMLDivElement;
const progressEl = document.getElementById("progress") as HTMLDivElement;
const progressBar = progressEl.querySelector(".progress-bar") as HTMLDivElement;
const progressText = progressEl.querySelector(".progress-text") as HTMLSpanElement;
const resultsEl = document.getElementById("results") as HTMLDivElement;

// Store config for GitHub uploads
let githubConfig: {
  owner: string;
  repo: string;
  path: string;
  branch: string;
  token: string;
  commitMessage: string;
} | null = null;

// Helper functions
function showStatus(message: string, type: "info" | "success" | "error") {
  statusEl.textContent = message;
  statusEl.className = `status ${type}`;
  console.log(`[UI] Status (${type}):`, message);
}

function showProgress(percent: number, text?: string) {
  progressEl.classList.remove("hidden");
  progressBar.style.width = `${percent}%`;
  progressText.textContent = text || `${Math.round(percent)}%`;
}

function hideProgress() {
  progressEl.classList.add("hidden");
}

function showResults(results: { path: string; success: boolean; error?: string }[]) {
  const successful = results.filter((r) => r.success);
  const failed = results.filter((r) => !r.success);

  let html = `<h3>Upload Results</h3>`;
  html += `<p>${successful.length} succeeded, ${failed.length} failed</p>`;
  html += `<ul>`;
  results.forEach((r) => {
    if (r.success) {
      html += `<li class="success">✓ ${r.path}</li>`;
    } else {
      html += `<li class="error">✗ ${r.path}: ${r.error}</li>`;
    }
  });
  html += `</ul>`;

  resultsEl.innerHTML = html;
  resultsEl.classList.remove("hidden");
}

// Validate GitHub connection (done from UI to avoid sandbox restrictions)
async function validateGitHubConnection(): Promise<{ valid: boolean; error?: string }> {
  if (!githubConfig) {
    return { valid: false, error: "No configuration provided" };
  }

  const { owner, repo, branch, token } = githubConfig;

  console.log("[UI] Validating GitHub connection...");
  console.log("[UI] Token length:", token?.length);
  console.log("[UI] Token starts with:", token?.substring(0, 4));

  try {
    const headers = {
      "Authorization": `token ${token}`,
      "Accept": "application/vnd.github.v3+json",
    };

    // Test 1: Check if token is valid
    console.log("[UI] Testing token with /user endpoint...");
    const userResponse = await fetch("https://api.github.com/user", { headers });
    console.log("[UI] /user response status:", userResponse.status);

    if (!userResponse.ok) {
      const errorBody = await userResponse.text();
      console.log("[UI] /user error body:", errorBody);
      if (userResponse.status === 401) {
        return { valid: false, error: "Invalid GitHub token. Please check your Personal Access Token." };
      }
      return { valid: false, error: `GitHub authentication failed: ${userResponse.status}` };
    }

    const userData = await userResponse.json();
    console.log("[UI] Authenticated as:", userData.login);

    // Test 2: Check if repo exists
    console.log("[UI] Checking repo access:", `${owner}/${repo}`);
    const repoResponse = await fetch(`https://api.github.com/repos/${owner}/${repo}`, { headers });
    console.log("[UI] /repos response status:", repoResponse.status);

    if (!repoResponse.ok) {
      if (repoResponse.status === 404) {
        return { valid: false, error: `Repository '${owner}/${repo}' not found or not accessible.` };
      }
      return { valid: false, error: `Cannot access repository: ${repoResponse.status}` };
    }

    // Test 3: Check if branch exists
    console.log("[UI] Checking branch:", branch);
    const branchResponse = await fetch(`https://api.github.com/repos/${owner}/${repo}/branches/${branch}`, { headers });
    console.log("[UI] /branches response status:", branchResponse.status);

    if (!branchResponse.ok) {
      if (branchResponse.status === 404) {
        return { valid: false, error: `Branch '${branch}' not found in repository.` };
      }
      return { valid: false, error: `Cannot access branch: ${branchResponse.status}` };
    }

    // Test 4: Check write permissions
    const repoData = await repoResponse.json();
    console.log("[UI] Repo permissions:", repoData.permissions);

    if (repoData.permissions && !repoData.permissions.push) {
      return { valid: false, error: "Token doesn't have write access to this repository." };
    }

    console.log("[UI] Connection validation passed!");
    return { valid: true };
  } catch (error) {
    console.log("[UI] Connection validation error:", error);
    return {
      valid: false,
      error: error instanceof Error ? error.message : "Connection test failed"
    };
  }
}

// Upload a single file to GitHub (done from UI to avoid sandbox restrictions)
async function uploadFileToGitHub(
  filename: string,
  base64Content: string
): Promise<{ success: boolean; error?: string }> {
  if (!githubConfig) {
    return { success: false, error: "No configuration" };
  }

  const { owner, repo, path: basePath, branch, token, commitMessage } = githubConfig;
  const targetPath = basePath ? `${basePath}/${filename}` : filename;
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${targetPath}`;

  const headers = {
    "Authorization": `token ${token}`,
    "Content-Type": "application/json",
    "Accept": "application/vnd.github.v3+json",
  };

  console.log("[UI] Uploading:", targetPath);

  try {
    // Check if file exists to get SHA for update
    let sha: string | undefined;
    try {
      const existingResponse = await fetch(`${url}?ref=${branch}`, { headers });
      if (existingResponse.ok) {
        const existingData = await existingResponse.json();
        sha = existingData.sha;
        console.log("[UI] File exists, SHA:", sha);
      }
    } catch {
      // File doesn't exist, that's fine
    }

    // Upload/Update file
    const response = await fetch(url, {
      method: "PUT",
      headers,
      body: JSON.stringify({
        message: `${commitMessage}: ${filename}`,
        content: base64Content,
        branch,
        ...(sha ? { sha } : {}),
      }),
    });

    console.log("[UI] Upload response status:", response.status);

    if (response.ok) {
      console.log("[UI] Upload success:", targetPath);
      return { success: true };
    } else {
      const errorData = await response.json();
      const errorMsg = errorData.message || `HTTP ${response.status}`;
      console.log("[UI] Upload failed:", targetPath, errorMsg);
      return { success: false, error: errorMsg };
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Unknown error";
    console.log("[UI] Upload error:", targetPath, errorMsg);
    return { success: false, error: errorMsg };
  }
}

// Form submission
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  console.log("[UI] Form submitted");

  const formData = new FormData(form);
  githubConfig = {
    owner: formData.get("owner") as string,
    repo: formData.get("repo") as string,
    path: formData.get("path") as string || "assets",
    branch: formData.get("branch") as string || "main",
    token: formData.get("token") as string,
    commitMessage: formData.get("commit-message") as string || "Upload assets from Penpot",
  };

  console.log("[UI] Config:", {
    owner: githubConfig.owner,
    repo: githubConfig.repo,
    path: githubConfig.path,
    branch: githubConfig.branch,
    tokenLength: githubConfig.token?.length || 0,
    tokenPrefix: githubConfig.token?.substring(0, 10) + "...",
    commitMessage: githubConfig.commitMessage,
  });

  // Validate
  if (!githubConfig.owner || !githubConfig.repo || !githubConfig.token) {
    showStatus("Please fill in all required fields", "error");
    return;
  }

  // Disable form during export
  exportBtn.disabled = true;
  exportBtn.textContent = "Exporting...";
  resultsEl.classList.add("hidden");

  showStatus("Validating GitHub connection...", "info");
  showProgress(2, "Validating GitHub connection...");

  // Step 1: Validate GitHub connection FROM UI (not sandbox)
  const validation = await validateGitHubConnection();
  if (!validation.valid) {
    showStatus(validation.error || "Connection validation failed", "error");
    hideProgress();
    exportBtn.disabled = false;
    exportBtn.textContent = "Export & Upload";
    return;
  }

  showProgress(5, "GitHub connection valid ✓");
  showStatus("Starting export...", "info");

  // Step 2: Tell plugin to export assets (plugin will send back base64 data)
  console.log("[UI] Sending start-export message to plugin");
  parent.postMessage({ type: "start-export" }, "*");
});

// Listen for messages from plugin.ts
window.addEventListener("message", async (event) => {
  const data = event.data;

  if (data.source === "penpot") {
    // Theme change
    if (data.type === "themechange") {
      document.body.dataset.theme = data.theme;
    }
  }

  // Plugin found no assets
  if (data.type === "no-assets") {
    console.log("[UI] No assets found");
    hideProgress();
    exportBtn.disabled = false;
    exportBtn.textContent = "Export & Upload";
    showStatus("No elements with export profiles found on this page", "error");
  }

  // Plugin sending export progress
  if (data.type === "export-progress") {
    showProgress(data.percent, data.message);
  }

  // Plugin finished exporting - now upload from UI
  if (data.type === "assets-ready") {
    console.log("[UI] Received assets from plugin:", Object.keys(data.assets).length, "files");

    const assets = data.assets as Record<string, string>; // filename -> base64 content
    const filenames = Object.keys(assets);
    const total = filenames.length;

    if (total === 0) {
      showStatus("No files to upload", "error");
      hideProgress();
      exportBtn.disabled = false;
      exportBtn.textContent = "Export & Upload";
      return;
    }

    showProgress(50, "Uploading to GitHub...");
    showStatus(`Uploading ${total} files to GitHub...`, "info");

    const results: { path: string; success: boolean; error?: string }[] = [];
    let completed = 0;

    for (const filename of filenames) {
      const base64Content = assets[filename];
      const targetPath = githubConfig?.path ? `${githubConfig.path}/${filename}` : filename;

      const result = await uploadFileToGitHub(filename, base64Content);
      results.push({ path: targetPath, ...result });

      // FAIL FAST on first error
      if (!result.success) {
        showStatus(`Upload failed: ${result.error}`, "error");
        showResults(results);
        hideProgress();
        exportBtn.disabled = false;
        exportBtn.textContent = "Export & Upload";
        return;
      }

      completed++;
      const percent = 50 + (completed / total) * 48;
      showProgress(percent, `Uploading ${completed}/${total}: ${filename}`);
    }

    // All done!
    showProgress(100, "Upload complete!");
    showStatus(`Successfully uploaded ${results.filter(r => r.success).length} assets!`, "success");
    showResults(results);

    hideProgress();
    exportBtn.disabled = false;
    exportBtn.textContent = "Export & Upload";
  }
});

console.log("[UI] Event listeners attached");
