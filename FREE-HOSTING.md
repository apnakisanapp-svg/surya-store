# Free preview website (no card needed)

What you get: your PC is the "master" (you add products in admin on your PC). A free copy of the website runs on Render
so people can see it on their phone. Orders are NOT taken on the free copy (it shows "order on WhatsApp"),
because free hosts can lose data. When real orders start, move to a paid server (see README.md).

Two small things keep it working:
- Your PC saves its data to a PRIVATE GitHub folder every 5 minutes and when you close it (Ctrl+C).
- The free copy loads that data when it starts, and restarts itself when new data arrives (about every 10 minutes).
- UptimeRobot (free) visits the site every 5 minutes so Render does not put it to sleep.

## A. GitHub (free account)
1. github.com -> Sign up.
2. Create TWO repositories (+ icon -> New repository):
   - `surya-store`  (Private)  -> this holds the code
   - `surya-data`   (Private)  -> this holds your products/photos. Tick "Add a README file".
3. Open `surya-store` -> "uploading an existing file" -> drag the CONTENTS of the project folder
   (admin-web, scripts, src, test, web, package.json, package-lock.json, Dockerfile, README.md ...). Do NOT upload node_modules or data. Commit.
4. Token for the data folder: GitHub -> your photo -> Settings -> Developer settings -> Personal access tokens ->
   Fine-grained tokens -> Generate. Repository access: "Only select repositories" -> `surya-data`.
   Permissions -> Repository permissions -> **Contents: Read and write**. Generate and COPY the token (shown once).

## B. Your PC (master)
1. In the project folder create a file named `.env` (copy `.env.example`) and add these lines:
```
SYNC_REPO=YOURGITHUBNAME/surya-data
SYNC_TOKEN=paste-the-token-here
```
2. `npm start`. After about 20 seconds the window shows "Sync: database saved". Add your products in admin as usual.
3. Close with Ctrl+C (it saves one last time). Never share the token or the .env file.

## C. Render (free website copy)
1. render.com -> sign up with GitHub (no card).
2. New -> Web Service -> choose `surya-store` -> Instance type: **Free**.
3. Build command: `npm ci --omit=dev`   Start command: `node src/start.js`
4. Environment variables (Add):
```
NODE_ENV=production
APP_SECRET=any-long-random-text
SITE_URL=https://your-service-name.onrender.com
SYNC_REPO=YOURGITHUBNAME/surya-data
SYNC_TOKEN=the-same-token
SYNC_MODE=pull
CATALOGUE_ONLY=1
```
5. Deploy. In a minute your site opens at the onrender.com address.
6. Changed something on your PC? Wait 5-15 minutes: the copy restarts and shows it.

## D. Keep it awake (free)
uptimerobot.com -> Add monitor -> HTTP(s) -> your onrender.com address -> every 5 minutes.

## Limits (honest)
- Free copy shows the products you saved on your PC, not live stock changes from orders.
- Photos up to 25 MB each are synced. GitHub repos should stay under about 1 GB.
- Render free is slow for the first visitor after a restart (up to a minute).
- Do not take real orders here. For real orders use a paid server and `SYNC_MODE=push` (or no sync).
