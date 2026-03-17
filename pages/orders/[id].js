import { useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import Layout from "../components/Layout";
import { createClient } from "@supabase/supabase-js";

const STATUS_META = {
  draft:               { label: "Draft",           cls: "badge-gray",  dot: "gray" },
  confirmed:           { label: "Confirmed",       cls: "badge-blue",  dot: "gray" },
  partially_fulfilled: { label: "Part. Fulfilled", cls: "badge-amber", dot: "amber" },
  fulfilled:           { label: "Fulfilled",       cls: "badge-green", dot: "green" },
  cancelled:           { label: "Cancelled",       cls: "badge-red",   dot: "red" },
  voided:              { label: "Voided",          cls: "badge-gray",  dot: "gray" },
};

const CHANNEL_META = {
  wholesale:  { label: "Wholesale",  cls: "badge-blue" },
  ecommerce:  { label: "E-Commerce", cls: "badge-green" },
  sample:     { label: "Sample",     cls: "badge-gray" },
  marketing:  { label: "Marketing",  cls: "badge-amber" },
};

const STATUS_FLOW = ["draft", "confirmed", "partially_fulfilled", "fulfilled"];

const fmt = (n) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(n ?? 0);

const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : "—";

export default function OrderDetailPage({ order, error: serverError }) {
  const router = useRouter();
  const [loading, setLoading]       = useState(null);
  const [error, setError]           = useState(null);
  const [cancelReason, setCancelReason] = useState("");
  const [showCancelModal, setShowCancelModal] = useState(false);

  if (serverError || !order) {
    return (
      <Layout>
        <div className="empty">
          <p>{serverError ?? "Order not found"}</p>
          <Link href="/orders"><button className="btn-outline" style={{ marginTop: 16 }}>← Back to Orders</button></Link>
        </div>
      </Layout>
    );
  }

  const canConfirm = order.status === "draft";
  const canFulfill = ["confirmed", "partially_fulfilled"].includes(order.status);
  const canCancel  = ["draft", "confirmed"].includes(order.status);

  const doAction = async (action, body = {}) => {
    setLoading(action); setError(null);
    try {
      const res = await fetch(`/api/orders/${order.id}/${action}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Unknown error");
      router.replace(router.asPath);
    } catch (e) { setError(e.message); }
    finally { setLoading(null); }
  };

  const validLines = (order.lines ?? []).filter(l => l.product_id);
  const stepIdx    = STATUS_FLOW.indexOf(order.status);
  const isCancelled = ["cancelled", "voided"].includes(order.status);

  return (
    <Layout>
      {/* Header */}
      <div className="page-header">
        <div>
          <Link href="/orders"><span style={{ fontSize: 13, color: "var(--text-3)", cursor: "pointer" }}>← Orders</span></Link>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 4 }}>
            <h1 style={{ margin: 0 }}>{order.order_number}</h1>
            <span className={`badge ${CHANNEL_META[order.channel]?.cls}`}>{CHANNEL_META[order.channel]?.label ?? order.channel}</span>
            <span className={`badge ${STATUS_META[order.status]?.cls}`}>{STATUS_META[order.status]?.label ?? order.status}</span>
          </div>
        </div>
        <div className="page-actions">
          {canConfirm && (
            <button className="btn-outline" style={{ color: "var(--blue)", borderColor: "var(--blue)" }}
              disabled={!!loading} onClick={() => doAction("confirm")}>
              {loading === "confirm" ? "…" : "✓ Confirm Order"}
            </button>
          )}
          {canFulfill && (
            <button className="btn-green"
              disabled={!!loading} onClick={() => doAction("fulfill")}>
              {loading === "fulfill" ? "…" : "↗ Mark Fulfilled"}
            </button>
          )}
          {canCancel && (
            <button className="btn-danger"
              disabled={!!loading} onClick={() => setShowCancelModal(true)}>
              Cancel Order
            </button>
          )}
        </div>
      </div>

      {/* Status timeline */}
      <div className="card" style={{ marginBottom: 20, padding: "14px 20px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
          {STATUS_FLOW.map((s, i) => {
            const done   = !isCancelled && i <= stepIdx;
            const active = !isCancelled && i === stepIdx;
            const isLast = i === STATUS_FLOW.length - 1;
            return (
              <div key={s} style={{ display: "flex", alignItems: "center" }}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                  <div style={{ width: 10, height: 10, borderRadius: "50%", border: `2px solid ${done ? (active ? "var(--accent)" : "var(--green)") : "var(--border-2)"}`, background: done ? (active ? "var(--accent)" : "var(--green)") : "#fff" }} />
                  <span style={{ fontSize: 10, marginTop: 4, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 500, color: done ? (active ? "var(--accent)" : "var(--green)") : "var(--text-3)", whiteSpace: "nowrap" }}>
                    {STATUS_META[s]?.label}
                  </span>
                </div>
                {!isLast && <div style={{ width: 60, height: 1, background: i < stepIdx && !isCancelled ? "var(--green-mid)" : "var(--border)", marginBottom: 14 }} />}
              </div>
            );
          })}
          {isCancelled && <span className={`badge ${STATUS_META[order.status]?.cls}`} style={{ marginLeft: 16 }}>{STATUS_META[order.status]?.label}</span>}
        </div>
      </div>

      {error && <div className="alert alert-danger" style={{ marginBottom: 16 }}>⚠ {error}</div>}

      {/* Main grid */}
      <div className="grid-3-1" style={{ alignItems: "start" }}>

        {/* Left — lines + notes */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          {/* Line items */}
          <div className="card">
            <div className="card-header"><span className="card-title">Products</span></div>
            <div className="table-wrap" style={{ border: "none", borderRadius: 0, boxShadow: "none" }}>
              <table>
                <thead>
                  <tr>
                    <th>SKU</th><th>Product</th><th style={{ textAlign: "center" }}>Ordered</th><th style={{ textAlign: "center" }}>Fulfilled</th><th style={{ textAlign: "right" }}>Unit Price</th><th style={{ textAlign: "right" }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {validLines.length === 0 ? (
                    <tr><td colSpan={6}><div className="empty"><p>No line items</p></div></td></tr>
                  ) : validLines.map(line => {
                    const pending = line.quantity_ordered - line.quantity_fulfilled;
                    return (
                      <tr key={line.id}>
                        <td className="td-muted" style={{ fontSize: 12 }}>{line.sku}</td>
                        <td style={{ fontWeight: 500 }}>{line.product_name}</td>
                        <td style={{ textAlign: "center" }}>{line.quantity_ordered}</td>
                        <td style={{ textAlign: "center" }}>
                          <span style={{ color: line.quantity_fulfilled === line.quantity_ordered ? "var(--green)" : "var(--amber)", fontWeight: 600 }}>{line.quantity_fulfilled}</span>
                          {pending > 0 && <span className="td-muted" style={{ fontSize: 11, marginLeft: 4 }}>({pending} left)</span>}
                        </td>
                        <td style={{ textAlign: "right" }}>{fmt(line.unit_price)}</td>
                        <td style={{ textAlign: "right", fontWeight: 600 }}>{fmt(line.line_total)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {/* Totals */}
            <div style={{ padding: "12px 18px", borderTop: "1px solid var(--border)", background: "var(--bg)" }}>
              <div style={{ maxWidth: 220, marginLeft: "auto", fontSize: 13, display: "flex", flexDirection: "column", gap: 5 }}>
                <div style={{ display: "flex", justifyContent: "space-between", color: "var(--text-3)" }}><span>Subtotal</span><span>{fmt(order.subtotal)}</span></div>
                {Number(order.tax_amount) > 0 && <div style={{ display: "flex", justifyContent: "space-between", color: "var(--text-3)" }}><span>Tax</span><span>{fmt(order.tax_amount)}</span></div>}
                <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: 15, borderTop: "1px solid var(--border)", paddingTop: 6 }}><span>Total</span><span>{fmt(order.total_amount)}</span></div>
              </div>
            </div>
          </div>

          {/* Notes */}
          {order.notes && (
            <div className="card">
              <div className="card-header"><span className="card-title">Notes</span></div>
              <div className="card-body"><p style={{ fontSize: 13, color: "var(--text-2)", lineHeight: 1.6 }}>{order.notes}</p></div>
            </div>
          )}
        </div>

        {/* Right sidebar */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          {/* Customer */}
          <div className="card">
            <div className="card-header"><span className="card-title">Customer</span></div>
            <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: 10, fontSize: 13 }}>
              <Link href={`/customers/${order.customer_id}`}>
                <span style={{ fontWeight: 600, color: "var(--accent)", cursor: "pointer" }}>{order.customer_name}</span>
              </Link>
              {order.contact_name && <div><span className="td-muted">Contact: </span>{order.contact_name}</div>}
              {order.customer_email && <div><span className="td-muted">Email: </span>{order.customer_email}</div>}
              {order.payment_terms_days != null && <div><span className="td-muted">Terms: </span>Net {order.payment_terms_days}</div>}
            </div>
          </div>

          {/* Order info */}
          <div className="card">
            <div className="card-header"><span className="card-title">Order Info</span></div>
            <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 13 }}>
              <div><span className="td-muted">Date: </span>{fmtDate(order.order_date)}</div>
              <div><span className="td-muted">Created: </span>{fmtDate(order.created_at)}</div>
              {order.shopify_order_number && <div><span className="td-muted">Shopify: </span>{order.shopify_order_number}</div>}
            </div>
          </div>

          {/* Ship-to */}
          {order.location_name && (
            <div className="card">
              <div className="card-header"><span className="card-title">Ship To</span></div>
              <div className="card-body" style={{ fontSize: 13, lineHeight: 1.7 }}>
                <div style={{ fontWeight: 500 }}>{order.location_name}</div>
                {order.address_line1 && <div className="td-muted">{order.address_line1}</div>}
                {(order.city || order.state) && <div className="td-muted">{[order.city, order.state].filter(Boolean).join(", ")} {order.zip}</div>}
              </div>
            </div>
          )}

          {/* Invoice */}
          <div className="card">
            <div className="card-header"><span className="card-title">Invoice</span></div>
            <div className="card-body">
              {order.invoice_id
                ? <Link href={`/invoices/${order.invoice_id}`}><button className="btn-outline" style={{ width: "100%", color: "var(--green)", borderColor: "var(--green-mid)" }}>View Invoice →</button></Link>
                : <p style={{ fontSize: 13, color: "var(--text-3)" }}>No invoice generated yet.</p>}
            </div>
          </div>
        </div>
      </div>

      {/* Cancel modal */}
      {showCancelModal && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="modal-header">
              <h2>Cancel Order</h2>
              <button className="modal-close" onClick={() => setShowCancelModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: 13, color: "var(--text-2)", marginBottom: 16 }}>
                This will cancel <strong>{order.order_number}</strong> and release any committed stock.
              </p>
              <label className="form-label">Reason (optional)</label>
              <textarea rows={3} placeholder="Reason for cancellation…" value={cancelReason} onChange={e => setCancelReason(e.target.value)} />
            </div>
            <div className="modal-footer">
              <button className="btn-outline" onClick={() => setShowCancelModal(false)}>Go back</button>
              <button className="btn-danger" onClick={async () => { setShowCancelModal(false); await doAction("cancel", { reason: cancelReason }); }}>
                Confirm Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}

export async function getServerSideProps({ params }) {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data: order, error } = await supabase
    .from("sales_orders")
    .select(`*, customers ( id, name, email, contact_name, payment_terms_days ), customer_locations ( id, name, address_line1, city, state, zip ), sales_order_lines ( id, product_id, sku, product_name, quantity_ordered, quantity_fulfilled, quantity_returned, unit_price, line_total, cogs_unit_cost, notes )`)
    .eq("id", params.id)
    .single();

  if (error || !order) return { props: { order: null, error: error?.message ?? "Order not found" } };

  const flat = {
    ...order,
    customer_name:      order.customers?.name,
    customer_email:     order.customers?.email,
    contact_name:       order.customers?.contact_name,
    customer_id:        order.customers?.id ?? order.customer_id,
    payment_terms_days: order.payment_terms_days ?? order.customers?.payment_terms_days,
    location_name:      order.customer_locations?.name ?? null,
    address_line1:      order.customer_locations?.address_line1 ?? null,
    city:               order.customer_locations?.city ?? null,
    state:              order.customer_locations?.state ?? null,
    zip:                order.customer_locations?.zip ?? null,
    lines:              order.sales_order_lines ?? [],
    customers:          undefined,
    customer_locations: undefined,
    sales_order_lines:  undefined,
  };

  return { props: { order: flat, error: null } };
}
