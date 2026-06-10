import OpenAI from 'openai';
import { env } from '../config/env';
import type { SearchResult, Reference } from '../types';

// =============================================================================
// LLM Service
// =============================================================================
// Builds context from retrieved PostgreSQL records and calls the LLM.
// The LLM answers ONLY using retrieved context — no hallucination.
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

    // Build grouped context from retrieved records
    const context = this.buildContext(searchResults);
    const references = this.buildReferences(searchResults);

    // System prompt — grounded but interpretive
    const systemPrompt = `Kamu adalah Asisten HR yang ahli dalam menjawab pertanyaan karyawan berdasarkan dokumen peraturan perusahaan.

CARA MEMBACA KONTEKS:
- Setiap sumber memiliki JUDUL PASAL dan ISI AYAT.
- Judul Pasal mendeskripsikan topik keseluruhan. Ayat-ayat di bawahnya adalah isi dari topik tersebut.
- Contoh: Pasal 24 berjudul "PEMOTONGAN UPAH KARYAWAN" → Ayat 1 dan 2 di bawahnya ADALAH bagian dari pemotongan upah, meskipun kata "pemotongan" tidak disebut di tiap ayat.
- Kamu WAJIB menginterpretasikan ayat dalam konteks judul pasalnya.

ATURAN MENJAWAB:
1. Jawab berdasarkan KONTEKS yang diberikan. Gunakan judul pasal sebagai panduan interpretasi isi ayat.
2. Jika informasi memang BENAR-BENAR tidak ada dalam konteks, katakan: "${NOT_FOUND_MESSAGE}"
3. JANGAN mengarang fakta atau angka yang tidak ada di konteks.
4. Setiap jawaban WAJIB menyertakan referensi sumber.
5. Gunakan Bahasa Indonesia yang formal dan mudah dipahami.
6. Berikan jawaban yang LENGKAP — sebutkan semua poin relevan dari konteks.

FORMAT REFERENSI (di akhir jawaban):
Berdasarkan [Nama Dokumen]
[BAB] [Pasal] [Ayat jika ada]
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
        temperature: 0.15,
        max_tokens: 1200,
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
  // buildContext — group results by Pasal, prepend section header to each ayat
  // ---------------------------------------------------------------------------
  private buildContext(results: SearchResult[]): string {
    // Group by (document_name + bab + pasal)
    const groups = new Map<string, { header: SearchResult | null; ayat: SearchResult[] }>();

    for (const r of results) {
      const groupKey = `${r.document_name}|${r.bab}|${r.pasal}`;
      if (!groups.has(groupKey)) {
        groups.set(groupKey, { header: null, ayat: [] });
      }
      const group = groups.get(groupKey)!;

      // Row without ayat = section header (e.g. "PEMOTONGAN UPAH KARYAWAN")
      if (!r.ayat) {
        group.header = r;
      } else {
        group.ayat.push(r);
      }
    }

    const sections: string[] = [];
    let idx = 1;

    for (const [, group] of groups) {
      const { header, ayat } = group;
      const ref = header ?? ayat[0];
      if (!ref) continue;

      const sectionParts: string[] = [];

      // Section header
      sectionParts.push(`[Sumber ${idx}]`);
      sectionParts.push(`Dokumen: ${ref.document_name} (${ref.document_type})`);
      if (ref.bab) sectionParts.push(`BAB: ${ref.bab}`);
      if (ref.pasal) {
        // Include the section title from the header row if available
        const sectionTitle = header?.content?.trim();
        const isTitleOnly = sectionTitle && sectionTitle.length < 100 && !sectionTitle.includes('\n');
        if (isTitleOnly) {
          sectionParts.push(`Pasal: ${ref.pasal} — ${sectionTitle}`);
        } else {
          sectionParts.push(`Pasal: ${ref.pasal}`);
          if (header) sectionParts.push(`Isi Pasal: ${header.content.trim()}`);
        }
      }
      sectionParts.push(`Halaman: ${ref.page_no}`);

      // Ayat content — each ayat labeled under the section context
      if (ayat.length > 0) {
        sectionParts.push('Isi:');
        for (const a of ayat) {
          sectionParts.push(`  ${a.ayat}: ${a.content.trim()}`);
        }
      }

      sections.push(sectionParts.join('\n'));
      idx++;
    }

    return sections.join('\n\n');
  }

  // ---------------------------------------------------------------------------
  // buildReferences — extract structured references from results
  // ---------------------------------------------------------------------------
  private buildReferences(results: SearchResult[]): Reference[] {
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
