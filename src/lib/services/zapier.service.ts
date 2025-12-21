import prisma from '@/lib/db'

/**
 * Trigger Zapier webhook for a product submission
 */
export async function triggerZapierWebhook(
  productId: string,
  formData: Record<string, unknown>,
  identityId: string
) {
  const product = await prisma.product.findUnique({
    where: { id: productId }
  })

  if (!product || !product.zapierWebhookUrl) {
    throw new Error(`No Zapier webhook configured for product: ${productId}`)
  }

  const identity = await prisma.identity.findUnique({
    where: { id: identityId }
  })

  // Prepare payload with form data and metadata
  const payload = {
    ...formData,
    source: 'bundle',
    identityId,
    primaryEmail: identity?.primaryEmail,
    timestamp: new Date().toISOString(),
    productId
  }

  try {
    const response = await fetch(product.zapierWebhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    })

    const responseData = await response.text()

    // Update submission record
    await prisma.productSubmission.updateMany({
      where: {
        identityId,
        productId,
        zapierTriggered: false
      },
      data: {
        zapierTriggered: true,
        zapierResponse: {
          status: response.status,
          statusText: response.statusText,
          body: responseData
        }
      }
    })

    return {
      success: response.ok,
      status: response.status,
      response: responseData
    }
  } catch (error) {
    // Log the error
    await prisma.productSubmission.updateMany({
      where: {
        identityId,
        productId,
        zapierTriggered: false
      },
      data: {
        zapierTriggered: true,
        zapierResponse: {
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      }
    })

    throw error
  }
}

/**
 * Process pending Zapier submissions (for retry logic)
 */
export async function processPendingSubmissions() {
  const pending = await prisma.productSubmission.findMany({
    where: { zapierTriggered: false },
    include: {
      product: true,
      identity: true
    }
  })

  const results = await Promise.allSettled(
    pending.map(async (submission) => {
      if (!submission.product.zapierWebhookUrl) {
        return { skipped: true, reason: 'No webhook URL' }
      }

      return triggerZapierWebhook(
        submission.productId,
        submission.formData as Record<string, unknown>,
        submission.identityId
      )
    })
  )

  return {
    total: pending.length,
    results
  }
}
