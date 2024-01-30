import "dotenv/config"
import FormData from "form-data"
import fs from "fs"
import axios from "axios"

let djangoCompany = process.env.DJANGO_COMPANY_ID || null
let domain = process.env.SHOPIFY_DOMAIN || null

async function apiRequest(companyId, domainPath, filePath, count = 500) {
  // Read the file and split it into lines
  const fileContent = fs.readFileSync(filePath, "utf-8")
  const lines = fileContent.split("\n")
  const headers = lines[0]

  // Split the lines into batches based on the count
  for (let i = 1; i < lines.length; i += count) {
    const batch = lines.slice(i, i + count)
    batch.unshift(headers) // Add headers to the batch
    const batchContent = batch.join("\n")

    // Create FormData
    const formData = new FormData()
    const buffer = Buffer.from(batchContent)
    formData.append("docs", buffer, "x.csv")

    // Make the POST request
    try {
        await axios.post(
          `https://llm.t.certainly.io/docstore?company=${companyId}&path=${domainPath}1.myshopify.com`,
          formData,
          {
            headers: {
              ...formData.getHeaders(),
              accept: "application/json",
            },
          }
        )
        console.log(`Batch starting from line ${i} sent successfully!`)
    } catch (error) {
      console.error(
        `Error sending batch starting from line ${i}:`,
        error.message
      )
    }
  }
}

// Example usage
apiRequest(djangoCompany, domain, `${domain}.csv`, 500)
