# Backend API Updates: Variants & Multiple Images Support

This document summarizes the recent backend changes made to support product variants (color/size) and multiple product images, enabling the frontend to fully integrate these features.

## 1. Cart System Updates
The Cart system has been completely upgraded to be **variant-aware**.

*   **New Fields**: Each item in the cart now tracks `variantId`, `size`, and `color`.
*   **Adding to Cart (`POST /api/cart`)**: 
    *   You can now pass `variantId`, `size`, and `color` in the request body.
    *   If you only pass `size` and `color`, the backend will automatically resolve the correct `variantId`.
    *   Adding different variants of the same product (e.g., a Red Medium shirt and a Blue Large shirt) will now create **separate line items** in the cart instead of merging them.
*   **Removing from Cart (`DELETE /api/cart/:productId`)**:
    *   You can now append `?variantId=YOUR_VARIANT_ID` to remove only a specific variant from the cart.
    *   If no `variantId` is provided, it removes all variants of that product.
*   **Updating Quantity (`PUT /api/cart/:productId`)**:
    *   Now accepts `variantId` in the body to specify exactly which line item's quantity to update.
*   **Syncing Cart (`POST /api/cart/sync`)**:
    *   The local storage sync endpoint is also variant-aware and handles merging items with the same `variantId`.

## 2. Product API Updates (Variants)
Four new dedicated endpoints were added to `product.route.js` to handle variants and images easily.

*   **`GET /api/products/:id/variants`**
    *   A lightweight endpoint to fetch only the variants for a specific product.
    *   **Bonus**: The response automatically includes `availableColors` and `availableSizes` arrays to make building frontend dropdown/selector UIs easier.
*   **`PUT /api/products/:id/variants`**
    *   Admin endpoint to replace the entire variants array for a product in one go. Validates sizes and stock.

## 3. Product API Updates (Images)
Products already supported multiple images in the database (`images` array), but managing them was difficult.

*   **`POST /api/products/:id/images`**
    *   Admin endpoint to **append** new images to a product without overwriting the existing ones. Accepts `multipart/form-data` with multiple files under the `images` key.
*   **`DELETE /api/products/:id/images/:filename`**
    *   Admin endpoint to delete a single, specific image from a product's gallery. Keeps the primary `imageUrl` in sync automatically.

## 4. Model Changes
*   **Cart Model**: Added `variantId` (ObjectId), `size` (String), and `color` (String) to the `items` array schema.
*   **Product Model**: No changes were needed! The `variants` array (with size, color, stock, sku) and `images` array were already defined, they are just fully utilized now.

## Next Steps for Frontend
Please refer to the updated `frontend_integration_guide.md` for specific code examples, payload structures, and UI suggestions for implementing these features.
