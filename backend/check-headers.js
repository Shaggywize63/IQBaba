const http = require('http');

http.get('http://localhost:5000/admin-login.html', (res) => {
  console.log('Headers:', JSON.stringify(res.headers, null, 2));
  process.exit(0);
}).on('error', (e) => {
  console.error('Error:', e.message);
  process.exit(1);
});
