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
    const customMetadata = object.customMetadata || {};
    const pathParts = object.key.split('/');

    if (pathParts.length < 4) {
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
 * GET / - Serves the download page HTML
 */
app.get('/', async (c) => {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Cogix Downloads</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    *, *::before, *::after {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    :root {
      --primary-500: #3B82F6;
      --primary-600: #2563EB;
      --primary-700: #1D4ED8;

      --accent-400: #FB923C;
      --accent-500: #F97316;
      --accent-600: #EA580C;
      --accent-700: #C2410C;

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

      --background: #FFFFFF;
      --foreground: var(--neutral-900);
      --card: #FFFFFF;
      --border: var(--neutral-200);
      --muted: var(--neutral-100);
      --muted-foreground: var(--neutral-500);

      --radius: 0.5rem;
      --radius-lg: 0.75rem;
    }

    .dark {
      --background: var(--neutral-950);
      --foreground: var(--neutral-50);
      --card: var(--neutral-900);
      --border: var(--neutral-800);
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
    }

    .page {
      min-height: 100vh;
      display: flex;
      flex-direction: column;
    }

    .container {
      width: 100%;
      max-width: 1120px;
      margin: 0 auto;
      padding: 0 1.5rem;
    }

    /* Header */
    .header {
      border-bottom: 1px solid var(--border);
      padding: 1rem 0;
    }

    .header-inner {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .logo {
      display: flex;
      align-items: center;
      gap: 0.625rem;
      text-decoration: none;
      color: var(--foreground);
    }

    .logo-mark {
      width: 32px;
      height: 32px;
      background: linear-gradient(135deg, var(--primary-600), var(--accent-500));
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .logo-mark svg {
      width: 18px;
      height: 18px;
      color: white;
    }

    .logo-text {
      font-size: 1.125rem;
      font-weight: 600;
      letter-spacing: -0.01em;
    }

    .theme-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 36px;
      height: 36px;
      background: transparent;
      border: 1px solid var(--border);
      border-radius: var(--radius);
      cursor: pointer;
      color: var(--muted-foreground);
      transition: all 0.15s ease;
    }

    .theme-btn:hover {
      background: var(--muted);
      color: var(--foreground);
    }

    .theme-btn svg {
      width: 18px;
      height: 18px;
    }

    /* Hero */
    .hero {
      padding: 3rem 0 2rem;
      text-align: center;
    }

    .hero h1 {
      font-size: 2rem;
      font-weight: 700;
      letter-spacing: -0.025em;
      margin-bottom: 0.5rem;
    }

    .hero p {
      color: var(--muted-foreground);
      font-size: 1rem;
    }

    /* Stats */
    .stats {
      display: flex;
      justify-content: center;
      gap: 2rem;
      padding: 1.5rem 0;
      margin-bottom: 1.5rem;
      border-bottom: 1px solid var(--border);
    }

    .stat {
      text-align: center;
    }

    .stat-value {
      font-size: 1.5rem;
      font-weight: 700;
      color: var(--primary-600);
    }

    .dark .stat-value {
      color: var(--primary-500);
    }

    .stat-label {
      font-size: 0.75rem;
      color: var(--muted-foreground);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-top: 0.125rem;
    }

    /* Filters */
    .filters {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 1rem;
      margin-bottom: 2rem;
    }

    @media (max-width: 640px) {
      .filters {
        grid-template-columns: 1fr;
      }
    }

    .filter-label {
      display: block;
      font-size: 0.75rem;
      font-weight: 500;
      color: var(--muted-foreground);
      margin-bottom: 0.375rem;
      text-transform: uppercase;
      letter-spacing: 0.025em;
    }

    .filter-input {
      width: 100%;
      padding: 0.5rem 0.75rem;
      font-size: 0.875rem;
      font-family: inherit;
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      color: var(--foreground);
      transition: border-color 0.15s ease;
    }

    .filter-input:focus {
      outline: none;
      border-color: var(--primary-500);
    }

    /* Main content */
    .main {
      flex: 1;
      padding-bottom: 3rem;
    }

    /* Product section */
    .product-section {
      margin-bottom: 2.5rem;
    }

    .product-header {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      margin-bottom: 1rem;
      padding-bottom: 0.75rem;
      border-bottom: 1px solid var(--border);
    }

    .product-icon {
      width: 32px;
      height: 32px;
      background: var(--muted);
      border-radius: var(--radius);
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--muted-foreground);
    }

    .product-icon svg {
      width: 18px;
      height: 18px;
    }

    .product-name {
      font-size: 1.125rem;
      font-weight: 600;
    }

    .product-count {
      margin-left: auto;
      font-size: 0.75rem;
      color: var(--muted-foreground);
      background: var(--muted);
      padding: 0.25rem 0.5rem;
      border-radius: 9999px;
    }

    /* Release grid */
    .releases-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
      gap: 1rem;
    }

    /* Release card */
    .release-card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      padding: 1.25rem;
      transition: all 0.15s ease;
    }

    .release-card:hover {
      border-color: var(--neutral-300);
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
    }

    .dark .release-card:hover {
      border-color: var(--neutral-700);
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
    }

    .release-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 0.75rem;
    }

    .version-tag {
      display: inline-flex;
      align-items: center;
      background: var(--primary-600);
      color: white;
      font-size: 0.75rem;
      font-weight: 600;
      padding: 0.25rem 0.5rem;
      border-radius: 4px;
    }

    .platform-tag {
      display: inline-flex;
      align-items: center;
      gap: 0.375rem;
      font-size: 0.8125rem;
      color: var(--muted-foreground);
    }

    .platform-tag svg {
      width: 16px;
      height: 16px;
    }

    .arch-badge {
      font-size: 0.6875rem;
      font-weight: 500;
      text-transform: uppercase;
      background: var(--muted);
      padding: 0.125rem 0.375rem;
      border-radius: 4px;
      margin-left: 0.25rem;
    }

    .filename {
      font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
      font-size: 0.8125rem;
      color: var(--foreground);
      background: var(--muted);
      padding: 0.5rem 0.75rem;
      border-radius: var(--radius);
      margin-bottom: 0.75rem;
      word-break: break-all;
    }

    .release-meta {
      display: flex;
      gap: 1.5rem;
      margin-bottom: 1rem;
    }

    .meta-item {
      display: flex;
      flex-direction: column;
    }

    .meta-label {
      font-size: 0.6875rem;
      color: var(--muted-foreground);
      text-transform: uppercase;
      letter-spacing: 0.025em;
    }

    .meta-value {
      font-size: 0.875rem;
      font-weight: 600;
      color: var(--foreground);
    }

    /* Download button - Orange */
    .download-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      width: 100%;
      padding: 0.625rem 1rem;
      background: var(--accent-500);
      color: white;
      font-size: 0.875rem;
      font-weight: 600;
      font-family: inherit;
      text-decoration: none;
      border: none;
      border-radius: var(--radius);
      cursor: pointer;
      transition: all 0.15s ease;
    }

    .download-btn:hover {
      background: var(--accent-600);
    }

    .download-btn:active {
      background: var(--accent-700);
    }

    .download-btn svg {
      width: 16px;
      height: 16px;
    }

    /* Loading */
    .loading {
      text-align: center;
      padding: 4rem 2rem;
      color: var(--muted-foreground);
    }

    .spinner {
      width: 32px;
      height: 32px;
      border: 3px solid var(--border);
      border-top-color: var(--primary-500);
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
      margin: 0 auto 1rem;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    /* Empty state */
    .empty-state {
      text-align: center;
      padding: 4rem 2rem;
    }

    .empty-icon {
      width: 48px;
      height: 48px;
      margin: 0 auto 1rem;
      color: var(--muted-foreground);
      opacity: 0.5;
    }

    .empty-state h2 {
      font-size: 1rem;
      font-weight: 600;
      margin-bottom: 0.25rem;
    }

    .empty-state p {
      font-size: 0.875rem;
      color: var(--muted-foreground);
    }

    /* Error */
    .error {
      background: rgba(239, 68, 68, 0.1);
      border: 1px solid rgba(239, 68, 68, 0.2);
      color: #DC2626;
      padding: 1rem;
      border-radius: var(--radius);
      margin: 1rem 0;
    }

    /* Footer */
    .footer {
      border-top: 1px solid var(--border);
      padding: 1.5rem 0;
      text-align: center;
      color: var(--muted-foreground);
      font-size: 0.8125rem;
    }

    .footer a {
      color: var(--primary-600);
      text-decoration: none;
    }

    .footer a:hover {
      text-decoration: underline;
    }

    .footer-divider {
      margin: 0 0.5rem;
      opacity: 0.5;
    }
  </style>
</head>
<body>
  <div class="page">
    <header class="header">
      <div class="container header-inner">
        <a href="/" class="logo">
          <div class="logo-mark">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <circle cx="12" cy="12" r="4"/>
              <line x1="12" y1="2" x2="12" y2="4"/>
              <line x1="12" y1="20" x2="12" y2="22"/>
              <line x1="2" y1="12" x2="4" y2="12"/>
              <line x1="20" y1="12" x2="22" y2="12"/>
            </svg>
          </div>
          <span class="logo-text">Cogix</span>
        </a>
        <button class="theme-btn" onclick="toggleTheme()" title="Toggle theme" id="theme-btn">
          <svg class="icon-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
          </svg>
          <svg class="icon-sun" style="display:none" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
          </svg>
        </button>
      </div>
    </header>

    <section class="hero">
      <div class="container">
        <h1>Downloads</h1>
        <p>Get the latest Cogix releases for your platform</p>
      </div>
    </section>

    <div class="container">
      <div id="stats-container"></div>

      <div class="filters">
        <div>
          <label class="filter-label" for="product-filter">Product</label>
          <select class="filter-input" id="product-filter">
            <option value="">All Products</option>
          </select>
        </div>
        <div>
          <label class="filter-label" for="platform-filter">Platform</label>
          <select class="filter-input" id="platform-filter">
            <option value="">All Platforms</option>
          </select>
        </div>
        <div>
          <label class="filter-label" for="search-filter">Search</label>
          <input class="filter-input" type="text" id="search-filter" placeholder="Search releases...">
        </div>
      </div>
    </div>

    <main class="main">
      <div class="container">
        <div id="releases-container">
          <div class="loading">
            <div class="spinner"></div>
            <p>Loading releases...</p>
          </div>
        </div>
      </div>
    </main>

    <footer class="footer">
      <div class="container">
        <span>&copy; 2026 <a href="https://cogix.app">Cogix</a></span>
        <span class="footer-divider">|</span>
        <span>Powered by Cloudflare</span>
      </div>
    </footer>
  </div>

  <script>
    let allReleases = [];
    let filteredReleases = [];

    // SVG Icons
    const icons = {
      download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
      windows: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M0 3.449L9.75 2.1v9.451H0m10.949-9.602L24 0v11.4H10.949M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-12.9-1.801"/></svg>',
      apple: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/></svg>',
      linux: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12.504 0c-.155 0-.311.002-.465.006-.154.003-.308.01-.463.02a7.738 7.738 0 00-.473.04 6.81 6.81 0 00-.487.07c-.166.026-.33.06-.497.102a5.85 5.85 0 00-.519.147c-.176.054-.35.119-.524.194a4.93 4.93 0 00-.538.257c-.18.094-.355.2-.527.318-.172.119-.34.25-.502.396-.162.145-.318.304-.466.478a5.498 5.498 0 00-.422.56c-.137.195-.266.404-.385.626a6.344 6.344 0 00-.341.72c-.11.253-.211.517-.302.793-.09.276-.17.562-.24.858-.07.296-.128.6-.176.912-.048.312-.084.63-.108.954-.024.324-.036.652-.036.984 0 .333.012.662.036.986.024.324.06.642.108.954.048.312.107.616.176.912.07.296.15.582.24.858.091.276.192.54.302.793.11.252.222.493.341.72.12.222.248.43.385.626.137.195.277.381.422.56.148.174.304.333.466.478.162.146.33.277.502.396.172.118.347.224.527.318.18.093.356.177.538.257.174.075.348.14.524.194.167.052.331.086.497.102.166.034.327.06.487.07.16.01.314.017.463.02.154.004.31.006.465.006.155 0 .311-.002.465-.006.155-.003.309-.01.463-.02.16-.01.321-.036.487-.07.166-.016.33-.05.497-.102.176-.054.35-.119.524-.194.182-.08.358-.164.538-.257.18-.094.355-.2.527-.318.172-.119.34-.25.502-.396.162-.145.318-.304.466-.478.145-.179.285-.365.422-.56.137-.196.265-.404.385-.626.119-.227.231-.468.341-.72.11-.253.211-.517.302-.793.09-.276.17-.562.24-.858.07-.296.128-.6.176-.912.048-.312.084-.63.108-.954.024-.324.036-.653.036-.986 0-.332-.012-.66-.036-.984-.024-.324-.06-.642-.108-.954a7.755 7.755 0 00-.176-.912 6.344 6.344 0 00-.24-.858 5.85 5.85 0 00-.302-.793 5.498 5.498 0 00-.341-.72 4.93 4.93 0 00-.385-.626 4.458 4.458 0 00-.422-.56 3.976 3.976 0 00-.466-.478 3.616 3.616 0 00-.502-.396 3.38 3.38 0 00-.527-.318 3.2 3.2 0 00-.538-.257 3.126 3.126 0 00-.524-.194 3.202 3.202 0 00-.497-.102 3.62 3.62 0 00-.487-.07 4.468 4.468 0 00-.463-.02 7.738 7.738 0 00-.465-.006zM8.072 15.933c.153.043.31.078.467.106.158.028.316.049.474.063.158.014.315.02.473.02.157 0 .315-.006.473-.02.158-.014.316-.035.474-.063.157-.028.314-.063.467-.106.153-.043.302-.095.447-.154.145-.059.285-.127.42-.202.135-.075.264-.16.387-.251.123-.091.24-.192.35-.3.11-.11.212-.226.305-.35.094-.123.178-.253.254-.388.075-.135.142-.275.2-.42.06-.145.11-.294.153-.447.043-.153.078-.31.106-.467.028-.158.049-.316.063-.474.014-.158.02-.315.02-.473 0-.157-.006-.315-.02-.473a3.976 3.976 0 00-.063-.474 3.2 3.2 0 00-.106-.467 2.894 2.894 0 00-.154-.447 2.613 2.613 0 00-.2-.42 2.358 2.358 0 00-.253-.387 2.134 2.134 0 00-.306-.35 1.935 1.935 0 00-.35-.306 1.763 1.763 0 00-.386-.252 1.618 1.618 0 00-.42-.2 1.5 1.5 0 00-.448-.154 1.405 1.405 0 00-.467-.106 1.332 1.332 0 00-.474-.063c-.157 0-.315.02-.473.063-.158.028-.31.063-.467.106-.153.043-.302.095-.447.154-.145.059-.285.127-.42.2-.135.076-.264.161-.387.253-.123.091-.24.192-.35.305-.11.11-.212.227-.305.35-.094.124-.178.253-.254.388-.075.135-.142.275-.2.42-.06.145-.11.294-.153.447-.043.153-.078.31-.106.467-.028.158-.049.316-.063.474-.014.158-.02.316-.02.473 0 .158.006.315.02.473.014.158.035.316.063.474.028.157.063.314.106.467.043.153.094.302.154.447.058.145.125.285.2.42.075.135.159.265.253.388.093.123.195.24.305.35.11.108.227.209.35.3.123.091.252.176.387.25.135.076.275.144.42.203.145.059.294.111.447.154z"/></svg>',
      package: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16.5 9.4l-9-5.19M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>',
      box: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/></svg>'
    };

    function toggleTheme() {
      document.body.classList.toggle('dark');
      const isDark = document.body.classList.contains('dark');
      localStorage.setItem('theme', isDark ? 'dark' : 'light');
      updateThemeIcon(isDark);
    }

    function updateThemeIcon(isDark) {
      document.querySelector('.icon-moon').style.display = isDark ? 'none' : 'block';
      document.querySelector('.icon-sun').style.display = isDark ? 'block' : 'none';
    }

    function initTheme() {
      const saved = localStorage.getItem('theme');
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      const isDark = saved === 'dark' || (!saved && prefersDark);
      if (isDark) document.body.classList.add('dark');
      updateThemeIcon(isDark);
    }

    async function loadReleases() {
      try {
        const res = await fetch('/api/releases');
        if (!res.ok) throw new Error('Failed to load releases');
        const data = await res.json();
        allReleases = data.releases || [];
        filteredReleases = [...allReleases];
        renderStats();
        populateFilters();
        renderReleases();
      } catch (err) {
        document.getElementById('releases-container').innerHTML =
          '<div class="error">Failed to load releases. Please try again later.</div>';
      }
    }

    function renderStats() {
      if (allReleases.length === 0) {
        document.getElementById('stats-container').innerHTML = '';
        return;
      }
      const totalSize = allReleases.reduce((s, r) => s + r.size, 0);
      const products = new Set(allReleases.map(r => r.metadata.product)).size;
      document.getElementById('stats-container').innerHTML = \`
        <div class="stats">
          <div class="stat">
            <div class="stat-value">\${allReleases.length}</div>
            <div class="stat-label">Releases</div>
          </div>
          <div class="stat">
            <div class="stat-value">\${products}</div>
            <div class="stat-label">Products</div>
          </div>
          <div class="stat">
            <div class="stat-value">\${formatFileSize(totalSize)}</div>
            <div class="stat-label">Total Size</div>
          </div>
        </div>
      \`;
    }

    function populateFilters() {
      const products = [...new Set(allReleases.map(r => r.metadata.product))].sort();
      const platforms = [...new Set(allReleases.map(r => r.metadata.platform))].sort();

      const productSelect = document.getElementById('product-filter');
      const platformSelect = document.getElementById('platform-filter');

      products.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p;
        opt.textContent = p;
        productSelect.appendChild(opt);
      });

      platforms.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p;
        opt.textContent = p.charAt(0).toUpperCase() + p.slice(1);
        platformSelect.appendChild(opt);
      });
    }

    function applyFilters() {
      const product = document.getElementById('product-filter').value;
      const platform = document.getElementById('platform-filter').value;
      const search = document.getElementById('search-filter').value.toLowerCase();

      filteredReleases = allReleases.filter(r => {
        const matchProduct = !product || r.metadata.product === product;
        const matchPlatform = !platform || r.metadata.platform === platform;
        const matchSearch = !search ||
          r.metadata.filename.toLowerCase().includes(search) ||
          r.metadata.version.toLowerCase().includes(search) ||
          r.metadata.product.toLowerCase().includes(search);
        return matchProduct && matchPlatform && matchSearch;
      });
      renderReleases();
    }

    function getPlatformIcon(platform) {
      const p = platform.toLowerCase();
      if (p.includes('windows')) return icons.windows;
      if (p.includes('mac') || p.includes('darwin') || p.includes('apple')) return icons.apple;
      if (p.includes('linux')) return icons.linux;
      return icons.package;
    }

    function renderReleases() {
      const container = document.getElementById('releases-container');

      if (filteredReleases.length === 0) {
        container.innerHTML = \`
          <div class="empty-state">
            <div class="empty-icon">\${icons.box}</div>
            <h2>No releases found</h2>
            <p>Try adjusting your filters or check back later.</p>
          </div>
        \`;
        return;
      }

      const grouped = {};
      filteredReleases.forEach(r => {
        const p = r.metadata.product;
        if (!grouped[p]) grouped[p] = [];
        grouped[p].push(r);
      });

      Object.keys(grouped).forEach(p => {
        grouped[p].sort((a, b) => new Date(b.metadata.uploadDate) - new Date(a.metadata.uploadDate));
      });

      let html = '';
      Object.keys(grouped).sort().forEach(product => {
        const releases = grouped[product];
        html += \`
          <div class="product-section">
            <div class="product-header">
              <div class="product-icon">\${icons.package}</div>
              <h2 class="product-name">\${product}</h2>
              <span class="product-count">\${releases.length} release\${releases.length !== 1 ? 's' : ''}</span>
            </div>
            <div class="releases-grid">
              \${releases.map(r => createReleaseCard(r)).join('')}
            </div>
          </div>
        \`;
      });

      container.innerHTML = html;
    }

    function createReleaseCard(release) {
      const { metadata, size } = release;
      const date = new Date(metadata.uploadDate).toLocaleDateString('en-US', {
        year: 'numeric', month: 'short', day: 'numeric'
      });
      const platformIcon = getPlatformIcon(metadata.platform);

      return \`
        <div class="release-card">
          <div class="release-top">
            <span class="version-tag">v\${metadata.version}</span>
            <div class="platform-tag">
              \${platformIcon}
              <span>\${metadata.platform}</span>
              <span class="arch-badge">\${metadata.arch}</span>
            </div>
          </div>
          <div class="filename">\${metadata.filename}</div>
          <div class="release-meta">
            <div class="meta-item">
              <span class="meta-label">Size</span>
              <span class="meta-value">\${formatFileSize(size)}</span>
            </div>
            <div class="meta-item">
              <span class="meta-label">Released</span>
              <span class="meta-value">\${date}</span>
            </div>
          </div>
          <a href="/download/\${encodeURIComponent(release.key)}" class="download-btn">
            \${icons.download}
            <span>Download</span>
          </a>
        </div>
      \`;
    }

    function formatFileSize(bytes) {
      const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
      if (bytes === 0) return '0 B';
      const i = Math.floor(Math.log(bytes) / Math.log(1024));
      return (bytes / Math.pow(1024, i)).toFixed(1) + ' ' + sizes[i];
    }

    document.getElementById('product-filter').addEventListener('change', applyFilters);
    document.getElementById('platform-filter').addEventListener('change', applyFilters);
    document.getElementById('search-filter').addEventListener('input', applyFilters);

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
    }, 500);
  }
});

/**
 * GET /download/* - Proxies download from R2
 */
app.get('/download/*', async (c) => {
  try {
    const key = c.req.path.substring('/download/'.length);
    const decodedKey = decodeURIComponent(key);
    const object = await c.env.RELEASES.get(decodedKey);

    if (!object) {
      return c.json({ success: false, error: 'File not found' }, 404);
    }

    const filename = decodedKey.split('/').pop() || 'download';
    const headers = new Headers();
    headers.set('Content-Type', object.httpMetadata?.contentType || 'application/octet-stream');
    headers.set('Content-Length', object.size.toString());
    headers.set('Content-Disposition', `attachment; filename="${filename}"`);
    headers.set('Cache-Control', 'public, max-age=31536000');
    headers.set('ETag', object.httpEtag);

    return new Response(object.body, { headers });
  } catch (error) {
    console.error('Error downloading file:', error);
    return c.json({ success: false, error: 'Failed to download file' }, 500);
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
    };

    const listed = await c.env.RELEASES.list();

    for (const object of listed.objects) {
      const metadata = parseReleaseMetadata(object);
      if (metadata) {
        stats.totalReleases++;
        stats.totalSize += object.size;

        if (!stats.products[metadata.product]) {
          stats.products[metadata.product] = { count: 0, size: 0 };
        }
        stats.products[metadata.product].count++;
        stats.products[metadata.product].size += object.size;
        stats.platforms[metadata.platform] = (stats.platforms[metadata.platform] || 0) + 1;
      }
    }

    return c.json({ success: true, stats });
  } catch (error) {
    console.error('Error getting stats:', error);
    return c.json({ success: false, error: 'Failed to get statistics' }, 500);
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
