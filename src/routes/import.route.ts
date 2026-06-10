import { Router } from 'express';
import multer from 'multer';
import { importController } from '../controllers/import.controller';

// Store PDF in memory buffer (not written to disk by multer itself)
// The ImportController decides whether to persist to disk
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50 MB max
  },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Hanya file PDF yang diizinkan'));
    }
  },
});

const router = Router();

router.post('/', upload.single('file'), importController.importPdf.bind(importController));

export default router;
