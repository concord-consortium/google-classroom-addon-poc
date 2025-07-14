import * as jwt from 'jsonwebtoken'
import { google } from 'googleapis'
import { localJWTSecret, publicUrl, localJWTAlg, firebaseAppConfig, googleClientId, googleClientSecret } from './config'
import { computeClassHash, ensureTrailingSlash, computeUidHash } from './helpers'
import { checkGoogleAuth } from './middleware/checkGoogleAuth'

export const addGoogleClassroomPortalApiRoutes = (app: any, oauth2Client: any, classroom: any) => {

  // Helper function to get auth data from JWT (attached by middleware)
  const getAuthData = (req: any) => {
    return req.gcAuth;
  }

  // Helper function to setup OAuth client with user tokens
  const setupAuthClient = async (authData: any) => {
    const client = new google.auth.OAuth2(
      googleClientId,
      googleClientSecret,
      `${publicUrl}/google-classroom/google/callback`
    )

    console.log('Portal API - Setting up auth client with tokens:', {
      hasAccessToken: !!authData.tokens?.access_token,
      hasRefreshToken: !!authData.tokens?.refresh_token,
      expiryDate: authData.tokens?.expiry_date
    })

    if (!authData.tokens?.access_token) {
      throw new Error('No access token available')
    }

    client.setCredentials(authData.tokens)

    // If token is expired and we have a refresh token, try to refresh
    if (authData.tokens.expiry_date && Date.now() >= authData.tokens.expiry_date) {
      if (authData.tokens.refresh_token) {
        console.log('Token expired, attempting refresh...')
        try {
          await client.refreshAccessToken()
          console.log('Token refreshed successfully')
        } catch (error) {
          console.error('Failed to refresh token:', error)
          throw new Error('Token expired and refresh failed')
        }
      } else {
        throw new Error('Token expired and no refresh token available')
      }
    }

    return client
  }

  // Helper function to determine user type from Google profile
  const getGoogleUserType = (userProfile: any, courseId?: string) => {
    // In Google Classroom, we need to check the user's role in the specific course
    // For now, we'll default to 'user' and let the course-specific checks handle roles
    return 'user'  // This will be overridden by course-specific role checks
  }

  // Generate portal JWT token for Google Classroom users
  app.get('/google-classroom/api/v1/jwt/portal', checkGoogleAuth, async (req: any, res: any) => {
    try {
      const authData = getAuthData(req)
      if (!authData?.user || !authData?.tokens) {
        return res.status(401).json({ error: 'Unauthorized' })
      }

      const userProfile = authData.user
      const courseId = req.query.courseId || authData.addon?.courseId

      let userType = 'user'
      let claims: Record<string, any> = {
        uid: userProfile.id,
        domain: `${publicUrl}/`,
        user_type: userType,
        user_id: `https://accounts.google.com/${userProfile.id}`,
      }

      // If we have a course ID, check the user's role in that course
      if (courseId) {
        try {
          const authClient = await setupAuthClient(authData)
          const classroomClient = google.classroom({ version: 'v1', auth: authClient })

          // Check if user is a teacher in the course
          try {
            await classroomClient.courses.teachers.get({ courseId, userId: userProfile.id })
            userType = 'teacher'
            claims.teacher_id = userProfile.id
          } catch (teacherError) {
            // Not a teacher, check if student
            try {
              await classroomClient.courses.students.get({ courseId, userId: userProfile.id })
              userType = 'learner'
              claims.learner_id = userProfile.id
              claims.class_info_url = `${publicUrl}/google-classroom/api/v1/classes/${courseId}`
              claims.offering_id = `gc-${courseId}`
            } catch (studentError) {
              // Not a student either, default to user
              userType = 'user'
            }
          }
        } catch (error) {
          console.error('Error checking course role:', error)
        }
      }

      // Update claims with final user type
      claims.user_type = userType
      claims.googleClassroomToken = authData

      const portalToken = jwt.sign(claims, localJWTSecret, { algorithm: localJWTAlg, expiresIn: '1h' })
      return res.status(201).send({ token: portalToken })

    } catch (error) {
      console.error('Error generating portal JWT:', error)
      res.status(500).json({ error: 'Failed to generate portal token' })
    }
  })

  // Get class information - parallel to LTI portal API
  app.get('/google-classroom/api/v1/classes/:courseId', checkGoogleAuth, async (req: any, res: any) => {
    try {
      const authData = getAuthData(req)
      if (!authData?.user || !authData?.tokens) {
        return res.status(401).json({ error: 'Unauthorized' })
      }

      const authClient = await setupAuthClient(authData)
      const classroomClient = google.classroom({ version: 'v1', auth: authClient })

      const { courseId } = req.params

      // Get course details
      const course = await classroomClient.courses.get({ id: courseId })

      // Get teachers
      const teachers = await classroomClient.courses.teachers.list({ courseId })

      // Get students
      const students = await classroomClient.courses.students.list({ courseId })

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
         external_class_reports: [], // TODO: Implement if needed
       }

      res.json(classInfo)
    } catch (error) {
      console.error('Error getting class info:', error)
      res.status(500).json({ error: 'Failed to get class info' })
    }
  })

  // Get offering information - parallel to LTI portal API
  app.get('/google-classroom/api/v1/offerings/:courseId', checkGoogleAuth, async (req: any, res: any) => {
    try {
      const authData = getAuthData(req)
      if (!authData?.user || !authData?.tokens) {
        return res.status(401).json({ error: 'Unauthorized' })
      }

      const { courseId } = req.params

      const offeringInfo = {
        id: `gc-${courseId}`,
        activity_url: `https://classroom.google.com/c/${courseId}`,
        rubric_url: null, // Google Classroom doesn't have direct rubric URLs
        locked: false, // Assume not locked
      }

      res.json(offeringInfo)
    } catch (error) {
      console.error('Error getting offering info:', error)
      res.status(500).json({ error: 'Failed to get offering info' })
    }
  })

  // Generate Firebase JWT token for Google Classroom users
  app.get('/google-classroom/api/v1/jwt/firebase', checkGoogleAuth, async (req: any, res: any) => {
    try {
      const { firebase_app, class_hash } = req.query
      if (!firebase_app || !class_hash) {
        return res.status(400).send({
          status: 400,
          error: 'Bad Request',
          details: { message: 'Missing required query parameters: firebase_app and class_hash.' }
        })
      }

      if (firebase_app !== 'report-service-dev') {
        return res.status(400).send({
          status: 400,
          error: 'Bad Request',
          details: { message: 'Invalid firebase_app. Only "report-service-dev" is supported.' }
        })
      }

      const authData = getAuthData(req)
      if (!authData?.user || !authData?.tokens) {
        return res.status(401).json({ error: 'Unauthorized' })
      }

      const userProfile = authData.user
      const courseId = req.query.courseId || authData.addon?.courseId
      const userId = `https://accounts.google.com/${userProfile.id}`

      const subClaims: any = {
        platform_id: 'https://classroom.google.com',
        platform_user_id: userProfile.id,
        user_id: userId,
      }

      const classHash = computeClassHash(courseId || 'default')

      // Determine user type based on course role
      let userType = 'user'
      if (courseId) {
        try {
          const authClient = await setupAuthClient(authData)
          const classroomClient = google.classroom({ version: 'v1', auth: authClient })

          // Check if user is a teacher
          try {
            await classroomClient.courses.teachers.get({ courseId, userId: userProfile.id })
            userType = 'teacher'
            subClaims.class_hash = classHash
          } catch (teacherError) {
            // Check if user is a student
            try {
              await classroomClient.courses.students.get({ courseId, userId: userProfile.id })
              userType = 'learner'
              subClaims.class_hash = classHash
              subClaims.offering_id = `gc-${courseId}`
            } catch (studentError) {
              // Default to user
              userType = 'user'
            }
          }
        } catch (error) {
          console.error('Error checking course role for Firebase JWT:', error)
        }
      }

      subClaims.user_type = userType

      // Build return URL similar to LTI implementation
      const returnUrl = `https://classroom.google.com/c/${courseId || 'default'}`

      const response = {
        claims: subClaims,
        uid: computeUidHash(userId),
        returnUrl
      }

      const firebaseToken = jwt.sign(response, firebaseAppConfig.privateKey, {
        algorithm: 'RS256',
        issuer: firebaseAppConfig.clientEmail,
        subject: firebaseAppConfig.clientEmail,
        audience: 'https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit',
        expiresIn: "1h",
      })

      return res.status(200).send({ token: firebaseToken })

    } catch (error) {
      console.error('Error generating Firebase JWT:', error)
      res.status(500).json({ error: 'Failed to generate Firebase token' })
    }
  })
}