import "./style.css";

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

// Helper functions
function showStatus(message: string, type: "info" | "success" | "error") {
  statusEl.textContent = message;
  statusEl.className = `status ${type}`;
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

// Form submission
form.addEventListener("submit", (e) => {
  e.preventDefault();

  const formData = new FormData(form);
  const config = {
    owner: formData.get("owner") as string,
    repo: formData.get("repo") as string,
    path: formData.get("path") as string || "assets",
    branch: formData.get("branch") as string || "main",
    token: formData.get("token") as string,
    commitMessage: formData.get("commit-message") as string || "Upload assets from Penpot",
  };

  // Validate
  if (!config.owner || !config.repo || !config.token) {
    showStatus("Please fill in all required fields", "error");
    return;
  }

  // Disable form during export
  exportBtn.disabled = true;
  exportBtn.textContent = "Exporting...";
  resultsEl.classList.add("hidden");

  showStatus("Starting export...", "info");
  showProgress(0, "Initializing...");

  // Send config to plugin
  parent.postMessage({ type: "start-export", config }, "*");
});

// Listen for messages from plugin.ts
window.addEventListener("message", (event) => {
  const data = event.data;

  if (data.source === "penpot") {
    // Theme change
    if (data.type === "themechange") {
      document.body.dataset.theme = data.theme;
    }
  }

  // Export progress updates
  if (data.type === "export-progress") {
    showProgress(data.percent, data.message);
  }

  // Export status updates
  if (data.type === "export-status") {
    showStatus(data.message, data.status);
  }

  // Export complete
  if (data.type === "export-complete") {
    hideProgress();
    exportBtn.disabled = false;
    exportBtn.textContent = "Export & Upload";

    if (data.success) {
      showStatus(`Successfully uploaded ${data.results.filter((r: { success: boolean }) => r.success).length} assets!`, "success");
      showResults(data.results);
    } else {
      showStatus(data.error || "Export failed", "error");
    }
  }

  // No assets found
  if (data.type === "no-assets") {
    hideProgress();
    exportBtn.disabled = false;
    exportBtn.textContent = "Export & Upload";
    showStatus("No elements with export profiles found on this page", "error");
  }
});
