import { createHash } from "crypto";

export const arrayIncludesSubstring = (array: string[], substring: string) => {
  return array.some(item => item.includes(substring));
}

export type GetUserTypeOptions = {
  treatAdministratorAsLearner?: boolean;
}
export const getUserType = (decodedToken: any, options: GetUserTypeOptions = {}) => {
  if (arrayIncludesSubstring(decodedToken.platformContext?.roles ?? [], '#Administrator')) {
    if (options.treatAdministratorAsLearner) {
      return 'learner';
    }
    return 'administrator';
  }
  if (arrayIncludesSubstring(decodedToken.platformContext?.roles ?? [], '#Instructor')) {
    return 'teacher';
  }
  if (arrayIncludesSubstring(decodedToken.platformContext?.roles ?? [], '#Learner')) {
    return 'learner';
  }
  return 'user';
}

export const ensureTrailingSlash = (url: string) => {
  if (url.endsWith('/')) {
    return url;
  }
  return `${url}/`;
}

export const computeClassHash = (s: string) => {
  return createHash("sha256").update(s).digest("hex").slice(0, 48);
}

export const computeUidHash = (s: string) => {
  return createHash("sha256").update(s).digest("hex").slice(0, 32);
}

export const getTeacherPage = ({apUrl, teUrl}: {apUrl: string, teUrl: string}) => {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <style>
        html, body {
          height: 100%;
          margin: 0;
          padding: 0;
          width: 100%;
        }
        body {
          display: flex;
          justify-content: center;
          align-items: center;
          height: 100vh;
          box-sizing: border-box;
        }
        .button-row {
          display: flex;
          gap: 20px;
        }
        button {
          padding: 12px 24px;
          font-size: 1rem;
          cursor: pointer;
        }
      </style>
    </head>
    <body>
      <div class="button-row">
        <button id="preview-btn">Preview</button>
        <button id="teacher-btn">Teacher Edition</button>
        <button id="dashboard-btn">Class Dashboard</button>
      </div>
      <script>
        document.getElementById('preview-btn').onclick = function() {
          window.location.assign('${apUrl}');
        };
        document.getElementById('teacher-btn').onclick = function() {
          window.location.assign('${teUrl}');
        };
        document.getElementById('dashboard-btn').onclick = function() {
          alert('The Class Dashboard linking is not implemented yet.');
        };
      </script>
    </body>
    </html>
  `
}