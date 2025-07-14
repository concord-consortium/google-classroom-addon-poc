import express from 'express'
import path from 'path'
import cookieParser from 'cookie-parser'
import { setupGoogleClassroom } from "./google-classroom"
import { usePortalToken } from './middleware/usePortalToken'
import { httpsOptions, publicUrl } from './config'

const start = async () => {
  const app = express();
  // Configure cookie parser for Google Classroom (required for iframe context)
  app.use(cookieParser());
  usePortalToken(app);

  // Serve static files from public directory
  app.use(express.static(path.join(__dirname, 'public')));

  // Add JSON body parsing
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  setupGoogleClassroom(app);

  // We need to use HTTPS in development for Google Classroom add-on
  const port = 3000;
  const https = require('https');
  const server = https.createServer(httpsOptions, app);

  server.listen(port, () => {
    console.log(`Server running on https://localhost:${port}`);
    logEndpoints();
  })
}

function logEndpoints() {
  console.log('Available endpoints:')
  console.log(`Google Classroom Add-on Discovery: ${publicUrl}/google-classroom/addon-discovery`);
  console.log(`Google Classroom OAuth: ${publicUrl}/google-classroom/oauth/login`);
  console.log(`Google Classroom Test Page: ${publicUrl}/google-classroom-test.html`);

  console.log(`Homepage: ${publicUrl}`);
}

start().catch(error => {
  console.error('Failed to start server:', error)
  process.exit(1)
});
