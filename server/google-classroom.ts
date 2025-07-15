import { google } from 'googleapis'
import { googleClientId, googleClientSecret, publicUrl, googleOAuthScopes, localJWTSecret } from './config'
import { Express } from 'express'
import { googleClassroomLaunchDemo } from './resources/google-classroom-launch-demo'
import { checkGoogleAuth } from './middleware/checkGoogleAuth'
import jwt, { JwtPayload } from 'jsonwebtoken'

// Google OAuth2 client setup
const oauth2Client = new google.auth.OAuth2(
  googleClientId,
  googleClientSecret,
  `${publicUrl}/google-classroom/google/callback`
)

// Google Classroom API client
const classroom = google.classroom({ version: 'v1', auth: oauth2Client })

// Helper function to setup OAuth client with user tokens
const setupAuthClient = async (sessionData: any) => {
  const client = new google.auth.OAuth2(
    googleClientId,
    googleClientSecret,
    `${publicUrl}/google-classroom/google/callback`
  )

  if (!sessionData.tokens?.access_token) {
    throw new Error('No access token available')
  }

  client.setCredentials(sessionData.tokens)

  // If token is expired and we have a refresh token, try to refresh
  if (sessionData.tokens.expiry_date && Date.now() >= sessionData.tokens.expiry_date) {
    if (sessionData.tokens.refresh_token) {
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

export const setupGoogleClassroom = (app: Express) => {
  // Add Google Classroom API routes
  const { addGoogleClassroomApiRoutes } = require('./google-classroom-api')
  addGoogleClassroomApiRoutes(app, oauth2Client, classroom)

  // Add Google Classroom Portal API routes
  const { addGoogleClassroomPortalApiRoutes } = require('./google-classroom-portal-api')
  addGoogleClassroomPortalApiRoutes(app, oauth2Client, classroom)

    // OAuth login route (stateless version)
  app.get('/google-classroom/google', (req, res) => {
    const state = {
      returnUrl: req.query.returnUrl || '/google-classroom/addon-discovery',
      // Include any Google Classroom parameters that were passed
      courseId: req.query.courseId,
      itemId: req.query.itemId,
      itemType: req.query.itemType,
      addOnToken: req.query.addOnToken,
      login_hint: req.query.login_hint
    }

    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: googleOAuthScopes,
      state: JSON.stringify(state)
    })
    res.redirect(authUrl)
  })

    // OAuth callback route (matches official Google example)
  app.get('/google-classroom/google/callback', async (req, res) => {
    try {
      const { code, state } = req.query

      if (!code) {
        return res.redirect('/google-classroom/failed')
      }

      // Parse state to get Google Classroom parameters
      let stateData: any = {}
      try {
        stateData = JSON.parse(state as string)
      } catch (error) {
        console.error('Failed to parse OAuth state:', error)
      }

      // Exchange code for tokens
      const { tokens } = await oauth2Client.getToken(code as string)
      console.log('Received tokens from Google:', {
        hasAccessToken: !!tokens.access_token,
        hasRefreshToken: !!tokens.refresh_token,
        hasIdToken: !!tokens.id_token,
        expiryDate: tokens.expiry_date
      })

      oauth2Client.setCredentials(tokens)

      // Verify the ID token
      const ticket = await oauth2Client.verifyIdToken({
        idToken: tokens.id_token!,
        audience: googleClientId,
      })

      // Get user info from the verified token
      const info = ticket.getPayload()!

      // Build user object from payload and tokens
      const user = {
        sub: info.sub!,
        email: info.email!,
        displayName: info.name!,
        portraitUrl: info.picture!,
        refreshToken: tokens.refresh_token || undefined
      }

      const tokenData = {
        access_token: tokens.access_token!,
        refresh_token: tokens.refresh_token || undefined,
        id_token: tokens.id_token || undefined,
        expiry_date: tokens.expiry_date || undefined
      }

      // Create JWT with user data, tokens, and Google Classroom parameters from state
      const jwtPayload = {
        user,
        tokens: tokenData,
        addon: {
          courseId: stateData.courseId,
          itemId: stateData.itemId,
          itemType: stateData.itemType,
          addOnToken: stateData.addOnToken,
          login_hint: stateData.login_hint
        }
      };

      const authToken = jwt.sign(jwtPayload, localJWTSecret, { expiresIn: '7d' });

      // Set JWT in HTTP-only cookie
      res.cookie('gc-auth', authToken, {
        httpOnly: true,
        secure: true,
        sameSite: 'none',
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
      });

      console.log('OAuth successful for user:', user.email)

      // Build closepopup URL with the correct return URL
      const returnUrl = stateData.returnUrl || '/google-classroom/addon-discovery';
      res.redirect(`/google-classroom/closepopup?returnUrl=${encodeURIComponent(returnUrl)}`)

    } catch (error) {
      console.error('OAuth callback error:', error)
      res.redirect('/google-classroom/failed')
    }
  })

  // Authentication and helper routes
  app.get('/google-classroom/signin', (req, res) => {
    res.sendFile(require('path').join(__dirname, 'public/google-classroom-signin.html'))
  })

  app.get('/google-classroom/closepopup', (req, res) => {
    const returnUrl = req.query.returnUrl as string || '/google-classroom/addon-discovery';
    res.send(`
      <html>
        <head><title>Authentication Complete</title></head>
        <body>
          <script>
            // Redirect the opener (iframe) to the correct page
            window.opener.location.href = '${returnUrl}';
            window.close();
          </script>
          <p>Authentication successful. You can close this window.</p>
        </body>
      </html>
    `)
  })

  app.get('/google-classroom/failed', (req, res) => {
    res.send(`
      <html>
        <head><title>Authentication Failed</title></head>
        <body>
          <h2>Authentication Failed</h2>
          <p>Please try again.</p>
          <button onclick="window.close()">Close</button>
        </body>
      </html>
    `)
  })

  // Main iframe endpoints
  app.get('/google-classroom/addon-discovery', checkGoogleAuth, (req, res) => {
    // Log the query parameters for debugging
    console.log('Add-on discovery accessed with parameters:', req.query);
    console.log('JWT addon parameters:', req.gcAuth?.addon);
    res.sendFile(require('path').join(__dirname, 'public/google-classroom-discovery.html'))
  })

  app.get('/google-classroom/teacher-view', (req, res) => {
    res.sendFile(require('path').join(__dirname, 'public/google-classroom-teacher.html'))
  })

  app.get('/google-classroom/student-view', (req, res) => {
    res.sendFile(require('path').join(__dirname, 'public/google-classroom-student.html'))
  })

  app.get('/google-classroom/student-work-review', (req, res) => {
    res.sendFile(require('path').join(__dirname, 'public/google-classroom-student-work-review.html'))
  })

  app.get('/google-classroom/link-upgrade', (req, res) => {
    res.sendFile(require('path').join(__dirname, 'public/google-classroom-link-upgrade.html'))
  })

  // Resource launch endpoint
  app.get('/google-classroom/resource-launch', checkGoogleAuth, async (req, res) => {
    try {
      const { resource, view } = req.query

      // Get data from JWT (attached by middleware)
      const sessionData = {
        user: req.gcAuth!.user,
        tokens: req.gcAuth!.tokens,
        courseId: req.gcAuth!.addon?.courseId,
        itemId: req.gcAuth!.addon?.itemId,
        itemType: req.gcAuth!.addon?.itemType,
        addOnToken: req.gcAuth!.addon?.addOnToken
      }

      // Route to appropriate resource handler
      switch (resource) {
        case 'ap-launch-demo':
          return await googleClassroomLaunchDemo(res, sessionData, resource as string)

        case 'token-debugger':
          try {
            let debugData: any = {
              tokenInfo: sessionData,
              liveClassroomData: null,
              error: null
            }

            // If we have a courseId, fetch live classroom data
            if (sessionData.courseId) {
              try {
                const authClient = await setupAuthClient(sessionData)
                const classroomClient = google.classroom({ version: 'v1', auth: authClient })

                // Fetch course details
                const course = await classroomClient.courses.get({ id: sessionData.courseId })

                // Fetch teachers
                const teachers = await classroomClient.courses.teachers.list({ courseId: sessionData.courseId })

                // Fetch students - using pageSize to ensure we get all students
                console.log(`Fetching students for course ${sessionData.courseId} as user ${sessionData.user.sub}`)
                const students = await classroomClient.courses.students.list({
                  courseId: sessionData.courseId,
                  pageSize: 1000  // Ensure we get all students in one request
                })
                console.log(`Found ${students.data.students?.length || 0} students`)

                let currentUserRole = 'unknown'
                try {
                  await classroomClient.courses.teachers.get({ courseId: sessionData.courseId, userId: sessionData.user.sub })
                  currentUserRole = 'teacher'
                } catch (teacherError) {
                  try {
                    await classroomClient.courses.students.get({ courseId: sessionData.courseId, userId: sessionData.user.sub })
                    currentUserRole = 'student'
                  } catch (studentError) {
                    currentUserRole = 'unknown'
                    console.log(`User ${sessionData.user.sub} has UNKNOWN role in course ${sessionData.courseId}`)
                    console.log('Teacher error:', teacherError.message)
                    console.log('Student error:', studentError.message)
                  }
                }

                debugData.liveClassroomData = {
                  course: {
                    id: course.data.id,
                    name: course.data.name,
                    description: course.data.description,
                    enrollmentCode: course.data.enrollmentCode,
                    courseState: course.data.courseState,
                    creationTime: course.data.creationTime,
                    updateTime: course.data.updateTime
                  },
                  currentUser: {
                    role: currentUserRole,
                    email: sessionData.user.email,
                    name: sessionData.user.displayName
                  },
                  roster: {
                    teacherCount: teachers.data.teachers?.length || 0,
                    studentCount: students.data.students?.length || 0,
                    teachers: (teachers.data.teachers || []).map((teacher: any) => ({
                      userId: teacher.userId,
                      name: teacher.profile?.name?.fullName || 'Name not available',
                      email: teacher.profile?.emailAddress || 'Email not available',
                      photoUrl: teacher.profile?.photoUrl
                    })),
                    students: (students.data.students || []).map((student: any) => ({
                      userId: student.userId,
                      name: student.profile?.name?.fullName || 'Name not available',
                      email: student.profile?.emailAddress || 'Email not available',
                      photoUrl: student.profile?.photoUrl
                    }))
                  }
                }
              } catch (apiError: any) {
                debugData.error = `Error fetching live classroom data: ${apiError.message}`
                console.error('Classroom API error:', apiError)
              }
            } else {
              debugData.error = 'No courseId available - cannot fetch live classroom data'
            }

            // Return clean JSON
            return res.json(debugData)
          } catch (error: any) {
            console.error('Token debugger error:', error)
            return res.json({
              error: error.message,
              sessionData: sessionData
            })
          }

        case 'grading-demo':
          return res.send(`
            <h2>Google Classroom Grading Demo</h2>
            <p>This would integrate with Google Classroom's grading system.</p>
            <p>User: ${sessionData.user?.email}</p>
            <p>Course: ${sessionData.courseId}</p>
            <p>View: ${view}</p>
          `)

        default:
          return res.status(404).send(`Unknown resource: ${resource}`)
      }
    } catch (error) {
      console.error('Resource launch error:', error)
      res.status(500).send('Error launching resource')
    }
  })
}

export { oauth2Client, classroom }