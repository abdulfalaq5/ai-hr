import { Router } from 'express';
import { askController } from '../controllers/ask.controller';

const router = Router();

router.post('/', askController.ask.bind(askController));

export default router;
