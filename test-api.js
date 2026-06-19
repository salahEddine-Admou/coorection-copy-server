async function testApi() {
  try {
    const loginRes = await fetch('https://coorection-copy-server.vercel.app/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'adam@gmail.com', password: 'Ad@m2026' })
    });
    
    if (!loginRes.ok) {
        console.log('LOGIN ERROR:', await loginRes.text());
        return;
    }
    const loginData = await loginRes.json();
    const token = loginData.token;
    console.log('Login successful. Token:', token.substring(0, 10) + '...');

    console.log('Fetching exams...');
    const examsRes = await fetch('https://coorection-copy-server.vercel.app/api/exams', {
      headers: { 'x-auth-token': token }
    });
    
    if (!examsRes.ok) {
        console.log('EXAMS 500 ERROR CAUSE:', await examsRes.text());
    } else {
        console.log('EXAMS OK:', await examsRes.json());
    }

  } catch (err) {
    console.error('ERROR:', err);
  }
}
testApi();
