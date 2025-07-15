import * as jwt from "jsonwebtoken"
import { google } from 'googleapis'
import { localJWTSecret, localJWTAlg, publicUrl, apBaseUrl, googleClientId, googleClientSecret } from "../config"
import { getTeacherPage } from "../helpers"

export const googleClassroomLaunchDemo = async (res: any, sessionData: any, resource: string) => {
  try {
    // Setup OAuth client with user tokens
    const authClient = new google.auth.OAuth2(
      googleClientId,
      googleClientSecret,
      `${publicUrl}/google-classroom/oauth/callback`
    )
    authClient.setCredentials(sessionData.tokens)

    // Get user profile
    const userProfile = sessionData.user
    const courseId = sessionData.courseId

    // Determine user type based on course role
    let userType = 'user'

    if (courseId) {
      try {
        const classroomClient = google.classroom({ version: 'v1', auth: authClient })

        // Use the correct user ID field (sub instead of id)
        const userId = userProfile.sub || userProfile.id
        console.log('Using userId for API calls:', userId)

        // Check if user is a teacher
        try {
          await classroomClient.courses.teachers.get({ courseId, userId })
          userType = 'teacher'
        } catch (teacherError) {
          // Check if user is a student
          try {
            await classroomClient.courses.students.get({ courseId, userId })
            userType = 'learner'
          } catch (studentError) {
            // Default to user
            userType = 'user'
          }
        }
      } catch (error) {
        console.error('Error checking course role:', error)
      }
    } else {
      console.log('No courseId provided - cannot determine role')
    }

    console.log('Final userType:', userType)

    // Create a token that can be verified by our portal API
    const portalToken = {
      user: userProfile.sub,
      user_type: userType, // Include the determined user type
      platformContext: {
        contextId: courseId,
        context: { id: courseId, title: `Google Classroom Course ${courseId}` },
        resource: { id: resource },
      },
      userInfo: {
        name: userProfile.displayName,
        email: userProfile.email,
        given_name: userProfile.displayName?.split(' ')[0] || '',
        family_name: userProfile.displayName?.split(' ').slice(1).join(' ') || '',
      },
      iss: 'https://classroom.google.com',
      googleClassroomToken: sessionData
    }

    // Sign the token with our local secret
    const localJWT = jwt.sign(portalToken, localJWTSecret, { algorithm: localJWTAlg })

    // Build Activity Player parameters
    const rawAPParams = {
      activity: "https://authoring.lara.staging.concord.org/api/v1/activities/1416.json",
      domain: `${publicUrl}/`,
      token: localJWT,
      answersSourceKey: 'classroom.google.com', // Google Classroom platform identifier
    }

    const apUrl = new URL(apBaseUrl)
    apUrl.search = new URLSearchParams(rawAPParams).toString()

    switch (userType) {
      case "learner":
        return res.redirect(apUrl.toString())

      case "teacher":
        const teacherEditionParams = new URLSearchParams({
          ...rawAPParams,
          mode: "teacher-edition",
          show_index: "true",
        })
        const teUrl = new URL(apUrl)
        teUrl.search = teacherEditionParams.toString()

        return res.status(200).send(
          getTeacherPage({
            apUrl: apUrl.toString(),
            teUrl: teUrl.toString()
          })
        )

      default:
        return res.status(403).send("This tool is only available for learners and teachers.")
    }

  } catch (error) {
    console.error('Error in Google Classroom launch demo:', error)
    return res.status(500).send('Error launching resource')
  }
}