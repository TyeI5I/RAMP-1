import React, { useState, useEffect } from 'react';
import { useRamp } from '../../context/RampContext';
import {
  SubscriptionTier,
  BillingCadence,
  JobCategory,
  JOB_CATEGORIES,
  InvoiceRecord,
  TIER_DIFFERENTIATORS,
} from '../../types/ramp';
import {
  X,
  Check,
  CreditCard,
  Shield,
  Zap,
  Bell,
  CheckCircle,
  Building,
  Lock,
  ArrowRight,
  Download,
  Mail,
  AlertCircle,
  HelpCircle,
  ExternalLink,
  ChevronRight,
  RefreshCw,
  Landmark,
  FileText,
} from 'lucide-react';

interface StripeSubscriptionModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultTier?: SubscriptionTier;
}

export const StripeSubscriptionModal: React.FC<StripeSubscriptionModalProps> = ({
  isOpen,
  onClose,
  defaultTier,
}) => {
  const { currentEmployer, upgradeSubscription, setSelectedEmailModal, emailLogs } = useRamp();

  // Workflow Step: 1 = Plan Selection, 2 = Billing Details, 3 = Payment Processing, 4 = Confirmation/Receipt
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

  // Plan configuration
  const [selectedTier, setSelectedTier] = useState<SubscriptionTier>(
    defaultTier ||
      (currentEmployer?.subscriptionTier && currentEmployer.subscriptionTier !== 'none'
        ? currentEmployer.subscriptionTier
        : 'tier2')
  );
  const [cadence, setCadence] = useState<BillingCadence>(
    currentEmployer?.subscriptionCadence || 'annual'
  );
  const [recruiterSeats, setRecruiterSeats] = useState<number>(1);
  const [alertCategories, setAlertCategories] = useState<JobCategory[]>(
    currentEmployer?.instantAlertCategories || ['Full-Stack Software Engineer', 'Data Scientist & ML Engineer']
  );

  // Billing Details
  const [companyName, setCompanyName] = useState(currentEmployer?.companyName || 'Apex Innovations');
  const [taxId, setTaxId] = useState(currentEmployer?.taxId || 'EIN: 84-3991204');
  const [billingEmail, setBillingEmail] = useState(currentEmployer?.email || 'billing@apexinnovations.tech');
  const [billingAddress, setBillingAddress] = useState('100 Montgomery St, Suite 1400');
  const [city, setCity] = useState('San Francisco');
  const [postalCode, setPostalCode] = useState('94104');
  const [country, setCountry] = useState('United States');

  // Payment method state
  const [paymentMethodType, setPaymentMethodType] = useState<'card' | 'ach' | 'link'>('card');
  const [cardNumber, setCardNumber] = useState('4242 4242 4242 4242');
  const [cardExpiry, setCardExpiry] = useState('12/28');
  const [cardCvc, setCardCvc] = useState('381');
  const [cardholderName, setCardholderName] = useState(currentEmployer?.recruiterName || 'Sarah Jenkins');
  const [bankRouting, setBankRouting] = useState('111000025');
  const [bankAccount, setBankAccount] = useState('000123456789');

  // Stripe processing simulation state
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStage, setProcessingStage] = useState<string>('');
  const [processingProgress, setProcessingProgress] = useState<number>(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // 3D Secure modal simulation
  const [is3DSModalOpen, setIs3DSModalOpen] = useState(false);
  const [otpCode, setOtpCode] = useState('');

  // Generated receipt invoice record
  const [generatedInvoice, setGeneratedInvoice] = useState<InvoiceRecord | null>(null);

  // Pricing math
  const isTier2 = selectedTier === 'tier2';
  const baseMonthly = isTier2 ? 599 : 299;
  const baseAnnual = isTier2 ? 5990 : 2990;
  const basePrice = cadence === 'monthly' ? baseMonthly : baseAnnual;
  const extraSeatPrice = recruiterSeats > 1 ? (recruiterSeats - 1) * (cadence === 'monthly' ? 99 : 990) : 0;
  const subtotal = basePrice + extraSeatPrice;
  const taxRate = 0.0825; // 8.25% State & Local sales tax
  const taxAmount = Math.round(subtotal * taxRate * 100) / 100;
  const totalAmount = subtotal + taxAmount;
  const annualSavings = isTier2 ? 599 * 12 - 5990 : 299 * 12 - 2990;

  useEffect(() => {
    if (defaultTier) {
      setSelectedTier(defaultTier);
    }
  }, [defaultTier]);

  if (!isOpen) return null;

  // Detect card brand
  const getCardBrand = (number: string) => {
    const clean = number.replace(/\s+/g, '');
    if (clean.startsWith('4')) return 'Visa';
    if (clean.startsWith('5')) return 'Mastercard';
    if (clean.startsWith('3')) return 'Amex';
    return 'Card';
  };

  // Quick preset test cards
  const applyTestCard = (type: 'success' | '3ds' | 'decline' | 'insufficient') => {
    setErrorMessage(null);
    if (type === 'success') {
      setCardNumber('4242 4242 4242 4242');
      setCardExpiry('12/28');
      setCardCvc('381');
    } else if (type === '3ds') {
      setCardNumber('4000 0000 0000 0005');
      setCardExpiry('12/28');
      setCardCvc('381');
    } else if (type === 'decline') {
      setCardNumber('4000 0000 0000 0002');
      setCardExpiry('12/28');
      setCardCvc('381');
    } else if (type === 'insufficient') {
      setCardNumber('4000 0000 0000 0127');
      setCardExpiry('12/28');
      setCardCvc('381');
    }
  };

  const toggleAlertCategory = (cat: JobCategory) => {
    setAlertCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
    );
  };

  // Handle Stripe Payment Submit
  const handlePaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setIsProcessing(true);
    setProcessingProgress(15);
    setProcessingStage('Tokenizing payment credentials with Stripe.js...');

    await new Promise((r) => setTimeout(r, 600));
    setProcessingProgress(40);
    setProcessingStage('Creating Stripe PaymentIntent (pi_3P...)...');

    await new Promise((r) => setTimeout(r, 600));
    setProcessingProgress(65);
    setProcessingStage('Running Stripe Radar Fraud & Risk Analysis (Risk: Normal)...');

    // Test Card Logic check
    const cleanCard = cardNumber.replace(/\s+/g, '');

    // Card Decline Test
    if (cleanCard.endsWith('0002')) {
      setIsProcessing(false);
      setErrorMessage(
        'Your card was declined by the issuer (Code: generic_decline). Please use an alternate card.'
      );
      return;
    }

    // Insufficient Funds Test
    if (cleanCard.endsWith('0127')) {
      setIsProcessing(false);
      setErrorMessage(
        'Card decline: Insufficient corporate credit limit (Code: insufficient_funds).'
      );
      return;
    }

    // 3D Secure Challenge Test
    if (cleanCard.endsWith('0005')) {
      setIsProcessing(false);
      setIs3DSModalOpen(true);
      return;
    }

    // Normal Success Flow
    await completeSuccessfulPayment();
  };

  const completeSuccessfulPayment = async () => {
    setIsProcessing(true);
    setProcessingProgress(85);
    setProcessingStage('Creating recurring Stripe subscription object (sub_1N...)...');

    await new Promise((r) => setTimeout(r, 500));
    setProcessingProgress(100);
    setProcessingStage('Subscription confirmed. Dispatching tax invoice receipt...');

    const brand = getCardBrand(cardNumber);
    const last4 = cardNumber.replace(/\s+/g, '').slice(-4) || '4242';

    const invoice = upgradeSubscription(
      selectedTier,
      cadence,
      {
        paymentMethod: {
          brand,
          last4,
          expMonth: parseInt(cardExpiry.split('/')[0]) || 12,
          expYear: parseInt(cardExpiry.split('/')[1]) ? 2000 + parseInt(cardExpiry.split('/')[1]) : 2028,
        },
        billingAddress: {
          name: cardholderName,
          line1: billingAddress,
          city,
          postalCode,
          country,
          taxId,
        },
      },
      alertCategories
    );

    setGeneratedInvoice(invoice);
    setIsProcessing(false);
    setStep(4); // Move to Confirmation/Receipt
  };

  const handle3DSSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otpCode) return;
    setIs3DSModalOpen(false);
    await completeSuccessfulPayment();
  };

  const handleDownloadInvoice = () => {
    if (!generatedInvoice) return;
    const invoiceContent = `
============================================================
              RAMP PLATFORM TAX INVOICE
============================================================
Invoice Number: ${generatedInvoice.invoiceNumber}
Date Conferred: ${new Date(generatedInvoice.date).toLocaleDateString()}
Status: PAID (Processed via Stripe Gateway)

BILL TO:
${companyName}
Attn: ${cardholderName}
${billingAddress}, ${city}, ${postalCode}
${country}
Tax ID / EIN: ${taxId}

SUBSCRIPTION LINE ITEMS:
1. ${generatedInvoice.planName} (${cadence.toUpperCase()})
   Amount: $${subtotal.toFixed(2)}
2. Recruiter Seats: ${recruiterSeats}
3. Estimated Sales Tax / VAT (8.25%): $${taxAmount.toFixed(2)}
------------------------------------------------------------
TOTAL CHARGED: $${totalAmount.toFixed(2)} USD
------------------------------------------------------------

STRIPE PAYMENT METADATA:
Payment Intent: ${generatedInvoice.stripePaymentIntentId}
Subscription ID: ${generatedInvoice.stripeSubscriptionId}
Customer ID: ${generatedInvoice.stripeCustomerId}
Payment Method: ${generatedInvoice.paymentMethod.brand} ending in ${generatedInvoice.paymentMethod.last4}

RAMP Technologies Inc.
100 Montgomery St, Suite 1400, San Francisco, CA
============================================================
    `;

    const blob = new Blob([invoiceContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${generatedInvoice.invoiceNumber}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-neutral-950/85 backdrop-blur-sm overflow-y-auto">
      <div className="relative w-full max-w-4xl bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl overflow-hidden my-6 flex flex-col">
        {/* Stripe Checkout Top Navigation Bar */}
        <div className="flex items-center justify-between p-5 border-b border-neutral-800 bg-neutral-950">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-xs font-bold text-white tracking-tight">
              <span className="w-2 h-2 rounded-full bg-blue-500"></span>
              <span>RAMP Subscriptions</span>
              <span className="text-neutral-500 font-normal">/</span>
              <span className="font-mono text-neutral-400 font-normal text-[11px] flex items-center gap-1">
                <Lock className="w-3 h-3 text-emerald-400" />
                Stripe Billing Engine
              </span>
            </div>
          </div>

          {/* Stepper Progress */}
          <div className="hidden sm:flex items-center gap-2 text-xs font-mono">
            <span className={step === 1 ? 'text-blue-400 font-bold' : 'text-neutral-500'}>
              1. Choose Plan
            </span>
            <span className="text-neutral-700">→</span>
            <span className={step === 2 ? 'text-blue-400 font-bold' : 'text-neutral-500'}>
              2. Billing Info
            </span>
            <span className="text-neutral-700">→</span>
            <span className={step === 3 ? 'text-blue-400 font-bold' : 'text-neutral-500'}>
              3. Payment
            </span>
            <span className="text-neutral-700">→</span>
            <span className={step === 4 ? 'text-emerald-400 font-bold' : 'text-neutral-500'}>
              4. Receipt
            </span>
          </div>

          <button
            onClick={onClose}
            className="p-1 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* STEP 1: PLAN SELECTION & CUSTOMIZATION */}
        {step === 1 && (
          <div className="p-6 space-y-6">
            <div className="text-center max-w-xl mx-auto space-y-1">
              <h2 className="text-xl font-bold text-white tracking-tight">
                Select Your Verified Talent Access Plan
              </h2>
              <p className="text-xs text-neutral-400">
                Directly invite verified passive candidates. No blind resumes or applicant spam.
              </p>

              {/* Monthly vs Annual Switcher */}
              <div className="pt-3 flex justify-center">
                <div className="p-1 bg-neutral-950 border border-neutral-800 rounded-xl flex items-center gap-1 text-xs">
                  <button
                    type="button"
                    onClick={() => setCadence('monthly')}
                    className={`px-4 py-1.5 rounded-lg transition-colors font-medium ${
                      cadence === 'monthly'
                        ? 'bg-neutral-800 text-white shadow-sm'
                        : 'text-neutral-400 hover:text-white'
                    }`}
                  >
                    Monthly Billing
                  </button>
                  <button
                    type="button"
                    onClick={() => setCadence('annual')}
                    className={`px-4 py-1.5 rounded-lg transition-colors font-medium flex items-center gap-1.5 ${
                      cadence === 'annual'
                        ? 'bg-neutral-800 text-white shadow-sm'
                        : 'text-neutral-400 hover:text-white'
                    }`}
                  >
                    <span>Annual Billing</span>
                    <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded font-bold">
                      Save up to ${annualSavings.toLocaleString()}
                    </span>
                  </button>
                </div>
              </div>
            </div>

            {/* Plan Comparison Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* TIER 1 PLAN */}
              <div
                onClick={() => setSelectedTier('tier1')}
                className={`cursor-pointer p-6 rounded-2xl border transition-all relative flex flex-col justify-between space-y-4 ${
                  selectedTier === 'tier1'
                    ? 'bg-neutral-850 border-blue-500 shadow-xl shadow-blue-500/10'
                    : 'bg-neutral-950/60 border-neutral-800 hover:border-neutral-700'
                }`}
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-neutral-400 uppercase tracking-wider font-mono">
                      Tier 1 Standard
                    </span>
                    {selectedTier === 'tier1' && (
                      <span className="w-5 h-5 rounded-full bg-blue-500 text-neutral-950 flex items-center justify-center font-bold text-xs">
                        ✓
                      </span>
                    )}
                  </div>

                  <div>
                    <h3 className="text-lg font-bold text-white">Verified Search & Discovery</h3>
                    <p className="text-xs text-neutral-400 mt-1">
                      For teams actively hiring pre-screened talent across core tech roles.
                    </p>
                  </div>

                  <div className="flex items-baseline gap-1 pt-1">
                    <span className="text-3xl font-extrabold text-white font-mono">
                      ${cadence === 'monthly' ? '299' : '2,990'}
                    </span>
                    <span className="text-xs text-neutral-400 font-mono">
                      {cadence === 'monthly' ? '/ month' : '/ year (Save $598)'}
                    </span>
                  </div>

                  <div className="pt-2 border-t border-neutral-800 space-y-2 text-xs text-neutral-300">
                    <div className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span>Full access to verified candidate search pool</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span>Fairness-First mathematical randomizer</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                      <strong className="text-white">25 direct job invites / month</strong>
                    </div>
                    <div className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span>1 Recruiter Seat</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span>Direct corporate work email access</span>
                    </div>
                    <div className="flex items-center gap-2 text-neutral-500 line-through">
                      <X className="w-4 h-4 text-neutral-600 shrink-0" />
                      <span>Gemini Values & Narrative Search</span>
                    </div>
                    <div className="flex items-center gap-2 text-neutral-500 line-through">
                      <X className="w-4 h-4 text-neutral-600 shrink-0" />
                      <span>Direct phone & calendar scheduling links</span>
                    </div>
                    <div className="flex items-center gap-2 text-neutral-500 line-through">
                      <X className="w-4 h-4 text-neutral-600 shrink-0" />
                      <span>Cryptographic registrar audit vault</span>
                    </div>
                    <div className="flex items-center gap-2 text-neutral-500 line-through">
                      <X className="w-4 h-4 text-neutral-600 shrink-0" />
                      <span>Real-time instant join alerts</span>
                    </div>
                  </div>
                </div>

                <div className="text-[11px] font-mono text-neutral-500 text-center pt-2">
                  Billed {cadence === 'monthly' ? 'monthly recurring' : 'annually ($249/mo eff.)'}
                </div>
              </div>

              {/* TIER 2 PLAN */}
              <div
                onClick={() => setSelectedTier('tier2')}
                className={`cursor-pointer p-6 rounded-2xl border transition-all relative flex flex-col justify-between space-y-4 ${
                  selectedTier === 'tier2'
                    ? 'bg-neutral-850 border-emerald-500 shadow-xl shadow-emerald-500/10'
                    : 'bg-neutral-950/60 border-neutral-800 hover:border-neutral-700'
                }`}
              >
                <div className="absolute -top-3 right-4 bg-emerald-500 text-neutral-950 font-extrabold text-[10px] uppercase tracking-wider px-3 py-1 rounded-full shadow-md flex items-center gap-1">
                  <Zap className="w-3 h-3 fill-neutral-950" /> Enterprise Suite
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider font-mono">
                      Tier 2 Enterprise
                    </span>
                    {selectedTier === 'tier2' && (
                      <span className="w-5 h-5 rounded-full bg-emerald-500 text-neutral-950 flex items-center justify-center font-bold text-xs">
                        ✓
                      </span>
                    )}
                  </div>

                  <div>
                    <h3 className="text-lg font-bold text-white">Full Enterprise Talent Suite</h3>
                    <p className="text-xs text-neutral-400 mt-1">
                      Unlimited reach, AI values search, registrar audit vault, team recruiter seats, and real-time alerts.
                    </p>
                  </div>

                  <div className="flex items-baseline gap-1 pt-1">
                    <span className="text-3xl font-extrabold text-white font-mono">
                      ${cadence === 'monthly' ? '599' : '5,990'}
                    </span>
                    <span className="text-xs text-neutral-400 font-mono">
                      {cadence === 'monthly' ? '/ month' : '/ year (Save $1,198)'}
                    </span>
                  </div>

                  <div className="pt-2 border-t border-neutral-800 space-y-2 text-xs text-neutral-300">
                    <div className="flex items-center gap-2 text-emerald-300">
                      <Zap className="w-4 h-4 text-emerald-400 shrink-0" />
                      <strong className="text-white">Unlimited direct job invites + Priority VIP Badge</strong>
                    </div>
                    <div className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                      <strong className="text-white">Gemini Natural Language & Values Search</strong>
                    </div>
                    <div className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                      <strong className="text-white">Cryptographic Registrar Audit Vault</strong>
                    </div>
                    <div className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span>Direct Phone / SMS & Instant Calendar Scheduling</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span>Up to 5 Team Recruiter Seats included</span>
                    </div>
                    <div className="flex items-center gap-2 text-emerald-300">
                      <Bell className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span>Real-time Push & Email alerts on new verified talent</span>
                    </div>
                  </div>
                </div>

                <div className="text-[11px] font-mono text-emerald-400/80 text-center pt-2">
                  Billed {cadence === 'monthly' ? 'monthly recurring' : 'annually ($499/mo eff.)'}
                </div>
              </div>
            </div>

            {/* If Tier 2 is selected: Alert Categories Configuration */}
            {selectedTier === 'tier2' && (
              <div className="p-4 rounded-xl bg-neutral-950 border border-neutral-800 space-y-2.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-white flex items-center gap-1.5">
                    <Bell className="w-3.5 h-3.5 text-emerald-400" />
                    Configure Instant Alert Categories (Tier 2 Feature):
                  </span>
                  <span className="text-[11px] font-mono text-neutral-400">
                    {alertCategories.length} Categories Monitored
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {JOB_CATEGORIES.map((cat) => {
                    const isSelected = alertCategories.includes(cat);
                    return (
                      <button
                        type="button"
                        key={cat}
                        onClick={() => toggleAlertCategory(cat)}
                        className={`text-[11px] px-2.5 py-1 rounded-lg border transition-colors ${
                          isSelected
                            ? 'bg-emerald-950/50 border-emerald-500/60 text-emerald-300 font-semibold'
                            : 'bg-neutral-900 border-neutral-800 text-neutral-400 hover:text-white'
                        }`}
                      >
                        {isSelected ? '✓ ' : '+ '}
                        {cat}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Recruiter Seats Add-on */}
            <div className="p-4 rounded-xl bg-neutral-950 border border-neutral-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
              <div>
                <div className="font-semibold text-white">Recruiter Seats & Team Licenses</div>
                <div className="text-neutral-400 text-[11px]">
                  1 lead seat included. Additional recruiter logins: $99/mo each.
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setRecruiterSeats((s) => Math.max(1, s - 1))}
                  className="w-7 h-7 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-white font-bold flex items-center justify-center"
                >
                  -
                </button>
                <span className="font-mono font-bold text-white px-2">{recruiterSeats}</span>
                <button
                  type="button"
                  onClick={() => setRecruiterSeats((s) => Math.min(10, s + 1))}
                  className="w-7 h-7 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-white font-bold flex items-center justify-center"
                >
                  +
                </button>
              </div>
            </div>

            {/* Comprehensive Tier 1 vs Tier 2 Comparison Matrix */}
            <div className="p-4 rounded-xl bg-neutral-950 border border-neutral-800 space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-white font-mono uppercase tracking-wider">
                  Plan Comparison Matrix (What's included in Tier 2)
                </span>
                <span className="text-[10px] text-emerald-400 font-mono bg-emerald-950 px-2 py-0.5 rounded border border-emerald-900">
                  Full Enterprise Advantage
                </span>
              </div>
              <div className="divide-y divide-neutral-850 text-xs">
                {TIER_DIFFERENTIATORS.map((diff) => (
                  <div key={diff.id} className="py-2.5 grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <div className="font-semibold text-neutral-200">
                      {diff.feature}
                    </div>
                    <div className="text-neutral-400 font-mono text-[11px]">
                      <span className="text-neutral-500">Tier 1: </span>
                      {diff.tier1}
                    </div>
                    <div className="text-emerald-400 font-mono text-[11px] flex items-center gap-1">
                      <span className="text-emerald-500/70">Tier 2: </span>
                      <span>{diff.tier2}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Navigation to Step 2 */}
            <div className="flex items-center justify-between pt-3 border-t border-neutral-800">
              <div className="text-xs text-neutral-400">
                Selected Plan:{' '}
                <strong className="text-white capitalize">
                  {selectedTier === 'tier2' ? 'Tier 2 (Real-Time Alerts)' : 'Tier 1 Standard'}
                </strong>{' '}
                · Total: <span className="font-mono text-emerald-400 font-bold">${totalAmount.toFixed(2)}</span>
              </div>
              <button
                type="button"
                onClick={() => setStep(2)}
                className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs transition-colors flex items-center gap-2 shadow-lg shadow-blue-600/20"
              >
                <span>Continue to Billing Details</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 2: CORPORATE CUSTOMER & BILLING DETAILS */}
        {step === 2 && (
          <div className="p-6 space-y-5">
            <div>
              <h2 className="text-xl font-bold text-white tracking-tight">Corporate Billing Information</h2>
              <p className="text-xs text-neutral-400">
                This information will appear on your official monthly/annual tax invoice and Stripe customer record.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-neutral-300 mb-1.5">
                  Legal Corporate Entity Name *
                </label>
                <input
                  type="text"
                  required
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-neutral-950 border border-neutral-800 rounded-lg text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-300 mb-1.5">
                  Tax ID / VAT / EIN *
                </label>
                <input
                  type="text"
                  required
                  value={taxId}
                  onChange={(e) => setTaxId(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-neutral-950 border border-neutral-800 rounded-lg text-white font-mono focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-neutral-300 mb-1.5">
                  Billing Email (for Stripe Receipts) *
                </label>
                <input
                  type="email"
                  required
                  value={billingEmail}
                  onChange={(e) => setBillingEmail(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-neutral-950 border border-neutral-800 rounded-lg text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-300 mb-1.5">
                  Authorized Signer / Billing Contact *
                </label>
                <input
                  type="text"
                  required
                  value={cardholderName}
                  onChange={(e) => setCardholderName(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-neutral-950 border border-neutral-800 rounded-lg text-white focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-neutral-300 mb-1.5">
                  Billing Street Address *
                </label>
                <input
                  type="text"
                  required
                  value={billingAddress}
                  onChange={(e) => setBillingAddress(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-neutral-950 border border-neutral-800 rounded-lg text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-300 mb-1.5">
                  City *
                </label>
                <input
                  type="text"
                  required
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-neutral-950 border border-neutral-800 rounded-lg text-white focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-neutral-300 mb-1.5">
                  Postal / ZIP Code *
                </label>
                <input
                  type="text"
                  required
                  value={postalCode}
                  onChange={(e) => setPostalCode(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-neutral-950 border border-neutral-800 rounded-lg text-white font-mono focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-300 mb-1.5">
                  Country *
                </label>
                <select
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-neutral-950 border border-neutral-800 rounded-lg text-white focus:outline-none"
                >
                  <option value="United States">United States</option>
                  <option value="Canada">Canada</option>
                  <option value="United Kingdom">United Kingdom</option>
                  <option value="Germany">Germany</option>
                  <option value="Australia">Australia</option>
                </select>
              </div>
            </div>

            {/* Stepper Buttons */}
            <div className="flex items-center justify-between pt-4 border-t border-neutral-800">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="px-4 py-2 text-xs text-neutral-400 hover:text-white"
              >
                ← Back to Plans
              </button>
              <button
                type="button"
                onClick={() => setStep(3)}
                className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs transition-colors flex items-center gap-2 shadow-lg shadow-blue-600/20"
              >
                <span>Proceed to Stripe Payment</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: MOCK STRIPE PAYMENT PROCESSING INTERFACE */}
        {step === 3 && (
          <div className="p-6 space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Left Column: Stripe Elements Payment Form */}
              <div className="lg:col-span-2 space-y-5">
                <div>
                  <h2 className="text-xl font-bold text-white tracking-tight">Payment Method</h2>
                  <p className="text-xs text-neutral-400">
                    Secured by Stripe Elements. Your credentials are encrypted end-to-end.
                  </p>
                </div>

                {/* Payment Method Tabs */}
                <div className="p-1 bg-neutral-950 border border-neutral-800 rounded-xl flex items-center gap-1 text-xs">
                  <button
                    type="button"
                    onClick={() => setPaymentMethodType('card')}
                    className={`flex-1 py-1.5 rounded-lg font-medium transition-colors flex items-center justify-center gap-1.5 ${
                      paymentMethodType === 'card'
                        ? 'bg-neutral-800 text-white'
                        : 'text-neutral-400 hover:text-white'
                    }`}
                  >
                    <CreditCard className="w-3.5 h-3.5" />
                    Card
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaymentMethodType('ach')}
                    className={`flex-1 py-1.5 rounded-lg font-medium transition-colors flex items-center justify-center gap-1.5 ${
                      paymentMethodType === 'ach'
                        ? 'bg-neutral-800 text-white'
                        : 'text-neutral-400 hover:text-white'
                    }`}
                  >
                    <Landmark className="w-3.5 h-3.5" />
                    ACH Direct Debit
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaymentMethodType('link')}
                    className={`flex-1 py-1.5 rounded-lg font-medium transition-colors flex items-center justify-center gap-1.5 ${
                      paymentMethodType === 'link'
                        ? 'bg-neutral-800 text-white'
                        : 'text-neutral-400 hover:text-white'
                    }`}
                  >
                    <Zap className="w-3.5 h-3.5 text-emerald-400" />
                    Stripe Link (1-Click)
                  </button>
                </div>

                {/* Test Cards Quick Presets */}
                <div className="p-3 bg-neutral-950/70 border border-neutral-800 rounded-xl space-y-1.5 text-xs">
                  <div className="flex items-center justify-between text-[11px] text-neutral-400">
                    <span className="font-semibold text-neutral-300">Stripe Sandbox Test Cards:</span>
                    <span>Click to autofill scenario</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => applyTestCard('success')}
                      className="px-2.5 py-1 rounded bg-neutral-900 hover:bg-neutral-850 text-emerald-400 border border-emerald-900/50 text-[11px] font-mono"
                    >
                      ✓ 4242 (Instant Success)
                    </button>
                    <button
                      type="button"
                      onClick={() => applyTestCard('3ds')}
                      className="px-2.5 py-1 rounded bg-neutral-900 hover:bg-neutral-850 text-blue-400 border border-blue-900/50 text-[11px] font-mono"
                    >
                      🛡️ 0005 (3D Secure Challenge)
                    </button>
                    <button
                      type="button"
                      onClick={() => applyTestCard('decline')}
                      className="px-2.5 py-1 rounded bg-neutral-900 hover:bg-neutral-850 text-red-400 border border-red-900/50 text-[11px] font-mono"
                    >
                      ✕ 0002 (Card Declined)
                    </button>
                    <button
                      type="button"
                      onClick={() => applyTestCard('insufficient')}
                      className="px-2.5 py-1 rounded bg-neutral-900 hover:bg-neutral-850 text-amber-400 border border-amber-900/50 text-[11px] font-mono"
                    >
                      ⚠️ 0127 (Insufficient Limit)
                    </button>
                  </div>
                </div>

                {/* Card Fields Form */}
                <form onSubmit={handlePaymentSubmit} className="space-y-4">
                  {paymentMethodType === 'card' && (
                    <div className="p-4 rounded-xl bg-neutral-950 border border-neutral-800 space-y-3">
                      <div>
                        <div className="flex justify-between items-center mb-1">
                          <label className="text-[11px] font-semibold text-neutral-300">
                            Card Number
                          </label>
                          <span className="text-[11px] font-mono font-bold text-blue-400">
                            {getCardBrand(cardNumber)}
                          </span>
                        </div>
                        <div className="relative">
                          <input
                            type="text"
                            required
                            value={cardNumber}
                            onChange={(e) => setCardNumber(e.target.value)}
                            className="w-full pl-3 pr-10 py-2.5 text-xs bg-neutral-900 border border-neutral-800 rounded-lg text-white font-mono focus:outline-none focus:border-blue-500"
                          />
                          <CreditCard className="w-4 h-4 text-neutral-500 absolute right-3 top-3" />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[11px] font-semibold text-neutral-300 mb-1">
                            Expiration Date
                          </label>
                          <input
                            type="text"
                            required
                            value={cardExpiry}
                            onChange={(e) => setCardExpiry(e.target.value)}
                            placeholder="MM / YY"
                            className="w-full px-3 py-2 text-xs bg-neutral-900 border border-neutral-800 rounded-lg text-white font-mono focus:outline-none focus:border-blue-500"
                          />
                        </div>

                        <div>
                          <div className="flex justify-between items-center mb-1">
                            <label className="text-[11px] font-semibold text-neutral-300">
                              CVC Security Code
                            </label>
                            <Lock className="w-3 h-3 text-neutral-500" />
                          </div>
                          <input
                            type="text"
                            required
                            value={cardCvc}
                            onChange={(e) => setCardCvc(e.target.value)}
                            placeholder="CVC"
                            className="w-full px-3 py-2 text-xs bg-neutral-900 border border-neutral-800 rounded-lg text-white font-mono focus:outline-none focus:border-blue-500"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-neutral-300 mb-1">
                          Name on Card
                        </label>
                        <input
                          type="text"
                          required
                          value={cardholderName}
                          onChange={(e) => setCardholderName(e.target.value)}
                          className="w-full px-3 py-2 text-xs bg-neutral-900 border border-neutral-800 rounded-lg text-white focus:outline-none focus:border-blue-500"
                        />
                      </div>
                    </div>
                  )}

                  {paymentMethodType === 'ach' && (
                    <div className="p-4 rounded-xl bg-neutral-950 border border-neutral-800 space-y-3">
                      <div>
                        <label className="block text-[11px] font-semibold text-neutral-300 mb-1">
                          Bank Routing Number (ABA)
                        </label>
                        <input
                          type="text"
                          value={bankRouting}
                          onChange={(e) => setBankRouting(e.target.value)}
                          className="w-full px-3 py-2 text-xs bg-neutral-900 border border-neutral-800 rounded-lg text-white font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-neutral-300 mb-1">
                          Corporate Checking Account Number
                        </label>
                        <input
                          type="text"
                          value={bankAccount}
                          onChange={(e) => setBankAccount(e.target.value)}
                          className="w-full px-3 py-2 text-xs bg-neutral-900 border border-neutral-800 rounded-lg text-white font-mono"
                        />
                      </div>
                    </div>
                  )}

                  {paymentMethodType === 'link' && (
                    <div className="p-4 rounded-xl bg-neutral-950 border border-neutral-800 space-y-2 text-xs">
                      <div className="font-semibold text-white flex items-center gap-1.5">
                        <Zap className="w-4 h-4 text-emerald-400" />
                        Stripe Link 1-Click Pay
                      </div>
                      <p className="text-neutral-400 text-[11px]">
                        Pay with your saved credentials across millions of Stripe-enabled businesses.
                      </p>
                      <div className="p-2.5 rounded-lg bg-neutral-900 font-mono text-[11px] text-neutral-300 flex justify-between">
                        <span>{billingEmail}</span>
                        <span className="text-emerald-400">Authenticated ✓</span>
                      </div>
                    </div>
                  )}

                  {errorMessage && (
                    <div className="p-3 bg-red-950/40 border border-red-800/60 rounded-xl text-xs text-red-300 flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                      <div>
                        <strong className="block">Stripe Gateway Error</strong>
                        <span>{errorMessage}</span>
                      </div>
                    </div>
                  )}

                  {isProcessing && (
                    <div className="p-4 rounded-xl bg-neutral-950 border border-neutral-800 space-y-2">
                      <div className="flex items-center justify-between text-xs font-mono">
                        <span className="text-blue-400 flex items-center gap-1.5">
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          {processingStage}
                        </span>
                        <span className="text-neutral-400">{processingProgress}%</span>
                      </div>
                      <div className="w-full bg-neutral-900 rounded-full h-1.5 overflow-hidden">
                        <div
                          className="bg-blue-500 h-full transition-all duration-300 rounded-full"
                          style={{ width: `${processingProgress}%` }}
                        />
                      </div>
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-2">
                    <button
                      type="button"
                      onClick={() => setStep(2)}
                      disabled={isProcessing}
                      className="px-4 py-2 text-xs text-neutral-400 hover:text-white disabled:opacity-50"
                    >
                      ← Back
                    </button>

                    <button
                      type="submit"
                      disabled={isProcessing}
                      className="px-8 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs transition-colors flex items-center gap-2 shadow-xl shadow-blue-600/25 disabled:opacity-50"
                    >
                      <Lock className="w-3.5 h-3.5" />
                      <span>Pay ${totalAmount.toFixed(2)} USD</span>
                    </button>
                  </div>
                </form>
              </div>

              {/* Right Column: Itemized Order Summary */}
              <div className="p-5 rounded-2xl bg-neutral-950 border border-neutral-800 flex flex-col justify-between space-y-4">
                <div className="space-y-4 text-xs">
                  <div className="border-b border-neutral-850 pb-3">
                    <h3 className="font-bold text-white text-sm">Order Summary</h3>
                    <div className="text-[11px] text-neutral-400 font-mono mt-0.5">
                      Merchant: RAMP Technologies Inc.
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-neutral-400">
                        {isTier2 ? 'Tier 2 (Real-Time Alerts)' : 'Tier 1 Standard'}
                      </span>
                      <span className="font-mono text-white">${basePrice.toLocaleString()}</span>
                    </div>

                    {recruiterSeats > 1 && (
                      <div className="flex justify-between text-neutral-400">
                        <span>Extra Seats ({recruiterSeats - 1})</span>
                        <span className="font-mono text-white">${extraSeatPrice.toLocaleString()}</span>
                      </div>
                    )}

                    <div className="flex justify-between text-neutral-400">
                      <span>Subtotal</span>
                      <span className="font-mono text-white">${subtotal.toLocaleString()}</span>
                    </div>

                    <div className="flex justify-between text-neutral-400">
                      <span>Sales Tax / VAT (8.25%)</span>
                      <span className="font-mono text-white">${taxAmount.toFixed(2)}</span>
                    </div>

                    {cadence === 'annual' && (
                      <div className="flex justify-between text-emerald-400 font-medium">
                        <span>Annual Prepay Discount</span>
                        <span className="font-mono">-${annualSavings.toLocaleString()}</span>
                      </div>
                    )}
                  </div>

                  <div className="border-t border-neutral-800 pt-3 flex justify-between items-baseline">
                    <span className="font-bold text-white text-sm">Total Due Today</span>
                    <div className="text-right">
                      <span className="text-xl font-extrabold text-white font-mono">
                        ${totalAmount.toFixed(2)}
                      </span>
                      <div className="text-[10px] text-neutral-500 font-mono">USD currency</div>
                    </div>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-neutral-900/60 border border-neutral-850 text-[11px] text-neutral-400 space-y-1">
                  <div className="flex items-center gap-1 font-semibold text-neutral-300">
                    <Shield className="w-3.5 h-3.5 text-emerald-400" />
                    Stripe PCI-DSS Level 1 Security
                  </div>
                  <div>
                    Cancel anytime in 1 click from your employer dashboard before renewal date.
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* STEP 4: ORDER CONFIRMATION & ITEMIZED TAX INVOICE / RECEIPT */}
        {step === 4 && generatedInvoice && (
          <div className="p-6 space-y-6">
            {/* Success Celebration Banner */}
            <div className="p-5 rounded-2xl bg-emerald-950/25 border border-emerald-800/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold">
                  <CheckCircle className="w-6 h-6" />
                </div>
                <div>
                  <div className="text-xs font-bold uppercase tracking-wider text-emerald-400 font-mono">
                    Payment Successful · Subscription Active
                  </div>
                  <h2 className="text-lg font-bold text-white tracking-tight mt-0.5">
                    {companyName} is now upgraded to {selectedTier === 'tier2' ? 'Tier 2' : 'Tier 1'}!
                  </h2>
                  <p className="text-xs text-neutral-300">
                    Unlimited direct job invites and verified talent search are immediately unlocked.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={handleDownloadInvoice}
                  className="px-4 py-2 rounded-xl bg-neutral-850 hover:bg-neutral-800 text-white border border-neutral-700 text-xs font-semibold transition-colors flex items-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download Tax Receipt
                </button>
              </div>
            </div>

            {/* Official Itemized Receipt View */}
            <div className="p-6 rounded-2xl bg-neutral-950 border border-neutral-800 space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-neutral-850 gap-2">
                <div>
                  <div className="text-sm font-extrabold text-white tracking-tight">
                    RAMP PLATFORM TAX INVOICE
                  </div>
                  <div className="text-xs text-neutral-400 font-mono">
                    Invoice No: <strong className="text-white">{generatedInvoice.invoiceNumber}</strong>
                  </div>
                </div>

                <div className="text-right text-xs font-mono">
                  <div className="text-emerald-400 font-bold">STATUS: PAID</div>
                  <div className="text-neutral-500">
                    {new Date(generatedInvoice.date).toLocaleDateString()}
                  </div>
                </div>
              </div>

              {/* Billed To */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs font-mono">
                <div>
                  <div className="text-[10px] text-neutral-500 uppercase">Customer / Licensee</div>
                  <div className="font-bold text-white mt-0.5">{companyName}</div>
                  <div className="text-neutral-400">{cardholderName}</div>
                  <div className="text-neutral-400">{billingAddress}, {city}, {postalCode}</div>
                  <div className="text-neutral-500 mt-1">Tax ID / EIN: {taxId}</div>
                </div>

                <div className="sm:text-right">
                  <div className="text-[10px] text-neutral-500 uppercase">Payment Details</div>
                  <div className="text-neutral-300 mt-0.5">
                    {generatedInvoice.paymentMethod.brand} ···· {generatedInvoice.paymentMethod.last4}
                  </div>
                  <div className="text-neutral-500">
                    Stripe PI: {generatedInvoice.stripePaymentIntentId}
                  </div>
                  <div className="text-neutral-500">
                    Stripe Sub: {generatedInvoice.stripeSubscriptionId}
                  </div>
                </div>
              </div>

              {/* Itemized Line Items Table */}
              <div className="pt-2">
                <table className="w-full text-xs font-mono">
                  <thead>
                    <tr className="border-b border-neutral-800 text-neutral-400 text-left">
                      <th className="py-2">Description</th>
                      <th className="py-2 text-right">Cadence</th>
                      <th className="py-2 text-right">Seats</th>
                      <th className="py-2 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-850">
                    <tr>
                      <td className="py-2.5 font-bold text-white">
                        {generatedInvoice.planName}
                      </td>
                      <td className="py-2.5 text-right text-neutral-300 capitalize">{cadence}</td>
                      <td className="py-2.5 text-right text-neutral-300">{recruiterSeats}</td>
                      <td className="py-2.5 text-right font-bold text-white">${subtotal.toLocaleString()}</td>
                    </tr>
                    <tr>
                      <td colSpan={3} className="py-2 text-right text-neutral-400">
                        Sales Tax / VAT (8.25%)
                      </td>
                      <td className="py-2 text-right text-neutral-300">${taxAmount.toFixed(2)}</td>
                    </tr>
                    <tr className="font-bold text-sm text-white">
                      <td colSpan={3} className="py-2.5 text-right">
                        Total Paid
                      </td>
                      <td className="py-2.5 text-right text-emerald-400">${totalAmount.toFixed(2)} USD</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Action Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  const receiptEmail = emailLogs.find((e) => e.subject.includes(generatedInvoice.invoiceNumber));
                  if (receiptEmail) {
                    setSelectedEmailModal(receiptEmail);
                  }
                }}
                className="text-xs text-blue-400 hover:underline flex items-center gap-1.5"
              >
                <Mail className="w-3.5 h-3.5" />
                View Delivered Email Receipt
              </button>

              <button
                type="button"
                onClick={onClose}
                className="px-6 py-2.5 rounded-xl bg-white hover:bg-neutral-200 text-neutral-950 font-bold text-xs transition-colors flex items-center justify-center gap-2 shadow-lg"
              >
                <span>Go to Verified Candidate Search</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* 3D SECURE CHALLENGE MODAL SIMULATOR */}
        {is3DSModalOpen && (
          <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-neutral-950/90 backdrop-blur-md">
            <div className="w-full max-w-md bg-neutral-900 border border-neutral-800 rounded-2xl p-6 shadow-2xl space-y-4">
              <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
                <div className="flex items-center gap-2 text-xs font-bold text-white font-mono">
                  <Shield className="w-4 h-4 text-blue-400" />
                  <span>Stripe 3D Secure 2.0 Challenge</span>
                </div>
                <button
                  onClick={() => setIs3DSModalOpen(false)}
                  className="text-neutral-400 hover:text-white"
                >
                  ✕
                </button>
              </div>

              <div className="text-xs text-neutral-300 space-y-2">
                <p>
                  Your card issuer requires two-factor verification to authenticate this ${totalAmount.toFixed(2)} USD transaction.
                </p>
                <div className="p-3 bg-neutral-950 rounded-xl border border-neutral-800 font-mono text-[11px] text-neutral-400">
                  <div>Merchant: RAMP Technologies Inc.</div>
                  <div>Card: •••• 0005</div>
                  <div className="text-emerald-400 mt-1">Mock OTP Test Code: Enter "123456"</div>
                </div>
              </div>

              <form onSubmit={handle3DSSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-neutral-300 mb-1">
                    Enter SMS Security Code:
                  </label>
                  <input
                    type="text"
                    required
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value)}
                    placeholder="123456"
                    className="w-full px-3 py-2 text-sm bg-neutral-950 border border-neutral-800 rounded-lg text-white font-mono text-center tracking-widest focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setIs3DSModalOpen(false)}
                    className="px-4 py-2 text-xs text-neutral-400 hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs transition-colors"
                  >
                    Authorize Payment
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
