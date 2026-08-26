# Running IQ Baba on Hostinger

Hostinger's Git deployment publishes this repository into `public_html`. That
covers the pages, but it does not start a server — so `/api/*` reaches the web
server, which knows nothing about it and answers with its own HTML 404. That is
what leaves every dropdown on its built-in fallback list and makes login fail
with "The string did not match the expected pattern."

To fix it, run `backend/server.js` as a Node.js application.

## 1. Rotate the exposed credentials first

`.env` and `backend/.env` were committed to this repository while it was
public, and they were also published into `public_html`. Treat the database
password and `JWT_SECRET` in them as known to strangers:

- Change the database user's password in hPanel → Databases → MySQL.
- Choose a new `JWT_SECRET`. Everyone currently signed in gets signed out,
  which is the point.
- Change the admin password: `npm run create-admin -- admin admin@… '<new>'`

The files are no longer tracked, so they will not be republished. They remain
in the repository's history, which is why rotating is the fix and deleting is
not.

## 2. Create the Node.js application

hPanel → Advanced → **Node.js** → Create application:

| Field | Value |
|---|---|
| Node version | 18 or newer (Express 5 needs it) |
| Application root | the directory Git deploys into, e.g. `domains/iqbaba.in/public_html` |
| Application URL | `iqbaba.in` |
| Application startup file / **Entry file** | `backend/server.js` (or leave the `app.js` default — the repository has one that loads it) |
| **Start command** | `npm start` |

Pointing the application URL at the domain root lets Express serve both the
pages and the API from one address. `js/config.js` then stays empty, because
deriving the API address from the page's own address is correct again.

If you would rather keep the pages on LiteSpeed and run the API on a
subdomain — say `api.iqbaba.in` — that works too: set the application URL to
the subdomain, and set the address in `js/config.js`:

```js
window.IQBABA_API_BASE = 'https://api.iqbaba.in';
```

## 3. Set the environment variables

In the same Node.js panel, add these rather than uploading a `.env`:

| Name | Value |
|---|---|
| `NODE_ENV` | `production` |
| `DB_HOST` | `localhost` |
| `DB_USER` | your Hostinger MySQL user, e.g. `u123456_iqbaba` |
| `DB_PASSWORD` | the password you just rotated |
| `DB_NAME` | your Hostinger database name |
| `JWT_SECRET` | the new long random string |
| `BASE_PATH` | leave empty when serving from the domain root |
| `ALLOWED_ORIGINS` | `https://iqbaba.in,https://www.iqbaba.in` |

Without `ALLOWED_ORIGINS` any site may call the API, and the app says so in
the log at startup. Setting it also narrows the `connect-src` in the
Content-Security-Policy to those origins.

Do **not** set `PORT` — Hostinger assigns one and the app reads it.

`NODE_ENV=production` also keeps stack traces out of error responses; they are
only included when it is `development`.

The committed defaults were `DB_USER=root` and `DB_NAME=olympiad_db`, which are
right for a laptop and wrong here. Hostinger prefixes both with your account
number.

## 4. Install and start

Run the install step, then restart.

The dependencies are declared in the **root** `package.json`, which is where a
platform runs `npm install`. Node resolves upward from `backend/`, so they are
found from there. This matters: they used to live only in
`backend/package.json`, pulled in by a `postinstall` hook, and an install run
with `--ignore-scripts` or `npm ci` skips that hook. The install then reports
success having installed nothing, and the app dies on
`Cannot find module 'express'` before serving a single request.

On startup the app runs `backend/migrate-db.js`, which creates any missing
tables — including `admins`, which older databases lack.

To create the first admin, either set `ADMIN_USERNAME`, `ADMIN_EMAIL` and
`ADMIN_PASSWORD` before the first start, or run afterwards:

```
npm run create-admin -- admin admin@yourschool.com '<password>'
```

The same command resets the password of an existing admin.

## 5. Protect the server-side files

The Git deployment publishes the whole repository into `public_html`, so
`/.env`, `/database_schema.sql` and `/backend/...` are all fetchable URLs.

`docs/htaccess-rules.txt` has rules that deny them. **Append** them to the
`.htaccess` already in `public_html` — never replace that file. Hostinger keeps
the Passenger directives that route requests to the Node app in it, and
overwriting them takes the API offline: `/api/*` starts answering 404 because
the web server, not Node, is handling it.

This repository deliberately ships no `.htaccess` for that reason.

## 6. Check it

Open **`/diagnostics.html`**. It reports which API address is in use, whether
the current `js/app.js` is deployed, and whether `/api/*` answers with JSON or
with an HTML error page. Everything green means the dropdowns are reading the
admin tables.

If the boards list is still the built-in four, hard-reload — the browser caches
`js/app.js`.

## Before any deploy

Take a database snapshot:

```
./backend/backup-db.sh
```
