# HTTP REST API Reference: `paper-drift`

`paper-drift` includes a lightweight, zero-dependency Node.js HTTP server configured with WebAssembly headers (`Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Embedder-Policy: require-corp`) and REST endpoints for direct PDF-to-Markdown conversions.

---

## Starting the Server

Start via npm:
```bash
npm start
```

Or run directly:
```bash
node playground/server.js
```

By default, the server binds to `http://localhost:3000` (or the port defined in the `PORT` environment variable). If the port is in use, it automatically increments to the next available port.

```bash
PORT=8080 node playground/server.js
```

---

## Endpoints

### 1. Direct PDF to Markdown Conversion

Converts an uploaded PDF binary stream directly into clean, publication-grade GitHub Flavored Markdown (GFM).

- **URL:** `/api/convert-markdown`
- **Method:** `POST`
- **Query Parameters:**
  - `pages` (*optional*, default: `"all"`): Page range to process (e.g. `pages=1`, `pages=1-5`, `pages=1,3,7`).
- **Headers:**
  - `Content-Type`: `application/pdf` (or `application/octet-stream`)
- **Body:** Raw PDF binary buffer (up to 50 MB)

#### cURL Example

```bash
curl -X POST "http://localhost:3000/api/convert-markdown?pages=1-2" \
  -H "Content-Type: application/pdf" \
  --data-binary "@paper.pdf"
```

#### Node.js / Fetch Example

```javascript
import fs from 'fs';

const pdfBuffer = fs.readFileSync('research-paper.pdf');

const response = await fetch('http://localhost:3000/api/convert-markdown?pages=1-5', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/pdf'
  },
  body: pdfBuffer
});

const data = await response.json();
if (data.success) {
  console.log('Generated Markdown:\n', data.markdown);
  console.log(`Processed ${data.pagesProcessed} pages in ${data.durationMs}ms`);
  console.log(`Saved ${data.savingsPercent}% tokens vs multimodal vision.`);
} else {
  console.error('Conversion error:', data.error);
}
```

#### Response (`200 OK`)

```json
{
  "success": true,
  "markdown": "# Attention Is All You Need\n\n## 1 Introduction\n\nRecurrent neural networks...",
  "totalPages": 15,
  "pagesProcessed": 2,
  "durationMs": 84,
  "visionTokens": 3200,
  "markdownTokens": 712,
  "savingsPercent": "77.8"
}
```

#### Response Fields

| Field | Type | Description |
| :--- | :--- | :--- |
| `success` | `boolean` | `true` when conversion succeeds. |
| `markdown` | `string` | Converted GFM Markdown text with tables and section anchors. |
| `totalPages` | `number` | Total number of pages in the submitted PDF. |
| `pagesProcessed` | `number` | Number of pages converted based on the `pages` query parameter. |
| `durationMs` | `number` | Wall-clock conversion time in milliseconds. |
| `visionTokens` | `number` | Estimated token cost of processing the same pages via multimodal vision (1600 tokens/page). |
| `markdownTokens` | `number` | Estimated token count of the generated Markdown text (`length / 4`). |
| `savingsPercent` | `string` | Percentage token reduction achieved by using Markdown over vision tokens. |

---

### 2. CORS Preflight (`OPTIONS`)

The server supports CORS preflight requests from browser applications running on other origins (e.g. local dev servers on Vite, React, Next.js).

- **URL:** `/api/convert-markdown`
- **Method:** `OPTIONS`
- **Response:** `204 No Content`
  - `Access-Control-Allow-Origin: *`
  - `Access-Control-Allow-Methods: POST, OPTIONS`
  - `Access-Control-Allow-Headers: Content-Type`

---

## Error Codes

| Status Code | Description | Example Response |
| :--- | :--- | :--- |
| `413 Payload Too Large` | PDF binary exceeds 50 MB limit. | `{"success": false, "error": "Payload too large. Maximum PDF size is 50MB."}` |
| `500 Internal Server Error` | PDF file corrupt or parsing failed. | `{"success": false, "error": "cannot open document"}` |
