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