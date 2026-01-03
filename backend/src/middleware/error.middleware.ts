import { Request, Response, NextFunction } from 'express';

export const errorMiddleware = (err: any, req: Request, res: Response, next: NextFunction) => {
    console.error(err.stack);

    const status = err.status || 500;
    const message = err.message || 'Internal Server Error';

    res.status(status).json({
        error: message,
        stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
};
