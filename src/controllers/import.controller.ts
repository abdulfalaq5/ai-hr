import { Request, Response } from 'express';
import { pdfImportService } from '../services/pdf-import.service';

// =============================================================================
// Import Controller
// =============================================================================
// POST /import   (multipart/form-data)
// Fields:
//   file          - PDF file (required)
//   documentName  - human-readable name (required)
//   documentType  - e.g., "Peraturan Perusahaan", "SOP", "Kebijakan" (required)
//   version       - e.g., "1.0", "2023-REV1" (optional)
//   effectiveDate - YYYY-MM-DD (optional)
//   saveFile      - "true" | "false" — persist PDF to disk (optional, default: true)
// =============================================================================

export class ImportController {
  async importPdf(req: Request, res: Response): Promise<void> {
    try {
      // multer attaches the file to req.file
      const file = req.file;

      if (!file) {
        res.status(400).json({ error: 'File PDF wajib disertakan (field: file).' });
        return;
      }

      if (file.mimetype !== 'application/pdf') {
        res.status(400).json({ error: 'File harus berformat PDF.' });
        return;
      }

      const { documentName, documentType, version, effectiveDate, saveFile } = req.body;

      if (!documentName || !documentType) {
        res.status(400).json({
          error: 'Field "documentName" dan "documentType" wajib diisi.',
        });
        return;
      }

      console.log(`[AI-HR] Importing PDF: ${file.originalname} → "${documentName}"`);

      const result = await pdfImportService.importFromBuffer(
        file.buffer,
        {
          documentName: documentName.trim(),
          documentType: documentType.trim(),
          version: version?.trim(),
          effectiveDate: effectiveDate?.trim(),
          saveFile: saveFile === 'true',
        },
        file.originalname
      );

      res.status(201).json(result);

    } catch (error) {
      console.error('[AI-HR] Error in /import:', error);
      res.status(500).json({
        error: 'Terjadi kesalahan saat memproses PDF. Silakan coba lagi.',
      });
    }
  }
}

export const importController = new ImportController();
