import * as pdfParse from 'pdf-parse';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import * as path from 'path';
import { knex } from '../database/knex';
import type { HrDocument, ParsedSection, ImportResult } from '../types';

// =============================================================================
// PDF Import Service
// =============================================================================
// Flow:
//   Upload PDF → Parse → Extract text → Split by page
//   → Detect BAB/PASAL/AYAT → Generate sections → Insert PostgreSQL
// =============================================================================

interface ImportOptions {
  documentName: string;
  documentType: string;
  version?: string;
  effectiveDate?: string;
  saveFile?: boolean;
}

export class PdfImportService {

  // ---------------------------------------------------------------------------
  // importFromBuffer — main entry point
  // ---------------------------------------------------------------------------
  async importFromBuffer(
    buffer: Buffer,
    options: ImportOptions,
    originalFilename?: string
  ): Promise<ImportResult> {
    console.log(`[PDF-IMPORT] Starting import for: ${options.documentName}`);

    // 1. Parse PDF
    const pdfData = await pdfParse.default(buffer);
    console.log(`[PDF-IMPORT] Parsed PDF. Pages: ${pdfData.numpages}, Characters: ${pdfData.text.length}`);

    // 2. Save file to disk (optional)
    if (options.saveFile && originalFilename) {
      await this.savePdfToDisk(buffer, originalFilename);
    }

    // 3. Split into pages and parse sections
    const sections = this.parseIntoSections(pdfData.text, pdfData.numpages);
    console.log(`[PDF-IMPORT] Extracted ${sections.length} sections`);

    // 4. Insert document record
    const documentId = uuidv4();
    const document: HrDocument = {
      id: documentId,
      document_name: options.documentName,
      document_type: options.documentType,
      version: options.version || '1.0',
      effective_date: options.effectiveDate || null,
      created_at: new Date().toISOString(),
    };

    await knex('hr_documents').insert(document);
    console.log(`[PDF-IMPORT] Inserted document record: ${documentId}`);

    // 5. Batch insert content sections
    if (sections.length > 0) {
      const contentRows = sections.map((section) => ({
        id: uuidv4(),
        document_id: documentId,
        page_no: section.page_no,
        bab: section.bab,
        pasal: section.pasal,
        ayat: section.ayat,
        title: section.title,
        content: section.content,
        created_at: new Date().toISOString(),
      }));

      // Insert in batches of 100
      const batchSize = 100;
      for (let i = 0; i < contentRows.length; i += batchSize) {
        const batch = contentRows.slice(i, i + batchSize);
        await knex('hr_document_contents').insert(batch);
      }
      console.log(`[PDF-IMPORT] Inserted ${contentRows.length} content sections`);
    }

    return {
      success: true,
      documentId,
      documentName: options.documentName,
      pageCount: pdfData.numpages,
      sectionsImported: sections.length,
    };
  }

  // ---------------------------------------------------------------------------
  // parseIntoSections — splits PDF text into structured HR sections
  // ---------------------------------------------------------------------------
  private parseIntoSections(fullText: string, totalPages: number): ParsedSection[] {
    const sections: ParsedSection[] = [];

    // Split text into pages using form feed character (\f) or page breaks
    let pages: string[];
    if (fullText.includes('\f')) {
      pages = fullText.split('\f');
    } else {
      // Estimate page breaks by line count
      const lines = fullText.split('\n');
      const linesPerPage = Math.max(1, Math.ceil(lines.length / totalPages));
      pages = [];
      for (let i = 0; i < lines.length; i += linesPerPage) {
        pages.push(lines.slice(i, i + linesPerPage).join('\n'));
      }
    }

    // State tracking across pages
    let currentBab = '';
    let currentPasal = '';
    let currentAyat = '';
    let currentTitle = '';
    let buffer: string[] = [];
    let bufferPage = 1;

    const flushBuffer = (pageNo: number) => {
      const text = buffer.join('\n').trim();
      if (text.length > 20) { // ignore very short segments
        sections.push({
          page_no: bufferPage,
          bab: currentBab,
          pasal: currentPasal,
          ayat: currentAyat,
          title: currentTitle,
          content: text,
        });
      }
    };

    // Patterns for BAB, PASAL, AYAT detection
    const babPattern = /^\s*BAB\s+([IVXLCDM]+|\d+)\s*$/im;
    const pasalPattern = /^\s*Pasal\s+(\d+)\s*$/im;
    const ayatPattern = /^\s*(?:Ayat\s+\(?(\d+)\)?|\((\d+)\))\s*$/im;
    const titleAfterBabPattern = /^\s*([A-Z\s]{5,})\s*$/m;

    pages.forEach((pageText, pageIdx) => {
      const pageNo = pageIdx + 1;
      const lines = pageText.split('\n');

      lines.forEach((line) => {
        const trimmed = line.trim();
        if (!trimmed) return;

        // Detect BAB
        const babMatch = trimmed.match(/^BAB\s+([IVXLCDM]+|\d+)\s*$/i);
        if (babMatch) {
          flushBuffer(pageNo);
          buffer = [];
          bufferPage = pageNo;
          currentBab = `BAB ${babMatch[1].toUpperCase()}`;
          currentPasal = '';
          currentAyat = '';
          currentTitle = '';
          return;
        }

        // Detect title line after BAB (ALL CAPS line)
        if (currentBab && !currentPasal && /^[A-Z\s\-,\.]{5,}$/.test(trimmed) && trimmed.length > 4) {
          currentTitle = trimmed;
          return;
        }

        // Detect PASAL
        const pasalMatch = trimmed.match(/^Pasal\s+(\d+)$/i);
        if (pasalMatch) {
          flushBuffer(pageNo);
          buffer = [];
          bufferPage = pageNo;
          currentPasal = `Pasal ${pasalMatch[1]}`;
          currentAyat = '';
          return;
        }

        // Detect AYAT — formats: "Ayat 1", "(1)", "1."
        const ayatMatch1 = trimmed.match(/^Ayat\s+\(?(\d+)\)?$/i);
        const ayatMatch2 = trimmed.match(/^\((\d+)\)$/);
        const ayatMatch3 = trimmed.match(/^(\d+)\.\s+\S/);

        if (ayatMatch1) {
          flushBuffer(pageNo);
          buffer = [];
          bufferPage = pageNo;
          currentAyat = `Ayat ${ayatMatch1[1]}`;
          return;
        }

        if (ayatMatch2 && currentPasal) {
          // "(1)" format — flush and start new ayat
          flushBuffer(pageNo);
          buffer = [];
          bufferPage = pageNo;
          currentAyat = `Ayat ${ayatMatch2[1]}`;
          // The rest of the line is content
          buffer.push(trimmed);
          return;
        }

        if (ayatMatch3 && currentPasal) {
          // "1. Content here" format within a pasal
          flushBuffer(pageNo);
          buffer = [];
          bufferPage = pageNo;
          currentAyat = `Ayat ${ayatMatch3[1]}`;
          buffer.push(trimmed.replace(/^\d+\.\s+/, ''));
          return;
        }

        // Accumulate content
        buffer.push(trimmed);
      });
    });

    // Flush remaining buffer
    if (buffer.length > 0) {
      flushBuffer(pages.length);
    }

    // If no structured sections found (e.g., unstructured PDF),
    // fall back to per-page segments
    if (sections.length === 0) {
      console.log('[PDF-IMPORT] No structured sections found, falling back to per-page segments');
      pages.forEach((pageText, idx) => {
        const text = pageText.trim();
        if (text.length > 50) {
          sections.push({
            page_no: idx + 1,
            bab: '',
            pasal: '',
            ayat: '',
            title: '',
            content: text,
          });
        }
      });
    }

    return sections;
  }

  // ---------------------------------------------------------------------------
  // savePdfToDisk — optionally persist PDF to /documents
  // ---------------------------------------------------------------------------
  private async savePdfToDisk(buffer: Buffer, filename: string): Promise<void> {
    const docsDir = path.join(process.cwd(), 'documents');
    if (!fs.existsSync(docsDir)) {
      fs.mkdirSync(docsDir, { recursive: true });
    }
    const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    const filePath = path.join(docsDir, safeName);
    fs.writeFileSync(filePath, buffer);
    console.log(`[PDF-IMPORT] Saved PDF to disk: ${filePath}`);
  }
}

export const pdfImportService = new PdfImportService();
