# Frontend Integration Guide: Products, Variants (Color & Size) & Multiple Images

This guide covers how to work with the product API — specifically **color/size variants**, **multiple product images**, and how to pass variant selection through the cart and order flow.

---

## 1. Product Schema Overview

A product has the following relevant fields:

```json
{
  "_id": "PRODUCT_ID",
  "productName": "Barcelona Home Kit 2025",
  "price": 350,
  "images": ["img1.jpg", "img2.jpg", "img3.jpg"],
  "imageUrl": "img1.jpg",
  "variants": [
    { "_id": "VAR_ID_1", "size": "S",  "color": "Red",   "stock": 5, "sku": "BAR-S-RED" },
    { "_id": "VAR_ID_2", "size": "M",  "color": "Red",   "stock": 3, "sku": "BAR-M-RED" },
    { "_id": "VAR_ID_3", "size": "L",  "color": "Blue",  "stock": 0, "sku": "BAR-L-BLU" },
    { "_id": "VAR_ID_4", "size": "XL", "color": "White", "stock": 8, "sku": "BAR-XL-WHT" }
  ],
  "sale": { "isOnSale": false, ... }
}
```

**Valid sizes**: `XS`, `S`, `M`, `L`, `XL`, `XXL`, `XXXL`, `One Size`

---

## 2. Fetching Variants for a Product Page

### Option A — Full product (already includes variants)

```javascript
const res = await fetch(`/api/products/${productId}`);
const { data: product } = await res.json();

const availableColors = [...new Set(product.variants.map(v => v.color).filter(Boolean))];
const availableSizes  = [...new Set(product.variants.map(v => v.size).filter(Boolean))];
```

### Option B — Variants only (lightweight)

```
GET /api/products/:id/variants
```

```json
{
  "message": "Variants",
  "variants": [ ... ],
  "availableColors": ["Red", "Blue", "White"],
  "availableSizes": ["S", "M", "L", "XL"]
}
```

---

## 3. Building a Color + Size Selector UI

```javascript
// After user picks a color, show only sizes available in that color
function getSizesForColor(variants, selectedColor) {
  return variants
    .filter(v => v.color === selectedColor && v.stock > 0)
    .map(v => v.size);
}

// Find the matching variant for the user's choice
function findVariant(variants, selectedColor, selectedSize) {
  return variants.find(
    v => v.color === selectedColor && v.size === selectedSize
  );
}
```

**Show stock badge example:**

```jsx
{variant.stock === 0 && <span className="badge sold-out">Sold Out</span>}
{variant.stock > 0 && variant.stock <= 3 && <span className="badge low-stock">Only {variant.stock} left!</span>}
{variant.stock > 3 && <span className="badge in-stock">In Stock</span>}
```

---

## 4. Multiple Product Images

The `images` array holds all image filenames. Serve them from `/uploads/<filename>`.

```javascript
// Render image gallery
const imageBaseUrl = 'http://localhost:5000/uploads/';

product.images.forEach(filename => {
  const img = document.createElement('img');
  img.src = imageBaseUrl + filename;
  gallery.appendChild(img);
});
```

---

## 5. Adding to Cart with a Variant

### Endpoint

```
POST /api/cart
Authorization: Bearer <token>
Content-Type: application/json
```

### Body

```json
{
  "productId": "PRODUCT_ID",
  "quantity": 1,
  "variantId": "VAR_ID_2",
  "size": "M",
  "color": "Red"
}
```

> **Tip:** You can pass either `variantId` alone, `size`+`color` alone, or all three. The API will resolve the correct variant. Different variants of the same product are stored as **separate line items** in the cart.

### Example

```javascript
async function addToCart(product, variant, quantity = 1) {
  const res = await fetch('/api/cart', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      productId: product._id,
      quantity,
      variantId: variant._id,
      size: variant.size,
      color: variant.color,
    }),
  });

  const result = await res.json();
  if (!res.ok) throw new Error(result.message);
  return result.cart;
}
```

---

## 6. Removing a Specific Variant from Cart

```
DELETE /api/cart/:productId?variantId=VAR_ID
Authorization: Bearer <token>
```

- If `variantId` is provided → removes only that variant line.
- If omitted → removes **all** lines for that product.

---

## 7. Updating Quantity for a Specific Variant

```
PUT /api/cart/:productId
Authorization: Bearer <token>
Content-Type: application/json
```

```json
{
  "quantity": 3,
  "variantId": "VAR_ID_2"
}
```

---

## 8. Creating an Order (with Variant Info)

When placing an order, include the variant data in each item:

```json
{
  "items": [
    {
      "product": "PRODUCT_ID",
      "quantity": 2,
      "variant": { "size": "L", "color": "Black" }
    }
  ],
  "shippingAddress": { "address": "123 Main Street, Cairo, Egypt" },
  "paymentMethod": "instapay"
}
```

---

## 9. Admin: Creating a Product with Images & Variants

Use `multipart/form-data`. Send images under the `images` field (up to 10). Send `variants` as a **JSON string**.

```javascript
const form = new FormData();
form.append('productName', 'Barcelona Home Kit');
form.append('price', '350');
form.append('type', 'Shirt');

// Multiple images
imageFiles.forEach(file => form.append('images', file));

// Variants as JSON string
const variants = [
  { size: 'S',  color: 'Red',   stock: 10, sku: 'BAR-S-RED' },
  { size: 'M',  color: 'Red',   stock: 8,  sku: 'BAR-M-RED' },
  { size: 'L',  color: 'Blue',  stock: 5,  sku: 'BAR-L-BLU' },
  { size: 'XL', color: 'White', stock: 3,  sku: 'BAR-XL-WHT' },
];
form.append('variants', JSON.stringify(variants));

const res = await fetch('/api/products', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${adminToken}` },
  body: form,
});
```

---

## 10. Admin: Append More Images Later

```
POST /api/products/:id/images
Authorization: Bearer <token>
Content-Type: multipart/form-data  (field: "images", up to 10 files)
```

## 11. Admin: Remove a Single Image

```
DELETE /api/products/:id/images/:filename
Authorization: Bearer <token>
```

## 12. Admin: Replace All Variants

```
PUT /api/products/:id/variants
Authorization: Bearer <token>
Content-Type: application/json
```

```json
{
  "variants": [
    { "size": "S",  "color": "Navy", "stock": 15, "sku": "BAR-S-NAV" },
    { "size": "M",  "color": "Navy", "stock": 10, "sku": "BAR-M-NAV" },
    { "size": "L",  "color": "Gold", "stock": 0,  "sku": "BAR-L-GLD" }
  ]
}
```

Response includes `availableColors` and `availableSizes` arrays for convenience.

---

## 13. Payment Methods

> **Note:** Visa (Paymob) payment is currently disabled. Only **InstaPay** and **Cash on Delivery** are available.
> For InstaPay orders, customers should **DM us on Instagram** to complete payment.

### Creating the Order

```javascript
const response = await fetch('/api/orders', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify(orderPayload)
});

const result = await response.json();

if (response.ok) {
  const orderId = result.data._id;
  const paymentMethod = result.data.paymentMethod;

  if (paymentMethod === 'instapay') {
    // Show instructions telling the user to DM on Instagram
    navigateTo(`/order/${orderId}/instapay-instructions`);
  } else {
    // cash_on_delivery
    navigateTo(`/order/${orderId}/success`);
  }
}
```

<!-- Visa payment (Paymob) and retry sections are disabled. Uncomment if re-enabled in the future. -->
