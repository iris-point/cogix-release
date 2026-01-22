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
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    :root {
      --primary: #6366f1;
      --primary-dark: #4f46e5;
      --secondary: #8b5cf6;
      --background: #0f172a;
      --surface: #1e293b;
      --surface-light: #334155;
      --text: #f1f5f9;
      --text-muted: #94a3b8;
      --border: #334155;
      --success: #10b981;
      --warning: #f59e0b;
      --radius: 12px;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      background: var(--background);
      color: var(--text);
      line-height: 1.6;
      min-height: 100vh;
    }

    .container {
      max-width: 1200px;
      margin: 0 auto;
      padding: 2rem;
    }

    header {
      text-align: center;
      margin-bottom: 3rem;
      padding: 2rem 0;
      border-bottom: 2px solid var(--border);
    }

    h1 {
      font-size: 3rem;
      font-weight: 800;
      background: linear-gradient(135deg, var(--primary) 0%, var(--secondary) 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
      margin-bottom: 0.5rem;
    }

    .subtitle {
      color: var(--text-muted);
      font-size: 1.125rem;
    }

    .loading {
      text-align: center;
      padding: 3rem;
      color: var(--text-muted);
    }

    .spinner {
      display: inline-block;
      width: 40px;
      height: 40px;
      border: 4px solid var(--surface-light);
      border-top-color: var(--primary);
      border-radius: 50%;
      animation: spin 1s linear infinite;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    .error {
      background: rgba(239, 68, 68, 0.1);
      border: 1px solid rgba(239, 68, 68, 0.3);
      color: #fca5a5;
      padding: 1rem;
      border-radius: var(--radius);
      margin: 2rem 0;
    }

    .filters {
      display: flex;
      gap: 1rem;
      margin-bottom: 2rem;
      flex-wrap: wrap;
    }

    .filter-group {
      flex: 1;
      min-width: 200px;
    }

    .filter-group label {
      display: block;
      margin-bottom: 0.5rem;
      color: var(--text-muted);
      font-size: 0.875rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    select, input {
      width: 100%;
      padding: 0.75rem 1rem;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      color: var(--text);
      font-size: 1rem;
      transition: all 0.2s;
    }

    select:focus, input:focus {
      outline: none;
      border-color: var(--primary);
      box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
    }

    .product-section {
      margin-bottom: 3rem;
    }

    .product-header {
      display: flex;
      align-items: center;
      gap: 1rem;
      margin-bottom: 1.5rem;
      padding-bottom: 1rem;
      border-bottom: 2px solid var(--border);
    }

    .product-icon {
      font-size: 2rem;
    }

    .product-name {
      font-size: 1.75rem;
      font-weight: 700;
      color: var(--text);
    }

    .product-count {
      margin-left: auto;
      background: var(--surface-light);
      padding: 0.25rem 0.75rem;
      border-radius: 9999px;
      font-size: 0.875rem;
      color: var(--text-muted);
    }

    .releases-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
      gap: 1.5rem;
    }

    .release-card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 1.5rem;
      transition: all 0.3s ease;
      position: relative;
      overflow: hidden;
    }

    .release-card::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 3px;
      background: linear-gradient(90deg, var(--primary), var(--secondary));
      transform: scaleX(0);
      transition: transform 0.3s ease;
    }

    .release-card:hover {
      border-color: var(--primary);
      transform: translateY(-2px);
      box-shadow: 0 8px 24px rgba(99, 102, 241, 0.2);
    }

    .release-card:hover::before {
      transform: scaleX(1);
    }

    .release-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      margin-bottom: 1rem;
    }

    .release-info {
      flex: 1;
    }

    .version-badge {
      display: inline-block;
      background: var(--primary);
      color: white;
      padding: 0.25rem 0.75rem;
      border-radius: 6px;
      font-size: 0.875rem;
      font-weight: 600;
      margin-bottom: 0.5rem;
    }

    .platform-info {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      color: var(--text-muted);
      font-size: 0.875rem;
      margin-bottom: 0.5rem;
    }

    .platform-icon {
      font-size: 1.25rem;
    }

    .filename {
      font-family: 'Courier New', monospace;
      font-size: 0.875rem;
      color: var(--text);
      margin-bottom: 0.75rem;
      word-break: break-all;
    }

    .release-meta {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 0.75rem;
      margin-bottom: 1rem;
      padding: 1rem;
      background: var(--background);
      border-radius: 8px;
    }

    .meta-item {
      display: flex;
      flex-direction: column;
    }

    .meta-label {
      font-size: 0.75rem;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 0.25rem;
    }

    .meta-value {
      font-size: 0.875rem;
      color: var(--text);
      font-weight: 600;
    }

    .download-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      width: 100%;
      padding: 0.75rem 1.5rem;
      background: linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%);
      color: white;
      text-decoration: none;
      border-radius: var(--radius);
      font-weight: 600;
      transition: all 0.3s ease;
      border: none;
      cursor: pointer;
    }

    .download-btn:hover {
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(99, 102, 241, 0.4);
    }

    .download-btn:active {
      transform: translateY(0);
    }

    .empty-state {
      text-align: center;
      padding: 4rem 2rem;
      color: var(--text-muted);
    }

    .empty-icon {
      font-size: 4rem;
      margin-bottom: 1rem;
    }

    footer {
      text-align: center;
      margin-top: 4rem;
      padding: 2rem 0;
      border-top: 1px solid var(--border);
      color: var(--text-muted);
      font-size: 0.875rem;
    }

    @media (max-width: 768px) {
      .container {
        padding: 1rem;
      }

      h1 {
        font-size: 2rem;
      }

      .releases-grid {
        grid-template-columns: 1fr;
      }

      .filters {
        flex-direction: column;
      }

      .filter-group {
        min-width: 100%;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>📦 Cogix Downloads</h1>
      <p class="subtitle">Download the latest binary releases for all Cogix products</p>
    </header>

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
        <p>Loading releases...</p>
      </div>
    </div>

    <footer>
      <p>© 2026 Cogix Project. All rights reserved.</p>
      <p>Powered by Cloudflare Workers & R2</p>
    </footer>
  </div>

  <script>
    let allReleases = [];
    let filteredReleases = [];

    async function loadReleases() {
      try {
        const response = await fetch('/api/releases');
        if (!response.ok) {
          throw new Error(\`HTTP \${response.status}: \${response.statusText}\`);
        }
        const data = await response.json();
        allReleases = data.releases || [];
        filteredReleases = [...allReleases];

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
        html += \`
          <div class="product-section">
            <div class="product-header">
              <span class="product-icon">🚀</span>
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
                <span>\${metadata.platform} · \${metadata.arch}</span>
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
            <span>⬇️</span>
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

    // Load releases on page load
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
