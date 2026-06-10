import OpenAI from 'openai';
import { env } from '../config/env';
import type { SearchResult, Reference } from '../types';

// =============================================================================
// LLM Service
// =============================================================================
// Builds context from retrieved PostgreSQL records and calls the LLM.
// The LLM MUST only answer using the retrieved context.
// If nothing found → fixed Indonesian "not found" message.
// Every answer MUST include source references.
// =============================================================================

const NOT_FOUND_MESSAGE =
  'Maaf, saya tidak menemukan informasi tersebut dalam dokumen HR yang tersedia.';

const openai = new OpenAI({
  apiKey: env.OPENAI_API_KEY,
  baseURL: env.OPENAI_BASE_URL,
});

export class LlmService {

  // ---------------------------------------------------------------------------
  // generateAnswer — core Q&A method
  // ---------------------------------------------------------------------------
  async generateAnswer(
    question: string,
    searchResults: SearchResult[]
  ): Promise<{ answer: string; references: Reference[] }> {

    // If search returned nothing → short-circuit, no LLM call needed
    if (searchResults.length === 0) {
      return { answer: NOT_FOUND_MESSAGE, references: [] };
    }

    // Build context from retrieved records
    const context = this.buildContext(searchResults);
    const references = this.buildReferences(searchResults);

    // System prompt — strict grounding
    const systemPrompt = `Kamu adalah Asisten HR yang ahli dalam menjawab pertanyaan karyawan.

ATURAN KETAT:
1. Jawab HANYA berdasarkan informasi yang ada dalam KONTEKS DI BAWAH INI.
2. Jika informasi tidak ada dalam konteks, katakan: "${NOT_FOUND_MESSAGE}"
3. JANGAN mengarang, JANGAN berasumsi, JANGAN menggunakan pengetahuan di luar konteks.
4. Setiap jawaban WAJIB menyertakan referensi sumber (dokumen, BAB, Pasal, Ayat, Halaman).
5. Gunakan Bahasa Indonesia yang formal dan mudah dipahami.
6. Format referensi di akhir jawaban.

FORMAT REFERENSI:
Berdasarkan [Nama Dokumen]
[BAB jika ada]
[Pasal jika ada]
[Ayat jika ada]
Halaman [nomor]

---
KONTEKS DOKUMEN HR:
${context}
---`;

    try {
      console.log(`[LLM] Sending question to LLM with ${searchResults.length} context segments`);

      const response = await openai.chat.completions.create({
        model: env.OPENAI_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: question },
        ],
        temperature: 0.1, // low temperature = minimal hallucination
        max_tokens: 1000,
      });

      const answer = response.choices[0]?.message?.content?.trim() || NOT_FOUND_MESSAGE;
      console.log(`[LLM] Answer generated (${answer.length} chars)`);

      return { answer, references };

    } catch (error) {
      console.error('[LLM] Error calling LLM:', error);
      return {
        answer: 'Maaf, terjadi kesalahan saat memproses pertanyaan Anda. Silakan coba lagi.',
        references: [],
      };
    }
  }

  // ---------------------------------------------------------------------------
  // buildContext — format search results into readable context block
  // ---------------------------------------------------------------------------
  private buildContext(results: SearchResult[]): string {
    return results
      .map((r, idx) => {
        const parts: string[] = [];
        parts.push(`[Sumber ${idx + 1}]`);
        parts.push(`Dokumen: ${r.document_name} (${r.document_type})`);
        parts.push(`Halaman: ${r.page_no}`);
        if (r.bab) parts.push(`BAB: ${r.bab}`);
        if (r.pasal) parts.push(`Pasal: ${r.pasal}`);
        if (r.ayat) parts.push(`Ayat: ${r.ayat}`);
        if (r.title) parts.push(`Judul: ${r.title}`);
        parts.push(`Isi: ${r.content}`);
        return parts.join('\n');
      })
      .join('\n\n');
  }

  // ---------------------------------------------------------------------------
  // buildReferences — extract structured references from results
  // ---------------------------------------------------------------------------
  private buildReferences(results: SearchResult[]): Reference[] {
    // Deduplicate by (document+page+bab+pasal+ayat)
    const seen = new Set<string>();
    const refs: Reference[] = [];

    for (const r of results) {
      const key = `${r.document_name}|${r.page_no}|${r.bab}|${r.pasal}|${r.ayat}`;
      if (!seen.has(key)) {
        seen.add(key);
        refs.push({
          document: r.document_name,
          page: r.page_no,
          bab: r.bab || '',
          pasal: r.pasal || '',
          ayat: r.ayat || '',
        });
      }
    }

    return refs;
  }
}

export const llmService = new LlmService();
