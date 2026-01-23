import { Hono } from 'hono';
import { cors } from 'hono/cors';

interface Env {
  RELEASES: R2Bucket;
  ENVIRONMENT: string;
  MAX_FILE_SIZE_GB: string;
}

interface ReleaseMetadata {
  product: string;
  version: string;
  platform: string;
  arch: string;
  uploadDate: string;
  size: number;
  filename: string;
  checksum?: string;
  description?: string;
}

interface ReleaseFile {
  key: string;
  size: number;
  uploaded: Date;
  metadata: ReleaseMetadata;
}

const app = new Hono<{ Bindings: Env }>();

// Add CORS middleware
app.use('*', cors());

/**
 * Parse R2 object metadata to extract release information
 */
function parseReleaseMetadata(object: R2Object): ReleaseMetadata | null {
  try {
    // Extract metadata from custom metadata or parse from filename
    const customMetadata = object.customMetadata || {};

    // Expected format: product/version/platform-arch/filename.ext
    // Example: cogix-desktop/1.0.0/windows-x64/cogix-desktop-setup.exe
    const pathParts = object.key.split('/');

    if (pathParts.length < 4) {
      // Fallback to filename-based parsing
      const filename = object.key.split('/').pop() || object.key;
      return {
        product: customMetadata.product || 'unknown',
        version: customMetadata.version || 'unknown',
        platform: customMetadata.platform || 'unknown',
        arch: customMetadata.arch || 'unknown',
        uploadDate: object.uploaded.toISOString(),
        size: object.size,
        filename: filename,
        checksum: customMetadata.checksum,
        description: customMetadata.description,
      };
    }

    const [product, version, platformArch, ...filenameParts] = pathParts;
    const [platform, arch] = platformArch.split('-');
    const filename = filenameParts.join('/');

    return {
      product: customMetadata.product || product,
      version: customMetadata.version || version,
      platform: customMetadata.platform || platform,
      arch: customMetadata.arch || arch || 'unknown',
      uploadDate: object.uploaded.toISOString(),
      size: object.size,
      filename: filename,
      checksum: customMetadata.checksum,
      description: customMetadata.description,
    };
  } catch (error) {
    console.error('Error parsing metadata:', error);
    return null;
  }
}

/**
 * Format file size in human-readable format
 */
function formatFileSize(bytes: number): string {
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  if (bytes === 0) return '0 B';
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
}

/**
 * Get platform icon emoji
 */
function getPlatformIcon(platform: string): string {
  const platformLower = platform.toLowerCase();
  if (platformLower.includes('windows')) return '🪟';
  if (platformLower.includes('mac') || platformLower.includes('darwin')) return '🍎';
  if (platformLower.includes('linux')) return '🐧';
  if (platformLower.includes('android')) return '🤖';
  if (platformLower.includes('ios')) return '📱';
  return '💾';
}

/**
 * GET / - Serves the download page HTML
 */
app.get('/', async (c) => {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Cogix Downloads - Binary Releases</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    :root {
      /* Cogix Primary - Trust Blue */
      --primary-50: #EFF6FF;
      --primary-100: #DBEAFE;
      --primary-200: #BFDBFE;
      --primary-300: #93C5FD;
      --primary-400: #60A5FA;
      --primary-500: #3B82F6;
      --primary-600: #2563EB;
      --primary-700: #1D4ED8;
      --primary-800: #1E40AF;
      --primary-900: #1E3A8A;

      /* Cogix Secondary - Research Purple */
      --secondary-500: #A855F7;
      --secondary-600: #9333EA;
      --secondary-700: #7C3AED;
      --secondary-800: #6D28D9;

      /* Cogix Accent - Action Orange */
      --accent-400: #FB923C;
      --accent-500: #F97316;
      --accent-600: #EA580C;

      /* Neutrals - Slate */
      --neutral-50: #F8FAFC;
      --neutral-100: #F1F5F9;
      --neutral-200: #E2E8F0;
      --neutral-300: #CBD5E1;
      --neutral-400: #94A3B8;
      --neutral-500: #64748B;
      --neutral-600: #475569;
      --neutral-700: #334155;
      --neutral-800: #1E293B;
      --neutral-900: #0F172A;
      --neutral-950: #020617;

      /* Semantic */
      --success: #22C55E;
      --warning: #F59E0B;
      --destructive: #EF4444;

      /* Theme tokens */
      --background: #FFFFFF;
      --foreground: var(--neutral-900);
      --card: #FFFFFF;
      --card-foreground: var(--neutral-900);
      --border: var(--neutral-200);
      --input: var(--neutral-200);
      --ring: var(--primary-600);
      --muted: var(--neutral-100);
      --muted-foreground: var(--neutral-500);

      --radius: 0.375rem;
      --radius-lg: 0.5rem;
      --radius-xl: 0.75rem;

      --shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.05);
      --shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
      --shadow-lg: 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1);
      --shadow-xl: 0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1);
    }

    .dark {
      --background: var(--neutral-950);
      --foreground: var(--neutral-50);
      --card: var(--neutral-900);
      --card-foreground: var(--neutral-50);
      --border: var(--neutral-800);
      --input: var(--neutral-800);
      --ring: var(--primary-500);
      --muted: var(--neutral-800);
      --muted-foreground: var(--neutral-400);
    }

    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: var(--background);
      color: var(--foreground);
      line-height: 1.5;
      min-height: 100vh;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }

    /* Mesh gradient background */
    .mesh-bg {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      z-index: -1;
      background:
        radial-gradient(ellipse at 20% 0%, rgba(37, 99, 235, 0.08) 0%, transparent 50%),
        radial-gradient(ellipse at 80% 0%, rgba(124, 58, 237, 0.06) 0%, transparent 50%),
        radial-gradient(ellipse at 50% 100%, rgba(249, 115, 22, 0.04) 0%, transparent 50%),
        var(--background);
    }

    .container {
      max-width: 1280px;
      margin: 0 auto;
      padding: 2rem;
      position: relative;
    }

    header {
      text-align: center;
      margin-bottom: 3rem;
      padding: 3rem 0 2rem;
    }

    .logo {
      display: inline-flex;
      align-items: center;
      gap: 0.75rem;
      margin-bottom: 1rem;
    }

    .logo-icon {
      width: 48px;
      height: 48px;
      background: linear-gradient(135deg, var(--primary-600) 0%, var(--secondary-700) 100%);
      border-radius: var(--radius-lg);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.5rem;
      box-shadow: 0 0 20px rgba(37, 99, 235, 0.3);
    }

    h1 {
      font-size: 2.25rem;
      font-weight: 700;
      color: var(--foreground);
      letter-spacing: -0.025em;
    }

    .subtitle {
      color: var(--muted-foreground);
      font-size: 1rem;
      margin-top: 0.5rem;
    }

    .theme-toggle {
      position: absolute;
      top: 2rem;
      right: 2rem;
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 0.5rem;
      cursor: pointer;
      transition: all 0.2s ease;
      font-size: 1.25rem;
    }

    .theme-toggle:hover {
      background: var(--muted);
      border-color: var(--primary-500);
    }

    .filters {
      display: flex;
      gap: 1rem;
      margin-bottom: 2rem;
      flex-wrap: wrap;
      background: var(--card);
      padding: 1.5rem;
      border-radius: var(--radius-xl);
      border: 1px solid var(--border);
      box-shadow: var(--shadow-sm);
    }

    .filter-group {
      flex: 1;
      min-width: 200px;
    }

    .filter-group label {
      display: block;
      margin-bottom: 0.5rem;
      color: var(--muted-foreground);
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    select, input {
      width: 100%;
      padding: 0.625rem 0.875rem;
      background: var(--background);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      color: var(--foreground);
      font-size: 0.875rem;
      font-family: inherit;
      transition: all 0.2s ease;
    }

    select:hover, input:hover {
      border-color: var(--neutral-300);
    }

    select:focus, input:focus {
      outline: none;
      border-color: var(--primary-500);
      box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
    }

    .stats-bar {
      display: flex;
      gap: 1.5rem;
      margin-bottom: 2rem;
      padding: 1rem 1.5rem;
      background: linear-gradient(135deg, var(--primary-50) 0%, var(--neutral-50) 100%);
      border-radius: var(--radius-lg);
      border: 1px solid var(--primary-100);
    }

    .dark .stats-bar {
      background: linear-gradient(135deg, rgba(37, 99, 235, 0.1) 0%, rgba(124, 58, 237, 0.05) 100%);
      border-color: var(--primary-900);
    }

    .stat-item {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .stat-value {
      font-size: 1.25rem;
      font-weight: 700;
      color: var(--primary-600);
    }

    .dark .stat-value {
      color: var(--primary-400);
    }

    .stat-label {
      font-size: 0.75rem;
      color: var(--muted-foreground);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .loading {
      text-align: center;
      padding: 4rem;
      color: var(--muted-foreground);
    }

    .spinner {
      display: inline-block;
      width: 40px;
      height: 40px;
      border: 3px solid var(--border);
      border-top-color: var(--primary-600);
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    .error {
      background: rgba(239, 68, 68, 0.1);
      border: 1px solid rgba(239, 68, 68, 0.2);
      color: var(--destructive);
      padding: 1rem 1.5rem;
      border-radius: var(--radius-lg);
      margin: 2rem 0;
    }

    .product-section {
      margin-bottom: 2.5rem;
    }

    .product-header {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      margin-bottom: 1.25rem;
      padding-bottom: 0.75rem;
      border-bottom: 1px solid var(--border);
    }

    .product-icon {
      width: 36px;
      height: 36px;
      background: linear-gradient(135deg, var(--primary-500) 0%, var(--primary-600) 100%);
      border-radius: var(--radius);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.125rem;
    }

    .product-name {
      font-size: 1.25rem;
      font-weight: 600;
      color: var(--foreground);
    }

    .product-count {
      margin-left: auto;
      background: var(--muted);
      padding: 0.25rem 0.625rem;
      border-radius: 9999px;
      font-size: 0.75rem;
      font-weight: 500;
      color: var(--muted-foreground);
    }

    .releases-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
      gap: 1.25rem;
    }

    .release-card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: var(--radius-xl);
      padding: 1.25rem;
      transition: all 0.2s ease;
      position: relative;
    }

    .release-card:hover {
      border-color: var(--primary-300);
      box-shadow: var(--shadow-lg), 0 0 0 1px var(--primary-100);
      transform: translateY(-2px);
    }

    .dark .release-card:hover {
      border-color: var(--primary-700);
      box-shadow: var(--shadow-lg), 0 0 20px rgba(37, 99, 235, 0.1);
    }

    .release-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      margin-bottom: 0.75rem;
    }

    .release-info {
      flex: 1;
    }

    .version-badge {
      display: inline-flex;
      align-items: center;
      gap: 0.25rem;
      background: linear-gradient(135deg, var(--primary-600) 0%, var(--primary-700) 100%);
      color: white;
      padding: 0.25rem 0.625rem;
      border-radius: var(--radius);
      font-size: 0.75rem;
      font-weight: 600;
      margin-bottom: 0.5rem;
    }

    .platform-info {
      display: flex;
      align-items: center;
      gap: 0.375rem;
      color: var(--muted-foreground);
      font-size: 0.8125rem;
    }

    .platform-icon {
      font-size: 1rem;
    }

    .platform-badge {
      display: inline-flex;
      align-items: center;
      gap: 0.25rem;
      background: var(--muted);
      padding: 0.125rem 0.5rem;
      border-radius: var(--radius);
      font-size: 0.6875rem;
      font-weight: 500;
      text-transform: uppercase;
    }

    .filename {
      font-family: 'SF Mono', 'Cascadia Code', 'Fira Code', monospace;
      font-size: 0.8125rem;
      color: var(--foreground);
      margin: 0.75rem 0;
      padding: 0.625rem 0.75rem;
      background: var(--muted);
      border-radius: var(--radius);
      word-break: break-all;
      border: 1px solid var(--border);
    }

    .release-meta {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 0.5rem;
      margin-bottom: 1rem;
    }

    .meta-item {
      display: flex;
      flex-direction: column;
      gap: 0.125rem;
    }

    .meta-label {
      font-size: 0.6875rem;
      color: var(--muted-foreground);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      font-weight: 500;
    }

    .meta-value {
      font-size: 0.8125rem;
      color: var(--foreground);
      font-weight: 600;
    }

    .download-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      width: 100%;
      padding: 0.625rem 1rem;
      background: linear-gradient(135deg, var(--primary-600) 0%, var(--primary-700) 100%);
      color: white;
      text-decoration: none;
      border-radius: var(--radius);
      font-size: 0.875rem;
      font-weight: 600;
      transition: all 0.2s ease;
      border: none;
      cursor: pointer;
    }

    .download-btn:hover {
      background: linear-gradient(135deg, var(--primary-500) 0%, var(--primary-600) 100%);
      box-shadow: 0 4px 12px rgba(37, 99, 235, 0.3);
      transform: translateY(-1px);
    }

    .download-btn:active {
      transform: translateY(0);
    }

    .empty-state {
      text-align: center;
      padding: 4rem 2rem;
      color: var(--muted-foreground);
    }

    .empty-icon {
      font-size: 3rem;
      margin-bottom: 1rem;
      opacity: 0.5;
    }

    .empty-state h2 {
      font-size: 1.125rem;
      font-weight: 600;
      color: var(--foreground);
      margin-bottom: 0.5rem;
    }

    footer {
      text-align: center;
      margin-top: 4rem;
      padding: 2rem 0;
      border-top: 1px solid var(--border);
      color: var(--muted-foreground);
      font-size: 0.8125rem;
    }

    footer a {
      color: var(--primary-600);
      text-decoration: none;
    }

    footer a:hover {
      text-decoration: underline;
    }

    @media (max-width: 768px) {
      .container {
        padding: 1rem;
      }

      h1 {
        font-size: 1.75rem;
      }

      .releases-grid {
        grid-template-columns: 1fr;
      }

      .filters {
        flex-direction: column;
        padding: 1rem;
      }

      .filter-group {
        min-width: 100%;
      }

      .stats-bar {
        flex-wrap: wrap;
        gap: 1rem;
      }

      .theme-toggle {
        top: 1rem;
        right: 1rem;
      }
    }
  </style>
</head>
<body>
  <div class="mesh-bg"></div>
  <div class="container">
    <button class="theme-toggle" onclick="toggleTheme()" title="Toggle theme">🌙</button>

    <header>
      <div class="logo">
        <div class="logo-icon">🧠</div>
        <h1>Cogix Downloads</h1>
      </div>
      <p class="subtitle">Download the latest binary releases for Cogix products</p>
    </header>

    <div id="stats-container"></div>

    <div class="filters">
      <div class="filter-group">
        <label for="product-filter">Product</label>
        <select id="product-filter">
          <option value="">All Products</option>
        </select>
      </div>
      <div class="filter-group">
        <label for="platform-filter">Platform</label>
        <select id="platform-filter">
          <option value="">All Platforms</option>
        </select>
      </div>
      <div class="filter-group">
        <label for="search-filter">Search</label>
        <input type="text" id="search-filter" placeholder="Search releases...">
      </div>
    </div>

    <div id="releases-container">
      <div class="loading">
        <div class="spinner"></div>
        <p style="margin-top: 1rem;">Loading releases...</p>
      </div>
    </div>

    <footer>
      <p>© 2026 <a href="https://cogix.app">Cogix</a>. All rights reserved.</p>
      <p style="margin-top: 0.5rem; opacity: 0.7;">Powered by Cloudflare Workers & R2</p>
    </footer>
  </div>

  <script>
    let allReleases = [];
    let filteredReleases = [];

    // Theme toggle
    function toggleTheme() {
      document.body.classList.toggle('dark');
      const isDark = document.body.classList.contains('dark');
      localStorage.setItem('theme', isDark ? 'dark' : 'light');
      document.querySelector('.theme-toggle').textContent = isDark ? '☀️' : '🌙';
    }

    // Initialize theme from localStorage
    function initTheme() {
      const savedTheme = localStorage.getItem('theme');
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      if (savedTheme === 'dark' || (!savedTheme && prefersDark)) {
        document.body.classList.add('dark');
        document.querySelector('.theme-toggle').textContent = '☀️';
      }
    }

    async function loadReleases() {
      try {
        const response = await fetch('/api/releases');
        if (!response.ok) {
          throw new Error(\`HTTP \${response.status}: \${response.statusText}\`);
        }
        const data = await response.json();
        allReleases = data.releases || [];
        filteredReleases = [...allReleases];

        renderStats();
        populateFilters();
        renderReleases();
      } catch (error) {
        console.error('Error loading releases:', error);
        document.getElementById('releases-container').innerHTML = \`
          <div class="error">
            <strong>Error loading releases:</strong> \${error.message}
          </div>
        \`;
      }
    }

    function renderStats() {
      const totalSize = allReleases.reduce((sum, r) => sum + r.size, 0);
      const products = new Set(allReleases.map(r => r.metadata.product)).size;

      document.getElementById('stats-container').innerHTML = \`
        <div class="stats-bar">
          <div class="stat-item">
            <span class="stat-value">\${allReleases.length}</span>
            <span class="stat-label">Releases</span>
          </div>
          <div class="stat-item">
            <span class="stat-value">\${products}</span>
            <span class="stat-label">Products</span>
          </div>
          <div class="stat-item">
            <span class="stat-value">\${formatFileSize(totalSize)}</span>
            <span class="stat-label">Total Size</span>
          </div>
        </div>
      \`;
    }

    function populateFilters() {
      const products = new Set();
      const platforms = new Set();

      allReleases.forEach(release => {
        products.add(release.metadata.product);
        platforms.add(release.metadata.platform);
      });

      const productFilter = document.getElementById('product-filter');
      const platformFilter = document.getElementById('platform-filter');

      products.forEach(product => {
        const option = document.createElement('option');
        option.value = product;
        option.textContent = product;
        productFilter.appendChild(option);
      });

      platforms.forEach(platform => {
        const option = document.createElement('option');
        option.value = platform;
        option.textContent = platform;
        platformFilter.appendChild(option);
      });
    }

    function applyFilters() {
      const productFilter = document.getElementById('product-filter').value;
      const platformFilter = document.getElementById('platform-filter').value;
      const searchFilter = document.getElementById('search-filter').value.toLowerCase();

      filteredReleases = allReleases.filter(release => {
        const matchesProduct = !productFilter || release.metadata.product === productFilter;
        const matchesPlatform = !platformFilter || release.metadata.platform === platformFilter;
        const matchesSearch = !searchFilter ||
          release.metadata.filename.toLowerCase().includes(searchFilter) ||
          release.metadata.version.toLowerCase().includes(searchFilter) ||
          release.metadata.product.toLowerCase().includes(searchFilter);

        return matchesProduct && matchesPlatform && matchesSearch;
      });

      renderReleases();
    }

    function getProductIcon(product) {
      const p = product.toLowerCase();
      if (p.includes('app')) return '🧠';
      if (p.includes('desktop')) return '🖥️';
      if (p.includes('eye') || p.includes('tracking')) return '👁️';
      if (p.includes('sdk')) return '🔧';
      if (p.includes('model')) return '🤖';
      return '📦';
    }

    function renderReleases() {
      const container = document.getElementById('releases-container');

      if (filteredReleases.length === 0) {
        container.innerHTML = \`
          <div class="empty-state">
            <div class="empty-icon">📭</div>
            <h2>No releases found</h2>
            <p>Try adjusting your filters or check back later.</p>
          </div>
        \`;
        return;
      }

      // Group by product
      const grouped = {};
      filteredReleases.forEach(release => {
        const product = release.metadata.product;
        if (!grouped[product]) {
          grouped[product] = [];
        }
        grouped[product].push(release);
      });

      // Sort each product's releases by upload date (newest first)
      Object.keys(grouped).forEach(product => {
        grouped[product].sort((a, b) =>
          new Date(b.metadata.uploadDate) - new Date(a.metadata.uploadDate)
        );
      });

      let html = '';
      Object.keys(grouped).sort().forEach(product => {
        const releases = grouped[product];
        const productIcon = getProductIcon(product);
        html += \`
          <div class="product-section">
            <div class="product-header">
              <div class="product-icon">\${productIcon}</div>
              <h2 class="product-name">\${product}</h2>
              <span class="product-count">\${releases.length} release\${releases.length !== 1 ? 's' : ''}</span>
            </div>
            <div class="releases-grid">
              \${releases.map(release => createReleaseCard(release)).join('')}
            </div>
          </div>
        \`;
      });

      container.innerHTML = html;
    }

    function createReleaseCard(release) {
      const { metadata, size, uploaded } = release;
      const uploadDate = new Date(metadata.uploadDate).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
      const fileSize = formatFileSize(size);
      const platformIcon = getPlatformIcon(metadata.platform);

      return \`
        <div class="release-card">
          <div class="release-header">
            <div class="release-info">
              <span class="version-badge">v\${metadata.version}</span>
              <div class="platform-info">
                <span class="platform-icon">\${platformIcon}</span>
                <span>\${metadata.platform}</span>
                <span class="platform-badge">\${metadata.arch}</span>
              </div>
            </div>
          </div>
          <div class="filename">\${metadata.filename}</div>
          <div class="release-meta">
            <div class="meta-item">
              <span class="meta-label">Size</span>
              <span class="meta-value">\${fileSize}</span>
            </div>
            <div class="meta-item">
              <span class="meta-label">Uploaded</span>
              <span class="meta-value">\${uploadDate}</span>
            </div>
          </div>
          <a href="/download/\${encodeURIComponent(release.key)}" class="download-btn">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            <span>Download</span>
          </a>
        </div>
      \`;
    }

    function formatFileSize(bytes) {
      const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
      if (bytes === 0) return '0 B';
      const i = Math.floor(Math.log(bytes) / Math.log(1024));
      return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
    }

    function getPlatformIcon(platform) {
      const platformLower = platform.toLowerCase();
      if (platformLower.includes('windows')) return '🪟';
      if (platformLower.includes('mac') || platformLower.includes('darwin')) return '🍎';
      if (platformLower.includes('linux')) return '🐧';
      if (platformLower.includes('android')) return '🤖';
      if (platformLower.includes('ios')) return '📱';
      return '💾';
    }

    // Event listeners
    document.getElementById('product-filter').addEventListener('change', applyFilters);
    document.getElementById('platform-filter').addEventListener('change', applyFilters);
    document.getElementById('search-filter').addEventListener('input', applyFilters);

    // Initialize
    initTheme();
    loadReleases();
  </script>
</body>
</html>`;

  return c.html(html);
});

/**
 * GET /api/releases - Lists all releases as JSON
 */
app.get('/api/releases', async (c) => {
  try {
    const releases: ReleaseFile[] = [];

    // List all objects in the R2 bucket
    const listed = await c.env.RELEASES.list();

    for (const object of listed.objects) {
      const metadata = parseReleaseMetadata(object);

      if (metadata) {
        releases.push({
          key: object.key,
          size: object.size,
          uploaded: object.uploaded,
          metadata,
        });
      }
    }

    // Sort by upload date (newest first)
    releases.sort((a, b) => b.uploaded.getTime() - a.uploaded.getTime());

    return c.json({
      success: true,
      count: releases.length,
      releases,
    });
  } catch (error) {
    console.error('Error listing releases:', error);
    return c.json({
      success: false,
      error: 'Failed to list releases',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

/**
 * GET /api/releases/:product - Lists releases for a specific product
 */
app.get('/api/releases/:product', async (c) => {
  try {
    const product = c.req.param('product');
    const releases: ReleaseFile[] = [];

    // List objects with prefix
    const listed = await c.env.RELEASES.list({ prefix: `${product}/` });

    for (const object of listed.objects) {
      const metadata = parseReleaseMetadata(object);

      if (metadata && metadata.product === product) {
        releases.push({
          key: object.key,
          size: object.size,
          uploaded: object.uploaded,
          metadata,
        });
      }
    }

    releases.sort((a, b) => b.uploaded.getTime() - a.uploaded.getTime());

    return c.json({
      success: true,
      product,
      count: releases.length,
      releases,
    });
  } catch (error) {
    console.error('Error listing product releases:', error);
    return c.json({
      success: false,
      error: 'Failed to list product releases',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

/**
 * GET /download/:key - Proxies download from R2
 * The key parameter should be URL-encoded and can contain slashes
 */
app.get('/download/*', async (c) => {
  try {
    // Get the full path after /download/
    const key = c.req.path.substring('/download/'.length);
    const decodedKey = decodeURIComponent(key);

    console.log('Download request for key:', decodedKey);

    // Get the object from R2
    const object = await c.env.RELEASES.get(decodedKey);

    if (!object) {
      return c.json({
        success: false,
        error: 'File not found',
        key: decodedKey,
      }, 404);
    }

    // Extract filename from key
    const filename = decodedKey.split('/').pop() || 'download';

    // Set appropriate headers for download
    const headers = new Headers();
    headers.set('Content-Type', object.httpMetadata?.contentType || 'application/octet-stream');
    headers.set('Content-Length', object.size.toString());
    headers.set('Content-Disposition', `attachment; filename="${filename}"`);
    headers.set('Cache-Control', 'public, max-age=31536000'); // Cache for 1 year
    headers.set('ETag', object.httpEtag);

    // Add custom metadata as headers
    if (object.customMetadata) {
      for (const [key, value] of Object.entries(object.customMetadata)) {
        headers.set(`X-Cogix-${key}`, value);
      }
    }

    return new Response(object.body, { headers });
  } catch (error) {
    console.error('Error downloading file:', error);
    return c.json({
      success: false,
      error: 'Failed to download file',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

/**
 * GET /api/stats - Get statistics about releases
 */
app.get('/api/stats', async (c) => {
  try {
    const stats = {
      totalReleases: 0,
      totalSize: 0,
      products: {} as Record<string, { count: number; size: number }>,
      platforms: {} as Record<string, number>,
      latestUpload: null as Date | null,
    };

    const listed = await c.env.RELEASES.list();

    for (const object of listed.objects) {
      const metadata = parseReleaseMetadata(object);

      if (metadata) {
        stats.totalReleases++;
        stats.totalSize += object.size;

        // Track by product
        if (!stats.products[metadata.product]) {
          stats.products[metadata.product] = { count: 0, size: 0 };
        }
        stats.products[metadata.product].count++;
        stats.products[metadata.product].size += object.size;

        // Track by platform
        stats.platforms[metadata.platform] = (stats.platforms[metadata.platform] || 0) + 1;

        // Track latest upload
        if (!stats.latestUpload || object.uploaded > stats.latestUpload) {
          stats.latestUpload = object.uploaded;
        }
      }
    }

    return c.json({
      success: true,
      stats: {
        ...stats,
        totalSizeFormatted: formatFileSize(stats.totalSize),
      },
    });
  } catch (error) {
    console.error('Error getting stats:', error);
    return c.json({
      success: false,
      error: 'Failed to get statistics',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, 500);
  }
});

/**
 * Health check endpoint
 */
app.get('/health', (c) => {
  return c.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    environment: c.env.ENVIRONMENT,
  });
});

export default app;
