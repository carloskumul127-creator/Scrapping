const https = require('https');
const fs = require('fs');

const options = {
  hostname: 'lngkslnffxpfiviizaox.supabase.co',
  port: 443,
  path: '/rest/v1/',
  method: 'GET',
  headers: {
    'apikey': 'sb_publishable_aaVYGIOsANmVvlTQJNy-pg_eXwmaXDh'
  }
};

const req = https.request(options, res => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    fs.writeFileSync('openapi.json', data);
    console.log('Saved openapi.json');
  });
});

req.on('error', error => console.error(error));
req.end();
