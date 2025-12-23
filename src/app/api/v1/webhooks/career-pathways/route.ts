import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'

/**
 * POST /api/v1/webhooks/career-pathways
 *
 * Receives Career Pathways form submissions from Zapier.
 * Stores the data in ProductSubmission table and links to identity if email matches.
 *
 * Expected body (flexible - accepts any JSON from Google Form via Zapier):
 * {
 *   email: string (required)
 *   name?: string
 *   phone?: string
 *   jobPreferences?: string
 *   targetLocations?: string
 *   ... any other form fields
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    // Email is required to link to identity
    const email = body.email || body.Email || body.EMAIL

    if (!email) {
      console.warn('[CareerPathways Webhook] No email in payload:', Object.keys(body))
      return NextResponse.json(
        { success: false, error: 'Email is required' },
        { status: 400 }
      )
    }

    const normalizedEmail = email.toLowerCase().trim()

    console.log(`[CareerPathways Webhook] Received submission for: ${normalizedEmail}`)

    // Try to find existing identity by email
    let identity = await prisma.identity.findFirst({
      where: { primaryEmail: normalizedEmail }
    })

    // Also check identity emails table
    if (!identity) {
      const identityEmail = await prisma.identityEmail.findFirst({
        where: {
          email: normalizedEmail,
          productId: { in: ['career-pathways', 'careerpathways', 'career'] }
        },
        include: { identity: true }
      })
      identity = identityEmail?.identity || null
    }

    // If no identity exists, create one for this email
    // This allows us to store the submission and link it to future purchases
    if (!identity) {
      identity = await prisma.identity.create({
        data: {
          primaryEmail: normalizedEmail
        }
      })
      console.log(`[CareerPathways Webhook] Created new identity for: ${normalizedEmail}`)
    }

    // Store the submission
    const submission = await prisma.productSubmission.create({
      data: {
        identityId: identity.id,
        productId: 'career-pathways',
        formData: body,
        zapierTriggered: true
      }
    })

    // Log to audit
    await prisma.auditLog.create({
      data: {
        action: 'career_pathways_submission',
        identityId: identity.id,
        productIds: ['career-pathways'],
        details: {
          email: normalizedEmail,
          submissionId: submission.id,
          source: 'zapier_webhook',
          formFields: Object.keys(body)
        }
      }
    })

    console.log(`[CareerPathways Webhook] Stored submission #${submission.id} for ${normalizedEmail}`)

    return NextResponse.json({
      success: true,
      submissionId: submission.id,
      identityId: identity.id,
      email: normalizedEmail,
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    console.error('[CareerPathways Webhook] Error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// Also support GET for Zapier webhook testing
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    endpoint: 'Career Pathways Webhook',
    usage: 'POST form data with email field',
    timestamp: new Date().toISOString()
  })
}
