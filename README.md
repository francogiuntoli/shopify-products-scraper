To run this code you need to create an ADMIN API TOKEN on Shopify Admin Panel and grant it the products, inventory, metaobjects and metafields permission (read only would be enough)

Create a `.env` file in the root directory with `SHOPIFY_ADMIN_TOKEN`, `SHOPIFY_DOMAIN` , `SHOPIFY_METAFIELD_KEYS`and `DESCRIPTION_EXCLUDE` or replace them directly in the file.

For `SHOPIFY_METAFIELD_KEYS` keep in mind that you can use multiple ones, and they need to be separated by a comma without spaces.

After running `npm i` to install all dependencies, you can run `npm run main` for the version including metafields or `npm run bulk` to get all products in bulk (does not include metafields or sanitization).

