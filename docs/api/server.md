# HTTP REST API Reference: `paper-drift`

`paper-drift` includes a lightweight, zero-dependency Node.js HTTP server configured with WebAssembly headers (`Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Embedder-Policy: require-corp`) and REST endpoints for direct PDF-to-Markdown conversions.

---

## Starting the Server

Start via npm daemon script:
```bash
# Run CLI daemon command
npm run serve

# Or run with custom port
npm run serve -- --port 7490
```

Run directly via CLI:
```bash
# Launch daemon on default port (3000 or $PORT)
paper-drift serve

# Launch daemon on specific microservice port
paper-drift serve --port 7490
```

Or run via Node:
```bash
node server/server.js
```

By default, the server binds to `http://localhost:3000` (or the port defined in the `PORT` environment variable or `--port` flag). If the default port is in use, it automatically increments to the next available port.

```bash
PORT=8080 node server/server.js
```

---

## Endpoints

### 1. Health & Status Check (`/api/health`)

Lightweight monitoring and health check endpoint for microservice supervisors, Kubernetes liveness probes, and backend orchestrators.

- **URL:** `/api/health`
- **Method:** `GET` | `HEAD`
- **Headers:** `Accept: application/json`
- **Response:** `200 OK`

#### cURL Example

```bash
curl http://localhost:7490/api/health
```

#### Response (`200 OK`)

```json
{
  "status": "ok",
  "uptime": 128,
  "version": "0.1.5",
  "activeRequests": 0,
  "maxConcurrent": 4
}
```

---

### 2. Unified "All-in-One" Bundle (`/api/parse-full`)

Loads the PDF document in a single WebAssembly pass and returns a consolidated bundle: scientific metadata, GFM Markdown, reader page assets (Base64 PNG `dataUrl` and text), and RAG-ready section chunks.

- **URL:** `/api/parse-full`
- **Method:** `POST`
- **Query Parameters:**
  - `pages` (*optional*, default: `"all"`): Page range to process (e.g. `pages=1`, `pages=1-5`).
  - `scale` (*optional*, default: `1.5`): Render scale for page image data URLs.
  - `images` (*optional*, default: `"true"`): Set to `"false"` to omit page `dataUrl` generation for pure text/metadata speed.
- **Headers:**
  - `Content-Type`: `application/pdf` (or `application/octet-stream`)
- **Body:** Raw PDF binary buffer (up to 50 MB)

#### cURL Example

```bash
curl -X POST "http://localhost:3000/api/parse-full?pages=1-2" \
  -H "Content-Type: application/pdf" \
  --data-binary "@paper.pdf"
```

#### Response (`200 OK`)

```json
{
  "success": true,
  "metadata": {
    "title": "Attention Is All You Need",
    "authors": ["Ashish Vaswani", "Noam Shazeer"],
    "abstract": "The dominant sequence transduction models...",
    "doi": null,
    "arxiv_id": "1706.03762"
  },
  "markdown": "# Attention Is All You Need\n\n## 1 Introduction...",
  "pages": [
    {
      "pageNumber": 1,
      "width": 612,
      "height": 792,
      "dataUrl": "data:image/png;base64,iVBORw0KGgoAAA...",
      "text": "..."
    }
  ],
  "sections": [
    { "title": "Introduction", "level": 1, "page": 1, "content": "..." },
    { "title": "Model Architecture", "level": 1, "page": 2, "content": "..." }
  ]
}
```

---

### 2. Native Semantic Chunking for RAG (`/api/chunk-rag`)

Slices an uploaded PDF into semantic, citation-grounded RAG chunks using `paper-drift`'s spatial AST and vector table detector. Guarantees that math formulas (`$$ ... $$`) and GFM pipe tables are never split down the middle.

- **URL:** `/api/chunk-rag`
- **Method:** `POST`
- **Query Parameters:**
  - `pages` (*optional*, default: `"all"`): Page range to process (e.g. `pages=1-5`).
  - `max_chunk_chars` (*optional*, default: `1500`): Maximum character threshold per chunk (must be > 50).
- **Headers:**
  - `Content-Type`: `application/pdf` (or `application/octet-stream`)
- **Body:** Raw PDF binary buffer (up to 50 MB)

#### cURL Example

```bash
curl -X POST "http://localhost:3000/api/chunk-rag?max_chunk_chars=1200&pages=1-4" \
  -H "Content-Type: application/pdf" \
  --data-binary "@paper.pdf"
```

#### Response (`200 OK`)

```json
[
  {
    "chunk_id": "chunk-1",
    "section": "3.2 Multi-Head Attention",
    "page": 4,
    "content": "Multi-head attention allows the model to jointly attend to information...\n\n$$\\text{MultiHead}(Q, K, V) = \\text{Concat}(\\text{head}_1, \\dots, \\text{head}_h)W^O$$",
    "has_math": true,
    "has_table": false
  }
]
```

---

### 3. Direct PDF to Markdown Conversion (`/api/convert-markdown`)

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
| `400 Bad Request` | Invalid query parameter (e.g. non-positive scale or invalid page range). | `{"success": false, "error": "Invalid scale parameter: \"-5\". Scale must be a positive number."}` |
| `405 Method Not Allowed` | Unsupported HTTP method on API endpoint (header `Allow: POST, OPTIONS`). | `{"success": false, "error": "Method Not Allowed"}` |
| `413 Payload Too Large` | PDF binary exceeds 50 MB limit. | `{"success": false, "error": "Payload too large. Maximum PDF size is 50MB."}` |
| `500 Internal Server Error` | PDF file corrupt or unhandled engine failure. | `{"success": false, "error": "cannot open document"}` |
| `503 Service Unavailable` | Maximum concurrent request capacity reached (includes `Retry-After: 5` header). | `{"success": false, "error": "Server busy: maximum concurrent parsing capacity reached. Please retry shortly."}` |
