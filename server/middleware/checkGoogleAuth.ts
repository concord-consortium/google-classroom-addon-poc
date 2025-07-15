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

        // If there are fresh Google Classroom parameters in the URL, update the JWT
    if (req.query.courseId) {
      // Strip JWT metadata from decoded payload and create clean payload for re-signing
      const cleanPayload = {
        user: decoded.user,
        tokens: decoded.tokens,
        addon: {
          ...decoded.addon,
          courseId: req.query.courseId as string,
          itemId: req.query.itemId as string,
          itemType: req.query.itemType as string,
          addOnToken: req.query.addOnToken as string,
          login_hint: req.query.login_hint as string
        }
      };

      // Create new JWT with updated parameters (no JWT metadata conflicts)
      const newToken = jwt.sign(cleanPayload, localJWTSecret, { expiresIn: '7d' });
      res.cookie('gc-auth', newToken, {
        httpOnly: true,
        secure: true,
        sameSite: 'none',
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
      });

      req.gcAuth = cleanPayload;
    } else {
      req.gcAuth = decoded;
    }

    return next();

  } catch (error) {
    console.error('JWT verification failed:', error);
    return redirectToSignin(req, res);
  }
};

function redirectToSignin(req: Request, res: Response) {
  // Redirect to signin page with Google Classroom parameters and correct return URL
  const queryString = req.url.includes('?') ? req.url.split('?')[1] : '';
  const originalPath = req.path;
  const returnUrl = queryString ? `${originalPath}?${queryString}` : originalPath;

  // Build signin URL with both Google Classroom parameters and returnUrl
  const signinParams = new URLSearchParams();

  // Add Google Classroom parameters if they exist
  if (queryString) {
    const urlParams = new URLSearchParams(queryString);
    urlParams.forEach((value, key) => {
      if (key !== 'returnUrl') { // Don't duplicate returnUrl
        signinParams.append(key, value);
      }
    });
  }

  // Add the return URL
  signinParams.append('returnUrl', returnUrl);

  const signinUrl = `/google-classroom/signin?${signinParams.toString()}`;
  res.redirect(signinUrl);
}

export default checkGoogleAuth;