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

export const setupGoogleClassroom = (app: Express) => {
  // Add Google Classroom API routes
  const { addGoogleClassroomApiRoutes } = require('./google-classroom-api')
  addGoogleClassroomApiRoutes(app, oauth2Client, classroom)

  // Add Google Classroom Portal API routes
  const { addGoogleClassroomPortalApiRoutes } = require('./google-classroom-portal-api')
  addGoogleClassroomPortalApiRoutes(app, oauth2Client, classroom)

    // OAuth login route (stateless version)
  app.get('/google-classroom/google', (req, res) => {
    // Store Google Classroom parameters in cookies for later use
    if (req.query.courseId) {
      const addonParams = { ...req.query };
      const paramsCookie = jwt.sign(addonParams, localJWTSecret, { expiresIn: '1h' });
      res.cookie('gc-addon-params', paramsCookie, {
        httpOnly: true,
        secure: true,
        sameSite: 'none',
        maxAge: 60 * 60 * 1000 // 1 hour
      });
    }

    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: googleOAuthScopes,
      state: JSON.stringify({
        returnUrl: req.query.returnUrl || '/google-classroom/addon-discovery'
      })
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

      // Get stored addon parameters from cookie if they exist
      let addonParams: JwtPayload|string = {};
      try {
        const paramsCookie = req.cookies['gc-addon-params'];
        if (paramsCookie) {
          addonParams = jwt.verify(paramsCookie, localJWTSecret);
          // Clear the temporary params cookie
          res.clearCookie('gc-addon-params');
        }
      } catch (error) {
        console.log('No valid addon params found in cookie');
      }

      // Create JWT with user data, tokens, and addon params (stateless approach)
      const jwtPayload = {
        user,
        tokens: tokenData,
        addon: addonParams
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

      // Redirect to closepopup page
      res.redirect('/google-classroom/closepopup')

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
    res.send(`
      <html>
        <head><title>Authentication Complete</title></head>
        <body>
          <script>
            // Redirect the opener (iframe) to the addon discovery page
            window.opener.location.href = '/google-classroom/addon-discovery';
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
          return res.send(`<div style="white-space: pre-wrap; font-family: monospace;">${JSON.stringify(sessionData, null, 2)}</div>`)

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