/**
 * Standalone script to send a test bundle purchase email
 *
 * Usage: npx ts-node scripts/send-test-email.ts
 *
 * Make sure RESEND_API_KEY is set in your .env file
 */

import { config } from 'dotenv'
config()

import { Resend } from 'resend'

const RESEND_API_KEY = process.env.RESEND_API_KEY
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
const EMAIL_FROM = process.env.EMAIL_FROM || 'noreply@rezume.ca'
const EMAIL_FROM_NAME = process.env.EMAIL_FROM_NAME || 'Immigrant Networks'

// Test email recipient
const TEST_EMAIL = 'dhruv.khurana@hypergrow.ai'
const TEST_NAME = 'Dhruv'

// Logo URLs
const LOGOS = {
  immigrantNetworks: 'https://immigrantnetworks.com/wp-content/uploads/2023/11/IMMNet-New-Logo-1-e1715195131262.png',
  rezume: 'https://rezume.ca/rezume-logo.png',
  aiInterviewCoach: `${APP_URL}/ai-interview-coach-logo.png`,
  heartbeat: 'https://dfle76rxbxaz7.cloudfront.net/assets/4e873b7a-033e-46b9-98f4-4a15dbd75957-communitylogo-8053e6c4-a50e-4082-908d-ffa118edaea4.png?Expires=2054192101&Key-Pair-Id=APKAIPAIYEJQ7WRNJNKQ&Signature=R7wcbOzL1m4n9SBPgP3YNQMRnbtyjA1TnB8Chmh5ToOzpPxj~BfiLWc1YXSQLK2pdwyylXlOM179AttWJlwowcgnX7HOWTyAOLPMZrbqyZUtOZ9vSXyR-kX5ZJf0xDAqOVl2mlaPTOgweywfSCczEK1hTErHxbtzTBr3kwto~PchKNQMCXJE0aLVr3I~Z2wFo5bg1Fi0qfvY7IgFeaJeQTqhMzVe7wZqfB6-72U1QLmAGNTb6PrY~15cxId-XP0u-KRR9ZWLrip07bAAc7F5XWL4AGbibF2G9mXDLJyLQwShBL4R8AZAuNUazFXWi8XSL5TSH48~bXtcvXeZ-B8M-A__',
  careerPathways: 'https://careerpathway.ca/logo.png'
}

function generateTestEmailHtml(): string {
  const customerEmail = TEST_EMAIL
  const name = TEST_NAME
  const bundleName = 'A-Game Ultimate Career Bundle'

  // Calculate expiry date (1 year from now)
  const expiresAt = new Date()
  expiresAt.setFullYear(expiresAt.getFullYear() + 1)
  const expiryText = `Your access is valid until ${expiresAt.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}.`

  const createStepCard = (
    step: number,
    logoUrl: string,
    logoAlt: string,
    title: string,
    description: string,
    listItems: string[],
    ctaUrl: string,
    ctaText: string,
    extraContent?: string
  ) => `
    <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom: 25px;">
      <tr>
        <td style="padding-bottom: 12px;">
          <span style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #ffffff; font-weight: 700; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px; padding: 8px 14px; border-radius: 20px; display: inline-block;">Step ${step}</span>
        </td>
      </tr>
      <tr>
        <td style="background-color: #ffffff; border: 1px solid #e8e8e8; border-radius: 8px; padding: 20px;">
          <table cellpadding="0" cellspacing="0" border="0" width="100%" style="border-bottom: 1px solid #f0f0f0; padding-bottom: 12px; margin-bottom: 12px;">
            <tr>
              <td width="72" valign="middle" style="padding-right: 12px;">
                <img src="${logoUrl}" alt="${logoAlt}" style="max-width: 60px; height: auto; display: block;">
              </td>
              <td valign="middle">
                <div style="font-size: 18px; font-weight: 700; color: #332D2D;">${title}</div>
              </td>
            </tr>
          </table>
          <p style="color: #666; margin-bottom: 10px; font-size: 14px; line-height: 1.5;">${description}</p>
          <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin: 10px 0;">
            ${listItems.map(item => `
              <tr>
                <td style="padding: 5px 0 5px 0; color: #666; font-size: 14px; line-height: 1.5;">
                  <span style="color: #DB1818; font-weight: 700; font-size: 16px; margin-right: 8px;">✓</span>${item}
                </td>
              </tr>
            `).join('')}
          </table>
          ${extraContent || ''}
          <a href="${ctaUrl}" style="display: inline-block; background-color: #DB1818; color: white; padding: 10px 24px; text-decoration: none; border-radius: 5px; font-weight: 700; font-size: 14px; margin-top: 8px;">${ctaText} →</a>
        </td>
      </tr>
    </table>
  `

  // Step 1: Rezume
  let productSections = createStepCard(
    1,
    LOGOS.rezume,
    'Rezume.ca',
    'Rezume.ca - AI Resume Builder',
    'Create stunning, ATS-optimized resumes that get you interviews.',
    [
      `Go to <a href="https://rezume.ca" style="color: #DB1818; text-decoration: none; font-weight: 600;">Rezume.ca</a>`,
      'Click on Get Started',
      'Sign in with your Gmail or create account (for other emails)',
      "You'll automatically have Pro access - start building!"
    ],
    'https://rezume.ca',
    'Open Rezume.ca'
  )

  // Step 2: AI Interview Coach
  productSections += createStepCard(
    2,
    LOGOS.aiInterviewCoach,
    'AI Interview Coach',
    'AI Interview Coach',
    'Practice interviews with AI and get instant feedback to ace your next interview.',
    [
      `Go to <a href="https://aiinterviewcoach.ca/" style="color: #DB1818; text-decoration: none; font-weight: 600;">AI Interview Coach</a>`,
      'Click on Existing User',
      `Enter <a href="mailto:${customerEmail}" style="color: #DB1818; text-decoration: none; font-weight: 600;">${customerEmail}</a> and access your account`
    ],
    'https://aiinterviewcoach.ca/',
    'Open AI Coach'
  )

  // Step 3: Heartbeat Community
  productSections += `
    <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom: 25px;">
      <tr>
        <td style="padding-bottom: 12px;">
          <span style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #ffffff; font-weight: 700; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px; padding: 8px 14px; border-radius: 20px; display: inline-block;">Step 3</span>
        </td>
      </tr>
      <tr>
        <td style="background-color: #ffffff; border: 1px solid #e8e8e8; border-radius: 8px; padding: 20px;">
          <table cellpadding="0" cellspacing="0" border="0" width="100%" style="border-bottom: 1px solid #f0f0f0; padding-bottom: 12px; margin-bottom: 12px;">
            <tr>
              <td width="62" valign="middle" style="padding-right: 12px;">
                <img src="${LOGOS.heartbeat}" alt="Heartbeat Community" style="max-width: 50px; height: auto; display: block;">
              </td>
              <td valign="middle">
                <div style="font-size: 18px; font-weight: 700; color: #332D2D;">Join Our Heartbeat Community</div>
              </td>
            </tr>
          </table>
          <p style="color: #666; margin-bottom: 10px; font-size: 14px; line-height: 1.5;">Connect with fellow members and join our live workshops on Heartbeat, our exclusive community platform.</p>
          <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin: 10px 0;">
            <tr>
              <td style="padding: 5px 0 5px 0; color: #666; font-size: 14px; line-height: 1.5;">
                <span style="color: #DB1818; font-weight: 700; font-size: 16px; margin-right: 8px;">✓</span>Check your inbox <strong style="color: #DB1818;">(and spam folder!)</strong> for an invite to join Heartbeat platform
              </td>
            </tr>
            <tr>
              <td style="padding: 5px 0 5px 0; color: #666; font-size: 14px; line-height: 1.5;">
                <span style="color: #DB1818; font-weight: 700; font-size: 16px; margin-right: 8px;">✓</span>Fill out a small questionnaire about yourself
              </td>
            </tr>
            <tr>
              <td style="padding: 5px 0 5px 0; color: #666; font-size: 14px; line-height: 1.5;">
                <span style="color: #DB1818; font-weight: 700; font-size: 16px; margin-right: 8px;">✓</span>Let our community get to know you better
              </td>
            </tr>
            <tr>
              <td style="padding: 5px 0 5px 0; color: #666; font-size: 14px; line-height: 1.5;">
                <span style="color: #DB1818; font-weight: 700; font-size: 16px; margin-right: 8px;">✓</span>Boom! You're part of the Immigrant Networks community
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  `

  // Step 4: Career Pathways
  const guideFeatures = `
    <div style="background-color: #FFF9F5; padding: 12px 15px; border-radius: 6px; margin: 10px 0;">
      <div style="color: #332D2D; margin-bottom: 8px; font-size: 14px; font-weight: 700;">Your guide includes:</div>
      <table cellpadding="0" cellspacing="0" border="0" width="100%">
        <tr><td style="padding: 3px 0 3px 0; font-size: 13px; color: #666; line-height: 1.4;"><span style="color: #DB1818; font-size: 18px; margin-right: 6px;">•</span>Self-assessment & 30/60/90 day career plan</td></tr>
        <tr><td style="padding: 3px 0 3px 0; font-size: 13px; color: #666; line-height: 1.4;"><span style="color: #DB1818; font-size: 18px; margin-right: 6px;">•</span>Provincial regulators & bridging programs for your profession</td></tr>
        <tr><td style="padding: 3px 0 3px 0; font-size: 13px; color: #666; line-height: 1.4;"><span style="color: #DB1818; font-size: 18px; margin-right: 6px;">•</span>Mentorship opportunities & professional associations</td></tr>
        <tr><td style="padding: 3px 0 3px 0; font-size: 13px; color: #666; line-height: 1.4;"><span style="color: #DB1818; font-size: 18px; margin-right: 6px;">•</span>Skills match analysis & best cities to work in Canada</td></tr>
        <tr><td style="padding: 3px 0 3px 0; font-size: 13px; color: #666; line-height: 1.4;"><span style="color: #DB1818; font-size: 18px; margin-right: 6px;">•</span>Alternative career options based on your background</td></tr>
      </table>
    </div>
    <div style="background-color: #FFF9F5; padding: 10px 15px; margin: 12px 0; border-radius: 6px; border-left: 4px solid #DB1818; font-size: 14px; line-height: 1.5;">
      <strong style="color: #332D2D;">⚠️ Important:</strong> Use the same email (<a href="mailto:${customerEmail}" style="color: #DB1818; text-decoration: none; font-weight: 600;">${customerEmail}</a>) when filling the form to link your access.
    </div>
  `

  productSections += createStepCard(
    4,
    LOGOS.careerPathways,
    'Career Pathways',
    'Career Pathways - Your Canadian Career Guide',
    'Get a personalized PDF guide to navigate your career in Canada, tailored to your profession and goals.',
    [
      'Click the button below to fill out a quick form',
      'Tell us about your profession and career goals',
      'Receive your personalized Career Pathways PDF guide!'
    ],
    'https://careerpathway.ca',
    'Get Your Career Guide',
    guideFeatures
  )

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Welcome to ${bundleName}</title>
    </head>
    <body style="font-family: 'Lato', Arial, sans-serif; line-height: 1.5; color: #332D2D; background-color: #FFF9F5; margin: 0; padding: 0;">
      <table cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width: 600px; margin: 0 auto; background-color: #ffffff;">
        <!-- Header -->
        <tr>
          <td style="background-color: #DB1818; padding: 25px 30px 20px; text-align: center;">
            <div style="background-color: #ffffff; padding: 12px 18px; border-radius: 8px; display: inline-block; margin-bottom: 15px;">
              <img src="${LOGOS.immigrantNetworks}" alt="Immigrant Networks" style="max-width: 150px; height: auto; display: block;">
            </div>
            <h1 style="color: #ffffff; font-size: 26px; font-weight: 700; margin: 0 0 6px 0;">Welcome to The A-Game!</h1>
            <p style="color: rgba(255, 255, 255, 0.9); font-size: 15px; font-weight: 300; margin: 0;">Your career transformation starts now</p>
          </td>
        </tr>

        <!-- Main Content -->
        <tr>
          <td style="padding: 25px 30px;">
            <h2 style="font-size: 22px; font-weight: 700; margin: 0 0 12px 0; color: #332D2D;">Hi ${name}!</h2>

            <p style="font-size: 15px; color: #332D2D; margin: 0 0 10px 0; line-height: 1.5;">
              Thank you for your purchase! Your access to all products in the
              <span style="color: #DB1818; font-weight: 700;">${bundleName}</span> is now active.
            </p>

            <div style="background-color: #FFF9F5; padding: 10px 15px; margin: 12px 0; border-radius: 6px; border-left: 4px solid #DB1818; font-size: 14px; line-height: 1.5;">
              <strong style="color: #332D2D;">📅 ${expiryText}</strong>
            </div>

            <div style="background-color: #FFF9F5; padding: 10px 15px; margin: 12px 0; border-radius: 6px; border-left: 4px solid #DB1818; font-size: 14px; line-height: 1.5;">
              <strong style="color: #332D2D;">💡 Quick Tip:</strong> Use the same email
              (<a href="mailto:${customerEmail}" style="color: #DB1818; text-decoration: none; font-weight: 600;">${customerEmail}</a>)
              when signing up for each product to automatically unlock your Pro access.
            </div>

            <!-- Getting Started -->
            <h2 style="font-size: 20px; font-weight: 700; margin: 25px 0 15px 0; color: #332D2D;">Getting Started (4 Easy Steps)</h2>

            ${productSections}

            <!-- Support -->
            <div style="text-align: center; padding: 20px; background-color: #FFF9F5; margin-top: 20px; border-radius: 8px;">
              <h3 style="color: #332D2D; margin: 0 0 8px 0; font-weight: 700; font-size: 17px;">Need help? We're here for you!</h3>
              <p style="color: #666; font-size: 14px; margin: 0;">
                Reply to this email or contact us at
                <a href="mailto:support@immnet.ca" style="color: #DB1818; text-decoration: none; font-weight: 600;">support@immnet.ca</a>
              </p>
            </div>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background-color: #f5f5f5; color: #666; padding: 20px 30px; text-align: center; font-size: 12px;">
            <p style="margin: 5px 0; line-height: 1.5;">You're receiving this email because you purchased the ${bundleName}.</p>
            <p style="margin: 5px 0; line-height: 1.5;">© ${new Date().getFullYear()} Immigrant Networks - All rights reserved.</p>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `
}

async function sendTestEmail() {
  if (!RESEND_API_KEY || RESEND_API_KEY === 're_xxx') {
    console.error('❌ RESEND_API_KEY is not configured in .env file')
    console.log('\nPlease set your Resend API key in .env:')
    console.log('RESEND_API_KEY="re_your_actual_key"')
    process.exit(1)
  }

  console.log('📧 Sending test email to:', TEST_EMAIL)
  console.log('📍 Using APP_URL:', APP_URL)

  const resend = new Resend(RESEND_API_KEY)

  try {
    const { data, error } = await resend.emails.send({
      from: `${EMAIL_FROM_NAME} <${EMAIL_FROM}>`,
      to: TEST_EMAIL,
      subject: "Welcome to A-Game Ultimate Career Bundle! Here's how to get started",
      html: generateTestEmailHtml()
    })

    if (error) {
      console.error('❌ Failed to send email:', error)
      process.exit(1)
    }

    console.log('✅ Test email sent successfully!')
    console.log('📨 Email ID:', data?.id)
  } catch (err) {
    console.error('❌ Error:', err)
    process.exit(1)
  }
}

sendTestEmail()
