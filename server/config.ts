import fs from 'fs'
import path from "path"
import 'dotenv/config'

const requiredEnvVars = ['PUBLIC_URL', 'LOCAL_JWT_SECRET', 'AP_BASE_URL', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET']
const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName])
if (missingEnvVars.length > 0) {
  console.error(`Missing required environment variables: ${missingEnvVars.join(', ')}`)
  process.exit(1)
}

export let publicUrl = process.env.PUBLIC_URL!
if (publicUrl.endsWith('/')) {
  publicUrl = publicUrl.slice(0, -1)
}

export const localJWTSecret = process.env.LOCAL_JWT_SECRET!
export const apBaseUrl = process.env.AP_BASE_URL!

// Must match the Google OAuth client ID and secret configured in the Google Cloud Console
export const googleClientId = process.env.GOOGLE_CLIENT_ID || ''
export const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET || ''

// Must match the scopes configured in the Google Cloud Console
export const googleOAuthScopes = [
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/classroom.addons.teacher',
  'https://www.googleapis.com/auth/classroom.addons.student',
  'https://www.googleapis.com/auth/classroom.courses',
  'https://www.googleapis.com/auth/classroom.courses.readonly',
  'https://www.googleapis.com/auth/classroom.rosters.readonly',
  'https://www.googleapis.com/auth/classroom.coursework.me',
  'https://www.googleapis.com/auth/classroom.courseworkmaterials',
  'https://www.googleapis.com/auth/classroom.course-work.readonly',
  'https://www.googleapis.com/auth/classroom.coursework.students',
]

// HTTPS configuration for local development
export const useHttps = true
export const httpsOptions = (() => {
  try {
    const certPath = path.join(__dirname, '..', 'certs', 'localhost.pem')
    const keyPath = path.join(__dirname, '..', 'certs', 'localhost-key.pem')

    if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
      return {
        cert: fs.readFileSync(certPath),
        key: fs.readFileSync(keyPath)
      }
    } else {
      console.warn('⚠️  HTTPS certificates not found. Run `npm run setup-https` to generate them.')
      return null
    }
  } catch (error) {
    console.warn('⚠️  Error loading HTTPS certificates:', error.message)
    return null
  }
})()

export let firebaseAppConfig: { clientEmail: string, privateKey: string }
try {
  const configPath = path.join(__dirname, 'firebase-configs', 'report-service-dev.json')
  const configContent = fs.readFileSync(configPath, 'utf8')
  firebaseAppConfig = JSON.parse(configContent)
  if (!firebaseAppConfig.privateKey || typeof firebaseAppConfig.privateKey !== 'string' || !firebaseAppConfig.privateKey.trim()) {
    throw new Error('Missing or empty "privateKey" in report-service-dev.json')
  }
  if (!firebaseAppConfig.clientEmail || typeof firebaseAppConfig.clientEmail !== 'string' || !firebaseAppConfig.clientEmail.trim()) {
    throw new Error('Missing or empty "clientEmail" in report-service-dev.json')
  }
} catch (err) {
  throw new Error(`Failed to load or parse report-service-dev.json: ${err.message}`)
}

export const localJWTAlg = 'HS256';

