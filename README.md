# Cogix Release Manager

A Cloudflare Worker for managing and serving binary releases for all Cogix products. Built with Hono and R2 for fast, global distribution.

## Features

- 🚀 **Global CDN**: Serve releases from Cloudflare's edge network
- 📦 **R2 Storage**: Cost-effective object storage for binaries
- 🎨 **Beautiful UI**: Modern, responsive download page
- 🔍 **Filtering**: Search and filter releases by product, platform, and version
- 📊 **Metadata**: Track file sizes, versions, platforms, and upload dates
- ⚡ **Fast**: Built on Cloudflare Workers for sub-50ms response times

## Project Structure

```
cogix-release/
├── src/
│   └── index.ts          # Main worker code
├── wrangler.jsonc        # Cloudflare Worker configuration
├── package.json          # Dependencies and scripts
├── .env.example          # Example environment variables
├── .gitignore           # Git ignore rules
└── README.md            # This file
```

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Create R2 Bucket

```bash
# Create production bucket
npx wrangler r2 bucket create cogix-releases

# Create preview bucket (for development)
npx wrangler r2 bucket create cogix-releases-preview
```

### 3. Configure Environment

Copy `.env.example` to `.env` and fill in your Cloudflare credentials:

```bash
cp .env.example .env
```

### 4. Update wrangler.jsonc

Update the bucket IDs in `wrangler.jsonc` if needed. The bucket names should match what you created in step 2.

## Development

Run the worker locally:

```bash
npm run dev
```

The worker will be available at `http://localhost:8787`

## Deployment

Deploy to Cloudflare Workers:

```bash
npm run deploy
```

## Uploading Releases

Releases should be uploaded to R2 with the following directory structure:

```
product/version/platform-arch/filename
```

**Examples:**
- `cogix-desktop/1.0.0/windows-x64/cogix-desktop-setup.exe`
- `cogix-eye-tracking/2.1.5/macos-arm64/cogix-eye-tracking.dmg`
- `cogix-sdk/0.9.0/linux-x64/libcogix-sdk.so`

### Using Wrangler CLI

```bash
# Upload a release file
npx wrangler r2 object put cogix-releases/cogix-desktop/1.0.0/windows-x64/setup.exe \
  --file ./path/to/setup.exe \
  --content-type application/octet-stream \
  --metadata product=cogix-desktop \
  --metadata version=1.0.0 \
  --metadata platform=windows \
  --metadata arch=x64 \
  --metadata checksum=sha256:abc123... \
  --metadata description="Desktop application installer"
```

### Using the R2 API

You can also upload programmatically using the Cloudflare R2 API or any S3-compatible client.

### Custom Metadata Fields

- `product`: Product name (e.g., "cogix-desktop")
- `version`: Semantic version (e.g., "1.0.0")
- `platform`: Platform name (e.g., "windows", "macos", "linux")
- `arch`: Architecture (e.g., "x64", "arm64")
- `checksum`: File checksum for verification (optional)
- `description`: Human-readable description (optional)

## API Endpoints

### `GET /`
Serves the download page HTML with a beautiful, responsive UI.

### `GET /api/releases`
Lists all releases as JSON.

**Response:**
```json
{
  "success": true,
  "count": 42,
  "releases": [
    {
      "key": "cogix-desktop/1.0.0/windows-x64/setup.exe",
      "size": 52428800,
      "uploaded": "2025-01-22T12:00:00.000Z",
      "metadata": {
        "product": "cogix-desktop",
        "version": "1.0.0",
        "platform": "windows",
        "arch": "x64",
        "uploadDate": "2025-01-22T12:00:00.000Z",
        "size": 52428800,
        "filename": "setup.exe",
        "checksum": "sha256:abc123...",
        "description": "Desktop application installer"
      }
    }
  ]
}
```

### `GET /api/releases/:product`
Lists releases for a specific product.

**Example:** `/api/releases/cogix-desktop`

### `GET /download/:key`
Downloads a file from R2. The key should be URL-encoded.

**Example:** `/download/cogix-desktop%2F1.0.0%2Fwindows-x64%2Fsetup.exe`

### `GET /api/stats`
Get statistics about all releases.

**Response:**
```json
{
  "success": true,
  "stats": {
    "totalReleases": 42,
    "totalSize": 2147483648,
    "totalSizeFormatted": "2 GB",
    "products": {
      "cogix-desktop": {
        "count": 15,
        "size": 786432000
      }
    },
    "platforms": {
      "windows": 15,
      "macos": 12,
      "linux": 15
    },
    "latestUpload": "2025-01-22T12:00:00.000Z"
  }
}
```

### `GET /health`
Health check endpoint.

## File Naming Conventions

For automatic metadata parsing, use this directory structure:

```
{product}/{version}/{platform}-{arch}/{filename}
```

**Examples:**
- ✅ `cogix-desktop/1.0.0/windows-x64/setup.exe`
- ✅ `cogix-eye-tracking/2.1.5/macos-arm64/installer.dmg`
- ✅ `cogix-sdk/0.9.0/linux-x64/libcogix.so`

If you use custom metadata during upload, it will override the parsed values.

## Platform Icons

The download page automatically displays platform-specific icons:

- 🪟 Windows
- 🍎 macOS / Darwin
- 🐧 Linux
- 🤖 Android
- 📱 iOS
- 💾 Other platforms

## Security Considerations

- All downloads are served with appropriate `Content-Type` and `Content-Disposition` headers
- Files are cached at the edge for 1 year (immutable releases)
- CORS is enabled for API endpoints
- No authentication required for public releases (add auth if needed for private releases)

## Performance

- **Cold start**: < 50ms
- **Response time**: < 10ms (cached at edge)
- **Global availability**: Deployed to 300+ Cloudflare locations
- **Scalability**: Automatically scales with traffic

## Monitoring

View logs and analytics:

```bash
# Tail logs in real-time
npm run tail

# View analytics in Cloudflare dashboard
# Workers & Pages → cogix-release → Analytics
```

## Customization

### Adding Authentication

To add authentication for private releases, modify `src/index.ts`:

```typescript
import { basicAuth } from 'hono/basic-auth';

// Add before routes
app.use('/download/*', basicAuth({
  username: 'your-username',
  password: 'your-password',
}));
```

### Custom Branding

Edit the HTML template in the `GET /` handler to match your brand:
- Update colors in CSS variables
- Change logo and title
- Modify footer text

### Rate Limiting

Add rate limiting using Cloudflare's rate limiting features or integrate with Durable Objects.

## Troubleshooting

### Releases not showing up
1. Check R2 bucket name in `wrangler.jsonc` matches your created bucket
2. Verify file structure follows the convention: `product/version/platform-arch/filename`
3. Check Wrangler logs: `npm run tail`

### Download links not working
1. Ensure files are in the R2 bucket: `npx wrangler r2 object list cogix-releases`
2. Check URL encoding of file paths
3. Verify R2 binding is configured correctly

### Permission errors
1. Ensure your Cloudflare API token has R2 read/write permissions
2. Check account ID in `.env` is correct

## License

MIT

## Support

For issues and questions, please open an issue in the repository or contact the Cogix team.
