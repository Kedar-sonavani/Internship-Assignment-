# Adaptive Cart Engine

A production-ready Node.js/Express/MongoDB microservice for multi-tenant shopping cart management with dynamic tiered promotional pricing.

---

## Live Demo & Code

- **GitHub Repository:** https://github.com/Kedar-sonavani/Internship-Assignment-
- **Demo:** (Add deployment link here when deployed)

---

## Features

- Multi-tenant cart isolation via `userId`
- Add, update, and remove cart items via `POST /cart/items` (quantity=0 removes)
- Checkout calculation with tiered campaign discounts
- Defensive input validation with Joi — structured 400 responses
- Structured JSON request logging to stdout
- **Feature X:** Per-user sliding-window rate limiting on `POST /cart/items`
- Comprehensive error handling with consistent JSON responses

---

## Quick Start

```bash
npm install
cp .env.example .env
# Edit .env with your MongoDB URI
npm start
```

---

## Environment Variables

Create a `.env` file (or copy `.env.example`):

```env
PORT=3000
MONGODB_URI=mongodb://127.0.0.1:27017/adaptive-cart-engine
REDIS_URL=redis://127.0.0.1:6379
```

| Variable | Required | Description |
|----------|----------|-------------|
| `PORT` | No | Server port (default: 3000) |
| `MONGODB_URI` | Yes | MongoDB connection string |
| `REDIS_URL` | No | Redis connection string — enables distributed rate limiting. Falls back to in-memory if absent. |

---

## API Route Specifications

### POST /cart/items

Add, update, or remove an item from the user's cart.

**userId** is required via `X-User-Id` header, `?userId=` query param, or body field.

**Request body:**

```json
{
  "userId":    "user-123",
  "productId": "sku-1",
  "name":      "Widget",
  "price":     25.00,
  "quantity":  2,
  "category":  "electronics"
}
```

| Field | Type | Rules |
|-------|------|-------|
| `userId` | string | required, min length 1 |
| `productId` | string | required, min length 1 |
| `name` | string | required, min length 1 |
| `price` | number | required, must be positive |
| `quantity` | integer | required, min 0 (0 = remove item) |
| `category` | string | required, min length 1 |

**Responses:**

| Status | Meaning |
|--------|---------|
| 200 | Updated cart document |
| 400 | Missing userId or validation failure with field-level details |
| 429 | Rate limit exceeded — includes `retryAfterSeconds` and `Retry-After` header |
| 500 | Internal server error |

**Behavior:**
- New `productId` → item added to cart
- Existing `productId` → quantity and price updated
- `quantity = 0` → item removed from cart

---

### GET /cart

Returns the current cart for the user. Never creates a cart document on read.

**userId** required via `X-User-Id` header or `?userId=` query param.

**Response (200):**

```json
{
  "userId": "user-123",
  "items": [
    {
      "productId": "sku-1",
      "name": "Widget",
      "price": 25.00,
      "quantity": 2,
      "category": "electronics"
    }
  ],
  "createdAt": "2026-01-01T00:00:00.000Z",
  "updatedAt": "2026-01-01T00:00:00.000Z"
}
```

Returns `items: []` if no cart exists yet.

---

### GET /cart/checkout

Computes and returns a checkout summary with the best qualifying promotional discount applied.

**userId** required via `X-User-Id` header or `?userId=` query param.

**Response (200):**

```json
{
  "userId":         "user-123",
  "items":          [ { "productId", "name", "price", "quantity", "category", "lineTotal" } ],
  "subtotal":       150.00,
  "discountAmount": 15.00,
  "discountLabel":  "Standard Tier",
  "total":          135.00,
  "appliedTier":    "tier-2"
}
```

`appliedTier` and `discountLabel` are `null` when no tier qualifies.

---

### GET /campaigns

Returns the loaded promotional tier definitions.

**Response (200):**

```json
[
  {
    "id":            "tier-1",
    "label":         "Welcome Tier",
    "minSubtotal":   50,
    "minCategories": 1,
    "discountType":  "percentage",
    "discountValue": 5
  }
]
```

---

## Schema Layout

### Cart Document

```
Cart {
  userId:    String  — unique, indexed, required
  items:     Item[]  — embedded array
  createdAt: Date    — set on creation
  updatedAt: Date    — updated on every save via pre-save hook
}

Item {
  productId: String  — required
  name:      String  — required
  price:     Number  — required, min 0
  quantity:  Number  — required, min 1 (0 accepted at API layer to trigger removal)
  category:  String  — required
}
```

`productId` uniqueness within the cart is enforced at the service layer, not the schema level.

---

## Session / Tenant Strategy

There is no traditional HTTP session. Tenant isolation is stateless — every request carries a `userId` which is the sole partition key:

- The `userId` middleware extracts it from `X-User-Id` header → query string → request body, in that order.
- Missing or blank `userId` returns `400` immediately before any database operation.
- Each `userId` maps to exactly one Cart document in MongoDB (`unique: true` index on `userId`).
- This design is horizontally scalable with no shared session state.

---

## Promotion Formula & Tier Math

Campaigns are loaded from `campaigns.json` at startup. Each tier defines:

| Field | Meaning |
|-------|---------|
| `minSubtotal` | Cart subtotal must be ≥ this value |
| `minCategories` | Number of distinct item categories must be ≥ this value |
| `discountType` | `"percentage"` or `"fixed"` |
| `discountValue` | Percentage points or fixed currency amount |

**Qualification check:**

```
qualifies = subtotal >= tier.minSubtotal AND distinctCategories >= tier.minCategories
```

**Discount computation:**

```
percentage → discountAmount = round(subtotal × (discountValue / 100), 2)
fixed      → discountAmount = min(discountValue, subtotal)
```

**Tier selection:** All qualifying tiers are evaluated. The single tier producing the highest `discountAmount` is applied. If two tiers produce equal discount amounts, the first one encountered wins (stable sort). If no tier qualifies, `discountAmount = 0`.

**Total invariant:** `total = subtotal − discountAmount`, always ≥ 0.

---

## Feature X: Per-User Rate Limiting

### What was added

A sliding-window rate limiter is applied exclusively to `POST /cart/items`.

- Each `userId` is limited to **60 requests per 60-second rolling window**.
- **Redis mode (preferred):** Uses a Redis sorted set keyed by `rate-limit:{userId}`. Timestamps are stored as scores; expired entries outside the window are pruned on each request with `ZREMRANGEBYSCORE`. Keys expire automatically after 120 seconds via `EXPIRE`.
- **In-memory fallback:** When Redis is unavailable (or in test environments), a `Map<userId, timestamp[]>` is used per-process. Invalid entries outside the window are filtered on each request.
- On limit breach: returns `429 Too Many Requests` with a `Retry-After` response header and `{ error: "Rate limit exceeded", retryAfterSeconds: N }` body.
- Redis errors are caught and fall through to in-memory automatically — the API never fails because of a Redis outage.

### Why it was added (Engineering Justification)

Without rate limiting, a single user can issue unlimited cart mutations in a burst, which:

1. **Exhausts database connections** — each POST hits MongoDB; a tight loop can saturate the connection pool.
2. **Enables abuse** — malicious or buggy clients can spam the cart, inflating storage and degrading latency for other tenants.
3. **Masks bugs** — accidental retry loops from client-side code become invisible without a server-side guard.

Per-user (rather than per-IP) limiting aligns with the multi-tenant design: each tenant is bounded independently, so one abusive user does not affect others. The Redis-with-fallback design makes the feature safe to deploy even when Redis is not yet provisioned — in-memory limiting still provides protection per process.

---

## Error Response Format

All error responses are JSON with a consistent structure:

```json
{ "error": "Human-readable message", "details": [ { "field": "fieldName", "message": "why it failed" } ] }
```

`details` is present only on validation and userId errors.

| Scenario | Status | Body |
|----------|--------|------|
| Missing userId | 400 | `{ error: "Missing userId", details: [...] }` |
| Validation failure | 400 | `{ error: "Validation failed", details: [...] }` |
| Rate limit exceeded | 429 | `{ error: "Rate limit exceeded", retryAfterSeconds: N }` |
| Unknown route | 404 | `{ error: "Not found" }` |
| Unhandled exception | 500 | `{ error: "Internal server error" }` |

---

## Running Tests

```bash
npm test -- --runInBand --forceExit
```

Unit and integration tests are included. Integration tests use an in-memory MongoDB instance via `@shelf/jest-mongodb` — no external database required.

```
Test Suites: 3 passed
Tests:       31 passed
```

---

## Project Structure

```
internship/
├── src/
│   ├── config/
│   │   ├── db.js              # MongoDB connection
│   │   └── redis.js           # Redis client with in-memory fallback
│   ├── controllers/
│   │   ├── cartController.js  # HTTP handlers for cart routes
│   │   └── campaignController.js
│   ├── middleware/
│   │   ├── logger.js          # Structured JSON request logging
│   │   ├── rateLimiter.js     # Feature X: per-user rate limiting
│   │   ├── userId.js          # Tenant identity extraction & enforcement
│   │   └── validate.js        # Joi validation factory
│   ├── models/
│   │   └── Cart.js            # Mongoose Cart + Item schema
│   ├── routes/
│   │   ├── cart.js            # POST /items, GET /, GET /checkout
│   │   └── campaigns.js       # GET /campaigns
│   ├── services/
│   │   ├── cartService.js     # Cart persistence logic
│   │   └── campaignService.js # Tier loading, evaluation, discount computation
│   ├── __tests__/
│   │   ├── unit/              # Pure logic tests (no DB/HTTP)
│   │   ├── property/          # fast-check property-based tests
│   │   └── integration/       # Supertest + MongoDB memory server
│   ├── campaigns.json         # Promotional tier definitions
│   └── server.js              # App factory + startup
├── .env.example
├── DESIGN.md                  # Architecture, schema decisions, trade-offs
├── jest.config.js
└── package.json
```
