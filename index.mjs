import fetch from "node-fetch"
import fs from "fs"
import csv from "fast-csv"
import { stripHtml } from "string-strip-html"

import "dotenv/config"

//Paste end cursor from console (after running the app at least once) in the variable below or leave as an empty string
let cursor = ""

//Separator for metafields coming from .ENV file
let metafields = process.env.SHOPIFY_METAFIELD_KEYS.split(',')


//Shopify GraphQL query of products with filter for active products (also draft, but not archived), published (at least one channel) and with a price of more than 1 (of the store currency)

const query = `
  query {
    products(first:100 ${
      cursor !== "" ? `after:"${cursor}"` : ""
    } query:"(available_for_sale:true) AND (status:ACTIVE) AND (published_status:published) AND (price:>1)") {
      edges {
        node {
          title
          productType
          description
          metafields(first: 3, keys:[${metafields.map(e=>JSON.stringify(e))}]) {
            edges {
              node {
                value
                key
              }
            }
          }
          priceRangeV2{
            minVariantPrice{
              amount
            }
          	maxVariantPrice{
              amount
              currencyCode
            }
          }
        }
      }
      pageInfo{
        endCursor
      }
    }
  }
`

const variables = {}

// GraphQL API request to shopify
fetch(
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
  .then((response) => response.json())
  //Promise response from GraphQL API request. If it returns an error saying data.data.products is undefined, there's a syntax error somewhere in the main query
  .then(async (data) => {
    let end_cursor = data.data.products.pageInfo.endCursor

    console.log(end_cursor, "end cursor")

    const products = await data.data.products.edges.map((product) => {

      //IF you need to extract metafields and add them to the description, you'll have to add the keys in the ENV file
      // There's an extra filter below just to create the specific string and add it at the end of the description.
      let descriptionTagValue = null
      if (product.node.metafields) {
        product.node.metafields.edges.forEach(({ node: metafieldNode }) => {
          if (
            metafieldNode.key &&
            metafieldNode.key === process.env.SHOPIFY_METAFIELD_KEYS
          ) {
            let html_stripped = stripHtml(metafieldNode.value).result

            descriptionTagValue = html_stripped

            // descriptionTagValue = html_stripped.split(" Designed")[0] // THIS IS ONLY FOR JOSEPH JOSEPH
          }
        })
      }

      //price formatting logic with product/store currency symbol
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

      //formatting variables in case they are either undefined or not correct.
      let prices =
        priceMin === priceMax ? `${priceMin}` : `Starting from ${priceMin}`

      let no_description = "No description present."

      return {
        title: product.node.title,
        heading:
          product.node.productType === "" || product.node.productType == null
            ? "No type present"
            : product.node.productType,
        content: `Product Title:"${
          product.node.title
        }". Product Price: "${prices}". Product Description: "${
          product?.node?.description?.length > 1
            ? product?.node?.description + ". " + descriptionTagValue ?? ""
            : descriptionTagValue ?? no_description
        }"`,

        //tokens are not relevant, you can leave as is.
        tokens: 200,
      }
    })

    // Write the product data to the CSV file
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
    })
  })
