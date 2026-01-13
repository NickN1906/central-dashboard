export default function CheckoutCancelledPage() {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      backgroundColor: '#f8fafc',
      padding: '20px'
    }}>
      <div style={{
        backgroundColor: 'white',
        borderRadius: '16px',
        padding: '48px',
        maxWidth: '500px',
        textAlign: 'center',
        boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'
      }}>
        <div style={{
          width: '80px',
          height: '80px',
          borderRadius: '50%',
          backgroundColor: '#fef3c7',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 24px',
          fontSize: '40px'
        }}>
          ⚠
        </div>

        <h1 style={{
          fontSize: '28px',
          fontWeight: 700,
          color: '#1f2937',
          marginBottom: '16px'
        }}>
          Payment Cancelled
        </h1>

        <p style={{
          fontSize: '16px',
          color: '#6b7280',
          marginBottom: '32px',
          lineHeight: 1.6
        }}>
          Your payment was cancelled. No charges were made.
          If you have any questions, please contact our support team.
        </p>

        <a
          href="https://123jobs.ca"
          style={{
            display: 'inline-block',
            padding: '14px 28px',
            backgroundColor: '#2563eb',
            color: 'white',
            textDecoration: 'none',
            borderRadius: '8px',
            fontWeight: 600,
            fontSize: '15px'
          }}
        >
          Return to 123Jobs
        </a>
      </div>
    </div>
  )
}
