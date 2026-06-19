const fs = require('fs');
const path = require('path');

async function testUpload() {
  try {
    const loginRes = await fetch('https://coorection-copy-server.vercel.app/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'adam@gmail.com', password: 'Ad@m2026' })
    });
    const loginData = await loginRes.json();
    const token = loginData.token;

    const examId = '6a33eeecc85a6b84784a0760';
    const studentId = '6a33eeecc85a6b84784a075d';

    const dummyPath = path.join(__dirname, 'dummy.jpg');
    fs.writeFileSync(dummyPath, 'fake image content');

    const form = new FormData();
    const fileBlob = new Blob([fs.readFileSync(dummyPath)], { type: 'image/jpeg' });
    form.append('scannedImage', fileBlob, 'dummy.jpg');

    console.log('Sending request to Vercel...');
    const res = await fetch(
      `https://coorection-copy-server.vercel.app/api/submissions/grade/${examId}/${studentId}`,
      {
        method: 'POST',
        headers: { 'x-auth-token': token },
        body: form
      }
    );
    if (!res.ok) {
      console.log('ERROR STATUS:', res.status);
      console.log('ERROR BODY:', await res.text());
    } else {
      console.log('SUCCESS:', await res.json());
    }
  } catch (err) {
    console.error('ERROR:', err);
  }
}
testUpload();
