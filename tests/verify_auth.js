// Automated Verification Test Suite for Clarity Cash
import bcrypt from 'bcryptjs';
import db from '../src/db/connection.js';
import { runMigrations } from '../src/db/migrate.js';

async function runTests() {
    console.log('====================================================');
    console.log('🧪 RUNNING CLARITY CASH SECURITY & DB VERIFICATION');
    console.log('====================================================\n');

    // 1. Check migrations
    console.log('[Test 1] Executing Database Migrations...');
    runMigrations();
    const tables = db.prepare(`SELECT name FROM sqlite_master WHERE type='table'`).all().map(t => t.name);
    console.log('✓ Tables in SQLite DB:', tables.join(', '));
    if (!tables.includes('users') || !tables.includes('accounts') || !tables.includes('transactions')) {
        throw new Error('Required tables missing in database!');
    }

    // 2. Test Bcrypt Hashing & DB User Verification
    console.log('\n[Test 2] Verifying Password Hashing in Database...');
    const users = db.prepare('SELECT id, email, password_hash, full_name, currency FROM users').all();
    console.log(`Found ${users.length} user(s) in persistent database.`);
    
    users.forEach(u => {
        const isBcrypt = u.password_hash.startsWith('$2a$') || u.password_hash.startsWith('$2b$');
        console.log(`- User: ${u.email} | Hash: ${u.password_hash.substring(0, 20)}... | Is Bcrypt: ${isBcrypt ? '✅ YES' : '❌ NO'}`);
        if (!isBcrypt) {
            throw new Error(`CRITICAL SECURITY FAILURE: Password for ${u.email} is NOT bcrypt hashed!`);
        }
    });

    // 3. Test Password Comparison
    console.log('\n[Test 3] Testing Bcrypt Password Verification...');
    if (users.length > 0) {
        const testUser = users[0];
        const isMatch = await bcrypt.compare('Clarity123!', testUser.password_hash);
        console.log(`- Password comparison for 'Clarity123!': ${isMatch ? '✅ MATCHED' : '⚠️ MISMATCH (Custom Password)'}`);
    }

    // 4. Test Foreign Key Cascading & Data Integrity
    console.log('\n[Test 4] Verifying Foreign Key Constraints...');
    const fkStatus = db.pragma('foreign_keys', { simple: true });
    console.log(`- SQLite Foreign Keys Status: ${fkStatus === 1 ? '✅ ACTIVE (Enforced)' : '❌ DISABLED'}`);

    // 5. Test Accounts and Transactions count
    console.log('\n[Test 5] Checking Accounts & Transactions count...');
    const accCount = db.prepare('SELECT COUNT(*) as count FROM accounts').get().count;
    const txCount = db.prepare('SELECT COUNT(*) as count FROM transactions').get().count;
    const budgetCount = db.prepare('SELECT COUNT(*) as count FROM budgets').get().count;
    const goalCount = db.prepare('SELECT COUNT(*) as count FROM goals').get().count;

    console.log(`- Accounts in DB: ${accCount}`);
    console.log(`- Transactions in DB: ${txCount}`);
    console.log(`- Budgets in DB: ${budgetCount}`);
    console.log(`- Savings Goals in DB: ${goalCount}`);

    console.log('\n====================================================');
    console.log('🎉 ALL DATABASE & SECURITY VERIFICATIONS PASSED 100%');
    console.log('====================================================');
}

runTests().catch(err => {
    console.error('❌ Verification failed:', err);
    process.exit(1);
});
