import { useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { createClient } from "@supabase/supabase-js";
import {
  ArrowLeftIcon,
  CheckCircleIcon,
  TruckIcon,
  XCircleIcon,
  DocumentArrowDownIcon,
  ArrowPathIcon,
  ExclamationTriangleIcon,
  MapPinIcon,
  UserIcon,
  CalendarIcon,
  CreditCardIcon,
  TagIcon,
} from "@heroicons/react/24/outline";

// ─── constants ───────────────────────────────────────────────────────────────

const STATUS_META = {
  draft:               { label: "Draft",            color: "text-zinc-400 bg-zinc-400/10 border-zinc-400/20" },
  confirmed:           { label: "Confirmed",        color: "text-blue-400 bg-blue-400/10 border-blue-400/20" },
  partially_fulfilled: { label: "Part. Fulfilled",  color: "text-amber-400 bg-amber-400/10 border-amber-400/20" },
  fulfilled:           { label: "Fulfilled",        color: "text-emerald-400 bg-emerald-400/10 border-emerald-400/20" },
  cancelled:           { label: "Cancelled",        color: "text-red-400 bg-red-400/10 border-red-400/20" },
  voided:              { label: "Voided",           color: "text-zinc-500 bg-zinc-500/10 border-zinc-500/20" },
};

const CHANNEL_META = {
  wholesale:  { label: "Wholesale",  color: "text-violet-400 bg-violet-400/10 border-violet-400/20" },
  ecommerce:  { label: "E-Commerce", color: "text-pink-400  bg-pink-400/10  border-pink-400/20"  },
  sample:     { label: "Sample",     color: "text-teal-400  bg-teal-400/10  border-teal-400/20"  },
  marketing:  { label: "Marketing",  color: "text-orange-400 bg-orange-400/10 border-orange-400/20" },
};

const STATUS_FLOW = ["draft", "confirmed", "partially_fulfilled", "fulfilled"];

const fmt = (n) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(n ?? 0);

const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : "—";

// ─── sub-components ──────────────────────────────────────────────────────────

function Badge({ meta }) {
  if (!meta) return null;
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold border ${meta.color}`}>
      {meta.label}
    </span>
  );
}

function InfoItem({ icon: Icon, label, value }) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-3">
      <Icon className="h-4 w-4 text-zinc-600 mt-0.5 shrink-0" />
      <div>
        <p className="text-[10px] uppercase tracking-widest text-zinc-600 mb-0.5">{label}</p>
        <p className="text-sm text-white">{value}</p>
      </div>
    </div>
  );
}

function StatusTimeline({ status }) {
  const current = STATUS_FLOW.indexOf(status);
  const isCancelled = status === "cancelled" || status === "voided";

  return (
    <div className="flex items-center gap-0">
      {STATUS_FLOW.map((s, i) => {
        const done    = !isCancelled && i <= current;
        const active  = !isCancelled && i === current;
        const isLast  = i === STATUS_FLOW.length - 1;
        return (
          <div key={s} className="flex items-center">
            <div className={`flex flex-col items-center`}>
              <div className={`w-2.5 h-2.5 rounded-full border-2 transition-colors ${
                done
                  ? active
                    ? "border-rose-400 bg-rose-400"
                    : "border-emerald-400 bg-emerald-400"
                  : "border-zinc-700 bg-transparent"
              }`} />
              <p className={`text-[9px] mt-1 whitespace-nowrap tracking-wide uppercase font-medium ${
                done ? (active ? "text-rose-400" : "text-emerald-400") : "text-zinc-700"
              }`}>
                {STATUS_META[s]?.label}
              </p>
            </div>
            {!isLast && (
              <div className={`w-12 h-px mb-3 ${i < current && !isCancelled ? "bg-emerald-400/40" : "bg-zinc-800"}`} />
            )}
          </div>
        );
      })}
      {isCancelled && (
        <div className="ml-4">
          <Badge meta={STATUS_META[status]} />
        </div>
      )}
    </div>
  );
}

// ─── Main page ───────────────────────────────────────────────────────────────

export default function OrderDetailPage({ order, error: serverError }) {
  const router = useRouter();
  const [loading, setLoading]     = useState(null); // "confirm" | "fulfill" | "cancel" | "pdf"
  const [error, setError]         = useState(null);
  const [cancelReason, setCancelReason] = useState("");
  const [showCancelModal, setShowCancelModal] = useState(false);

  if (serverError || !order) {
    return (
      <div className="min-h-screen bg-[#0A0A0D] flex items-center justify-center text-white">
        <div className="text-center">
          <p className="text-zinc-500 text-sm">{serverError ?? "Order not found"}</p>
          <Link href="/orders"><button className="mt-4 text-rose-400 text-sm hover:text-rose-300">← Back to Orders</button></Link>
        </div>
      </div>
    );
  }

  const canConfirm = order.status === "draft";
  const canFulfill = order.status === "confirmed" || order.status === "partially_fulfilled";
  const canCancel  = order.status === "draft" || order.status === "confirmed";
  const isActive   = !["cancelled", "voided", "fulfilled"].includes(order.status);

  // ── action handler ────────────────────────────────────────────────────────
  const doAction = async (action, body = {}) => {
    setLoading(action);
    setError(null);
    try {
      const res = await fetch(`/api/orders/${order.id}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Unknown error");
      router.replace(router.asPath); // refresh page data
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(null);
    }
  };

  // ── PDF generation (client-side simple) ──────────────────────────────────
  const handlePDF = async () => {
    setLoading("pdf");
    try {
      const res = await fetch(`/api/orders/${order.id}/pdf`);
      if (!res.ok) throw new Error("PDF generation failed");
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href     = url;
      a.download = `${order.order_number}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(null);
    }
  };

  const validLines = order.lines.filter((l) => l.product_id);

  return (
    <>
      <Head><title>{order.order_number} — CBS ERP</title></Head>

      <div className="min-h-screen bg-[#0A0A0D] text-white" style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}>
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600&family=DM+Mono:wght@400;500&display=swap');
          * { box-sizing: border-box; }
          ::-webkit-scrollbar { width: 6px; }
          ::-webkit-scrollbar-thumb { background: #2a2a30; border-radius: 3px; }
          .mono { font-family: 'DM Mono', monospace; }
        `}</style>

        <div className="max-w-5xl mx-auto px-6 py-8">

          {/* ── header ─────────────────────────────────────────────────── */}
          <div className="flex items-start justify-between mb-8">
            <div className="flex items-center gap-4">
              <Link href="/orders">
                <button className="p-2 rounded-lg border border-[#1E1E26] text-zinc-500 hover:text-white hover:border-zinc-600 transition-colors">
                  <ArrowLeftIcon className="h-4 w-4" />
                </button>
              </Link>
              <div>
                <p className="text-xs font-medium tracking-widest uppercase text-zinc-500">CBS ERP · Orders</p>
                <div className="flex items-center gap-3 mt-0.5">
                  <h1 className="text-2xl font-semibold mono text-white">{order.order_number}</h1>
                  <Badge meta={CHANNEL_META[order.channel]} />
                  <Badge meta={STATUS_META[order.status]} />
                </div>
              </div>
            </div>

            {/* actions */}
            <div className="flex items-center gap-2">
              <button
                onClick={handlePDF}
                disabled={!!loading}
                className="flex items-center gap-2 px-3 py-2 text-sm border border-[#1E1E26] rounded-lg text-zinc-400 hover:text-white hover:border-zinc-600 transition-colors disabled:opacity-40"
              >
                {loading === "pdf" ? <ArrowPathIcon className="h-4 w-4 animate-spin" /> : <DocumentArrowDownIcon className="h-4 w-4" />}
                Export PDF
              </button>

              {canConfirm && (
                <button
                  onClick={() => doAction("confirm")}
                  disabled={!!loading}
                  className="flex items-center gap-2 px-4 py-2 text-sm bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/30 text-blue-300 rounded-lg transition-colors disabled:opacity-40"
                >
                  {loading === "confirm" ? <ArrowPathIcon className="h-4 w-4 animate-spin" /> : <CheckCircleIcon className="h-4 w-4" />}
                  Confirm
                </button>
              )}

              {canFulfill && (
                <button
                  onClick={() => doAction("fulfill")}
                  disabled={!!loading}
                  className="flex items-center gap-2 px-4 py-2 text-sm bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/30 text-emerald-300 rounded-lg transition-colors disabled:opacity-40"
                >
                  {loading === "fulfill" ? <ArrowPathIcon className="h-4 w-4 animate-spin" /> : <TruckIcon className="h-4 w-4" />}
                  Mark Fulfilled
                </button>
              )}

              {canCancel && (
                <button
                  onClick={() => setShowCancelModal(true)}
                  disabled={!!loading}
                  className="flex items-center gap-2 px-3 py-2 text-sm border border-red-500/20 rounded-lg text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-40"
                >
                  <XCircleIcon className="h-4 w-4" />
                  Cancel
                </button>
              )}
            </div>
          </div>

          {/* ── status timeline ─────────────────────────────────────────── */}
          <div className="mb-6 px-5 py-4 rounded-xl border border-[#1E1E26] bg-[#0D0D11]">
            <StatusTimeline status={order.status} />
          </div>

          {/* ── error ───────────────────────────────────────────────────── */}
          {error && (
            <div className="mb-4 flex items-start gap-3 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
              <ExclamationTriangleIcon className="h-4 w-4 mt-0.5 shrink-0" />
              {error}
            </div>
          )}

          <div className="grid grid-cols-3 gap-4">

            {/* ── left col ─────────────────────────────────────────────── */}
            <div className="col-span-2 space-y-4">

              {/* line items */}
              <section className="rounded-xl border border-[#1E1E26] bg-[#0D0D11] overflow-hidden">
                <div className="px-5 py-3 border-b border-[#1E1E26]">
                  <h2 className="text-xs font-semibold tracking-widest uppercase text-zinc-500">Products</h2>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[#1A1A20]">
                        {["SKU", "Product", "Ordered", "Fulfilled", "Unit Price", "Total"].map((h) => (
                          <th key={h} className="px-4 py-2.5 text-left text-[10px] uppercase tracking-widest text-zinc-600 font-medium whitespace-nowrap">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {validLines.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="px-4 py-8 text-center text-zinc-600 text-sm">No line items</td>
                        </tr>
                      ) : validLines.map((line) => {
                        const pending = line.quantity_ordered - line.quantity_fulfilled;
                        return (
                          <tr key={line.id} className="border-b border-[#1A1A20] last:border-0 hover:bg-[#131318] transition-colors">
                            <td className="px-4 py-3 mono text-xs text-zinc-500">{line.sku}</td>
                            <td className="px-4 py-3 text-white font-medium">{line.product_name}</td>
                            <td className="px-4 py-3 mono text-center text-white">{line.quantity_ordered}</td>
                            <td className="px-4 py-3 mono text-center">
                              <span className={line.quantity_fulfilled === line.quantity_ordered ? "text-emerald-400" : "text-amber-400"}>
                                {line.quantity_fulfilled}
                              </span>
                              {pending > 0 && (
                                <span className="text-zinc-600 text-xs ml-1">({pending} left)</span>
                              )}
                            </td>
                            <td className="px-4 py-3 mono text-right text-zinc-300">{fmt(line.unit_price)}</td>
                            <td className="px-4 py-3 mono text-right text-white font-semibold">{fmt(line.line_total)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* totals */}
                <div className="px-5 py-4 border-t border-[#1E1E26] space-y-2">
                  <div className="flex justify-between text-sm text-zinc-400">
                    <span>Subtotal</span>
                    <span className="mono">{fmt(order.subtotal)}</span>
                  </div>
                  {Number(order.tax_amount) > 0 && (
                    <div className="flex justify-between text-sm text-zinc-400">
                      <span>Tax</span>
                      <span className="mono">{fmt(order.tax_amount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-base font-semibold text-white pt-2 border-t border-[#1E1E26]">
                    <span>Total</span>
                    <span className="mono">{fmt(order.total_amount)}</span>
                  </div>
                </div>
              </section>

              {/* notes */}
              {order.notes && (
                <section className="rounded-xl border border-[#1E1E26] bg-[#0D0D11] px-5 py-4">
                  <p className="text-[10px] uppercase tracking-widest text-zinc-600 mb-2">Notes</p>
                  <p className="text-sm text-zinc-300 leading-relaxed">{order.notes}</p>
                </section>
              )}
            </div>

            {/* ── right col ────────────────────────────────────────────── */}
            <div className="space-y-4">

              {/* customer card */}
              <section className="rounded-xl border border-[#1E1E26] bg-[#0D0D11] px-5 py-4 space-y-4">
                <h2 className="text-xs font-semibold tracking-widest uppercase text-zinc-500">Customer</h2>
                <Link href={`/customers/${order.customer_id}`}>
                  <p className="text-white font-semibold hover:text-zinc-300 transition-colors cursor-pointer">
                    {order.customer_name}
                  </p>
                </Link>
                <div className="space-y-3">
                  <InfoItem icon={UserIcon}     label="Contact"  value={order.contact_name} />
                  <InfoItem icon={TagIcon}      label="Email"    value={order.customer_email || null} />
                  <InfoItem icon={CreditCardIcon} label="Payment Terms" value={order.payment_terms_days != null ? `Net ${order.payment_terms_days}` : null} />
                </div>
              </section>

              {/* order meta */}
              <section className="rounded-xl border border-[#1E1E26] bg-[#0D0D11] px-5 py-4 space-y-4">
                <h2 className="text-xs font-semibold tracking-widest uppercase text-zinc-500">Order Info</h2>
                <div className="space-y-3">
                  <InfoItem icon={CalendarIcon} label="Order Date"   value={fmtDate(order.order_date)} />
                  <InfoItem icon={CalendarIcon} label="Created"      value={fmtDate(order.created_at)} />
                  {order.shopify_order_number && (
                    <InfoItem icon={TagIcon} label="Shopify Order" value={order.shopify_order_number} />
                  )}
                </div>
              </section>

              {/* ship-to */}
              {order.location_name && (
                <section className="rounded-xl border border-[#1E1E26] bg-[#0D0D11] px-5 py-4 space-y-3">
                  <h2 className="text-xs font-semibold tracking-widest uppercase text-zinc-500">Ship To</h2>
                  <div className="flex items-start gap-3">
                    <MapPinIcon className="h-4 w-4 text-zinc-600 mt-0.5 shrink-0" />
                    <div className="text-sm text-zinc-300 leading-relaxed">
                      <p className="text-white font-medium">{order.location_name}</p>
                      {order.address_line1 && <p>{order.address_line1}</p>}
                      {(order.city || order.state) && (
                        <p>{[order.city, order.state].filter(Boolean).join(", ")} {order.zip}</p>
                      )}
                    </div>
                  </div>
                </section>
              )}

              {/* invoice */}
              <section className="rounded-xl border border-[#1E1E26] bg-[#0D0D11] px-5 py-4">
                <h2 className="text-xs font-semibold tracking-widest uppercase text-zinc-500 mb-3">Invoice</h2>
                {order.invoice_id ? (
                  <Link href={`/invoices/${order.invoice_id}`}>
                    <button className="w-full py-2 text-sm text-emerald-400 border border-emerald-400/20 rounded-lg hover:bg-emerald-400/10 transition-colors">
                      View Invoice →
                    </button>
                  </Link>
                ) : (
                  <p className="text-xs text-zinc-600">No invoice generated yet.</p>
                )}
              </section>
            </div>
          </div>
        </div>
      </div>

      {/* ── cancel modal ─────────────────────────────────────────────────── */}
      {showCancelModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md mx-4 rounded-xl border border-[#1E1E26] bg-[#0D0D11] p-6">
            <h3 className="text-lg font-semibold text-white mb-2">Cancel Order</h3>
            <p className="text-sm text-zinc-400 mb-4">
              This will cancel <span className="mono text-white">{order.order_number}</span> and release any committed stock.
            </p>
            <textarea
              rows={3}
              placeholder="Reason for cancellation (optional)…"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              className="w-full px-3 py-2 bg-[#111116] border border-[#1E1E26] rounded-lg text-white text-sm placeholder-zinc-600 focus:outline-none focus:border-zinc-500 resize-none mb-4"
            />
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowCancelModal(false)}
                className="px-4 py-2 text-sm text-zinc-400 hover:text-white border border-[#1E1E26] rounded-lg transition-colors"
              >
                Go back
              </button>
              <button
                onClick={async () => {
                  setShowCancelModal(false);
                  await doAction("cancel", { reason: cancelReason });
                }}
                disabled={!!loading}
                className="px-4 py-2 text-sm bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 text-red-300 rounded-lg transition-colors"
              >
                Confirm Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─── getServerSideProps ───────────────────────────────────────────────────────

export async function getServerSideProps({ params }) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { data: order, error } = await supabase
    .from("sales_orders")
    .select(`
      *,
      customers ( id, name, email, contact_name, type, payment_terms_days ),
      customer_locations ( id, name, address_line1, city, state, zip ),
      sales_order_lines (
        id, product_id, sku, product_name,
        quantity_ordered, quantity_fulfilled, quantity_returned,
        unit_price, line_total, cogs_unit_cost, notes
      )
    `)
    .eq("id", params.id)
    .single();

  if (error || !order) {
    return { props: { order: null, error: error?.message ?? "Order not found" } };
  }

  const flat = {
    ...order,
    customer_name:   order.customers?.name,
    customer_email:  order.customers?.email,
    contact_name:    order.customers?.contact_name,
    customer_id:     order.customers?.id ?? order.customer_id,
    payment_terms_days: order.payment_terms_days ?? order.customers?.payment_terms_days,
    location_name:   order.customer_locations?.name ?? null,
    address_line1:   order.customer_locations?.address_line1 ?? null,
    city:            order.customer_locations?.city ?? null,
    state:           order.customer_locations?.state ?? null,
    zip:             order.customer_locations?.zip ?? null,
    lines:           order.sales_order_lines ?? [],
    customers:       undefined,
    customer_locations: undefined,
    sales_order_lines:  undefined,
  };

  return { props: { order: flat, error: null } };
}
