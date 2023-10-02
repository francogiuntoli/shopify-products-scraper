import fetch from "node-fetch"
import fs from "fs"
import csv from "fast-csv"
import { stripHtml } from "string-strip-html"
import "dotenv/config"

// Paste end cursor from console (after running the app at least once) in the variable below or leave it as an empty string
let cursor = ""

// Separator for metafields coming from .ENV file
let metafield_keys = process.env.SHOPIFY_METAFIELD_KEYS.split(',')

// Function to fetch products and write them to CSV
async function fetchAndWriteProducts(cursor) {
  const query = `
    query {
      products(first: 100 ${
        cursor !== "" ? `after: "${cursor}"` : ""
      } query: "(available_for_sale:true) AND (status:ACTIVE) AND (published_status:published) AND (price:>1)") {
        edges {
          node {
            title
            productType
            description
            metafields(first: 5, keys:[${metafield_keys.map(e=>JSON.stringify(e))}]) {
              edges {
                node {
                  value
                  key
                }
              }
            }
            priceRangeV2 {
              minVariantPrice {
                amount
              }
              maxVariantPrice {
                amount
                currencyCode
              }
            }
          }
        }
        pageInfo {
          endCursor
          hasNextPage
        }
      }
    }
  `

  const variables = {}

  const response = await fetch(
    `https://${process.env.SHOPIFY_DOMAIN}.myshopify.com/admin/api/unstable/graphql.json`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": process.env.SHOPIFY_ADMIN_TOKEN,
      },
      body: JSON.stringify({
        query,
        variables,
      }),
    }
  )

  const data = await response.json()

  if (!data.data || !data.data.products) {
    console.error("Error fetching products:", data.errors)
    return
  }

  const endCursor = data.data.products.pageInfo.endCursor
  const hasNextPage = data.data.products.pageInfo.hasNextPage

  console.log(`Fetched products up to cursor: ${endCursor}`)

  const products = data.data.products.edges.map((product) => {
    const {metafields, description, priceRangeV2, title, productType} = product.node
    //IF you need to extract metafields and add them to the description, you'll have to add the keys in the ENV file
    // There's an extra filter below just to create the specific string and add it at the end of the description.
    let metafieldValues = []
    if (metafields) {
      metafields.edges.forEach(({ node: metafieldNode }) => {
        const {key, value} = metafieldNode
        // Check if the metafield key exists in the list of keys from the .env file
        if (metafield_keys.includes(key)) {
          
          //strip html tags from content
          let html_stripped = stripHtml(value).result;
          metafieldValues.push(html_stripped);
        }
      });
    }

    let priceMin = Number(
      product.node.priceRangeV2.minVariantPrice.amount
    ).toLocaleString("en-US", {
      style: "currency",
      currency: `${product.node.priceRangeV2.maxVariantPrice.currencyCode}`,
    })

    let priceMax = Number(
      product.node.priceRangeV2.maxVariantPrice.amount
    ).toLocaleString("en-US", {
      style: "currency",
      currency: `${product.node.priceRangeV2.maxVariantPrice.currencyCode}`,
    })

    let prices =
      priceMin === priceMax ? `${priceMin}` : `Starting from ${priceMin}`

    let no_description = "No description present."

    return {
      title: title,
      heading:
        productType === "" || productType == null
          ? "No type present"
          : productType,
      content: `Product Title:"${title}". Product Price: "${prices}". Product Description: "${
        description.length > 1 && metafieldValues.length > 0
          ? description + ". Product Extra Information: " + metafieldValues.join(". ")
          : description.length < 1 && metafieldValues.length> 0 
            ? metafieldValues.join(". ")
            : no_description
      }"`,
      //tokens are not relevant, you can leave as is.
      tokens: 200,
    }
  })

  return { products, hasNextPage, endCursor }
}

// Function to write products to CSV
async function writeProductsToCSV(products) {
  return new Promise((resolve, reject) => {
    const fileStream = fs.createWriteStream("sample.csv", {
      encoding: "utf8",
    })

    csv
      .write(products, {
        headers: ["title", "heading", "content", "tokens"],
        delimiter: ";",
      })
      .pipe(fileStream)

    fileStream.on("finish", () => {
      console.log("CSV file successfully created")
      resolve()
    })

    fileStream.on("error", (error) => {
      console.error("Error writing to CSV:", error)
      reject(error)
    })
  })
}

// Fetch and write products in batches
async function fetchAndWriteProductsInBatches() {
  let hasNextPage = true
  let allProducts = []

  while (hasNextPage) {
    const { products, endCursor, hasNextPage: nextPage } = await fetchAndWriteProducts(cursor)
    allProducts = allProducts.concat(products)
    hasNextPage = nextPage
    cursor = endCursor
  }

  await writeProductsToCSV(allProducts)
}

// Run the script
fetchAndWriteProductsInBatches().catch((error) => {
  console.error("Script error:", error)
})