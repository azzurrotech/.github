# Azzurro.Tech Site Structure for Bulk Upload

## Overview
This document defines the complete directory and file structure for the azzurro.tech website, optimized for bulk upload via Stenella's batch upload API.

## Directory Structure

```
azzurro.tech/
├── assets/                    # Static assets (icons, logos, etc.)
│   ├── icons/               # Product/service icons
│   │   ├── auth.png
│   │   ├── database.png
│   │   ├── data.png
│   │   └── security.png
│   └── logo.png              # Primary logo
├── data/                     # Content seed files
│   ├── products.json         # Product database seed
│   └── posts.json           # Blog posts seed
├── tests/                    # Test fixtures
│   ├── products.json        # Testing product data
│   └── posts.json          # Testing post data
├── app.js                    # Application logic (E emperor42 libraries)
├── cart.html                 # Shopping cart page
├── checkout.html             # Checkout page (VINI workflow)
├── index.html                # Homepage
├── my-account.html           # User account page
├── post.html                 # Single post page
├── posts.html                # Posts listing page
├── privacy-policy.html       # Privacy policy
├── product.html              # Product detail page
├── refund_returns.html       # Refund/returns policy
├── safe.js                   # URL safety and sanitization
├── search.html               # Search page
├── shop.html                 # Shop page
└── styles.css                # Main stylesheet
```

## File Processing Hierarchy

### 1. Application Files (App Layer)
- `app.js` - Main application logic
- `safe.js` - Content sanitization and URL validation

### 2. Static Pages
- `{page}.html` - All pages use consistent vanilla HTML structure
- All pages reference Emperor42 libraries via CDN-like loading

### 3. Static Assets
- `assets/` directory contains all binary files (PNG images)
- Logo and product icons for brand consistency

### 4. Style Assets
- `styles.css` - Centralized styling system
- Responsive design for desktop and mobile

### 5. Content Data
- `data/` folder contains JSON seed files
- Products and posts data for database seeding

## Upload Optimization

### Binary Files
- `.png`, `.jpg`, `.jpeg` - Handled as binary streams
- Encrypted at rest in SONG silo
- Fast, efficient transfer via chunked upload

### Text Files (JSON/HTML/CSS/JS)
- `.json`, `.html`, `.css`, `.js` - Processed as text
- Auto-detected encoding
- UTF-8 preserved

### File Skip Logic (for Bulk Uploads)
Files that are skipped during bulk upload:
- `legacy/` directory - Parking for obsolete files
- `data/` contents - Handled separately by deploy.sh
- `tests/` directory - Test fixtures, not in production
- `README.md` - Project documentation
- `.env`, `.env.*` - Environment configuration
- `.git/`, `.gitmodules` - Git metadata

## Bulk Upload Recommendations

### 1. Batch Processing
- Use the new `/bulk-upload` endpoint for multiple files
- Text files can be uploaded in a single request
- Binary files processed in parallel

### 2. File Organization
- Maintain the directory structure above
- Keep assets organized in `assets/` subdirectories
- Separate development and production data

### 3. Content Dependencies
- Ensure `data/` files are uploaded before site files
- Assets referenced by site templates must be present
- JavaScript libraries loaded from platform's canonical copies

## Bulk Upload API Integration

### Supported Endpoints
1. **Single Binary Upload**: `POST /api/song/silos/{client}/file`
   - Raw binary content (PNG, JPG, etc.)

2. **Single Text Upload**: `POST /api/song/silos/{client}/file`
   - JSON payload with {"path": "...", "content": "..."}

3. **Bulk Upload**: `POST /bulk-upload/{client}`
   - Array of file operations with overwrite support
   - Automatic path normalization
   - Rollback on failures

### Upload Order Recommendations
1. **Data files first** (products.json, posts.json)
2. **Static assets** (images, logos)
3. **Application files** (app.js, styles.css)
4. **HTML templates** (all pages)

## Post-Upload Verification

### File Availability
- **Static files**: Served at `/c/{client}/{path}`
- **Static site on mapped hosts**: `https://azzurro.tech/{path}`
- **Platform portal**: `/s/portal?client=azzurro-tech`

### Content Loading
- Products loaded from `/s/data/azzurro-tech/products`
- Posts loaded from `/s/data/azzurro-tech/posts`
- JavaScript libraries from `/s/static/lib/`

## Maintenance

### Regular Updates
1. **Content files**: Update `data/products.json` and `data/posts.json`
2. **Site template changes**: Update .html and .css files
3. **New assets**: Add to `assets/` directory

### Legacy Migration
- Move old files to `legacy/` directory
- Update references in deployment scripts
- Gradual phase-out of deprecated functionality

## Technical Dependencies for Bulk Upload

### Emperor42 Libraries
- **veni** - Custom element discovery and registration
- **vidi** - Post/product card rendering and pagination
- **vici** - Cookie management and client-side encryption
- **vini** - Workflow management (VINI checkout demonstration)

### Platform Integration
- All JavaScript loaded from platform's canonical copies
- Site content served via public site-data endpoint
- Cart and checkout use VINI workflows
- No framework dependencies (vanilla HTML5/CSS/ES6 JS)

## Deployment Considerations

### Production vs. Preview
- **Production**: via Stenella platform with mapped hosts
- **Local preview**: via nginx in website/Dockerfile
- **Testing**: Use test data files in `tests/` directory

### API Rate Limiting
- Bulk uploads benefit from batch processing
- File operations rate-limited by platform
- Consider parallel uploads for large sites

This structure ensures optimal bulk upload performance while maintaining the static site architecture's integrity and security requirements.