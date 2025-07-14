// JWT payload structure for Google Classroom authentication
export interface GoogleClassroomJWTPayload {
  user: {
    sub: string;
    email: string;
    displayName: string;
    portraitUrl: string;
    refreshToken?: string;
  };
  tokens: {
    access_token: string;
    refresh_token?: string;
    id_token?: string;
    expiry_date?: number;
  };
  addon?: {
    courseId?: string;
    itemId?: string;
    itemType?: string;
    addOnToken?: string;
    login_hint?: string;
    [key: string]: any;
  };
  iat?: number;
  exp?: number;
}

// Extend Express Request to include JWT data
declare global {
  namespace Express {
    interface Request {
      gcAuth?: GoogleClassroomJWTPayload;
    }
  }
}