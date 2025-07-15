import * as jwt from 'jsonwebtoken'
import { google } from 'googleapis'
import { localJWTSecret, publicUrl, localJWTAlg, googleClientId, googleClientSecret, firebaseAppConfig } from './config'
import { computeClassHash, computeUidHash } from './helpers'

export const addGoogleClassroomPortalApiRoutes = (app: any, oauth2Client: any, classroom: any) => {

  // Standard portal API endpoints (for Activity Player compatibility)
  // These mirror the Google Classroom-specific endpoints but use standard paths

  app.get('/api/v1/jwt/portal', (req: any, res: any) => {
    // Extract the token from request (passed by Activity Player)
    const token = req.query.token || req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      return res.status(400).send({ status: 400, error: 'Bad Request', details: { message: 'Missing token.' } })
    }

    try {
      // Verify the token (should be signed with localJWTSecret)
      const decodedToken = jwt.verify(token, localJWTSecret) as any;

      // Extract user info from the Google Classroom token
      const userProfile = decodedToken.userInfo || decodedToken.user;
      const courseId = decodedToken.platformContext?.contextId;

      // Use the user_type from the original token if available, otherwise default to 'user'
      let userType = decodedToken.user_type || 'user'
      let claims: Record<string, any> = {
        uid: decodedToken.user || userProfile?.email,
        domain: `${publicUrl}/`,
        user_type: userType,
        user_id: decodedToken.userInfo?.email || `https://accounts.google.com/${userProfile?.sub}`,
      }

      // Add role-specific claims based on user type
      switch (userType) {
        case "learner":
          claims.learner_id = decodedToken.user;
          if (decodedToken.platformContext?.context?.id) {
            claims.class_info_url = `${publicUrl}/api/v1/classes/${decodedToken.platformContext.context.id}`;
            claims.offering_id = decodedToken.platformContext?.resource?.id || `gc-${courseId}`;
          }
          break;
        case "teacher":
          claims.teacher_id = decodedToken.user;
          break;
        default:
          // For 'user' type, include basic info
          if (decodedToken.platformContext?.context?.id) {
            claims.class_info_url = `${publicUrl}/api/v1/classes/${decodedToken.platformContext.context.id}`;
            claims.offering_id = decodedToken.platformContext?.resource?.id || `gc-${courseId}`;
          }
          break;
      }

      // // Include the original Google Classroom token for reference
      // console.log('=== DEBUGGING Portal JWT Generation ===');
      // console.log('Original token user_type:', decodedToken.user_type);
      // console.log('Original googleClassroomToken structure:', JSON.stringify(decodedToken.googleClassroomToken, null, 2));

      claims.googleClassroomToken = decodedToken.googleClassroomToken;
      const portalToken = jwt.sign(claims, localJWTSecret, { algorithm: localJWTAlg, expiresIn: '1h' });
      console.log('✅ Portal JWT generated successfully');
      return res.status(201).send({ token: portalToken });

    } catch (error) {
      console.error('Error generating standard portal JWT:', error);
      return res.status(401).send({ status: 401, error: 'Unauthorized', details: { message: 'Invalid token.' } });
    }
  });

  app.get('/api/v1/classes/:courseId', async (req: any, res: any) => {
    try {
      // Get the portal token from Authorization header
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer/')) {
        console.log('❌ Missing or invalid authorization header');
        return res.status(401).json({ error: 'Missing or invalid authorization header' });
      }

      const portalToken = authHeader.replace('Bearer/JWT ', '');
      const decoded = jwt.verify(portalToken, localJWTSecret) as any;
      const googleClassroomToken = decoded.googleClassroomToken;

      if (!googleClassroomToken?.tokens?.access_token) {
        return res.status(401).json({ error: 'No Google Classroom access token available' });
      }

      console.log('✅ Google Classroom token found, proceeding with API calls');

      // Setup Google Classroom client
      const authClient = new google.auth.OAuth2(googleClientId, googleClientSecret);
      authClient.setCredentials(googleClassroomToken.tokens);

      const classroomClient = google.classroom({ version: 'v1', auth: authClient });
      const { courseId } = req.params;

      // Get course details
      const course = await classroomClient.courses.get({ id: courseId });
      const teachers = await classroomClient.courses.teachers.list({ courseId });
      const students = await classroomClient.courses.students.list({ courseId, pageSize: 1000 });

      const classInfo = {
        name: course.data.name,
        class_hash: computeClassHash(courseId),
        students: (students.data.students || []).map((student: any) => ({
          id: `https://accounts.google.com/${student.userId}`,
          first_name: student.profile?.name?.givenName || '',
          last_name: student.profile?.name?.familyName || '',
        })),
        teachers: (teachers.data.teachers || []).map((teacher: any) => ({
          id: `https://accounts.google.com/${teacher.userId}`,
          first_name: teacher.profile?.name?.givenName || '',
          last_name: teacher.profile?.name?.familyName || '',
        })),
        external_class_reports: [],
      };

      res.json(classInfo);
    } catch (error) {
      console.error('Error getting class info (standard API):', error);
      res.status(500).json({ error: 'Failed to get class info' });
    }
  });

  app.get('/api/v1/offerings/:id', async (req: any, res: any) => {
    try {
      const { id } = req.params;
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer/')) {
        console.log('❌ Missing or invalid authorization header');
        return res.status(401).json({ error: 'Missing or invalid authorization header' });
      }

      const portalToken = authHeader.replace('Bearer/JWT ', '');
      const decoded = jwt.verify(portalToken, localJWTSecret) as any;

      const googleClassroomToken = decoded.googleClassroomToken;
      const { courseId, itemId } = googleClassroomToken;

      const offeringInfo = {
        id: `gc-${id}`,
        activity_url: `classroom.google.com/${courseId}/${itemId}`,
        rubric_url: null,
        locked: false,
      };

      res.json(offeringInfo);
    } catch (error) {
      console.error('Error getting offering info (standard API):', error);
      res.status(500).json({ error: 'Failed to get offering info' });
    }
  });

  app.get('/api/v1/jwt/firebase', async (req: any, res: any) => {
    try {
      const { firebase_app, class_hash } = req.query;
      const authHeader = req.headers.authorization;
      if (!firebase_app || !class_hash) {
        return res.status(400).send({
          status: 400,
          error: 'Bad Request',
          details: { message: 'Missing required query parameters: firebase_app and class_hash.' }
        });
      }

      if (firebase_app !== 'report-service-dev') {
        return res.status(400).send({
          status: 400,
          error: 'Bad Request',
          details: { message: 'Invalid firebase_app. Only "report-service-dev" is supported.' }
        });
      }

      // Get the portal token from res.locals (set by middleware)
      const portalTokenData = res.locals.portalToken;
      if (!portalTokenData) {
        return res.status(401).send({
          status: 401,
          error: 'Unauthorized',
          details: { message: 'Missing portal token.' }
        });
      }

      // Extract Google Classroom token and user info
      const googleClassroomToken = portalTokenData.googleClassroomToken;
      const userType = portalTokenData.user_type || 'user';
      const userId = portalTokenData.user_id;

      // Build Firebase claims
      const subClaims: any = {
        platform_id: 'https://classroom.google.com',
        platform_user_id: googleClassroomToken?.user?.sub || portalTokenData.uid,
        user_id: userId,
      };

      // Compute class hash from course ID
      const courseId = googleClassroomToken?.courseId;
      const classHash = courseId ? computeClassHash(courseId) : computeClassHash('default');

      switch (userType) {
        case 'learner':
          subClaims.user_type = 'learner';
          subClaims.class_hash = classHash;
          subClaims.offering_id = portalTokenData.offering_id || 'ap-launch-demo';
          break;
        case 'teacher':
          subClaims.user_type = 'teacher';
          subClaims.class_hash = classHash;
          break;
        default:
          subClaims.user_type = 'user';
          break;
      }

      // Create returnUrl similar to LTI pattern
      const contextId = courseId || 'default-context';
      const resourceId = portalTokenData.offering_id || 'ap-launch-demo';
      const platformUserId = googleClassroomToken?.user?.sub || portalTokenData.uid;
      const returnUrl = `https://classroom.google.com/${platformUserId}-${contextId}-${resourceId}`;

      const response: any = {
        // Firebase auth rules expect all the claims to be in a sub-object named "claims".
        claims: subClaims,
        uid: computeUidHash(userId),
        returnUrl
      };

      const firebaseToken = jwt.sign(response, firebaseAppConfig.privateKey, {
        algorithm: 'RS256',
        issuer: firebaseAppConfig.clientEmail,
        subject: firebaseAppConfig.clientEmail,
        audience: 'https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit',
        expiresIn: '1h',
      });

      return res.status(200).send({ token: firebaseToken });

    } catch (error) {
      console.error('Error generating Firebase JWT:', error);
      return res.status(500).send({
        status: 500,
        error: 'Internal Server Error',
        details: { message: 'Failed to generate Firebase JWT.' }
      });
    }
  });

}