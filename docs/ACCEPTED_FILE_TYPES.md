# Accepted File Types for IPFS Uploads

This document lists all file types accepted for upload to IPFS through the StarkEd platform, along with their size limits and any special considerations.

## Documents

| MIME Type | Extension | Max Size | Description |
|-----------|-----------|----------|-------------|
| `application/pdf` | .pdf | 100 MB | PDF documents |
| `application/msword` | .doc | 100 MB | Microsoft Word (legacy) |
| `application/vnd.openxmlformats-officedocument.wordprocessingml.document` | .docx | 100 MB | Microsoft Word |
| `application/vnd.ms-excel` | .xls | 100 MB | Microsoft Excel (legacy) |
| `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` | .xlsx | 100 MB | Microsoft Excel |
| `application/vnd.ms-powerpoint` | .ppt | 100 MB | Microsoft PowerPoint (legacy) |
| `application/vnd.openxmlformats-officedocument.presentationml.presentation` | .pptx | 100 MB | Microsoft PowerPoint |
| `text/plain` | .txt | 100 MB | Plain text files |
| `text/csv` | .csv | 100 MB | CSV data files |
| `text/markdown` | .md | 100 MB | Markdown documents |
| `application/rtf` | .rtf | 100 MB | Rich Text Format |

## Images

| MIME Type | Extension | Max Size | Description |
|-----------|-----------|----------|-------------|
| `image/jpeg` | .jpg, .jpeg | 50 MB | JPEG images |
| `image/png` | .png | 50 MB | PNG images |
| `image/gif` | .gif | 30 MB | GIF images |
| `image/webp` | .webp | 50 MB | WebP images |
| `image/svg+xml` | .svg | 10 MB | SVG vector graphics |
| `image/bmp` | .bmp | 50 MB | Bitmap images |
| `image/tiff` | .tiff, .tif | 100 MB | TIFF images |

## Video

| MIME Type | Extension | Max Size | Description |
|-----------|-----------|----------|-------------|
| `video/mp4` | .mp4 | 500 MB | MP4 videos |
| `video/webm` | .webm | 500 MB | WebM videos |
| `video/ogg` | .ogg | 500 MB | OGG videos |
| `video/quicktime` | .mov | 500 MB | QuickTime videos |

## Audio

| MIME Type | Extension | Max Size | Description |
|-----------|-----------|----------|-------------|
| `audio/mpeg` | .mp3 | 100 MB | MP3 audio |
| `audio/wav` | .wav | 100 MB | WAV audio |
| `audio/ogg` | .ogg | 100 MB | OGG audio |
| `audio/mp4` | .m4a | 100 MB | MP4 audio |
| `audio/flac` | .flac | 200 MB | FLAC audio |

## Code & Data

| MIME Type | Extension | Max Size | Description |
|-----------|-----------|----------|-------------|
| `application/json` | .json | 50 MB | JSON data |
| `application/xml` | .xml | 100 MB | XML data |
| `text/xml` | .xml | 100 MB | XML text |
| `text/javascript` | .js | 100 MB | JavaScript files |
| `text/html` | .html | 100 MB | HTML files |
| `text/css` | .css | 100 MB | CSS stylesheets |

## Archives

| MIME Type | Extension | Max Size | Description |
|-----------|-----------|----------|-------------|
| `application/zip` | .zip | 200 MB | ZIP archives |
| `application/x-rar-compressed` | .rar | 200 MB | RAR archives |
| `application/x-7z-compressed` | .7z | 200 MB | 7-Zip archives |
| `application/x-tar` | .tar | 200 MB | TAR archives |
| `application/gzip` | .gz, .gzip | 200 MB | GZip compressed files |

## Blocked File Types

The following file types are **never** accepted, even if disguised with a different MIME type:

- Executable files: `.exe`, `.dll`, `.so`, `.dylib`, `.scr`, `.msi`, `.com`, `.pif`, `.app`
- Scripts: `.sh`, `.bash`, `.bat`, `.cmd`, `.ps1`, `.vbs`
- Configuration hacks: `.reg`, `.jar`, `.war`

## Global Limits

- **Default maximum file size**: 100 MB (configurable via `IPFS_MAX_FILE_SIZE` env var)
- **Maximum files per request**: 10 files
- **Malware scanning**: Optional, enable via `IPFS_MALWARE_SCAN_ENABLED=true`

## Admin Bypass

Administrators with the `admin` role can bypass all file validation when
`IPFS_ADMIN_BYPASS` is set to `true` (default). Use with caution.

## Error Messages

When a file fails validation, the API returns detailed error messages including:
- The specific reason for rejection
- The allowed types for reference
- The size limit that was exceeded (both in bytes and human-readable format)
- Whether the limit was type-specific or global
- Tips for resolving the issue (e.g., splitting large files)
