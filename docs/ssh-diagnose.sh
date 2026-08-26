#!/usr/bin/env bash
# Run this over SSH on the host. It answers, in one pass, why /api does not
# respond: whether the dependencies installed, whether the app starts, and what
# it prints when it does.
#
#   ssh -p 65002 u293552885@145.79.212.239
#   cd ~/domains/iqbaba.in/public_html    # confirm the real path first
#   bash docs/ssh-diagnose.sh
#
# Paste the whole output back. Nothing here changes anything.

echo "===== where and what ====="
pwd
node --version 2>&1 || echo "node: NOT ON PATH"
npm --version 2>&1 || echo "npm: NOT ON PATH"
echo

echo "===== did the dependencies actually install? ====="
# Dependencies are declared in the root package.json now, so root node_modules
# is what matters; Node resolves upward from backend/. backend/node_modules is
# reported too because a local install puts them there.
for d in node_modules backend/node_modules; do
  if [ -d "$d" ]; then echo "$d: present ($(ls "$d" | wc -l) packages)"
  else echo "$d: absent"; fi
done
found=0
for m in express mysql2 bcryptjs dotenv cors helmet jsonwebtoken; do
  if [ -d "node_modules/$m" ] || [ -d "backend/node_modules/$m" ]; then
    echo "  ok      $m"; found=1
  else
    echo "  MISSING $m"
  fi
done
[ "$found" = "0" ] && echo "  Nothing installed at all - fix: npm install"
echo

echo "===== is there an entry file where the platform looks? ====="
# Hostinger's Web App "Entry file" defaults to app.js at the project root.
if [ -f app.js ]; then
  echo "app.js: present -> $(grep -m1 require app.js)"
else
  echo "app.js: MISSING - a platform defaulting to app.js starts nothing"
fi
[ -f backend/server.js ] && echo "backend/server.js: present" || echo "backend/server.js: MISSING"
[ -f package.json ] && echo "start script: $(node -p "require('./package.json').scripts.start" 2>/dev/null)"
[ -f package-lock.json ] && echo "package-lock.json: present (npm ci will work)" \
                        || echo "package-lock.json: absent (npm ci would fail)"
echo

echo "===== is anything listening? ====="
(command -v ss >/dev/null && ss -lntp 2>/dev/null | head -20) \
  || (command -v netstat >/dev/null && netstat -lntp 2>/dev/null | head -20) \
  || echo "no ss/netstat available"
pgrep -af "node .*server\.js" || echo "no node server.js process running"
echo

echo "===== what does the web root actually contain? ====="
ls -la | head -30
echo "--- .htaccess ---"
[ -f .htaccess ] && cat .htaccess || echo "(no .htaccess)"
echo

echo "===== environment reaching the shell ====="
# Values are deliberately not printed - only whether each name is set.
for k in PORT NODE_ENV DB_HOST DB_USER DB_NAME DB_PASSWORD JWT_SECRET ALLOWED_ORIGINS; do
  if [ -n "${!k}" ]; then echo "  set    $k"; else echo "  unset  $k"; fi
done
echo "(hPanel variables may only be injected into the app runtime, not this shell.)"
echo

echo "===== start it by hand: the real error message ====="
# The app prints [boot] as its first statement, then the port it bound and
# where that value came from, then the database user it connected as.
timeout 25 node app.js 2>&1 | head -40
echo
echo "===== platform logs ====="
ls -la ~/logs 2>/dev/null | head -20 || echo "(no ~/logs)"
for f in ~/logs/*error* ~/logs/*stderr* ../logs/*error*; do
  [ -f "$f" ] && { echo "--- $f (last 25) ---"; tail -25 "$f"; }
done
