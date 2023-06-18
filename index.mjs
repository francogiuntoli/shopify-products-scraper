import fetch from "node-fetch"

import fs from "fs"
import csv from "fast-csv"
import 'dotenv/config'

const query = `
  query {
    products(first:100 query:"(available_for_sale:true) AND (status:ACTIVE) AND (published_status:published) AND (price:>1)") {
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


fetch(`https://${process.env.SHOPIFY_DOMAIN}.myshopify.com/admin/api/unstable/graphql.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': process.env.SHOPIFY_ADMIN_TOKEN
    },
    body: JSON.stringify({
      query,
      variables
    })
  })
  .then((response) => response.json())
  .then(async (data) => {
    // let start_cursor = data.data.products.pageInfo.startCursor
    let end_cursor = data.data.products.pageInfo.endCursor

    // console.log(start_cursor, "start cursor")
    console.log(end_cursor, "end cursor")
    // console.dir(data)
    const products = await data.data.products.edges.map((product) => {
      
      
      let descriptionTagValue = null
     if(product.node.metafields){

       product.node.metafields.edges.forEach(({ node: metafieldNode }) => {
         if (
           metafieldNode.key &&
           metafieldNode.key === "global.description_tag"
           ) {
             descriptionTagValue = metafieldNode.value
            }
          })
        }


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
        case "DKK":
          currency = "DKK"
          break
      }

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
            : descriptionTagValue ?? no_description
        }"`,
        tokens: 200,
      }
    })
  
    // Write the product data to the CSV file after all the tokens have been added
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
