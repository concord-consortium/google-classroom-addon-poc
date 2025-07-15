import { publicUrl, googleClientId, googleClientSecret } from './config';
import { google } from 'googleapis';
import { checkGoogleAuth } from './middleware/checkGoogleAuth';

export const addGoogleClassroomApiRoutes = (app: any, oauth2Client: any, classroom: any) => {

  // Helper function to get auth data from JWT (attached by middleware)
  const getAuthData = (req: any) => {
    return req.gcAuth;
  }

  // Get user profile
  app.get('/google-classroom/profile', checkGoogleAuth, async (req: any, res: any) => {
    try {
      const authData = getAuthData(req)
      if (!authData?.user || !authData?.tokens) {
        return res.status(401).json({ error: 'Unauthorized' })
      }

      res.json({
        user: authData.user,
        authenticated: true
      })
    } catch (error) {
      console.error('Error getting profile:', error)
      res.status(500).json({ error: 'Failed to get profile' })
    }
  })

  // Helper function to setup OAuth client with user tokens
  const setupAuthClient = async (authData: any) => {
    const client = new google.auth.OAuth2(
      googleClientId,
      googleClientSecret,
      `${publicUrl}/google-classroom/google/callback`
    )

    console.log("client:", client);

    console.log('Setting up auth client with tokens:', {
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

  // Get course roster
  app.get('/google-classroom/courses/:courseId/roster', checkGoogleAuth, async (req: any, res: any) => {
    try {
      const authData = getAuthData(req)
      if (!authData?.user || !authData?.tokens) {
        return res.status(401).json({ error: 'Unauthorized' })
      }

      const authClient = await setupAuthClient(authData)
      const classroomClient = google.classroom({ version: 'v1', auth: authClient })

      const { courseId } = req.params

      // Get teachers
      const teachers = await classroomClient.courses.teachers.list({ courseId })

      // Get students
      const students = await classroomClient.courses.students.list({ courseId })

      res.json({
        teachers: teachers.data.teachers || [],
        students: students.data.students || []
      })
    } catch (error) {
      console.error('Error getting course roster:', error)
      res.status(500).json({ error: 'Failed to get course roster' })
    }
  })

  // Get course details
  app.get('/google-classroom/courses/:courseId', checkGoogleAuth, async (req: any, res: any) => {
    try {
      const authData = getAuthData(req)
      if (!authData?.user || !authData?.tokens) {
        return res.status(401).json({ error: 'Unauthorized' })
      }

      const authClient = await setupAuthClient(authData)
      const classroomClient = google.classroom({ version: 'v1', auth: authClient })

      const { courseId } = req.params

      const course = await classroomClient.courses.get({ id: courseId })

      res.json({ course: course.data })
    } catch (error) {
      console.error('Error getting course details:', error)
      res.status(500).json({ error: 'Failed to get course details' })
    }
  })

  // Resource selection for deep linking equivalent
  app.post('/google-classroom/select-resource', checkGoogleAuth, async (req: any, res: any) => {
    try {
      const authData = getAuthData(req)
      if (!authData?.user || !authData?.tokens) {
        return res.status(401).json({ error: 'Unauthorized' })
      }

      const { resource } = req.body;
      const { itemId, courseId, itemType, addOnToken } = authData.addon;

      // Validate required parameters
      if (!resource || !resource.slug) {
        return res.status(400).json({ error: 'Missing resource information' })
      }

      // Create the attachment URL based on the selected resource
      const attachmentUrl = `${publicUrl}/google-classroom/resource-launch?resource=${resource.slug}`

      // Setup OAuth client with user tokens
      const authClient = await setupAuthClient(authData)
      const classroomClient = google.classroom({ version: 'v1', auth: authClient })

      // Create the add-on attachment in Google Classroom
      const attachmentBody = {
        title: resource.title,
        studentViewUri: {
          uri: attachmentUrl
        },
        teacherViewUri: {
          uri: attachmentUrl
        },
        // For activity-type attachments, we need studentWorkReviewUri
        studentWorkReviewUri: {
          uri: `${attachmentUrl}&view=review`
        },
        // Set max points for grading (optional)
        maxPoints: resource.maxPoints || 100
      }

      let attachmentResponse;

      // Create attachment using the appropriate endpoint based on itemType
      if (itemType === 'courseWork') {
        attachmentResponse = await classroomClient.courses.courseWork.addOnAttachments.create({
          courseId: courseId,
          itemId: itemId,
          addOnToken: addOnToken,
          requestBody: attachmentBody
        })
      } else if (itemType === 'courseWorkMaterial') {
        attachmentResponse = await classroomClient.courses.courseWorkMaterials.addOnAttachments.create({
          courseId: courseId,
          itemId: itemId,
          addOnToken: addOnToken,
          requestBody: attachmentBody
        })
      }

      console.log('Attachment created successfully:', attachmentResponse.data)

      // Return success response
      res.json({
        success: true,
        attachmentId: attachmentResponse.data.id,
        attachment: attachmentResponse.data
      })
    } catch (error) {
      console.error('Error creating attachment:', error)
      res.status(500).json({ error: 'Failed to create attachment' })
    }
  })


}