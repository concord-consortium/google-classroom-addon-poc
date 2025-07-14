/**
 * Middleware function that checks for a valid JWT in cookies
 * and verifies Google Classroom authentication. If no valid JWT
 * is found, redirects to the sign-in page.
 */

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { localJWTSecret } from '../config';
import { GoogleClassroomJWTPayload } from '../types/classroom-jwt';

export const checkGoogleAuth = (req: Request, res: Response, next: NextFunction) => {
  try {
    // Get JWT from HTTP-only cookie
    const token = req.cookies['gc-auth'];

    if (!token) {
      return redirectToSignin(req, res);
    }

    // Verify and decode JWT
    const decoded = jwt.verify(token, localJWTSecret) as GoogleClassroomJWTPayload;

    // Check if user and tokens exist
    if (!decoded.user || !decoded.tokens) {
      return redirectToSignin(req, res);
    }

    // Add decoded data to request for use in route handlers
    req.gcAuth = decoded;

    return next();

  } catch (error) {
    console.error('JWT verification failed:', error);
    return redirectToSignin(req, res);
  }
};

function redirectToSignin(req: Request, res: Response) {
  // Store Google Classroom query parameters in cookies for later use
  if (req.query.courseId) {
    const addonParams = { ...req.query };
    const paramsCookie = jwt.sign(addonParams, localJWTSecret, { expiresIn: '1h' });
    res.cookie('gc-addon-params', paramsCookie, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'none',
      maxAge: 60 * 60 * 1000 // 1 hour
    });
  }

  res.redirect('/google-classroom/signin');
}

export default checkGoogleAuth;