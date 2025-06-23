import { Request, Response, NextFunction } from 'express';
import { body, validationResult } from 'express-validator';

export const validateProject = [
  body('name').trim().notEmpty().withMessage('Project name is required'),
  body('userId').trim().notEmpty().withMessage('User ID is required'),
  handleValidationErrors
];

export const validateDomain = [
  body('url').trim().isURL().withMessage('Valid URL is required'),
  body('projectId').trim().notEmpty().withMessage('Project ID is required'),
  handleValidationErrors
];

function handleValidationErrors(req: Request, res: Response, next: NextFunction) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  next();
}