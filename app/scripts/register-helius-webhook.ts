/**
 * Register Helius Webhook for SuniSwap
 *
 * Usage:
 *   HELIUS_API_KEY=your-api-key npx ts-node scripts/register-helius-webhook.ts <webhook-url>
 *
 * Example:
 *   HELIUS_API_KEY=abc123 npx ts-node scripts/register-helius-webhook.ts https://your-app.vercel.app/api/webhooks/helius
 */

const PROGRAM_ID = "D3mEetFkLuB1sia8Bvvv2nmt9k6RsJPAGR2PE6tj7EFq";

interface WebhookResponse {
  webhookID: string;
  wallet: string;
  webhookURL: string;
  transactionTypes: string[];
  accountAddresses: string[];
  webhookType: string;
}

async function registerWebhook(apiKey: string, webhookUrl: string): Promise<WebhookResponse> {
  const response = await fetch(
    `https://api.helius.xyz/v0/webhooks?api-key=${apiKey}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        webhookURL: webhookUrl,
        transactionTypes: ["ANY"],
        accountAddresses: [PROGRAM_ID],
        webhookType: "enhanced",
        txnStatus: "all",
      }),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to create webhook: ${response.status} - ${error}`);
  }

  return response.json();
}

async function listWebhooks(apiKey: string): Promise<WebhookResponse[]> {
  const response = await fetch(
    `https://api.helius.xyz/v0/webhooks?api-key=${apiKey}`
  );

  if (!response.ok) {
    throw new Error(`Failed to list webhooks: ${response.status}`);
  }

  return response.json();
}

async function deleteWebhook(apiKey: string, webhookId: string): Promise<void> {
  const response = await fetch(
    `https://api.helius.xyz/v0/webhooks/${webhookId}?api-key=${apiKey}`,
    { method: "DELETE" }
  );

  if (!response.ok) {
    throw new Error(`Failed to delete webhook: ${response.status}`);
  }
}

async function main() {
  const apiKey = process.env.HELIUS_API_KEY;
  const webhookUrl = process.argv[2];
  const action = process.argv[3] || "create";

  if (!apiKey) {
    console.error("Error: HELIUS_API_KEY environment variable is required");
    console.log("\nUsage:");
    console.log("  HELIUS_API_KEY=your-key npx ts-node scripts/register-helius-webhook.ts <webhook-url>");
    console.log("\nGet your API key at: https://dashboard.helius.dev/");
    process.exit(1);
  }

  console.log("=".repeat(60));
  console.log("Helius Webhook Registration");
  console.log("=".repeat(60));
  console.log(`\nProgram ID: ${PROGRAM_ID}`);

  if (action === "list" || !webhookUrl) {
    console.log("\nListing existing webhooks...");
    const webhooks = await listWebhooks(apiKey);

    if (webhooks.length === 0) {
      console.log("No webhooks found.");
    } else {
      console.log(`\nFound ${webhooks.length} webhook(s):\n`);
      for (const wh of webhooks) {
        console.log(`  ID: ${wh.webhookID}`);
        console.log(`  URL: ${wh.webhookURL}`);
        console.log(`  Type: ${wh.webhookType}`);
        console.log(`  Addresses: ${wh.accountAddresses.join(", ")}`);
        console.log("");
      }
    }

    if (!webhookUrl) {
      console.log("\nTo create a webhook, provide the URL:");
      console.log("  HELIUS_API_KEY=your-key npx ts-node scripts/register-helius-webhook.ts https://your-app.com/api/webhooks/helius");
    }
    return;
  }

  if (action === "delete") {
    const webhookId = webhookUrl; // In delete mode, second arg is webhook ID
    console.log(`\nDeleting webhook ${webhookId}...`);
    await deleteWebhook(apiKey, webhookId);
    console.log("✓ Webhook deleted successfully");
    return;
  }

  // Create webhook
  console.log(`\nWebhook URL: ${webhookUrl}`);
  console.log("\nRegistering webhook...");

  try {
    const webhook = await registerWebhook(apiKey, webhookUrl);

    console.log("\n✓ Webhook registered successfully!\n");
    console.log(`  Webhook ID: ${webhook.webhookID}`);
    console.log(`  URL: ${webhook.webhookURL}`);
    console.log(`  Type: ${webhook.webhookType}`);
    console.log(`  Monitoring: ${webhook.accountAddresses.join(", ")}`);

    console.log("\n" + "=".repeat(60));
    console.log("Add this to your .env.local:");
    console.log("=".repeat(60));
    console.log(`\nHELIUS_WEBHOOK_ID=${webhook.webhookID}`);

  } catch (error) {
    console.error("\n✗ Failed to register webhook:", error);
    process.exit(1);
  }
}

main().catch(console.error);
