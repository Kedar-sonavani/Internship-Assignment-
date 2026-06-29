# Design Document: Adaptive Cart Engine

## Overview

The Adaptive Cart Engine is a standalone Node.js/Express microservice living entirely in the `internship/` directory. It provides a multi-tenant REST API for shopping-cart management, backed by MongoDB for persistence and optionally Redis for rate-limiting. All tenant isolation flows through a `userId` supplied on every request via the `X-User-Id` header or query/body parameter.

The three primary operations are:

1. **Mutate cart** — `POST /cart/items` (upsert / remove via quantity=0)
2. **Read cart** — `GET /cart`
3. **Checkout** — `GET /cart/checkout` with tiered discount computation

Supporting sub-systems: Campaign Engine (loads `campaigns.json` at startup), per-user rate limiting (Redis → in-memory fallback), and structured JSON request logging.

---

## Architecture

```
Request
  → Logger (capture start time, extract userId)
  → Rate Limiter (POST /cart/items only — keyed by userId)
  → Joi Validator (strips unknown fields, returns 400 on failure)
  → Controller
  → Service → Model/DB
  → Response
  → Logger (append statusCode, durationMs, optional errorMessage)
```

### Component Overview

| Component | Purpose |
|-----------|---------|
| **server.js** | Entry point: create Express app, connect MongoDB, pre-load campaigns, start listener |
| **routes/cart.js** | Mount middleware + handlers for POST /items, GET /, GET /checkout |
| **routes/campaigns.js** | Mount handler for GET / |
| **middleware/logger.js** | Structured JSON logging to stdout (timestamp, method, path, userId, statusCode, durationMs, errorMessage on 4xx/5xx) |
| **middleware/userId.js** | Extract & require userId from header/query/body; return 400 if absent |
| **middleware/validate.js** | Joi schema validation factory; strip unknown fields; return 400 with field-level details on failure |
| **middleware/rateLimiter.js** | Per-userId sliding-window (60 requests per 60 seconds); Redis preferred, in-memory fallback; return 429 with Retry-After |
| **controllers/cartController.js** | HTTP request handlers for cart operations |
| **controllers/campaignController.js** | HTTP request handler for campaign retrieval |
| **services/cartService.js** | MongoDB cart logic: find-or-create, upsert item, remove item |
| **services/campaignService.js** | Load tiers from campaigns.json, evaluate tiers, compute discount |
| **models/Cart.js** | Mongoose Cart schema with embedded Item sub-documents |
| **config/db.js** | MongoDB connection setup |
| **config/redis.js** | Redis client with graceful fallback detection |

---

## Data Models

### Cart Document (Mongoose)

```javascript
{
  userId:    { type: String, required: true, unique: true, index: true },
  items:     [ ItemSchema ],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}
```

### Item Sub-document

```javascript
{
  productId: { type: String, required: true },
  name:      { type: String, required: true },
  price:     { type: Number, required: true, min: 0 },
  quantity:  { type: Number, required: true, min: 1 },
  category:  { type: String, required: true }
}
```

**Note:** `productId` uniqueness within `items` is enforced at the service layer via upsert logic, not via Mongoose validators.

### Campaign Tier (campaigns.json shape)

```json
{
  "id":            "string",
  "label":         "string",
  "minSubtotal":   0,
  "minCategories": 0,
  "discountType":  "percentage | fixed",
  "discountValue": 0
}
```

### Validation Schemas (Joi)

**POST /cart/items body:**

```javascript
{
  userId:    Joi.string().min(1).required(),
  productId: Joi.string().min(1).required(),
  name:      Joi.string().min(1).required(),
  price:     Joi.number().positive().finite().required(),
  quantity:  Joi.number().integer().min(0).required(),
  category:  Joi.string().min(1).required()
}
```

`quantity: 0` is valid at the validation layer (triggers deletion); `min(1)` is only enforced at the Mongoose layer for persisted documents.

### Checkout Summary (API response shape)

```javascript
{
  userId:        string,
  items: [
    { productId, name, price, quantity, category, lineTotal }
  ],
  subtotal:      number,
  discountAmount: number,
  discountLabel:  string | null,
  total:         number,
  appliedTier:   string | null
}
```

---

## Request Lifecycle

1. **Logger middleware** — Capture start time, extract userId, set up response logging
2. **Body parser** — Parse JSON (100 kb max)
3. **Rate Limiter** (POST /cart/items only) — Check per-userId sliding window; return 429 if exceeded
4. **Validator** (POST /cart/items only) — Validate body against Joi schema; strip unknown fields; return 400 on failure
5. **userId middleware** — Ensure userId is present; return 400 if absent
6. **Route handler** → **Controller** → **Service** → **Database**
7. **Response** — Logger middleware appends statusCode, durationMs, optional errorMessage

---

## API Endpoints

### POST /cart/items

**Purpose:** Add, update, or remove an item from the user's cart.

**Request:**
- `userId` — required (via header, query, or body)
- Body (validated against Joi schema):
  - `userId`, `productId`, `name`, `price`, `quantity`, `category`

**Response:**
- `200 OK` — Updated cart document
- `400 Bad Request` — Missing userId or validation failure
- `429 Too Many Requests` — Rate limit exceeded
- `500 Internal Server Error` — Database error

**Behavior:**
- If `productId` not in cart: add new item
- If `productId` in cart: update quantity and price
- If `quantity = 0`: remove item
- Update `updatedAt` timestamp

### GET /cart

**Purpose:** Retrieve the user's current cart (or empty cart if none exists).

**Request:**
- `userId` — required (via header or query)

**Response:**
- `200 OK` — Cart document (or empty cart with no _id)
- `400 Bad Request` — Missing userId
- `500 Internal Server Error` — Database error

**Behavior:**
- Never creates a cart; returns empty representation if none exists

### GET /cart/checkout

**Purpose:** Compute and return checkout summary with applied discounts.

**Request:**
- `userId` — required (via header or query)

**Response:**
- `200 OK` — Checkout_Summary

**Behavior:**
1. Fetch cart (or empty cart)
2. Compute subtotal: sum of (price × quantity) for all items, rounded to 2 dp
3. Count distinct categories
4. Evaluate tiers: select tier with highest discount amount that qualifies
5. Compute discount using tier's formula
6. Compute total: subtotal − discountAmount (≥ 0)
7. Return summary

### GET /campaigns

**Purpose:** Retrieve loaded promotional tier definitions.

**Response:**
- `200 OK` — Array of tier objects

---

## Correctness Properties

Each property is validated through a combination of unit, property-based, and integration tests.

### Property 1: Missing userId rejected

For any incoming request carrying no `userId`, the service returns `400 Bad Request` with structured error body.

### Property 2: Cart isolation

For any pair of distinct userIds A and B, a write to A's cart never alters reads of B's cart.

### Property 3: Upsert adds new item

For any cart and any `productId` not already present, a valid POST with `quantity ≥ 1` adds exactly one item with supplied fields.

### Property 4: Upsert updates existing item

For any cart with item `productId` P, a POST with same `productId` and new `quantity ≥ 1` updates that item's quantity/price without changing array length.

### Property 5: Zero-quantity removes item

For any cart with item `productId` P, a POST with `quantity = 0` removes that item.

### Property 6: Validation rejects invalid payloads

For any POST body with missing required field, negative price, or non-integer quantity, service returns `400` with `details` array naming each failing field.

### Property 7: Subtotal computation correctness

For any cart with arbitrary items, `subtotal` in checkout response equals exact sum of (price × quantity), rounded to 2 dp.

### Property 8: Campaign Engine tier selection

For any subtotal S and distinct-category count C, Campaign Engine selects at most one tier — the one with highest `discountAmount` among qualifying tiers — and returns `null` when none qualify.

### Property 9: Percentage discount formula

For any qualifying tier with `discountType = "percentage"` and value V, `discountAmount = subtotal × (V / 100)` rounded to 2 dp.

### Property 10: Fixed discount cap

For any qualifying tier with `discountType = "fixed"` and value V, `discountAmount = min(V, subtotal)`.

### Property 11: Checkout total invariant

For any valid checkout response, `total = subtotal − discountAmount` and `total ≥ 0`.

### Property 12: Rate limit enforcement

For any userId, after exactly 60 successful POSTs within a 60-second window, the 61st request returns `429` with `retryAfterSeconds` and `Retry-After` header.

### Property 13: Logger fields completeness

For any HTTP request, the log entry to stdout contains valid JSON with: `timestamp`, `method`, `path`, `statusCode`, `durationMs`, and `errorMessage` (on 4xx/5xx).

---

## Error Handling

| Scenario | HTTP Status | Response |
|----------|-------------|----------|
| Missing/empty userId | 400 | `{ error: "Missing userId", details: [{field, message}] }` |
| Validation failure | 400 | `{ error: "Validation failed", details: [{field, message}] }` |
| Rate limit exceeded | 429 | `{ error: "Rate limit exceeded", retryAfterSeconds: N }` + `Retry-After` header |
| Unhandled exception | 500 | `{ error: "Internal server error" }` |
| Unknown route | 404 | `{ error: "Not found" }` |

---

## Testing Strategy

### Unit Tests

Pure logic without live DB/HTTP:

- **campaignService** — tier qualification, discount formulas (percentage + fixed), tie-breaking, edge cases
- **cartService** — upsert/remove logic with mocked Mongoose model
- **Joi validation schemas** — valid payloads accepted, invalid payloads return correct details
- **Logger middleware** — required fields emitted, errorMessage present on 4xx/5xx

### Property-Based Tests (fast-check)

Validate universal correctness properties across many generated inputs:

- **Property 7** — Subtotal computation
- **Property 8** — Tier selection
- **Property 9** — Percentage formula
- **Property 10** — Fixed discount cap
- **Property 11** — Total invariant
- **Properties 3, 4, 5** — Cart upsert/remove
- **Property 6** — Validation rejection
- **Property 13** — Logger completeness
- **Property 12** — Rate limit enforcement
- **Property 2** — Cart isolation
- **Property 1** — Missing userId rejection

Each test is tagged with:
```javascript
// Feature: adaptive-cart-engine, Property N: <description>
```

### Integration Tests (Supertest + MongoDB Memory Server)

Full request/response cycles for all routes:

- POST /cart/items (add, update, remove)
- GET /cart (existing, empty)
- GET /cart/checkout (empty cart, mixed tiers)
- GET /campaigns
- Rate limiter behavior
- 400 on missing userId
- 400 on validation failure

### Test File Layout

```
internship/src/__tests__/
├── unit/
│   ├── campaignService.test.js
│   ├── cartService.test.js
│   ├── validation.test.js
│   └── logger.test.js
├── property/
│   ├── checkout.property.test.js
│   ├── campaign.property.test.js
│   ├── cart.property.test.js
│   └── validation.property.test.js
└── integration/
    ├── cart.integration.test.js
    ├── checkout.integration.test.js
    └── rateLimit.integration.test.js
```

---

## Deployment Considerations

### Environment Variables

- `MONGODB_URI` — MongoDB connection string
- `REDIS_URL` — Redis connection string (optional)
- `PORT` — Server port (default: 3000)

### Rate Limiting

- **Redis (preferred):** Distributed rate limiting across instances using sorted sets
- **In-memory (fallback):** Per-process Map; does not coordinate across instances

### Logging

All logs are newline-delimited JSON to stdout; aggregate with a log collector (e.g., ELK, Datadog, CloudWatch).

### Database Indexes

The Cart collection should be indexed on `userId` (unique index) for optimal query performance.

---

## Implementation Notes

- **Cart creation:** Only on write (POST /cart/items); never on read (GET /cart).
- **Discount computation:** Rounded to 2 decimal places; never exceeds subtotal.
- **Validation:** Unknown fields stripped; 100 kb request body limit enforced.
- **Error responses:** Always JSON with consistent `error` and optional `details` fields.
- **Timestamps:** ISO 8601 format in logs and API responses.
- **Rate limiting:** Per-userId, sliding-window algorithm; 60 requests per 60 seconds.

---

## Future Enhancements

- Persistent rate-limit state across instances (Redis required)
- User authentication/authorization layer
- Coupon/promo code engine
- Cart expiration/cleanup jobs
- Webhook notifications on checkout
- Payment processing integration
