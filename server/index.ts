import express from 'express'
import path from 'path'
import cookieParser from 'cookie-parser'
import { setupGoogleClassroom } from "./google-classroom"
import { usePortalToken } from './middleware/usePortalToken'
import { httpsOptions, publicUrl } from './config'

const start = async () => {
  const app = express();

  // Configure CORS for Activity Player integration
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    if (req.method === 'OPTIONS') {
      res.sendStatus(200);
    } else {
      next();
    }
  });

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
  })
};

start().catch(error => {
  console.error('Failed to start server:', error)
  process.exit(1)
});
