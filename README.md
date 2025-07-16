# Google Classroom Add-on POC

The Google Classroom Add-on POC is a proof-of-concept integration that demonstrates how to embed Concord Consortium's activities within Google Classroom assignments. This add-on enables teachers to discover and attach activities directly to their Google Classroom coursework, and provides students with access those activities from within Google Classroom.

## Development

The code consists of a Node.js/TypeScript server application with Express.js that handles Google Classroom integration, OAuth2 authentication, and Activity Player compatibility.

### Prerequisites

1. Access to the different concord-workspace accounts (logins in 1password):
  - Admin account
    - Used to change rules of the workspace (i.e. adding users, managing access to add-on, etc), by logging in to admin.google.com
    - Also used to change configuration of the add-on itself, by going to the Google Cloud project “Test Concord add on”
  - Teacher accounts
    - Used to test teacher view of add-on and to assign materials to students
  - Student accounts
    - Used to test student view of add-on

2. Access to the Google client environment variables + firebase credentials
- Find the relevant environment variables and download the firebase account key for report-service-dev from 1password

### Initial Setup

1. **Clone and Install Dependencies**
   ```bash
   git clone https://github.com/concord-consortium/google-classroom-addon-poc.git
   cd google-classroom-addon-poc
   npm install
   ```

2. **Generate HTTPS Certificates** (required for Google Classroom integration)
   ```bash
   npm run setup-https
   ```
   This will:
   - Install mkcert if not already installed
   - Generate SSL certificates for localhost development
   - Create certificates in the `certs/` directory

3. **Environment Configuration**
   Create a `.env` file in the project root with the required variables:
   ```env
   PUBLIC_URL=https://localhost:3000
   LOCAL_JWT_SECRET=your-strong-jwt-secret-here
   AP_BASE_URL=https://activity-player.concord.org
   GOOGLE_CLIENT_ID=your-google-oauth-client-id
   GOOGLE_CLIENT_SECRET=your-google-oauth-client-secret
   ```

4. **Firebase Configuration**
   - Place your Firebase service account key file at:
     ```
     server/firebase-configs/report-service-dev.json
     ```

5. **Start the Development Server**
   ```
   npm start
   ```
   The server will start on `https://localhost:3000`

## Developing the Add-on in Google Classroom

1. **Start the Development Server**
   ```
   npm start
   ```
   Ensure the server is running on `https://localhost:3000`

2. **Development of teacher views**
  - Sign in to google classroom as a teacher in the concord-workspace domain
  - Create an assignment
  - Click on the add-on to view the discovery page
  - Sign in again with the teacher log in (if necessary)
  - Once the activity has been assigned, you can preview it by clicking on the attachment

3. **Development of student views**
  - Sign in to google classroom as a student in the concord-workspace domain
  - Open an assignment that has the add-on attached
  - Click on the add-on and sign in with google again to view the attached activity

## Available Scripts

### `npm start`
Runs the server in development mode with hot reloading via tsx.
The server will be available at `https://localhost:3000`.

### `npm run setup-https`
Generates HTTPS certificates for local development using mkcert.
This is required for Google Classroom integration.

### `npm run clean-certs`
Removes generated SSL certificates from the `certs/` directory.

## Learn More

- [Google Classroom Add-ons Developer Guide](https://developers.google.com/classroom/add-ons)
- [Google Classroom API Documentation](https://developers.google.com/classroom)