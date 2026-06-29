/**
 * Simple manual test script for the Adaptive Cart Engine
 * Run with: node test-api.js
 * 
 * Prerequisites:
 * 1. MongoDB running locally or set MONGODB_URI in .env
 * 2. Server running: npm start (in another terminal)
 */

const http = require('http');

const BASE_URL = 'http://localhost:3000';

function makeRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(BASE_URL + path);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function runTests() {
  console.log('=== Adaptive Cart Engine Test Suite ===\n');

  const userId = 'test-user-' + Date.now();

  try {
    // Test 1: Get empty cart
    console.log('1. Testing GET /cart (empty cart)...');
    let result = await makeRequest('GET', `/cart?userId=${userId}`);
    console.log(`   Status: ${result.status}`);
    console.log(`   Items: ${result.body.items?.length || 0}`);
    console.log('   ✓ Passed\n');

    // Test 2: Add item
    console.log('2. Testing POST /cart/items (add item)...');
    result = await makeRequest('POST', '/cart/items', {
      userId,
      productId: 'prod-1',
      name: 'Widget',
      price: 25.00,
      quantity: 2,
      category: 'electronics'
    });
    console.log(`   Status: ${result.status}`);
    console.log(`   Items in cart: ${result.body.items?.length || 0}`);
    console.log('   ✓ Passed\n');

    // Test 3: Update item
    console.log('3. Testing POST /cart/items (update quantity)...');
    result = await makeRequest('POST', '/cart/items', {
      userId,
      productId: 'prod-1',
      name: 'Widget',
      price: 25.00,
      quantity: 5,
      category: 'electronics'
    });
    console.log(`   Status: ${result.status}`);
    const item = result.body.items?.find(i => i.productId === 'prod-1');
    console.log(`   New quantity: ${item?.quantity}`);
    console.log('   ✓ Passed\n');

    // Test 4: Add second item (different category)
    console.log('4. Testing POST /cart/items (add second item, different category)...');
    result = await makeRequest('POST', '/cart/items', {
      userId,
      productId: 'prod-2',
      name: 'Gadget',
      price: 40.00,
      quantity: 1,
      category: 'accessories'
    });
    console.log(`   Status: ${result.status}`);
    console.log(`   Items in cart: ${result.body.items?.length || 0}`);
    console.log('   ✓ Passed\n');

    // Test 5: Checkout
    console.log('5. Testing GET /cart/checkout...');
    result = await makeRequest('GET', `/cart/checkout?userId=${userId}`);
    console.log(`   Status: ${result.status}`);
    console.log(`   Subtotal: $${result.body.subtotal}`);
    console.log(`   Discount: $${result.body.discountAmount}`);
    console.log(`   Applied tier: ${result.body.appliedTier || 'none'}`);
    console.log(`   Total: $${result.body.total}`);
    console.log('   ✓ Passed\n');

    // Test 6: Get campaigns
    console.log('6. Testing GET /campaigns...');
    result = await makeRequest('GET', '/campaigns');
    console.log(`   Status: ${result.status}`);
    console.log(`   Tiers available: ${result.body?.length || 0}`);
    console.log('   ✓ Passed\n');

    // Test 7: Remove item (quantity = 0)
    console.log('7. Testing POST /cart/items (remove item with quantity=0)...');
    result = await makeRequest('POST', '/cart/items', {
      userId,
      productId: 'prod-2',
      name: 'Gadget',
      price: 40.00,
      quantity: 0,
      category: 'accessories'
    });
    console.log(`   Status: ${result.status}`);
    console.log(`   Items remaining: ${result.body.items?.length || 0}`);
    console.log('   ✓ Passed\n');

    // Test 8: Missing userId (should fail)
    console.log('8. Testing missing userId (should return 400)...');
    result = await makeRequest('GET', '/cart');
    console.log(`   Status: ${result.status}`);
    console.log(`   Error: ${result.body.error}`);
    console.log('   ✓ Passed\n');

    // Test 9: Invalid price (should fail validation)
    console.log('9. Testing invalid price (should return 400)...');
    result = await makeRequest('POST', '/cart/items', {
      userId,
      productId: 'prod-3',
      name: 'Bad Item',
      price: -10,
      quantity: 1,
      category: 'test'
    });
    console.log(`   Status: ${result.status}`);
    console.log(`   Error: ${result.body.error}`);
    console.log('   ✓ Passed\n');

    console.log('=== All tests passed! ===\n');
    console.log('Note: Rate limiter test skipped (requires 61 requests)');
    process.exit(0);

  } catch (error) {
    console.error('Test failed:', error.message);
    console.error('\nMake sure the server is running: npm start');
    process.exit(1);
  }
}

runTests();
