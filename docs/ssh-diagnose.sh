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
# The root package.json declares none; backend/ has them all, pulled in by a
# postinstall hook. A platform that installs with --ignore-scripts or npm ci
# skips that hook, and then the app cannot start at all.
if [ -d backend/node_modules ]; then
  echo "backend/node_modules: present ($(ls backend/node_modules | wc -l) packages)"
  for m in express mysql2 bcrypt bcryptjs dotenv cors helmet jsonwebtoken; do
    [ -d "backend/node_modules/$m" ] && echo "  ok      $m" || echo "  MISSING $m"
  done
else
  echo "backend/node_modules: MISSING - this alone stops the app starting."
  echo "  fix: (cd backend && npm install --omit=dev)"
fi
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
timeout 25 node backend/server.js 2>&1 | head -40
echo
echo "===== platform logs ====="
ls -la ~/logs 2>/dev/null | head -20 || echo "(no ~/logs)"
for f in ~/logs/*error* ~/logs/*stderr* ../logs/*error*; do
  [ -f "$f" ] && { echo "--- $f (last 25) ---"; tail -25 "$f"; }
done
