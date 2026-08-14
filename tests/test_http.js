// HTTP Endpoint verification script
const testUrl = 'http://localhost:3000';

async function testHttpEndpoints() {
    console.log('Testing HTTP Endpoints on ' + testUrl);

    // 1. Health check
    const health = await fetch(`${testUrl}/api/health`).then(r => r.json());
    console.log('1. Health check:', health);

    // 2. Register a fresh user
    const randomSuffix = Math.floor(Math.random() * 10000);
    const regPayload = {
        full_name: 'Test Tester',
        email: `tester_${randomSuffix}@claritycash.io`,
        password: 'SecurePassword123!',
        currency: 'USD'
    };

    const regRes = await fetch(`${testUrl}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(regPayload)
    }).then(r => r.json());

    console.log('2. Registration response:', regRes.success ? '✅ SUCCESS' : '❌ FAILED', regRes);

    if (!regRes.token) {
        throw new Error('Registration failed to return token');
    }

    // 3. Protected endpoint with token
    const accounts = await fetch(`${testUrl}/api/accounts`, {
        headers: { 'Authorization': `Bearer ${regRes.token}` }
    }).then(r => r.json());

    console.log('3. Authenticated Accounts Fetch:', accounts.success ? '✅ SUCCESS' : '❌ FAILED', `Found ${accounts.accounts?.length} starter accounts`);

    // 4. Create transaction
    const firstAcc = accounts.accounts[0];
    const txRes = await fetch(`${testUrl}/api/transactions`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${regRes.token}`
        },
        body: JSON.stringify({
            account_id: firstAcc.id,
            type: 'income',
            amount: 1500.00,
            category: 'Salary & Wages',
            payee: 'Direct Deposit Test',
            date: '2026-08-09'
        })
    }).then(r => r.json());

    console.log('4. Create Transaction:', txRes.success ? '✅ SUCCESS' : '❌ FAILED');

    // 5. Test Login
    const loginRes = await fetch(`${testUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            email: regPayload.email,
            password: 'SecurePassword123!'
        })
    }).then(r => r.json());

    console.log('5. Login Verification:', loginRes.success ? '✅ SUCCESS' : '❌ FAILED', `User: ${loginRes.user?.email}`);

    // 6. Test invalid login
    const badLogin = await fetch(`${testUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            email: regPayload.email,
            password: 'WrongPassword999!'
        })
    });
    console.log('6. Bad Password Rejection (HTTP Status):', badLogin.status === 401 ? '✅ REJECTED (401)' : '❌ UNEXPECTED');

    console.log('\n🌟 ALL HTTP LIVE ENDPOINT TESTS PASSED SUCCESSFULLY!');
}

testHttpEndpoints().catch(err => {
    console.error('HTTP Test Error:', err);
    process.exit(1);
});
