/**
 * Heartbeat (Immigrant Networks community) integration.
 *
 * Coaching bundles (A-Game, Power Pack, National Bank) each have a Heartbeat
 * sign-up link that only admits pre-approved emails. Adding the buyer's email
 * to that link's invitation makes Heartbeat send them its own invite email —
 * replacing the step the client used to do by hand ("Manage Invites").
 * Heartbeat's own workflows then remove members when their coaching period ends.
 *
 * API: POST https://api.heartbeat.chat/v0/invitations/{invitationID}
 *      { emails: string[], shouldSendEmail: boolean }
 */

const HEARTBEAT_API_URL = 'https://api.heartbeat.chat/v0'

export interface HeartbeatInviteResult {
  success: boolean
  status?: number
  error?: string
}

/**
 * Approve an email on a Heartbeat invitation link and send the invite email.
 * Never throws — a Heartbeat outage must not fail the purchase webhook.
 */
export async function inviteToHeartbeat(
  email: string,
  invitationId: string
): Promise<HeartbeatInviteResult> {
  const apiKey = process.env.HEARTBEAT_API_KEY
  if (!apiKey) {
    console.warn('[Heartbeat] HEARTBEAT_API_KEY not configured, skipping invite')
    return { success: false, error: 'HEARTBEAT_API_KEY not configured' }
  }

  try {
    const response = await fetch(`${HEARTBEAT_API_URL}/invitations/${encodeURIComponent(invitationId)}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ emails: [email.toLowerCase()], shouldSendEmail: true }),
      signal: AbortSignal.timeout(10000),
    })

    if (!response.ok) {
      const text = await response.text().catch(() => '')
      console.error(`[Heartbeat] Invite failed for ${email}: HTTP ${response.status} ${text}`)
      return { success: false, status: response.status, error: text || `HTTP ${response.status}` }
    }

    console.log(`[Heartbeat] Invited ${email} via invitation ${invitationId}`)
    return { success: true, status: response.status }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error(`[Heartbeat] Error inviting ${email}:`, message)
    return { success: false, error: message }
  }
}
