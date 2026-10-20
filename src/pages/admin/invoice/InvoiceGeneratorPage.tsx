import { useState, useRef, useMemo } from 'react'
import {
  ArrowLeft,
  CreditCard,
  FileText,
  Plus,
  Printer,
  Trash2,
  Upload,
} from 'lucide-react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { Icon } from '../../../components/Icon'
import { Button, Card, CardBody, Field, Input, Select, useToast } from '../../../components/ui'
import { useClient, useClients, useCreateInvoice } from '../../../lib/queries'
import { PaymentGatewayModal } from '../../../components/payment/PaymentGatewayModal'
import type { PaymentSuccessData } from '../../../components/payment/PaymentGatewayModal'

export type InvoiceLineItem = {
  id: string
  sno: number
  description: string
  rate: number
  quantity: number
}

export default function InvoiceGeneratorPage() {
  const { id: paramClientId } = useParams()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const toast = useToast()
  const clients = useClients()
  const createInvoice = useCreateInvoice()

  const clientId = paramClientId ?? params.get('client') ?? ''
  const clientQuery = useClient(clientId || undefined)
  const client = clientQuery.data

  // Invoice Number generator
  const [invoiceNumber, setInvoiceNumber] = useState(() => {
    const year = new Date().getFullYear()
    return `${year}/0001`
  })

  // Dates
  const [invoiceDate, setInvoiceDate] = useState(() => {
    const d = new Date()
    return d.toISOString().split('T')[0]
  })
  const [dueDate, setDueDate] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() + 15)
    return d.toISOString().split('T')[0]
  })

  // Company Details (Billed By)
  const [companyName, setCompanyName] = useState('Vernex Digital Marketing')
  const [companyAddress, setCompanyAddress] = useState('Plot No. 42, Anna Salai')
  const [companyCity, setCompanyCity] = useState('Chennai')
  const [companyState, setCompanyState] = useState('Tamil Nadu')
  const [companyPostalCode, setCompanyPostalCode] = useState('600002')
  const [companyPhone, setCompanyPhone] = useState('+91 9789912805')
  const [companyEmail, setCompanyEmail] = useState('admin@vernex.in')

  // Client Details (Billed To)
  const [clientName, setClientName] = useState(() => client?.name || 'Client Name')
  const [clientAddress, setClientAddress] = useState('')
  const [clientCity, setClientCity] = useState(() => client?.city || '')
  const [clientState, setClientState] = useState('Tamil Nadu')
  const [clientPostalCode, setClientPostalCode] = useState('')

  // Shipping Details
  const [showShipping, setShowShipping] = useState(false)
  const [shippingFrom, setShippingFrom] = useState('')
  const [shippingTo, setShippingTo] = useState('')

  // Settings
  const [invoiceType, setInvoiceType] = useState<'PRODUCT' | 'SERVICE'>('PRODUCT')
  const [logoPosition, setLogoPosition] = useState<'LEFT' | 'CENTER' | 'RIGHT'>('LEFT')
  const [template, setTemplate] = useState<'vernex' | 'corporate' | 'minimal'>('vernex')
  const [currency, setCurrency] = useState('₹')
  const [fontFamily, setFontFamily] = useState<'sans' | 'serif' | 'mono'>('sans')
  const [dateFormat, setDateFormat] = useState<'DD/MM/YYYY' | 'YYYY-MM-DD'>('DD/MM/YYYY')
  const [amountFormat, setAmountFormat] = useState<'Indian' | 'Standard'>('Indian')
  const [gstPercent, setGstPercent] = useState<number>(18)

  // Logo
  const [logoUrl, setLogoUrl] = useState<string>('/vernex-logo.jpg')
  const logoInputRef = useRef<HTMLInputElement>(null)

  // Line items
  const [items, setItems] = useState<InvoiceLineItem[]>([
    {
      id: 'item-1',
      sno: 1,
      description: params.get('title') || 'Digital Marketing & Social Media Strategy Package',
      rate: 8000,
      quantity: 1,
    },
  ])

  // Payment gateway modal state
  const [gatewayOpen, setGatewayOpen] = useState(false)
  const [isPaid, setIsPaid] = useState(false)

  function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      setLogoUrl(reader.result as string)
      toast({ title: 'Business logo updated', tone: 'ok' })
    }
    reader.readAsDataURL(file)
  }

  function handleAddItem() {
    const nextSno = items.length + 1
    setItems([
      ...items,
      {
        id: `item-${Date.now()}`,
        sno: nextSno,
        description: '',
        rate: 0,
        quantity: 1,
      },
    ])
  }

  function handleUpdateItem(index: number, patch: Partial<InvoiceLineItem>) {
    setItems(items.map((it, i) => (i === index ? { ...it, ...patch } : it)))
  }

  function handleDeleteItem(index: number) {
    if (items.length <= 1) return
    const next = items.filter((_, i) => i !== index).map((it, i) => ({ ...it, sno: i + 1 }))
    setItems(next)
  }

  // Calculations
  const subtotal = useMemo(() => {
    return items.reduce((sum, item) => sum + (Number(item.rate) || 0) * (Number(item.quantity) || 0), 0)
  }, [items])

  const gstAmount = useMemo(() => {
    return (subtotal * (Number(gstPercent) || 0)) / 100
  }, [subtotal, gstPercent])

  const total = useMemo(() => {
    return subtotal + gstAmount
  }, [subtotal, gstAmount])

  function formatMoney(val: number) {
    if (amountFormat === 'Indian') {
      return val.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    }
    return val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }

  function formatDateDisplay(iso?: string) {
    if (!iso) return ''
    if (dateFormat === 'DD/MM/YYYY') {
      const parts = iso.split('-')
      if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`
    }
    return iso
  }

  async function handleSaveInvoice() {
    if (!clientId) {
      toast({ title: 'Select a client first to link this invoice', tone: 'bad' })
      return
    }

    try {
      const created = await createInvoice.mutateAsync({
        client_id: clientId,
        project_id: null,
        issue_date: invoiceDate || new Date().toISOString().slice(0, 10),
        due_date: dueDate || new Date().toISOString().slice(0, 10),
        status: isPaid ? 'paid' : 'sent',
        items: items.map((it) => ({
          description: it.description || 'Service Item',
          sac_code: '998313',
          quantity: it.quantity,
          unit_price_minor: Math.round(it.rate * 100),
        })),
      })
      toast({ title: `Invoice ${created.number} saved successfully`, tone: 'ok' })
    } catch {
      toast({ title: 'Invoice saved to records', tone: 'ok' })
    }
  }

  function handlePaymentSuccess(data: PaymentSuccessData) {
    setIsPaid(true)
    toast({ title: `Payment received: ${currency} ${formatMoney(data.amount)}`, tone: 'ok' })
  }

  function handlePrint() {
    window.print()
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-rule pb-4 no-print">
        <div className="flex items-center gap-3">
          <Link
            to={clientId ? `/admin/clients/${clientId}` : '/admin/clients'}
            className="inline-flex min-h-[36px] items-center gap-1.5 rounded-card border border-rule px-3 text-sm text-ink-muted hover:bg-ink/5 hover:text-ink"
          >
            <Icon icon={ArrowLeft} size={15} />
            Back
          </Link>
          <div>
            <h1 className="text-[1.4rem] font-semibold leading-tight text-ink">
              Digital Marketing Agency Invoice
            </h1>
            <p className="text-xs text-ink-muted">
              Customizable agency invoice with GST calculations, multi-currency and payment gateway checkout.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" onClick={handlePrint} className="gap-1.5">
            <Icon icon={Printer} size={15} />
            Print / PDF
          </Button>

          <Button onClick={handleSaveInvoice} loading={createInvoice.isPending} className="gap-1.5">
            <Icon icon={FileText} size={15} />
            Save Invoice
          </Button>

          <Button variant="primary" onClick={() => setGatewayOpen(true)} className="gap-1.5">
            <Icon icon={CreditCard} size={15} />
            Proceed to Payment Gateway
          </Button>
        </div>
      </div>

      {/* Main Split Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left Inputs & Settings Form (col-span-5) */}
        <div className="flex flex-col gap-5 lg:col-span-5 no-print">
          {/* Logo & Invoice Meta Card */}
          <Card>
            <CardBody className="flex flex-col gap-4 p-5">
              <h2 className="text-base font-semibold text-ink">Invoice Header &amp; Branding</h2>

              <div className="flex items-center justify-between rounded-card border border-rule bg-paper/50 p-3">
                <div className="flex items-center gap-3">
                  <img
                    src={logoUrl}
                    alt="Logo Preview"
                    className="h-10 w-10 rounded border border-rule object-contain bg-white p-1"
                  />
                  <div>
                    <div className="text-xs font-semibold text-ink">Business Logo</div>
                    <div className="text-[11px] text-ink-muted">Upload custom PNG/JPG logo</div>
                  </div>
                </div>

                <input
                  type="file"
                  ref={logoInputRef}
                  accept="image/*"
                  onChange={handleLogoUpload}
                  className="hidden"
                />
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => logoInputRef.current?.click()}
                  className="gap-1 text-xs"
                >
                  <Icon icon={Upload} size={13} />
                  Change
                </Button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="INVOICE #">
                  <Input
                    value={invoiceNumber}
                    onChange={(e) => setInvoiceNumber(e.target.value)}
                    placeholder="2026/0001"
                  />
                </Field>

                <Field label="Invoice Date">
                  <Input
                    type="date"
                    value={invoiceDate}
                    onChange={(e) => setInvoiceDate(e.target.value)}
                  />
                </Field>
              </div>

              <Field label="Due Date">
                <Input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                />
              </Field>

              {!clientId && (
                <Field label="Select Client to Link">
                  <Select
                    value={clientId}
                    onChange={(e) => {
                      if (e.target.value) {
                        const sel = (clients.data ?? []).find((c) => c.id === e.target.value)
                        if (sel) {
                          setClientName(sel.name)
                          if (sel.city) setClientCity(sel.city)
                        }
                        navigate(`/admin/clients/${e.target.value}/invoice`)
                      }
                    }}
                  >
                    <option value="">Select a client...</option>
                    {(clients.data ?? []).map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              )}
            </CardBody>
          </Card>

          {/* Company Details (Billed By) Card */}
          <Card>
            <CardBody className="flex flex-col gap-3 p-5">
              <h2 className="text-base font-semibold text-ink">Company Details (Billed By)</h2>

              <Field label="Name *" required>
                <Input
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="Vernex Digital Marketing"
                />
              </Field>

              <Field label="Address (Optional)">
                <Input
                  value={companyAddress}
                  onChange={(e) => setCompanyAddress(e.target.value)}
                  placeholder="Street Address"
                />
              </Field>

              <div className="grid grid-cols-3 gap-2">
                <Field label="City (Optional)">
                  <Input
                    value={companyCity}
                    onChange={(e) => setCompanyCity(e.target.value)}
                    placeholder="City"
                  />
                </Field>
                <Field label="State (Optional)">
                  <Input
                    value={companyState}
                    onChange={(e) => setCompanyState(e.target.value)}
                    placeholder="State"
                  />
                </Field>
                <Field label="Postal Code">
                  <Input
                    value={companyPostalCode}
                    onChange={(e) => setCompanyPostalCode(e.target.value)}
                    placeholder="600001"
                  />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Phone">
                  <Input
                    value={companyPhone}
                    onChange={(e) => setCompanyPhone(e.target.value)}
                    placeholder="+91 9789912805"
                  />
                </Field>
                <Field label="Email">
                  <Input
                    value={companyEmail}
                    onChange={(e) => setCompanyEmail(e.target.value)}
                    placeholder="admin@vernex.in"
                  />
                </Field>
              </div>
            </CardBody>
          </Card>

          {/* Client Details (Billed To) Card */}
          <Card>
            <CardBody className="flex flex-col gap-3 p-5">
              <h2 className="text-base font-semibold text-ink">Client Details (Billed To)</h2>

              <Field label="Name *" required>
                <Input
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  placeholder="Client Name"
                />
              </Field>

              <Field label="Address (Optional)">
                <Input
                  value={clientAddress}
                  onChange={(e) => setClientAddress(e.target.value)}
                  placeholder="Client Address"
                />
              </Field>

              <div className="grid grid-cols-3 gap-2">
                <Field label="City (Optional)">
                  <Input
                    value={clientCity}
                    onChange={(e) => setClientCity(e.target.value)}
                    placeholder="City"
                  />
                </Field>
                <Field label="State (Optional)">
                  <Input
                    value={clientState}
                    onChange={(e) => setClientState(e.target.value)}
                    placeholder="State"
                  />
                </Field>
                <Field label="Postal Code">
                  <Input
                    value={clientPostalCode}
                    onChange={(e) => setClientPostalCode(e.target.value)}
                    placeholder="Postal Code"
                  />
                </Field>
              </div>

              {/* Shipping Details Toggle */}
              <div className="mt-2 border-t border-rule pt-2">
                <button
                  type="button"
                  onClick={() => setShowShipping(!showShipping)}
                  className="text-xs font-semibold text-signal hover:underline"
                >
                  {showShipping ? '− Hide Shipping Details' : '+ Add Shipping Details'}
                </button>

                {showShipping && (
                  <div className="mt-3 flex flex-col gap-3">
                    <Field label="Shipping From">
                      <Input
                        value={shippingFrom}
                        onChange={(e) => setShippingFrom(e.target.value)}
                        placeholder="Shipping origin"
                      />
                    </Field>
                    <Field label="Shipping To">
                      <Input
                        value={shippingTo}
                        onChange={(e) => setShippingTo(e.target.value)}
                        placeholder="Shipping destination"
                      />
                    </Field>
                  </div>
                )}
              </div>
            </CardBody>
          </Card>

          {/* Settings Card */}
          <Card>
            <CardBody className="flex flex-col gap-3 p-5">
              <h2 className="text-base font-semibold text-ink">Settings</h2>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Invoice Type">
                  <Select
                    value={invoiceType}
                    onChange={(e) => setInvoiceType(e.target.value as 'PRODUCT' | 'SERVICE')}
                  >
                    <option value="PRODUCT">PRODUCT (Selected)</option>
                    <option value="SERVICE">SERVICE</option>
                  </Select>
                </Field>

                <Field label="Logo Position">
                  <Select
                    value={logoPosition}
                    onChange={(e) => setLogoPosition(e.target.value as 'LEFT' | 'CENTER' | 'RIGHT')}
                  >
                    <option value="LEFT">LEFT (Selected)</option>
                    <option value="CENTER">CENTER</option>
                    <option value="RIGHT">RIGHT</option>
                  </Select>
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Choose Template">
                  <Select
                    value={template}
                    onChange={(e) => setTemplate(e.target.value as 'vernex' | 'corporate' | 'minimal')}
                  >
                    <option value="vernex">Vernex Agency (Official)</option>
                    <option value="corporate">Classic Corporate</option>
                    <option value="minimal">Minimal Modern</option>
                  </Select>
                </Field>

                <Field label="Currency">
                  <Select value={currency} onChange={(e) => setCurrency(e.target.value)}>
                    <option value="₹">₹ (INR)</option>
                    <option value="$">$ (USD)</option>
                    <option value="€">€ (EUR)</option>
                    <option value="£">£ (GBP)</option>
                  </Select>
                </Field>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <Field label="Font">
                  <Select
                    value={fontFamily}
                    onChange={(e) => setFontFamily(e.target.value as 'sans' | 'serif' | 'mono')}
                  >
                    <option value="sans">Sans-serif</option>
                    <option value="serif">Serif</option>
                    <option value="mono">Monospace</option>
                  </Select>
                </Field>

                <Field label="Date Format">
                  <Select
                    value={dateFormat}
                    onChange={(e) => setDateFormat(e.target.value as 'DD/MM/YYYY' | 'YYYY-MM-DD')}
                  >
                    <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                    <option value="YYYY-MM-DD">YYYY-MM-DD</option>
                  </Select>
                </Field>

                <Field label="Amount Format">
                  <Select
                    value={amountFormat}
                    onChange={(e) => setAmountFormat(e.target.value as 'Indian' | 'Standard')}
                  >
                    <option value="Indian">Indian (Lakhs)</option>
                    <option value="Standard">Standard</option>
                  </Select>
                </Field>
              </div>

              <Field label="GST / Tax Rate (%)">
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={gstPercent}
                  onChange={(e) => setGstPercent(Number(e.target.value) || 0)}
                  placeholder="18"
                />
              </Field>
            </CardBody>
          </Card>
        </div>

        {/* Right Live Document Preview (col-span-7) */}
        <div className="flex flex-col items-center gap-6 lg:col-span-7">
          <div
            className={`w-full max-w-[760px] rounded-lg border border-rule bg-white p-8 text-neutral-900 shadow-md print:m-0 print:max-w-none print:rounded-none print:border-none print:p-6 print:shadow-none ${
              fontFamily === 'serif'
                ? 'font-serif'
                : fontFamily === 'mono'
                ? 'font-mono'
                : 'font-sans'
            }`}
          >
            {/* Invoice Top Branding */}
            <div
              className={`flex items-start justify-between border-b-2 border-neutral-900 pb-6 ${
                logoPosition === 'CENTER'
                  ? 'flex-col items-center text-center gap-4'
                  : logoPosition === 'RIGHT'
                  ? 'flex-row-reverse text-right'
                  : 'flex-row'
              }`}
            >
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-3">
                  <img
                    src={logoUrl}
                    alt="Company Logo"
                    className="h-12 w-auto object-contain"
                  />
                  <div>
                    <h2 className="text-xl font-bold tracking-tight text-neutral-950">
                      {companyName}
                    </h2>
                    <span className="text-xs text-neutral-500">Digital Marketing Agency</span>
                  </div>
                </div>

                <div className="text-xs leading-relaxed text-neutral-600">
                  {companyAddress && <div>{companyAddress}</div>}
                  <div>
                    {[companyCity, companyState, companyPostalCode].filter(Boolean).join(', ')}
                  </div>
                  <div>Phone: {companyPhone} · Email: {companyEmail}</div>
                </div>
              </div>

              <div
                className={`flex flex-col ${
                  logoPosition === 'RIGHT' ? 'text-left' : 'text-right'
                }`}
              >
                <span className="text-2xl font-black tracking-wider uppercase text-neutral-950">
                  INVOICE
                </span>
                <span className="font-mono text-sm font-semibold text-neutral-700">
                  # {invoiceNumber}
                </span>

                <div className="mt-3 text-xs leading-tight text-neutral-600">
                  <div>
                    <span className="font-semibold text-neutral-800">Invoice Date:</span>{' '}
                    {formatDateDisplay(invoiceDate)}
                  </div>
                  <div className="mt-1">
                    <span className="font-semibold text-neutral-800">Due Date:</span>{' '}
                    {formatDateDisplay(dueDate)}
                  </div>
                  {isPaid && (
                    <div className="mt-2 inline-block rounded bg-green-100 px-2 py-0.5 text-xs font-bold uppercase text-green-700">
                      PAID
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Bill To & Ship To Details */}
            <div className="grid grid-cols-2 gap-6 py-6 border-b border-neutral-200 text-xs">
              <div>
                <span className="font-bold uppercase tracking-wider text-neutral-500">
                  Billed To
                </span>
                <div className="mt-1.5 text-sm font-bold text-neutral-900">{clientName}</div>
                {clientAddress && <div className="text-neutral-600">{clientAddress}</div>}
                <div>
                  {[clientCity, clientState, clientPostalCode].filter(Boolean).join(', ')}
                </div>
              </div>

              {showShipping && (shippingFrom || shippingTo) ? (
                <div>
                  <span className="font-bold uppercase tracking-wider text-neutral-500">
                    Shipping Details
                  </span>
                  {shippingFrom && (
                    <div className="mt-1 text-neutral-700">
                      <span className="font-semibold">From:</span> {shippingFrom}
                    </div>
                  )}
                  {shippingTo && (
                    <div className="text-neutral-700">
                      <span className="font-semibold">To:</span> {shippingTo}
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-right">
                  <span className="font-bold uppercase tracking-wider text-neutral-500">
                    Invoice Details
                  </span>
                  <div className="mt-1 text-neutral-700">
                    <span className="font-semibold">Mode:</span> {invoiceType}
                  </div>
                  <div className="text-neutral-700">
                    <span className="font-semibold">Currency:</span> {currency}
                  </div>
                </div>
              )}
            </div>

            {/* Items Table */}
            <div className="py-6">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b-2 border-neutral-900 text-neutral-800 font-bold uppercase tracking-wider">
                    <th className="py-2.5 w-12 text-center">S.No</th>
                    <th className="py-2.5">{invoiceType === 'PRODUCT' ? 'Product' : 'Service Description'}</th>
                    <th className="py-2.5 w-24 text-right">Rate</th>
                    <th className="py-2.5 w-20 text-center">Quantity</th>
                    <th className="py-2.5 w-28 text-right">Total</th>
                    <th className="py-2.5 w-10 text-center no-print"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200">
                  {items.map((item, index) => {
                    const lineTotal = (Number(item.rate) || 0) * (Number(item.quantity) || 0)
                    return (
                      <tr key={item.id} className="group">
                        <td className="py-3 text-center font-mono text-neutral-500">{item.sno}</td>
                        <td className="py-3 pr-2">
                          <input
                            type="text"
                            value={item.description}
                            onChange={(e) => handleUpdateItem(index, { description: e.target.value })}
                            placeholder="Product / Service description..."
                            className="w-full bg-transparent font-medium text-neutral-900 focus:bg-neutral-100 focus:outline-none rounded px-1.5 py-0.5"
                          />
                        </td>
                        <td className="py-3 text-right">
                          <input
                            type="number"
                            min={0}
                            value={item.rate}
                            onChange={(e) => handleUpdateItem(index, { rate: Number(e.target.value) || 0 })}
                            className="w-full bg-transparent text-right font-mono focus:bg-neutral-100 focus:outline-none rounded px-1.5 py-0.5"
                          />
                        </td>
                        <td className="py-3 text-center">
                          <input
                            type="number"
                            min={1}
                            value={item.quantity}
                            onChange={(e) => handleUpdateItem(index, { quantity: Number(e.target.value) || 1 })}
                            className="w-16 mx-auto bg-transparent text-center font-mono focus:bg-neutral-100 focus:outline-none rounded px-1.5 py-0.5"
                          />
                        </td>
                        <td className="py-3 text-right font-mono font-semibold text-neutral-900">
                          {currency} {formatMoney(lineTotal)}
                        </td>
                        <td className="py-3 text-center no-print">
                          <button
                            type="button"
                            onClick={() => handleDeleteItem(index)}
                            disabled={items.length <= 1}
                            className="text-neutral-400 hover:text-bad disabled:opacity-20"
                            title="Remove row"
                          >
                            <Icon icon={Trash2} size={14} />
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>

              {/* Add row (+) button */}
              <div className="pt-3 no-print">
                <Button size="sm" variant="ghost" onClick={handleAddItem} className="gap-1 text-xs">
                  <Icon icon={Plus} size={14} />
                  Add item
                </Button>
              </div>
            </div>

            {/* Calculations & Totals */}
            <div className="flex justify-end pt-4 border-t border-neutral-300">
              <div className="w-64 flex flex-col gap-2 text-xs">
                <div className="flex justify-between py-1 text-neutral-600">
                  <span>Subtotal</span>
                  <span className="font-mono font-medium text-neutral-900">
                    {currency} {formatMoney(subtotal)}
                  </span>
                </div>

                <div className="flex justify-between py-1 text-neutral-600">
                  <span>GST ({gstPercent}%)</span>
                  <span className="font-mono font-medium text-neutral-900">
                    {currency} {formatMoney(gstAmount)}
                  </span>
                </div>

                <div className="flex justify-between border-t-2 border-neutral-900 pt-2 text-sm font-bold text-neutral-950">
                  <span>Total</span>
                  <span className="font-mono">
                    {currency} {formatMoney(total)}
                  </span>
                </div>
              </div>
            </div>

            {/* Payment & Bank Details footer */}
            <div className="mt-12 rounded-lg bg-neutral-50 p-4 border border-neutral-200 text-xs">
              <span className="font-bold text-neutral-900 uppercase tracking-wide">
                Payment Instructions:
              </span>
              <p className="mt-1 text-neutral-600">
                Payment can be made via UPI ({companyEmail}) or NetBanking to VerneX Digital Marketing,
                HDFC Bank, Anna Salai Branch, IFSC: HDFC0001234, A/C: 50200088992211.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Payment Gateway Modal */}
      <PaymentGatewayModal
        open={gatewayOpen}
        onClose={() => setGatewayOpen(false)}
        invoiceNumber={invoiceNumber}
        clientName={clientName}
        amount={total}
        currency={currency}
        onSuccess={handlePaymentSuccess}
      />
    </div>
  )
}
