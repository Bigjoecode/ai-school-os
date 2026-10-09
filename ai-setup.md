1. Get the key from OpenAI

Go to https://platform.openai.com and sign in or create an account.
Open Settings → Billing, add a payment card and buy some credit ($10–20 is plenty to start). The key won't work without credit.
While you're in Billing, open Limits and set a monthly budget, e.g. $30, so costs can never run away.
Open API keys, click Create new secret key and name it ai-school-portal.
Copy the key now (it starts with sk-…). OpenAI only shows it once, so keep it somewhere private like a password manager. Don't paste it into this chat.
2. Add it to the app in cPanel

Log in to cPanel and open Setup Node.js App (under Software).
Find the app for ai-schoolportal.mejortechworld.com and click the pencil (Edit) icon.
Scroll to Environment variables and click Add variable:
Name: OPENAI_API_KEY
Value: paste your sk-… key
Click Save, then Restart at the top of the app page.
Optional but recommended: add ANTHROPIC_API_KEY the same way, using a key from console.anthropic.com. If OpenAI ever fails, the app switches to Anthropic automatically.
3. Switch OpenAI on in the platform console

Sign in to the portal as the platform owner and go to Platform → AI models.
Put OpenAI first in the provider order, with Anthropic second if you added it.
Check the model names for each tier. Standard is for everyday chat and tutoring; Advanced is for deeper work. Keep whatever is already filled in unless you know otherwise.
Press Test on OpenAI for both tiers. Each should come back with a green tick.
Click Save.
4. Check it works

Sign in as student@greenfield.demo, open AI tutor, and ask a question. You should get a real answer.
Tap the mic. It should now use the clearer OpenAI voice instead of the phone's own voice.
Within a few minutes, Platform → System health should stop reporting "AI isn't connected yet".
If something goes wrong:

Test fails with "invalid key": the key was copied with a space or cut off. Paste it again in cPanel, Save, Restart.
Test fails with "quota" or "billing": add credit on OpenAI's Billing page.
Still "AI isn't connected": you probably saved but didn't Restart the app in cPanel.
Once it's working, tell me and I'll check the live server log to confirm the AI calls are going through.

## Update: offline exams, lesson modules and the teacher workbook

Offline exams, lesson modules with check-ins, and the weekly teacher workbook are now live. The BECE Christian Religious Studies syllabus is added too (176 topics); I found it inside the combined BECE PDF you added.

On the live site, the new pages load and the main features answer correctly for the demo teacher, student and admin. The live error log shows no new errors since the deploy. JSS 1 Christian Religious Studies now has its BECE topics. I tested the full offline exam run on my machine, not on the live site.

### Offline exams

Turning it on: in an online exam, open the new Offline tab and set when it can be taken and when answers must be synced by. The app gives you a start code and a printable invigilator sheet.
Downloading:
Students tap Download for offline on their own phone the day before.
On a shared school laptop, a teacher taps Prepare this device. Each student then signs in with their admission number and a 6-digit PIN printed on the invigilator sheet.
In the hall: no internet is needed. The exam stays locked until the invigilator reads out the start code. The answer key never goes onto the device.
After the exam: answers sync and are marked automatically once there's a connection. The teacher sees a live board of downloaded, started, handed in and synced. Anything suspicious is flagged, such as a wrong device clock or overtime. Hand-ins that look tampered with wait for the teacher to accept or reject.
Security: start codes, PINs and signing keys are encrypted in the database. I added that before deploying.
### Lesson modules and classroom check-ins

Building a module: a module is a lesson made of notes, videos, pictures and materials, plus short check-ins. Questions can be typed, taken from the question bank or drafted by AI. Videos can pause at set points to ask a question.
Students: My lessons shows their modules. The next step stays locked until they pass the check-in (60% by default).
Teach in class: this opens a full-screen projector view.
At a check-in, students answer on their phones with a join code while the teacher watches the results come in. With no devices, the teacher counts hands or ticks each student.
The app then suggests Re-teach (fewer than 70% understood) or Move on before the lesson continues.
Every class session is saved as evidence that the class took part.
Where results go: check-ins feed topic mastery, Class insights, a new "Classroom check-ins this week" tile on the success dashboard, the parent's child page and the weekly parent update.
### Weekly workbook and content library

Weekly workbook: each class and week brings together the topic from the scheme of work, the lesson plan, the modules, the materials and last week's check-in results. Create from topic drafts a whole module with AI.
Content library: admins and heads of department share modules that any teacher of that subject can copy into their class.
Demo: the demo teacher has a sample module ready, "Fractions: adding and subtracting", for JSS 1 B Mathematics.
### Things to know

Offline exams:
A device must have opened the app once while online before it works offline.
Downloaded answers on a shared laptop are lost if someone clears the browser data before they sync.
Tested in Chrome/Edge only, not Safari or Firefox.
Video quizzes: with YouTube videos, if YouTube's player can't load, the questions show under the video instead.
Saving lessons offline: lessons can be saved for offline reading, but videos are not saved.
Data requests: done since. A student's data export now includes lesson progress, check-ins, offline exam hand-ins and EduGames data; offline exam PINs and keys are never exported.
CRS syllabus: some Bible references were cut off or look misprinted in the PDF. They're kept as printed and listed in the file, so a CRS teacher should check them.
