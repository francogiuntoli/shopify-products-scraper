import fetch, { FormData } from "node-fetch"
import fs from "fs"
import csv from "fast-csv"
import { stripHtml } from "string-strip-html"
import "dotenv/config"

// initiate cursor as empty for batch request to update the value if there's a next page
let cursor = ""

// Separator for metafields coming from .ENV file
let metafield_keys = process.env.SHOPIFY_METAFIELD_KEYS.split(",")

// Function to fetch products and write them to CSV
async function fetchAndWriteProducts(cursor) {
  const query = `
    query {
      products(first: 75 ${cursor !== "" ? `after: "${cursor}"` : ""} query: "(available_for_sale:true) AND (status:ACTIVE) AND (published_status:published) AND (price:>1)") {
        edges {
          node {
            title
            productType
            description
            options{
              name
              values
            }
            metafields(first: 5, keys:[${metafield_keys.map((e) => JSON.stringify(e))}]) {
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
  const hasNextPage = data.data.products.pageInfo.hasNextPage //always a boolean

  console.log(`Fetched products up to cursor: ${endCursor}`)

  const products = data.data.products.edges.map((product) => {

    //deconstruct product for readability
    const { metafields, description, priceRangeV2, title, productType, options } = product.node

    // IF you need to extract metafields and add them to the description, you'll have to add the keys in the ENV file
    // There's an extra filter below just to create the specific string and add it at the end of the description.
    
    let metafieldValues = []
    if (metafields) {
      metafields.edges.forEach(({ node: metafieldNode }) => {
        const { key, value } = metafieldNode

        // Check if the metafield key exists in the list of keys from the .env file
        if (metafield_keys.includes(key) && value !== "") {
          //strip html tags from content
          if(key !== 'filters.colours'){

            let html_stripped = stripHtml(value).result
            metafieldValues.push(html_stripped.split(' Designed')[0])
          }else{
            let valueColours = "Colours : " + JSON.parse(value).join(", ")
            metafieldValues.push(valueColours)             
           
          }
        }
      })
    }

    let priceMin = Number(
      priceRangeV2.minVariantPrice.amount
    ).toLocaleString("en-US", {
      style: "currency",
      currency: `${priceRangeV2.maxVariantPrice.currencyCode}`,
    })

    let priceMax = Number(
      priceRangeV2.maxVariantPrice.amount
    ).toLocaleString("en-US", {
      style: "currency",
      currency: `${priceRangeV2.maxVariantPrice.currencyCode}`,
    })

    let prices = priceMin === priceMax ? `${priceMin}` : `Starting from ${priceMin}`

    let no_description = "No description present."
    // let safe_description = process.env.DESCRIPTION_EXCLUDE ? "" : description
    let safe_description = stripHtml(description).result
    return {
      title: title,
      product_type:
        productType === "" || productType == null
          ? "No type present"
          : productType,
      description: safe_description.length > 0 && metafieldValues.length > 0
            ? safe_description +
              ". Product Extra Information: " +
              metafieldValues.join(". ")
            : safe_description.length < 1 && metafieldValues.length > 0
            ? metafieldValues.join(". ")
            : safe_description.length > 0
            ? safe_description
            : no_description,
      price: prices,
    }
  })

  return { products, hasNextPage, endCursor }
}

// Function to write products to CSV
async function writeProductsToCSV(products) {
  return new Promise((resolve, reject) => {
    const fileStream = fs.createWriteStream(
      `${process.env.SHOPIFY_DOMAIN + ".csv"}`,
      {
        encoding: "utf8",
      }
    )

    csv
      .write(products, {
        headers: ["title", "product_type", "description", "price"],
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
  let uniqueTitles = new Set() // Set to store unique titles

  while (hasNextPage) {
    const {
      products,
      endCursor,
      hasNextPage: nextPage,
    } = await fetchAndWriteProducts(cursor)

    // Check for duplicates and filter them out
    const uniqueProducts = products.filter((product) => {
      if (uniqueTitles.has(product.description)) {
        return false
      } else {
        uniqueTitles.add(product.description)
        return true
      }
    })

    allProducts = allProducts.concat(uniqueProducts)
    hasNextPage = nextPage
    cursor = endCursor
  }

  await writeProductsToCSV(allProducts)
}


// Run the script
fetchAndWriteProductsInBatches().catch((error) => {
  console.error("Script error:", error)
})

function sanitizeString(inputString) {
  // Remove script tags and their contents
  const sanitizedString = inputString.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  
  // Remove HTML tags and attributes
  const cleanString = sanitizedString.replace(/<\/?[^>]+(>|$)/g, '');

  // Remove JavaScript variable declarations and if {} else {} blocks with extra spaces
  const noJavaScriptVarsString = cleanString.replace(/(var\s+[^;]+;)|\bif\s*\(\s*.*?\s*\)\s*\{\s*[^{}]*\s*\}\s*(?:else\s*\{\s*[^{}]*\s*\})?/g, '');
  
  // Remove jQuery code
  const noJQueryString = noJavaScriptVarsString.replace(/\$\(.*?\);/g, '');

  // Remove extra spaces
  const cleanedOutput = noJQueryString.replace(/\s+/g, ' ');

  return cleanedOutput.trim();
}




