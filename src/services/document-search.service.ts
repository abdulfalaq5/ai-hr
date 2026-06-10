import { knex } from '../database/knex';
import type { SearchResult } from '../types';

// =============================================================================
// Document Search Service
// =============================================================================
// Strategy:
//   1. FTS simple + OR logic → find matching sections
//   2. Context expansion → pull ALL ayat from same Pasal as matched rows
//   3. ILIKE fallback
// =============================================================================

const FTS_LIMIT = 5;  // initial FTS hits (we expand context from these)

// Indonesian stop words — only particles/function words, NOT HR domain terms
const STOP_WORDS = new Set([
  'apa', 'apakah', 'berapa', 'bagaimana', 'siapa', 'kapan', 'dimana',
  'di', 'ke', 'dari', 'dan', 'atau', 'adalah', 'yang', 'untuk',
  'pada', 'dalam', 'dengan', 'oleh', 'ini', 'itu', 'saya', 'kami',
  'tolong', 'mohon', 'bisa', 'boleh', 'ada', 'tidak', 'juga', 'sudah',
  'saja', 'jika', 'kalau', 'maka', 'akan', 'telah', 'sebuah', 'suatu',
  'setiap', 'semua', 'setelah', 'sebelum', 'tentang', 'mengenai',
  'antara', 'namun', 'tetapi', 'bahwa', 'karena', 'ketika', 'saat',
]);

// Pages that are structural (table of contents, cover, etc.) — less informative
const STRUCTURAL_PAGE_THRESHOLD = 3;

export class DocumentSearchService {
  private ftsConfigDetected: 'indonesian' | 'simple' | null = null;

  // ---------------------------------------------------------------------------
  // init — detect available PostgreSQL FTS config
  // ---------------------------------------------------------------------------
  async init(): Promise<void> {
    try {
      const result = await knex.raw(`
        SELECT COUNT(*)::int as cnt
        FROM pg_ts_config
        WHERE cfgname = 'indonesian'
      `);
      this.ftsConfigDetected = result.rows[0]?.cnt > 0 ? 'indonesian' : 'simple';
      console.log(`[SEARCH] PostgreSQL FTS config available: '${this.ftsConfigDetected}'`);
    } catch {
      this.ftsConfigDetected = 'simple';
      console.log('[SEARCH] Could not detect FTS config, defaulting to: simple');
    }
  }

  // ---------------------------------------------------------------------------
  // extractKeywords — meaningful terms from natural language question
  // ---------------------------------------------------------------------------
  private extractKeywords(question: string): string[] {
    return question
      .toLowerCase()
      .replace(/[?!.,;:()"']/g, ' ')
      .split(/\s+/)
      .filter(w => w.length >= 3 && !STOP_WORDS.has(w))
      .filter((w, i, arr) => arr.indexOf(w) === i);
  }

  // ---------------------------------------------------------------------------
  // buildOrTsQuery — OR-based tsquery without single quotes (simpler, more robust)
  // ---------------------------------------------------------------------------
  private buildOrTsQuery(keywords: string[]): string {
    // Use pipe-separated terms without single quotes — valid tsquery syntax
    return keywords.join(' | ');
  }

  // ---------------------------------------------------------------------------
  // runFts — execute FTS query with given config and OR tsquery
  // ---------------------------------------------------------------------------
  private async runFts(
    keywords: string[],
    config: string,
    limit: number
  ): Promise<Array<{ document_id: string; document_name: string; document_type: string; page_no: number; bab: string; pasal: string; ayat: string; title: string; content: string; rank: number }>> {
    if (keywords.length === 0) return [];

    const tsQuery = this.buildOrTsQuery(keywords);

    try {
      const results = await knex.raw(`
        SELECT
          c.id,
          c.document_id,
          d.document_name,
          d.document_type,
          c.page_no,
          c.bab,
          c.pasal,
          c.ayat,
          c.title,
          c.content,
          ts_rank(to_tsvector('${config}', c.content), to_tsquery('${config}', ?)) AS rank
        FROM hr_document_contents c
        JOIN hr_documents d ON d.id = c.document_id
        WHERE
          c.page_no > ${STRUCTURAL_PAGE_THRESHOLD}
          AND to_tsvector('${config}', c.content) @@ to_tsquery('${config}', ?)
        ORDER BY rank DESC
        LIMIT ?
      `, [tsQuery, tsQuery, limit]);

      return results.rows;
    } catch {
      return [];
    }
  }

  // ---------------------------------------------------------------------------
  // expandContext — for each matched section, pull all rows from same Pasal
  // This ensures we get the full context of a section, not just the header
  // ---------------------------------------------------------------------------
  private async expandContext(
    seedRows: Array<{ document_id: string; bab: string; pasal: string; rank: number }>,
    maxResults: number
  ): Promise<SearchResult[]> {
    if (seedRows.length === 0) return [];

    // Build unique (document_id, bab, pasal) combinations from seed
    const sections = new Map<string, { document_id: string; bab: string; pasal: string; rank: number }>();
    for (const row of seedRows) {
      // Only expand if pasal is defined (skip structural pages)
      if (!row.pasal) continue;
      const key = `${row.document_id}|${row.bab}|${row.pasal}`;
      if (!sections.has(key)) {
        sections.set(key, { document_id: row.document_id, bab: row.bab, pasal: row.pasal, rank: row.rank });
      }
    }

    // Also include seed rows that don't have a Pasal (bab-level matches)
    const noPasalSeeds = seedRows.filter(r => !r.pasal);

    if (sections.size === 0 && noPasalSeeds.length === 0) return [];

    // Fetch all ayat from matched sections (up to maxResults rows)
    const expanded: SearchResult[] = [];

    // Sort sections by rank so we fetch most relevant ones first
    const sortedSections = [...sections.values()].sort((a, b) => b.rank - a.rank);

    for (const sec of sortedSections) {
      if (expanded.length >= maxResults) break;

      const rows = await knex.raw<{ rows: SearchResult[] }>(`
        SELECT
          d.document_name,
          d.document_type,
          c.page_no,
          c.bab,
          c.pasal,
          c.ayat,
          c.title,
          c.content,
          0::float AS rank
        FROM hr_document_contents c
        JOIN hr_documents d ON d.id = c.document_id
        WHERE
          c.document_id = ?
          AND c.bab = ?
          AND c.pasal = ?
        ORDER BY c.page_no, c.id
        LIMIT ?
      `, [sec.document_id, sec.bab, sec.pasal, maxResults - expanded.length]);

      expanded.push(...rows.rows);
    }

    // Fill remaining slots with direct seed rows (non-pasal matches)
    if (expanded.length < maxResults) {
      for (const row of noPasalSeeds) {
        if (expanded.length >= maxResults) break;
        expanded.push(row as unknown as SearchResult);
      }
    }

    return expanded;
  }

  // ---------------------------------------------------------------------------
  // search — main entry point
  // ---------------------------------------------------------------------------
  async search(question: string, limit = 10): Promise<SearchResult[]> {
    if (!this.ftsConfigDetected) {
      await this.init();
    }

    const keywords = this.extractKeywords(question);
    console.log(`[SEARCH] Question: "${question}"`);
    console.log(`[SEARCH] Keywords extracted: [${keywords.join(', ')}]`);

    if (keywords.length === 0) {
      return [];
    }

    // -------------------------------------------------------------------------
    // Step 1: FTS with 'simple' config + OR logic
    // -------------------------------------------------------------------------
    let seedRows = await this.runFts(keywords, 'simple', FTS_LIMIT);

    if (seedRows.length === 0 && this.ftsConfigDetected === 'indonesian') {
      console.log('[SEARCH] FTS(simple) empty, trying indonesian...');
      seedRows = await this.runFts(keywords, 'indonesian', FTS_LIMIT);
    }

    if (seedRows.length > 0) {
      console.log(`[SEARCH] FTS found ${seedRows.length} seed rows, expanding context...`);

      // Step 2: Context expansion — pull full Pasal content for each match
      const expanded = await this.expandContext(seedRows, limit);

      if (expanded.length > 0) {
        console.log(`[SEARCH] Context expanded to ${expanded.length} rows`);
        return expanded;
      }
    }

    // -------------------------------------------------------------------------
    // Step 3: ILIKE keyword fallback
    // -------------------------------------------------------------------------
    console.log('[SEARCH] FTS+expand returned 0, falling back to ILIKE...');
    return this.ilikeFallback(keywords, question, limit);
  }

  // ---------------------------------------------------------------------------
  // ilikeFallback — OR-based ILIKE keyword search with context expansion
  // ---------------------------------------------------------------------------
  private async ilikeFallback(
    keywords: string[],
    originalQuestion: string,
    limit: number
  ): Promise<SearchResult[]> {
    const topKeywords = keywords.slice(0, 4);
    console.log(`[SEARCH] ILIKE fallback with: [${topKeywords.join(', ')}]`);

    const conditions = topKeywords.map(() => `c.content ILIKE ?`).join(' OR ');
    const values = topKeywords.map(k => `%${k}%`);

    try {
      const seedRows = await knex.raw<{ rows: Array<{ document_id: string; bab: string; pasal: string; rank: number }> }>(`
        SELECT
          c.document_id, c.bab, c.pasal, 0::float AS rank
        FROM hr_document_contents c
        WHERE
          c.page_no > ${STRUCTURAL_PAGE_THRESHOLD}
          AND (${conditions})
        LIMIT ?
      `, [...values, FTS_LIMIT]);

      if (seedRows.rows.length > 0) {
        const expanded = await this.expandContext(seedRows.rows, limit);
        if (expanded.length > 0) {
          console.log(`[SEARCH] ILIKE+expand found ${expanded.length} rows`);
          return expanded;
        }
      }
    } catch (err) {
      console.error('[SEARCH] ILIKE error:', (err as Error).message);
    }

    // Absolute last resort: phrase search
    console.log('[SEARCH] Phrase search fallback...');
    try {
      const results = await knex.raw<{ rows: SearchResult[] }>(`
        SELECT
          d.document_name, d.document_type,
          c.page_no, c.bab, c.pasal, c.ayat, c.title, c.content,
          0::float AS rank
        FROM hr_document_contents c
        JOIN hr_documents d ON d.id = c.document_id
        WHERE c.content ILIKE ?
        LIMIT ?
      `, [`%${originalQuestion.toLowerCase().replace(/[?!.,;:()"']/g, ' ').trim()}%`, limit]);

      console.log(`[SEARCH] Phrase search found ${results.rows.length} rows`);
      return results.rows;
    } catch {
      return [];
    }
  }
}

export const documentSearchService = new DocumentSearchService();
