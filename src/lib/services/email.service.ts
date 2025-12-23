import { Resend } from 'resend'

let _resend: Resend | null = null

function getResend(): Resend | null {
  if (!_resend && process.env.RESEND_API_KEY) {
    _resend = new Resend(process.env.RESEND_API_KEY)
  }
  return _resend
}

const EMAIL_FROM = process.env.EMAIL_FROM || 'noreply@rezume.ca'
const EMAIL_FROM_NAME = process.env.EMAIL_FROM_NAME || 'Immigrant Networks'

interface BundlePurchaseEmailData {
  customerEmail: string
  customerName?: string
  bundleName: string
  productIds: string[]
  expiresAt?: Date
}

/**
 * Send bundle purchase confirmation email with instructions for all products
 */
export async function sendBundlePurchaseEmail(data: BundlePurchaseEmailData): Promise<boolean> {
  const resend = getResend()

  if (!resend) {
    console.warn('[Email] Resend not configured, skipping bundle purchase email')
    return false
  }

  const { customerEmail, customerName, bundleName, productIds, expiresAt } = data
  const name = customerName || 'there'

  // Format expiry date if provided
  const expiryText = expiresAt
    ? `Your access is valid until ${expiresAt.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}.`
    : ''

  // Determine which products are included (check multiple possible IDs)
  const lowerProductIds = productIds.map(id => id.toLowerCase())
  const hasRezume = lowerProductIds.some(id => id === 'rezume')
  const hasAICoach = lowerProductIds.some(id => ['aicoach', 'coach', 'ai-coach'].includes(id))
  const hasCareerPathways = lowerProductIds.some(id => ['careerpathway', 'career-pathways', 'careerpathways', 'career'].includes(id))

  console.log(`[Email] Sending bundle email for ${bundleName}. Products: ${productIds.join(', ')}. Rezume: ${hasRezume}, AI Coach: ${hasAICoach}, Career Pathways: ${hasCareerPathways}`)

  try {
    const { error } = await resend.emails.send({
      from: `${EMAIL_FROM_NAME} <${EMAIL_FROM}>`,
      to: customerEmail,
      subject: `Welcome to ${bundleName}! Here's how to get started`,
      html: generateBundleEmailHtml({
        name,
        bundleName,
        expiryText,
        hasRezume,
        hasAICoach,
        hasCareerPathways,
        customerEmail
      })
    })

    if (error) {
      console.error('[Email] Failed to send bundle purchase email:', error)
      return false
    }

    console.log(`[Email] Bundle purchase email sent to ${customerEmail}`)
    return true
  } catch (error) {
    console.error('[Email] Error sending bundle purchase email:', error)
    return false
  }
}

interface EmailHtmlData {
  name: string
  bundleName: string
  expiryText: string
  hasRezume: boolean
  hasAICoach: boolean
  hasCareerPathways: boolean
  customerEmail: string
}

function generateBundleEmailHtml(data: EmailHtmlData): string {
  const { name, bundleName, expiryText, hasRezume, hasAICoach, hasCareerPathways, customerEmail } = data

  // Build product sections
  let productSections = ''
  let stepNumber = 1

  if (hasRezume) {
    productSections += `
      <div style="background: #f0fdf4; border-left: 4px solid #22c55e; padding: 20px; margin: 20px 0; border-radius: 0 8px 8px 0;">
        <h3 style="color: #166534; margin: 0 0 10px 0;">
          <span style="background: #22c55e; color: white; padding: 2px 10px; border-radius: 20px; font-size: 14px; margin-right: 10px;">Step ${stepNumber}</span>
          Rezume.ca - AI Resume Builder
        </h3>
        <p style="color: #333; margin: 10px 0;">Create stunning, ATS-optimized resumes that get you interviews.</p>
        <ol style="color: #555; margin: 10px 0; padding-left: 20px;">
          <li>Go to <a href="https://rezume.ca" style="color: #22c55e; font-weight: 600;">rezume.ca</a></li>
          <li>Sign up or log in with <strong>${customerEmail}</strong></li>
          <li>You'll automatically have Pro access - start building!</li>
        </ol>
        <a href="https://rezume.ca" style="display: inline-block; background: #22c55e; color: white; padding: 10px 20px; text-decoration: none; border-radius: 6px; font-weight: 600; margin-top: 10px;">
          Open Rezume.ca &rarr;
        </a>
      </div>
    `
    stepNumber++
  }

  if (hasAICoach) {
    productSections += `
      <div style="background: #eff6ff; border-left: 4px solid #3b82f6; padding: 20px; margin: 20px 0; border-radius: 0 8px 8px 0;">
        <h3 style="color: #1e40af; margin: 0 0 10px 0;">
          <span style="background: #3b82f6; color: white; padding: 2px 10px; border-radius: 20px; font-size: 14px; margin-right: 10px;">Step ${stepNumber}</span>
          AI Interview Coach
        </h3>
        <p style="color: #333; margin: 10px 0;">Practice interviews with AI and get instant feedback to ace your next interview.</p>
        <ol style="color: #555; margin: 10px 0; padding-left: 20px;">
          <li>Go to <a href="https://your-ai-interview-coach-7f11f441a641.herokuapp.com" style="color: #3b82f6; font-weight: 600;">AI Interview Coach</a></li>
          <li>Sign up or log in with <strong>${customerEmail}</strong></li>
          <li>You'll automatically have full access - start practicing!</li>
        </ol>
        <a href="https://your-ai-interview-coach-7f11f441a641.herokuapp.com" style="display: inline-block; background: #3b82f6; color: white; padding: 10px 20px; text-decoration: none; border-radius: 6px; font-weight: 600; margin-top: 10px;">
          Open AI Coach &rarr;
        </a>
      </div>
    `
    stepNumber++
  }

  if (hasCareerPathways) {
    productSections += `
      <div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 20px; margin: 20px 0; border-radius: 0 8px 8px 0;">
        <h3 style="color: #92400e; margin: 0 0 10px 0;">
          <span style="background: #f59e0b; color: white; padding: 2px 10px; border-radius: 20px; font-size: 14px; margin-right: 10px;">Step ${stepNumber}</span>
          Career Pathways - Automated Job Applications
        </h3>
        <p style="color: #333; margin: 10px 0;">Get personalized job matches delivered to your inbox based on your preferences.</p>
        <ol style="color: #555; margin: 10px 0; padding-left: 20px;">
          <li>Click the button below to fill out a quick form</li>
          <li>Tell us your job preferences and target locations</li>
          <li>We'll automatically send you matching jobs daily!</li>
        </ol>
        <div style="background: #fef9c3; padding: 12px; border-radius: 6px; margin: 15px 0;">
          <p style="margin: 0; color: #854d0e; font-size: 14px;">
            <strong>Important:</strong> Use the same email (<strong>${customerEmail}</strong>) when filling the form to link your access.
          </p>
        </div>
        <a href="https://docs.google.com/forms/d/e/1FAIpQLSdHaNH2q6KXcoWUiO3BkSvBUbUG5hCsFkLVz0mx76Pooc6DIg/viewform?usp=header" style="display: inline-block; background: #f59e0b; color: white; padding: 10px 20px; text-decoration: none; border-radius: 6px; font-weight: 600; margin-top: 10px;">
          Fill Career Pathways Form &rarr;
        </a>
      </div>
    `
    stepNumber++
  }

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Welcome to ${bundleName}</title>
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background: #f5f5f5;">
      <div style="background: linear-gradient(135deg, #8b5cf6 0%, #6366f1 50%, #3b82f6 100%); padding: 40px 30px; text-align: center; border-radius: 12px 12px 0 0;">
        <h1 style="color: white; margin: 0; font-size: 28px;">Welcome to ${bundleName}!</h1>
        <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0; font-size: 16px;">Your career transformation starts now</p>
      </div>

      <div style="background: #ffffff; padding: 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 12px 12px;">
        <h2 style="color: #333; margin-top: 0;">Hi ${name}!</h2>

        <p>Thank you for your purchase! Your access to all products in the <strong>${bundleName}</strong> is now active.</p>

        ${expiryText ? `<p style="color: #666;">${expiryText}</p>` : ''}

        <div style="background: #f8fafc; padding: 15px; border-radius: 8px; margin: 20px 0;">
          <p style="margin: 0; color: #475569; font-size: 15px;">
            <strong>Quick Tip:</strong> Use the same email (<strong>${customerEmail}</strong>) when signing up for each product to automatically unlock your Pro access.
          </p>
        </div>

        <h2 style="color: #333; border-bottom: 2px solid #e5e7eb; padding-bottom: 10px; margin-top: 30px;">
          Getting Started (${stepNumber - 1} Easy Steps)
        </h2>

        ${productSections}

        <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 30px 0;">

        <div style="text-align: center;">
          <p style="color: #666; margin-bottom: 5px;">Need help? We're here for you!</p>
          <p style="color: #999; font-size: 14px; margin: 0;">
            Reply to this email or contact us at <a href="mailto:support@immigrantnetworks.ca" style="color: #6366f1;">support@immigrantnetworks.ca</a>
          </p>
        </div>

        <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 30px 0;">

        <p style="color: #999; font-size: 12px; margin: 0; text-align: center;">
          You're receiving this email because you purchased the ${bundleName}.<br>
          &copy; ${new Date().getFullYear()} Immigrant Networks - All rights reserved.
        </p>
      </div>
    </body>
    </html>
  `
}
