Deploying RUZ Interiors to Render (quick guide)

1) Prepare repo
- Ensure your code is committed to a GitHub repo and `main` branch is up-to-date.

2) Create Render service
- Sign in to Render (https://dashboard.render.com) and create a new Web Service.
- Connect your GitHub account and select the repo.
- Branch: `main`
- Build Command: `npm install`
- Start Command: `npm start`

3) Set environment variables (Render dashboard -> Service -> Environment)
- `ADMIN_USERNAME` = your_admin_username
- `ADMIN_PASSWORD` = your_admin_password
- `SESSION_SECRET` = any strong secret
- `PORT` = 3000 (optional)

4) Notes & verification
- After deployment Render will build and run the app. Visit the assigned URL and go to `/admin`.
- Use the `ADMIN_USERNAME`/`ADMIN_PASSWORD` you set.

Caveats
- This project uses SQLite which is stored on the instance filesystem. Render instances are ephemeral across deploys — if you need durable storage or multi-instance scaling, migrate to PostgreSQL or another hosted DB and update `db/database.js`.

Optional next steps I can do for you:
- Create a `render.yaml` manifest and open a PR.
- Migrate the project to use PostgreSQL and update startup scripts.
- Deploy the repo for you (I’ll need repo + Render access or an invitation).
