import * as jwt from "jsonwebtoken"

import { localJWTSecret, localJWTAlg, publicUrl, apBaseUrl } from "../config";
import { getUserType, getTeacherPage } from "../helpers";

export const apLaunchDemo = (res: any, token: any) => {
  // reencode the token to a JWT that we can verify the signature of
  const localJWT = jwt.sign(token, localJWTSecret, {algorithm: localJWTAlg})

  const rawAPParams = {
    activity: "https://authoring.lara.staging.concord.org/api/v1/activities/1416.json",
    domain: `${publicUrl}/`,
    token: localJWT,
    answersSourceKey: new URL(token.iss).hostname, // this is the platform URL
  }
  const apUrl = new URL(apBaseUrl);
  apUrl.search = new URLSearchParams(rawAPParams).toString();

  switch (getUserType(token, {treatAdministratorAsLearner: true})) {
    case "learner":
      return res.redirect(apUrl.toString());
      break;

    case "teacher":
      const teacherEditionParams = new URLSearchParams({...rawAPParams,
        mode: "teacher-edition",
        show_index: "true",
      })
      const teUrl = new URL(apUrl);
      teUrl.search = teacherEditionParams.toString();

      return res.status(200).send(getTeacherPage({apUrl: apUrl.toString(), teUrl: teUrl.toString()}));
      break

    default:
      return res.status(403).send("This tool is only available for learners and teachers.");
  }
  /*
    teacher notes:

    - the portal offering api response has a has_teacher_edition boolean and reports that look like this:
      "external_reports": [{
        "id": 1,
        "name": "Activity Player Class Dashboard",
        "url": "https://learn.portal.staging.concord.org/portal/offerings/1167/external_report/1",
        "launch_text": "Class Dashboard",
        "supports_researchers": true
      }]

  */
}
