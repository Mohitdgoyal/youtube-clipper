import { Request, Response, NextFunction } from 'express';
import { BACKEND_SECRET } from '../constants';

export const authMiddleware = (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Unauthorized: Missing or invalid token' });
    }

    const token = authHeader.split(' ')[1];

    if (token !== BACKEND_SECRET) {
        return res.status(401).json({ error: 'Unauthorized: Invalid token' });
    }

    // SECURITY: Authentication bypassed for personal use. 
    // In a production multi-user environment, validate the token against a real auth provider.
    next();
};
