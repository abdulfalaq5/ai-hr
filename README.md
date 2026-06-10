# AI-HR — HR Knowledge Agent

AI Agent for answering HR questions from PDF documents using PostgreSQL Full Text Search.

## Architecture

```
PDF Upload (POST /import)
      ↓
pdf-import.service.ts
  → Parse PDF (pdf-parse)
  → Detect BAB / PASAL / AYAT structure
  → Insert into PostgreSQL (hr_documents + hr_document_contents)
      ↓
PostgreSQL with GIN Full Text Search Index

POST /ask
      ↓
document-search.service.ts  → FTS query
      ↓
llm.service.ts              → Build context → Call LLM
      ↓
Structured answer + mandatory references
```

## API Endpoints

### `GET /health`
```json
{ "status": "healthy", "service": "ai-hr" }
```

### `POST /ask`
**Request:**
```json
{ "question": "Berapa hak cuti menikah?" }
```
**Response:**
```json
{
  "answer": "Berdasarkan Peraturan Perusahaan BAB VII Pasal 12 Ayat 1 Halaman 15\n\nKaryawan yang menikah berhak memperoleh cuti khusus selama 3 hari kerja.",
  "references": [
    {
      "document": "Peraturan Perusahaan",
      "page": 15,
      "bab": "BAB VII",
      "pasal": "Pasal 12",
      "ayat": "Ayat 1"
    }
  ]
}
```

### `POST /import`
**Request:** `multipart/form-data`
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| file | File | ya | PDF file (max 50MB) |
| documentName | string | ya | e.g., "Peraturan Perusahaan" |
| documentType | string | ya | e.g., "PP", "SOP", "Kebijakan" |
| version | string | tidak | e.g., "2024-v1" |
| effectiveDate | string | tidak | YYYY-MM-DD |
| saveFile | string | tidak | "true" to persist PDF to disk |

**Response:**
```json
{
  "success": true,
  "documentId": "uuid-here",
  "documentName": "Peraturan Perusahaan",
  "pageCount": 42,
  "sectionsImported": 187
}
```

## Setup

```bash
# 1. Install dependencies
pnpm install   # or: npm install

# 2. Configure environment
cp .env.example .env
nano .env

# 3. Run migrations (build first)
npm run build
npm run migrate:latest

# 4. Development
npm run dev

# 5. Production (Docker)
docker compose up -d
```

## Database

- `hr_documents` — document metadata
- `hr_document_contents` — parsed sections with BAB/PASAL/AYAT structure
- GIN index on `content` for fast full text search

## Integration with AI-SPV

Register ai-hr in the ai-spv database:
```sql
INSERT INTO agent_registry (id, agent_code, agent_name, endpoint, description, enabled)
VALUES (
  gen_random_uuid(),
  'ai-hr',
  'AI HR Agent',
  'http://ai-hr:9004/ask',
  'Menjawab pertanyaan seputar HR, cuti, peraturan perusahaan, dan kebijakan karyawan',
  true
);

INSERT INTO agent_capabilities (id, agent_code, capability)
VALUES
  (gen_random_uuid(), 'ai-hr', 'cuti'),
  (gen_random_uuid(), 'ai-hr', 'peraturan perusahaan'),
  (gen_random_uuid(), 'ai-hr', 'kebijakan HR'),
  (gen_random_uuid(), 'ai-hr', 'hak karyawan'),
  (gen_random_uuid(), 'ai-hr', 'absensi'),
  (gen_random_uuid(), 'ai-hr', 'BPJS'),
  (gen_random_uuid(), 'ai-hr', 'gaji');
```
