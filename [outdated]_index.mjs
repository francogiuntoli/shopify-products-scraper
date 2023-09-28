import fetch from "node-fetch"
import fs from "fs"
import csv from "fast-csv"
import "dotenv/config"

//Paste end cursor from console (after running the app at least once) in the variable below or leave as an empty string
let cursor = ""

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
          priceRangeV2{
            minVariantPrice{
              amount
              currencyCode
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

    //IF you need to extract metafields and add them to the description, you'll have to add metafields in the main query and also you could filter in the query itself / There's an extra filter below just to create the specific string for the description.
    const products = await data.data.products.edges.map((product) => {
      //price formatting fix and to create min/max values to change price tag in the csv later
      let currency
      let priceFixSyntaxMin =
        product.node.priceRangeV2.minVariantPrice.amount.split(".")
      let priceFixSyntaxMax =
        product.node.priceRangeV2.maxVariantPrice.amount.split(".")

      let priceSyntaxMin =
        priceFixSyntaxMin[1].length !== 1
          ? `${priceFixSyntaxMin[0]}.${priceFixSyntaxMin[1]}`
          : priceFixSyntaxMin[0] + ".00"

      let priceSyntaxMax =
        priceFixSyntaxMax[1].length !== 1
          ? `${priceFixSyntaxMax[0]}.${priceFixSyntaxMax[1]}`
          : priceFixSyntaxMax[0] + ".00"

      //correction of currency format in case of different stores currencies / you can add more variants of currency if needed to the switch below and add a default too as safeguard.
      switch (product.node.priceRangeV2.maxVariantPrice.currencyCode) {
        case "GBP":
          currency = "£"
          break
        case "EUR":
          currency = "€"
          break
        case "USD":
          currency = "$"
          break
        case "AUD":
          currency = "A$"
          break
        case "DKK":
          currency = "DKK"
          break
      }

      //formatting variables in case they are either undefined or not correct.
      let prices =
        priceSyntaxMin === priceSyntaxMax
          ? `${currency}${priceSyntaxMin}`
          : `Starting from ${currency}${priceSyntaxMin}`
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
            ? product?.node?.description
            : no_description
        }"`,
        //tokens are not relevant, you can leave as is.
        tokens: 200,
      }
    })

    // Write the product data to the CSV file
    const fileStream = fs.createWriteStream("sample1.csv", {
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
