import { knex } from '../database/knex';
import type { SearchResult } from '../types';

// =============================================================================
// Document Search Service
// =============================================================================
// Uses PostgreSQL Full Text Search (GIN index on hr_document_contents.content)
// Auto-detects 'indonesian' or falls back to 'simple' FTS config
// =============================================================================

const FTS_LIMIT = 10; // max results to return

export class DocumentSearchService {
  private ftsConfig: 'indonesian' | 'simple' = 'simple';
  private configChecked = false;

  // ---------------------------------------------------------------------------
  // init — detect available FTS config
  // ---------------------------------------------------------------------------
  async init(): Promise<void> {
    try {
      const result = await knex.raw(`
        SELECT COUNT(*)::int as cnt
        FROM pg_ts_config
        WHERE cfgname = 'indonesian'
      `);
      this.ftsConfig = result.rows[0]?.cnt > 0 ? 'indonesian' : 'simple';
      this.configChecked = true;
      console.log(`[SEARCH] Using PostgreSQL FTS config: '${this.ftsConfig}'`);
    } catch {
      this.ftsConfig = 'simple';
      this.configChecked = true;
      console.log('[SEARCH] Could not detect FTS config, using: simple');
    }
  }

  // ---------------------------------------------------------------------------
  // search — full text search against hr_document_contents
  // ---------------------------------------------------------------------------
  async search(question: string, limit = FTS_LIMIT): Promise<SearchResult[]> {
    if (!this.configChecked) {
      await this.init();
    }

    const cfg = this.ftsConfig;

    try {
      // Primary: GIN FTS search ranked by relevance
      const results = await knex.raw<{ rows: SearchResult[] }>(`
        SELECT
          d.document_name,
          d.document_type,
          c.page_no,
          c.bab,
          c.pasal,
          c.ayat,
          c.title,
          c.content,
          ts_rank(
            to_tsvector('${cfg}', c.content),
            plainto_tsquery('${cfg}', ?)
          ) AS rank
        FROM hr_document_contents c
        JOIN hr_documents d ON d.id = c.document_id
        WHERE
          to_tsvector('${cfg}', c.content) @@ plainto_tsquery('${cfg}', ?)
        ORDER BY rank DESC
        LIMIT ?
      `, [question, question, limit]);

      if (results.rows.length > 0) {
        console.log(`[SEARCH] FTS found ${results.rows.length} results for: "${question}"`);
        return results.rows;
      }

      // Fallback: ILIKE partial match when FTS returns nothing
      console.log(`[SEARCH] FTS empty, falling back to ILIKE for: "${question}"`);
      return this.fallbackSearch(question, limit);

    } catch (error) {
      console.error('[SEARCH] FTS error, using fallback:', error);
      return this.fallbackSearch(question, limit);
    }
  }

  // ---------------------------------------------------------------------------
  // fallbackSearch — keyword ILIKE search as last resort
  // ---------------------------------------------------------------------------
  private async fallbackSearch(question: string, limit: number): Promise<SearchResult[]> {
    // Extract meaningful keywords (skip common words)
    const stopWords = new Set(['apa', 'berapa', 'bagaimana', 'siapa', 'kapan', 'di', 'yang', 'dan', 'atau', 'adalah', 'untuk', 'dari', 'pada', 'dalam', 'dengan', 'ke', 'oleh', 'ini', 'itu', 'saya', 'karyawan']);
    const keywords = question
      .toLowerCase()
      .split(/\s+/)
      .filter(w => w.length > 3 && !stopWords.has(w));

    if (keywords.length === 0) return [];

    // Build ILIKE conditions
    const conditions = keywords.map(() => `c.content ILIKE ?`).join(' OR ');
    const values = keywords.map(k => `%${k}%`);

    const results = await knex.raw<{ rows: SearchResult[] }>(`
      SELECT
        d.document_name,
        d.document_type,
        c.page_no,
        c.bab,
        c.pasal,
        c.ayat,
        c.title,
        c.content,
        0 AS rank
      FROM hr_document_contents c
      JOIN hr_documents d ON d.id = c.document_id
      WHERE ${conditions}
      LIMIT ?
    `, [...values, limit]);

    console.log(`[SEARCH] ILIKE fallback found ${results.rows.length} results`);
    return results.rows;
  }
}

export const documentSearchService = new DocumentSearchService();
