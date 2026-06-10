import { Request, Response } from 'express';
import { documentSearchService } from '../services/document-search.service';
import { llmService } from '../services/llm.service';

// =============================================================================
// Ask Controller
// =============================================================================
// POST /ask
// Request:  { "question": "Berapa hak cuti menikah?" }
// Response: { "answer": "...", "references": [...] }
// =============================================================================

export class AskController {
  async ask(req: Request, res: Response): Promise<void> {
    try {
      const { question } = req.body;

      if (!question || typeof question !== 'string' || question.trim().length === 0) {
        res.status(400).json({
          error: 'Field "question" wajib diisi dan harus berupa string.',
        });
        return;
      }

      const trimmedQuestion = question.trim();
      console.log(`[AI-HR] Received question: "${trimmedQuestion}"`);

      // 1. Search PostgreSQL using Full Text Search
      const searchResults = await documentSearchService.search(trimmedQuestion);

      // 2. Generate grounded LLM answer
      const { answer, references } = await llmService.generateAnswer(trimmedQuestion, searchResults);

      res.json({ answer, references });

    } catch (error) {
      console.error('[AI-HR] Error in /ask:', error);
      res.status(500).json({
        error: 'Terjadi kesalahan internal. Silakan coba lagi.',
      });
    }
  }
}

export const askController = new AskController();
