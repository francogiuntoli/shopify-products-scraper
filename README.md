To run this code you need to create an ADMIN API TOKEN on Shopify Admin Panel and grant it the products and inventory permission (read only would be enough)
Create a `.env` file with `SHOPIFY_ADMIN_TOKEN`, `SHOPIFY_DOMAIN` and `SHOPIFY_METAFIELD_KEYS` or replace them directly in the file.

After running `npm i` to install all dependencies, you can run `npm run main` to get first 100 products or `npm run bulk` to get all of them.

This is a great snippet to use as context after running it through the embeddings engine. The CSV file it creates will work perfectly.

If you have an OpenAI API token, you can also count tokens from the description of the products to calculate how many tokens and use it as a limiter/rule when generating embeddings.
