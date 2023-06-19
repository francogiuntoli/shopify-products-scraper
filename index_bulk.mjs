import fetch from "node-fetch"
import fs from "fs"
import csv from "fast-csv"
import "dotenv/config"

const bulk_ops = `mutation {
  bulkOperationRunQuery(query:"""
  {
      products(query:"(available_for_sale:true)") {
        edges {
          node {
            title
            productType
            description
            priceRangeV2{
              maxVariantPrice{
                amount
                currencyCode
              }
            }
          }
        }
      }
    }""") {
    bulkOperation {
      id
      status
    }
    userErrors {
      field
      message
    }
  }
}`

const query = `
query {
  node(id: "gid://shopify/BulkOperation/1") {
    ... on BulkOperation {
      url
      partialDataUrl
    }
  }
  }
`

const variables = {}

fetch(
  `https://${process.env.SHOPIFY_DOMAIN}.myshopify.com/admin/api/unstable/graphql.json`,
  {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": process.env.SHOPIFY_ADMIN_TOKEN,
    },
    body: JSON.stringify({
      query: bulk_ops,
    }),
  }
)
  .then((response) => response.json())
  .then(async (data) => {
    console.log(
      (await data?.data?.bulkOperationRunQuery?.bulkOperation) ??
        data?.data?.bulkOperationRunQuery?.userErrors,
      "bulk response"
    )
    setTimeout(async () => {
      fetch(
        `https://${process.env.SHOPIFY_DOMAIN}.myshopify.com/admin/api/unstable/graphql.json`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Shopify-Access-Token": process.env.SHOPIFY_ADMIN_TOKEN,
          },
          body: JSON.stringify({
            query: `
        {
          node(id: "${data.data.bulkOperationRunQuery.bulkOperation?.id}") {
            ... on BulkOperation {
              id
              status
              errorCode
              createdAt
              completedAt
              objectCount
              fileSize
              url
              partialDataUrl
            }
          }
        }
        `,
          }),
        }
      )
        .then((response) => response.json())
        .then(async (queryData) => {
          if (queryData.data.node.status === "COMPLETED") {
            console.log("completed")
            fetch(`${queryData.data.node.url}`)
              .then((response) => response.text())
              .then(async (text) => {
                const jsonLines = text.trim().split("\n")
                const jsonData = jsonLines.map((line) => JSON.parse(line))
                const products = jsonData.map((product) => {
                  let currency
                  let priceFixSyntax =
                    product.priceRangeV2.maxVariantPrice.amount.split(".")

                  let priceSyntax =
                    priceFixSyntax[1].length !== 1
                      ? `${priceFixSyntax[0]}.${priceFixSyntax[1]}`
                      : priceFixSyntax[0] + ".00"

                  switch (product.priceRangeV2.maxVariantPrice.currencyCode) {
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

                  return {
                    title: product.title,
                    heading:
                      product.productType == "" || product.productType == null
                        ? "No type present"
                        : product.productType,
                    content: `Product Title:"${product.title}". ${
                      product.description.length > 1
                        ? "Product Description:" + product.description + "."
                        : ""
                    } It costs ${currency}${priceSyntax}`,
                    tokens: 150,
                  }
                })

                const fileStream = fs.createWriteStream("test_bulk.csv", {
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
              .catch((error) => console.error(error))
          }
        })
    }, 10000)
  })
