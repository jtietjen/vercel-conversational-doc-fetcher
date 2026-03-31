export default function Home() {
  return (
    <main style={styles.main}>
      {/* Hero */}
      <section style={styles.hero}>
        <div style={styles.badge}>Powered by Gemini Vision · Twilio · Vercel</div>
        <h1 style={styles.title}>Conversational Document Fetcher</h1>
        <p style={styles.subtitle}>
          Automatically request, validate, and store missing documents from customers
          via WhatsApp — triggered by a single REST call.
        </p>
        <div style={styles.buttonRow}>
          <a
            href="https://github.com/jtietjen/vercel-conversational-doc-fetcher"
            style={{ ...styles.button, ...styles.buttonPrimary }}
            target="_blank"
            rel="noopener noreferrer"
          >
            View on GitHub
          </a>
          <a href="#api" style={{ ...styles.button, ...styles.buttonSecondary }}>
            API Reference
          </a>
        </div>
      </section>

      {/* Flow */}
      <section style={styles.section}>
        <h2 style={styles.sectionTitle}>How it works</h2>
        <div style={styles.steps}>
          {[
            {
              number: '1',
              title: 'Trigger',
              desc: 'POST to /api/trigger with customer phone, order ID, and a tracking number.',
            },
            {
              number: '2',
              title: 'Outreach',
              desc: 'Gemini generates a personalised WhatsApp message. Twilio delivers it instantly.',
            },
            {
              number: '3',
              title: 'Validate',
              desc: "Customer replies with a photo or PDF. Gemini Vision checks it's a valid packing list.",
            },
            {
              number: '4',
              title: 'Store & Poll',
              desc: 'The validated document lands in Vercel Blob. Fetch /api/status/:id to get the URL.',
            },
          ].map((step) => (
            <div key={step.number} style={styles.step}>
              <div style={styles.stepNumber}>{step.number}</div>
              <h3 style={styles.stepTitle}>{step.title}</h3>
              <p style={styles.stepDesc}>{step.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* API Reference */}
      <section id="api" style={{ ...styles.section, ...styles.sectionDark }}>
        <h2 style={{ ...styles.sectionTitle, color: '#f1f5f9' }}>API Reference</h2>
        <div style={styles.endpoints}>
          {[
            {
              method: 'POST',
              path: '/api/trigger',
              desc: 'Start a conversation. Pass phone, orderId, trackingNumber, customerName, language.',
              color: '#22c55e',
            },
            {
              method: 'GET',
              path: '/api/status/:trackingNumber',
              desc: 'Poll for status (PENDING_DOCUMENT · COMPLETED · FAILED), blobUrl, and full conversation log.',
              color: '#3b82f6',
            },
            {
              method: 'POST',
              path: '/api/webhook',
              desc: 'Twilio webhook — receives incoming WhatsApp messages. Configure in Twilio Console.',
              color: '#f59e0b',
            },
          ].map((ep) => (
            <div key={ep.path} style={styles.endpoint}>
              <span style={{ ...styles.methodBadge, background: ep.color }}>
                {ep.method}
              </span>
              <code style={styles.path}>{ep.path}</code>
              <p style={styles.endpointDesc}>{ep.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section style={styles.section}>
        <h2 style={styles.sectionTitle}>Features</h2>
        <div style={styles.features}>
          {[
            { icon: '💬', title: 'Multilingual', desc: 'Gemini generates messages in any language via BCP-47 code.' },
            { icon: '🔁', title: 'Retry logic', desc: 'Up to 3 attempts with AI-generated feedback on invalid submissions.' },
            { icon: '🔒', title: 'Signature verification', desc: 'All Twilio webhooks verified with HMAC-SHA1.' },
            { icon: '📋', title: 'Conversation log', desc: 'Full message history stored and returned in status response.' },
            { icon: '☁️', title: 'Serverless', desc: 'Runs entirely on Vercel — no infrastructure to manage.' },
            { icon: '🆓', title: 'Free tier friendly', desc: 'Gemini Flash, Twilio sandbox, Upstash Redis, Vercel Blob — all free to start.' },
          ].map((f) => (
            <div key={f.title} style={styles.feature}>
              <span style={styles.featureIcon}>{f.icon}</span>
              <h3 style={styles.featureTitle}>{f.title}</h3>
              <p style={styles.featureDesc}>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer style={styles.footer}>
        <p style={styles.footerText}>
          Conversational Document Fetcher &mdash; MIT License &mdash;{' '}
          <a
            href="https://github.com/jtietjen/vercel-conversational-doc-fetcher"
            style={styles.footerLink}
            target="_blank"
            rel="noopener noreferrer"
          >
            GitHub
          </a>
        </p>
      </footer>
    </main>
  );
}

// ---- Styles ----

const styles: Record<string, React.CSSProperties> = {
  main: {
    minHeight: '100vh',
    background: '#ffffff',
    color: '#0f172a',
  },
  hero: {
    background: 'linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%)',
    color: '#ffffff',
    padding: '80px 24px',
    textAlign: 'center',
  },
  badge: {
    display: 'inline-block',
    background: 'rgba(255,255,255,0.1)',
    border: '1px solid rgba(255,255,255,0.2)',
    borderRadius: '999px',
    padding: '4px 16px',
    fontSize: '13px',
    color: '#94a3b8',
    marginBottom: '24px',
    letterSpacing: '0.02em',
  },
  title: {
    fontSize: 'clamp(2rem, 5vw, 3.5rem)',
    fontWeight: 700,
    margin: '0 0 20px',
    lineHeight: 1.15,
    letterSpacing: '-0.02em',
  },
  subtitle: {
    fontSize: '1.125rem',
    color: '#94a3b8',
    maxWidth: '600px',
    margin: '0 auto 36px',
    lineHeight: 1.7,
  },
  buttonRow: {
    display: 'flex',
    gap: '12px',
    justifyContent: 'center',
    flexWrap: 'wrap',
  },
  button: {
    display: 'inline-block',
    padding: '12px 28px',
    borderRadius: '8px',
    fontWeight: 600,
    fontSize: '0.95rem',
    textDecoration: 'none',
    transition: 'opacity 0.15s',
  },
  buttonPrimary: {
    background: '#3b82f6',
    color: '#ffffff',
  },
  buttonSecondary: {
    background: 'rgba(255,255,255,0.1)',
    color: '#ffffff',
    border: '1px solid rgba(255,255,255,0.2)',
  },
  section: {
    padding: '72px 24px',
    maxWidth: '1100px',
    margin: '0 auto',
  },
  sectionDark: {
    maxWidth: '100%',
    background: '#0f172a',
    padding: '72px 24px',
  },
  sectionTitle: {
    fontSize: '1.875rem',
    fontWeight: 700,
    marginBottom: '48px',
    textAlign: 'center',
    letterSpacing: '-0.02em',
  },
  steps: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    gap: '32px',
  },
  step: {
    textAlign: 'center',
    padding: '32px 24px',
    borderRadius: '12px',
    border: '1px solid #e2e8f0',
    background: '#f8fafc',
  },
  stepNumber: {
    width: '44px',
    height: '44px',
    background: '#3b82f6',
    color: '#fff',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '1.125rem',
    fontWeight: 700,
    margin: '0 auto 16px',
  },
  stepTitle: {
    fontSize: '1.125rem',
    fontWeight: 600,
    margin: '0 0 8px',
  },
  stepDesc: {
    fontSize: '0.9rem',
    color: '#64748b',
    lineHeight: 1.6,
    margin: 0,
  },
  endpoints: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    maxWidth: '800px',
    margin: '0 auto',
  },
  endpoint: {
    background: '#1e293b',
    borderRadius: '10px',
    padding: '20px 24px',
    display: 'flex',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
    gap: '12px',
  },
  methodBadge: {
    padding: '2px 10px',
    borderRadius: '6px',
    fontSize: '0.75rem',
    fontWeight: 700,
    color: '#fff',
    letterSpacing: '0.05em',
    flexShrink: 0,
    marginTop: '2px',
  },
  path: {
    fontFamily: 'monospace',
    fontSize: '0.95rem',
    color: '#e2e8f0',
    fontWeight: 600,
  },
  endpointDesc: {
    width: '100%',
    margin: 0,
    fontSize: '0.875rem',
    color: '#94a3b8',
    lineHeight: 1.6,
  },
  features: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
    gap: '24px',
  },
  feature: {
    padding: '28px',
    borderRadius: '12px',
    border: '1px solid #e2e8f0',
  },
  featureIcon: {
    fontSize: '1.75rem',
    display: 'block',
    marginBottom: '12px',
  },
  featureTitle: {
    fontSize: '1rem',
    fontWeight: 600,
    margin: '0 0 8px',
  },
  featureDesc: {
    fontSize: '0.875rem',
    color: '#64748b',
    lineHeight: 1.6,
    margin: 0,
  },
  footer: {
    borderTop: '1px solid #e2e8f0',
    padding: '32px 24px',
    textAlign: 'center',
  },
  footerText: {
    fontSize: '0.875rem',
    color: '#94a3b8',
    margin: 0,
  },
  footerLink: {
    color: '#3b82f6',
    textDecoration: 'none',
  },
};
