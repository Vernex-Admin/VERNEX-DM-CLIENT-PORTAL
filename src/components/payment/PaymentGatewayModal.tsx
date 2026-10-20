import { useState } from 'react'
import { CheckCircle2, CreditCard, Lock, QrCode, Smartphone, X } from 'lucide-react'
import { Icon } from '../Icon'
import { Button, Field, Input } from '../ui'

export type PaymentSuccessData = {
  transactionId: string
  paidAt: string
  method: string
  amount: number
}

export function PaymentGatewayModal({
  open,
  onClose,
  invoiceNumber,
  clientName,
  amount,
  currency = '₹',
  onSuccess,
}: {
  open: boolean
  onClose: () => void
  invoiceNumber: string
  clientName: string
  amount: number
  currency?: string
  onSuccess: (data: PaymentSuccessData) => void
}) {
  const [method, setMethod] = useState<'upi' | 'card' | 'netbanking'>('upi')
  const [upiId, setUpiId] = useState('vernex@okhdfcbank')
  const [cardNumber, setCardNumber] = useState('4532 •••• •••• 8821')
  const [expiry, setExpiry] = useState('12/28')
  const [cvv, setCvv] = useState('883')
  const [cardHolder, setCardHolder] = useState(clientName || 'Card Holder')
  const [processing, setProcessing] = useState(false)
  const [completed, setCompleted] = useState<PaymentSuccessData | null>(null)

  if (!open) return null

  async function handlePay() {
    setProcessing(true)
    // Simulate real gateway processing
    await new Promise((r) => setTimeout(r, 1200))
    const successData: PaymentSuccessData = {
      transactionId: `TXN_${Date.now().toString(36).toUpperCase()}_${Math.floor(1000 + Math.random() * 9000)}`,
      paidAt: new Date().toISOString(),
      method: method.toUpperCase(),
      amount,
    }
    setProcessing(false)
    setCompleted(successData)
    onSuccess(successData)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-rule bg-surface shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-rule bg-paper px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-signal/15 text-signal">
              <Icon icon={Lock} size={16} />
            </div>
            <div>
              <div className="text-sm font-semibold text-ink">Vernex Secure Checkout</div>
              <div className="text-xs text-ink-muted">256-bit Encrypted Payment</div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-card p-1 text-ink-muted hover:bg-ink/5 hover:text-ink"
            aria-label="Close checkout"
          >
            <Icon icon={X} size={18} />
          </button>
        </div>

        {completed ? (
          <div className="flex flex-col items-center gap-4 p-6 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-good/15 text-good">
              <Icon icon={CheckCircle2} size={36} />
            </div>
            <div className="flex flex-col gap-1">
              <h3 className="text-lg font-bold text-ink">Payment Successful!</h3>
              <p className="text-xs text-ink-muted">
                Transaction ID: <span className="font-mono font-medium text-ink">{completed.transactionId}</span>
              </p>
            </div>

            <div className="w-full rounded-card border border-rule bg-paper p-3 text-left text-xs">
              <div className="flex justify-between py-1 border-b border-rule/50">
                <span className="text-ink-muted">Invoice</span>
                <span className="font-mono font-medium text-ink">{invoiceNumber}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-rule/50">
                <span className="text-ink-muted">Billed To</span>
                <span className="font-medium text-ink">{clientName}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-rule/50">
                <span className="text-ink-muted">Payment Method</span>
                <span className="font-medium text-ink">{completed.method}</span>
              </div>
              <div className="flex justify-between py-1 font-semibold text-ink text-sm">
                <span>Total Amount Paid</span>
                <span>{currency} {completed.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
              </div>
            </div>

            <Button variant="primary" onClick={onClose} className="w-full justify-center">
              Continue to Portal
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-4 p-5">
            {/* Amount Summary */}
            <div className="flex items-center justify-between rounded-xl bg-paper p-3.5 border border-rule">
              <div>
                <div className="text-xs text-ink-muted">Invoice #{invoiceNumber}</div>
                <div className="text-xs font-medium text-ink">{clientName}</div>
              </div>
              <div className="text-right">
                <div className="text-xs text-ink-muted">Total Payable</div>
                <div className="text-lg font-bold text-ink">
                  {currency} {amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </div>
              </div>
            </div>

            {/* Payment Method Switcher */}
            <div className="flex rounded-lg border border-rule bg-paper/60 p-1">
              <button
                type="button"
                onClick={() => setMethod('upi')}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-medium transition-colors ${
                  method === 'upi' ? 'bg-surface font-semibold text-ink shadow-xs' : 'text-ink-muted hover:text-ink'
                }`}
              >
                <Icon icon={Smartphone} size={14} />
                UPI / QR
              </button>
              <button
                type="button"
                onClick={() => setMethod('card')}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-medium transition-colors ${
                  method === 'card' ? 'bg-surface font-semibold text-ink shadow-xs' : 'text-ink-muted hover:text-ink'
                }`}
              >
                <Icon icon={CreditCard} size={14} />
                Cards
              </button>
              <button
                type="button"
                onClick={() => setMethod('netbanking')}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-medium transition-colors ${
                  method === 'netbanking' ? 'bg-surface font-semibold text-ink shadow-xs' : 'text-ink-muted hover:text-ink'
                }`}
              >
                Net Banking
              </button>
            </div>

            {/* Method Details */}
            {method === 'upi' && (
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-3 rounded-lg border border-rule bg-paper p-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-surface border border-rule">
                    <Icon icon={QrCode} size={28} className="text-ink" />
                  </div>
                  <div className="flex flex-col text-xs">
                    <span className="font-semibold text-ink">Scan QR with any UPI App</span>
                    <span className="text-ink-muted">Google Pay, PhonePe, Paytm, BHIM</span>
                  </div>
                </div>

                <Field label="Or Enter UPI ID / VPA">
                  <Input
                    value={upiId}
                    onChange={(e) => setUpiId(e.target.value)}
                    placeholder="username@bank"
                  />
                </Field>
              </div>
            )}

            {method === 'card' && (
              <div className="flex flex-col gap-3 text-xs">
                <Field label="Card Number">
                  <Input
                    value={cardNumber}
                    onChange={(e) => setCardNumber(e.target.value)}
                    placeholder="4000 0000 0000 0000"
                  />
                </Field>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Expiry (MM/YY)">
                    <Input
                      value={expiry}
                      onChange={(e) => setExpiry(e.target.value)}
                      placeholder="12/28"
                    />
                  </Field>
                  <Field label="CVV">
                    <Input
                      type="password"
                      maxLength={4}
                      value={cvv}
                      onChange={(e) => setCvv(e.target.value)}
                      placeholder="•••"
                    />
                  </Field>
                </div>
                <Field label="Cardholder Name">
                  <Input
                    value={cardHolder}
                    onChange={(e) => setCardHolder(e.target.value)}
                    placeholder="Name on card"
                  />
                </Field>
              </div>
            )}

            {method === 'netbanking' && (
              <div className="flex flex-col gap-2 text-xs">
                <span className="text-ink-muted">Popular Banks:</span>
                <div className="grid grid-cols-2 gap-2">
                  {['HDFC Bank', 'ICICI Bank', 'State Bank of India', 'Axis Bank'].map((bank) => (
                    <button
                      key={bank}
                      type="button"
                      className="rounded-card border border-rule bg-paper p-2.5 text-center font-medium hover:border-signal"
                    >
                      {bank}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Pay Button */}
            <Button
              variant="primary"
              loading={processing}
              onClick={handlePay}
              className="mt-2 w-full justify-center text-sm py-2.5"
            >
              Pay {currency} {amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </Button>

            <p className="text-center text-[11px] text-ink-muted">
              Vernex Digital Marketing Gateway · Sandbox Ready · Instant Activation
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
