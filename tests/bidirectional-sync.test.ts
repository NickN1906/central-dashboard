/**
 * Bi-directional Sync Test Cases
 *
 * Tests the complete workflow of subscription synchronization between:
 * - Central Dashboard (master coordinator)
 * - Rezume (app)
 * - AI Coach (app)
 *
 * Run with: npx ts-node tests/bidirectional-sync.test.ts
 */

const CENTRAL_DASHBOARD_URL = process.env.CENTRAL_DASHBOARD_URL || 'https://central-dashboard-bbbb57a5985e.herokuapp.com';
const API_KEY = process.env.CENTRAL_DASHBOARD_API_KEY || '';

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  duration: number;
}

const results: TestResult[] = [];

async function runTest(name: string, testFn: () => Promise<void>): Promise<void> {
  const start = Date.now();
  try {
    await testFn();
    results.push({ name, passed: true, duration: Date.now() - start });
    console.log(`✅ ${name}`);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    results.push({ name, passed: false, error: errorMsg, duration: Date.now() - start });
    console.log(`❌ ${name}: ${errorMsg}`);
  }
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

// ============================================
// TEST CASES
// ============================================

/**
 * Test 1: Report endpoint is accessible
 */
async function testReportEndpointAccessible() {
  const res = await fetch(`${CENTRAL_DASHBOARD_URL}/api/v1/entitlements/report`);
  assert(res.ok, `Expected 200, got ${res.status}`);
  const data = await res.json();
  assert(data.endpoint === '/api/v1/entitlements/report', 'Endpoint info mismatch');
}

/**
 * Test 2: Grant subscription from Rezume
 */
async function testGrantFromRezume() {
  const testEmail = `test-rezume-${Date.now()}@example.com`;

  const res = await fetch(`${CENTRAL_DASHBOARD_URL}/api/v1/entitlements/report`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Admin-Api-Key': API_KEY,
    },
    body: JSON.stringify({
      email: testEmail,
      productId: 'rezume',
      action: 'grant',
      sourceApp: 'rezume',
      stripeSubscriptionId: 'sub_test_rezume_' + Date.now(),
      stripePriceId: 'price_test_monthly',
      amountPaid: 1999,
      currency: 'cad',
    }),
  });

  assert(res.ok, `Expected 200, got ${res.status}`);
  const data = await res.json();
  assert(data.success === true, 'Grant should succeed');
  assert(data.action === 'granted', 'Action should be granted');
  assert(data.sourceApp === 'rezume', 'Source app should be rezume');

  // Verify access was granted
  const checkRes = await fetch(`${CENTRAL_DASHBOARD_URL}/api/v1/check?email=${encodeURIComponent(testEmail)}&product=rezume`);
  const checkData = await checkRes.json();
  assert(checkData.hasAccess === true, 'User should have access after grant');
}

/**
 * Test 3: Grant subscription from AI Coach
 */
async function testGrantFromAICoach() {
  const testEmail = `test-aicoach-${Date.now()}@example.com`;

  const res = await fetch(`${CENTRAL_DASHBOARD_URL}/api/v1/entitlements/report`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Admin-Api-Key': API_KEY,
    },
    body: JSON.stringify({
      email: testEmail,
      productId: 'aicoach',
      action: 'grant',
      sourceApp: 'aicoach',
      stripeSubscriptionId: 'sub_test_aicoach_' + Date.now(),
      amountPaid: 2999,
      currency: 'cad',
    }),
  });

  assert(res.ok, `Expected 200, got ${res.status}`);
  const data = await res.json();
  assert(data.success === true, 'Grant should succeed');
  assert(data.sourceApp === 'aicoach', 'Source app should be aicoach');
}

/**
 * Test 4: Revoke subscription from Rezume
 */
async function testRevokeFromRezume() {
  const testEmail = `test-revoke-${Date.now()}@example.com`;
  const subId = 'sub_test_revoke_' + Date.now();

  // First grant
  await fetch(`${CENTRAL_DASHBOARD_URL}/api/v1/entitlements/report`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Admin-Api-Key': API_KEY,
    },
    body: JSON.stringify({
      email: testEmail,
      productId: 'rezume',
      action: 'grant',
      sourceApp: 'rezume',
      stripeSubscriptionId: subId,
    }),
  });

  // Verify access
  let checkRes = await fetch(`${CENTRAL_DASHBOARD_URL}/api/v1/check?email=${encodeURIComponent(testEmail)}&product=rezume`);
  let checkData = await checkRes.json();
  assert(checkData.hasAccess === true, 'User should have access after grant');

  // Now revoke
  const res = await fetch(`${CENTRAL_DASHBOARD_URL}/api/v1/entitlements/report`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Admin-Api-Key': API_KEY,
    },
    body: JSON.stringify({
      email: testEmail,
      productId: 'rezume',
      action: 'revoke',
      sourceApp: 'rezume',
      stripeSubscriptionId: subId,
      reason: 'Test cancellation',
    }),
  });

  assert(res.ok, `Expected 200, got ${res.status}`);
  const data = await res.json();
  assert(data.success === true, 'Revoke should succeed');
  assert(data.action === 'revoked', 'Action should be revoked');

  // Verify access removed
  checkRes = await fetch(`${CENTRAL_DASHBOARD_URL}/api/v1/check?email=${encodeURIComponent(testEmail)}&product=rezume`);
  checkData = await checkRes.json();
  assert(checkData.hasAccess === false, 'User should NOT have access after revoke');
}

/**
 * Test 5: Multiple sources for same user - bundle + direct
 * User has bundle access AND direct purchase - revoking direct should keep bundle access
 */
async function testMultipleSources() {
  const testEmail = `test-multi-${Date.now()}@example.com`;

  // Grant from Rezume (direct purchase)
  await fetch(`${CENTRAL_DASHBOARD_URL}/api/v1/entitlements/report`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Admin-Api-Key': API_KEY,
    },
    body: JSON.stringify({
      email: testEmail,
      productId: 'rezume',
      action: 'grant',
      sourceApp: 'rezume',
      stripeSubscriptionId: 'sub_direct_' + Date.now(),
    }),
  });

  // Verify access
  let checkRes = await fetch(`${CENTRAL_DASHBOARD_URL}/api/v1/check?email=${encodeURIComponent(testEmail)}&product=rezume`);
  let checkData = await checkRes.json();
  assert(checkData.hasAccess === true, 'User should have access');
  assert(checkData.source === 'direct', 'Source should be direct');
}

/**
 * Test 6: Unauthorized request rejected
 */
async function testUnauthorizedRejected() {
  const res = await fetch(`${CENTRAL_DASHBOARD_URL}/api/v1/entitlements/report`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Admin-Api-Key': 'wrong-api-key',
    },
    body: JSON.stringify({
      email: 'test@example.com',
      productId: 'rezume',
      action: 'grant',
      sourceApp: 'rezume',
    }),
  });

  assert(res.status === 401, `Expected 401, got ${res.status}`);
}

/**
 * Test 7: Missing required fields rejected
 */
async function testMissingFieldsRejected() {
  const res = await fetch(`${CENTRAL_DASHBOARD_URL}/api/v1/entitlements/report`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Admin-Api-Key': API_KEY,
    },
    body: JSON.stringify({
      email: 'test@example.com',
      // Missing productId, action, sourceApp
    }),
  });

  assert(res.status === 400, `Expected 400, got ${res.status}`);
}

/**
 * Test 8: Check endpoint works for non-existent user
 */
async function testCheckNonExistentUser() {
  const res = await fetch(`${CENTRAL_DASHBOARD_URL}/api/v1/check?email=nonexistent-${Date.now()}@example.com&product=rezume`);
  assert(res.ok, `Expected 200, got ${res.status}`);
  const data = await res.json();
  assert(data.hasAccess === false, 'Non-existent user should not have access');
}

/**
 * Test 9: Revenue tracking fields stored correctly
 */
async function testRevenueTracking() {
  const testEmail = `test-revenue-${Date.now()}@example.com`;

  const res = await fetch(`${CENTRAL_DASHBOARD_URL}/api/v1/entitlements/report`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Admin-Api-Key': API_KEY,
    },
    body: JSON.stringify({
      email: testEmail,
      productId: 'rezume',
      action: 'grant',
      sourceApp: 'rezume',
      stripeSubscriptionId: 'sub_revenue_' + Date.now(),
      stripePriceId: 'price_pro_monthly_cad',
      amountPaid: 1999,
      currency: 'cad',
    }),
  });

  assert(res.ok, `Expected 200, got ${res.status}`);
  const data = await res.json();
  assert(data.success === true, 'Should store revenue tracking fields');
}

/**
 * Test 10: Re-granting after revoke works
 */
async function testReGrantAfterRevoke() {
  const testEmail = `test-regrant-${Date.now()}@example.com`;
  const subId = 'sub_regrant_' + Date.now();

  // Grant
  await fetch(`${CENTRAL_DASHBOARD_URL}/api/v1/entitlements/report`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Admin-Api-Key': API_KEY,
    },
    body: JSON.stringify({
      email: testEmail,
      productId: 'rezume',
      action: 'grant',
      sourceApp: 'rezume',
      stripeSubscriptionId: subId,
    }),
  });

  // Revoke
  await fetch(`${CENTRAL_DASHBOARD_URL}/api/v1/entitlements/report`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Admin-Api-Key': API_KEY,
    },
    body: JSON.stringify({
      email: testEmail,
      productId: 'rezume',
      action: 'revoke',
      sourceApp: 'rezume',
    }),
  });

  // Verify no access
  let checkRes = await fetch(`${CENTRAL_DASHBOARD_URL}/api/v1/check?email=${encodeURIComponent(testEmail)}&product=rezume`);
  let checkData = await checkRes.json();
  assert(checkData.hasAccess === false, 'Should not have access after revoke');

  // Re-grant with new subscription
  const newSubId = 'sub_regrant_new_' + Date.now();
  await fetch(`${CENTRAL_DASHBOARD_URL}/api/v1/entitlements/report`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Admin-Api-Key': API_KEY,
    },
    body: JSON.stringify({
      email: testEmail,
      productId: 'rezume',
      action: 'grant',
      sourceApp: 'rezume',
      stripeSubscriptionId: newSubId,
    }),
  });

  // Verify access restored
  checkRes = await fetch(`${CENTRAL_DASHBOARD_URL}/api/v1/check?email=${encodeURIComponent(testEmail)}&product=rezume`);
  checkData = await checkRes.json();
  assert(checkData.hasAccess === true, 'Should have access after re-grant');
}

// ============================================
// MAIN TEST RUNNER
// ============================================

async function main() {
  console.log('\n🧪 Running Bi-directional Sync Tests\n');
  console.log(`Target: ${CENTRAL_DASHBOARD_URL}`);
  console.log(`API Key: ${API_KEY ? '***' + API_KEY.slice(-8) : 'NOT SET'}\n`);

  if (!API_KEY) {
    console.error('❌ CENTRAL_DASHBOARD_API_KEY environment variable is required');
    process.exit(1);
  }

  await runTest('1. Report endpoint is accessible', testReportEndpointAccessible);
  await runTest('2. Grant subscription from Rezume', testGrantFromRezume);
  await runTest('3. Grant subscription from AI Coach', testGrantFromAICoach);
  await runTest('4. Revoke subscription from Rezume', testRevokeFromRezume);
  await runTest('5. Multiple sources for same user', testMultipleSources);
  await runTest('6. Unauthorized request rejected', testUnauthorizedRejected);
  await runTest('7. Missing required fields rejected', testMissingFieldsRejected);
  await runTest('8. Check non-existent user', testCheckNonExistentUser);
  await runTest('9. Revenue tracking fields stored', testRevenueTracking);
  await runTest('10. Re-grant after revoke works', testReGrantAfterRevoke);

  // Summary
  console.log('\n' + '='.repeat(50));
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  console.log(`\n📊 Results: ${passed} passed, ${failed} failed\n`);

  if (failed > 0) {
    console.log('Failed tests:');
    results.filter(r => !r.passed).forEach(r => {
      console.log(`  ❌ ${r.name}: ${r.error}`);
    });
    process.exit(1);
  }

  console.log('✅ All tests passed!\n');
}

main().catch(console.error);
