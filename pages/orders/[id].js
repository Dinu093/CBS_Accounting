import { useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import Layout from "../../components/Layout";
import { createClient } from "@supabase/supabase-js";

const STATUS_META = {
  draft:               { label: "Draft",           cls: "badge-gray"  },
  confirmed:           { label: "Confirmed",       cls: "badge-blue"  },
  partially_fulfilled: { label: "Part. Fulfilled", cls: "badge-amber" },
  fulfilled:           { label: "Fulfilled",       cls: "badge-green" },
  cancelled:           { label: "Cancelled",       cls: "badge-red"   },
  voided:              { label: "Voided",          cls: "badge-gray"  },
};

const CHANNEL_META = {
  wholesale:  { label: "Wholesale",  cls: "badge-blue"  },
  ecommerce:  { label: "E-Commerce", cls: "badge-green" },
  sample:     { label: "Sample",     cls: "badge-gray"  },
  marketing:  { label: "Marketing",  cls: "badge-amber" },
};

const INVOICE_STATUS_META = {
  draft:          { label: "Draft",         cls: "badge-gray"  },
  sent:           { label: "Sent",          cls: "badge-blue"  },
  partially_paid: { label: "Part. Paid",    cls: "badge-amber" },
  paid:           { label: "Paid ✓",        cls: "badge-green" },
  overdue:        { label: "Overdue",       cls: "badge-red"   },
  void:           { label: "Void",          cls: "badge-gray"  },
};

const STATUS_FLOW = ["draft", "confirmed", "partially_fulfilled", "fulfilled"];

const fmt = (n) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(n ?? 0);

const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : "—";

const fmtDateShort = (d) =>
  d ? new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—";

export default function OrderDetailPage({ order, error: serverError }) {
  const router = useRouter();
  const [loading, setLoading]           = useState(null);
  const [error, setError]               = useState(null);
  const [cancelReason, setCancelReason] = useState("");
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

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
  const canDelete  = ["draft", "cancelled"].includes(order.status);
  const isCancelled = ["cancelled", "voided"].includes(order.status);
  const stepIdx    = STATUS_FLOW.indexOf(order.status);

  const doAction = async (action, body = {}) => {
    setLoading(action); setError(null);
    try {
      const res = await fetch(`/api/orders/${order.id}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Unknown error");
      router.replace(router.asPath);
    } catch (e) { setError(e.message); }
    finally { setLoading(null); }
  };

  const doDelete = async () => {
    setShowDeleteModal(false);
    setLoading("delete");
    try {
      const res = await fetch(`/api/orders/${order.id}/delete`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Unknown error");
      router.push("/orders");
    } catch (e) { setError(e.message); setLoading(null); }
  };

  const doMarkPaid = async () => {
    setLoading("markpaid"); setError(null);
    try {
      const res = await fetch(`/api/orders/${order.id}/mark-paid`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Unknown error");
      router.replace(router.asPath);
    } catch (e) { setError(e.message); }
    finally { setLoading(null); }
  };

  const validLines = (order.lines ?? []).filter(l => l.product_id);

  // Invoice info
  const inv        = order.invoice;
  const invIsPaid  = inv?.status === "paid";
  const invIsOverdue = inv && inv.status !== "paid" && inv.status !== "void" && new Date(inv.due_date) < new Date();
  const effectiveInvStatus = inv ? (invIsOverdue && inv.status !== "paid" ? "overdue" : inv.status) : null;

  return (
    <Layout>
      {/* Back */}
      <div style={{ marginBottom: 16 }}>
        <Link href="/orders">
          <button className="btn-outline btn-sm">← Orders</button>
        </Link>
      </div>

      {/* Header */}
      <div className="page-header">
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <h1 style={{ margin: 0 }}>{order.order_number}</h1>
            <span className={`badge ${CHANNEL_META[order.channel]?.cls}`}>{CHANNEL_META[order.channel]?.label ?? order.channel}</span>
            <span className={`badge ${STATUS_META[order.status]?.cls}`}>{STATUS_META[order.status]?.label ?? order.status}</span>
          </div>
        </div>
        <div className="page-actions">
          {canConfirm && (
            <button className="btn-outline" style={{ color: "var(--blue)", borderColor: "var(--blue)" }}
              disabled={!!loading} onClick={() => doAction("confirm")}>
              {loading === "confirm" ? "…" : "✓ Confirm & Invoice"}
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
              Cancel
            </button>
          )}
          {canDelete && (
            <button className="btn-ghost" style={{ color: "var(--red)", fontSize: 13 }}
              disabled={!!loading} onClick={() => setShowDeleteModal(true)}>
              🗑 Delete
            </button>
          )}
        </div>
      </div>

      {/* Status timeline */}
      <div className="card" style={{ marginBottom: 20, padding: "14px 20px" }}>
        <div style={{ display: "flex", alignItems: "center" }}>
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

        {/* Left col */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          {/* Line items */}
          <div className="card">
            <div className="card-header"><span className="card-title">Products</span></div>
            <div className="table-wrap" style={{ border: "none", borderRadius: 0, boxShadow: "none" }}>
              <table>
                <thead>
                  <tr>
                    <th>SKU</th><th>Product</th>
                    <th style={{ textAlign: "center" }}>Ordered</th>
                    <th style={{ textAlign: "center" }}>Fulfilled</th>
                    <th style={{ textAlign: "right" }}>Unit Price</th>
                    <th style={{ textAlign: "right" }}>Total</th>
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
                          <span style={{ color: line.quantity_fulfilled === line.quantity_ordered ? "var(--green)" : "var(--amber)", fontWeight: 600 }}>
                            {line.quantity_fulfilled}
                          </span>
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
            <div style={{ padding: "12px 18px", borderTop: "1px solid var(--border)", background: "var(--bg)" }}>
              <div style={{ maxWidth: 220, marginLeft: "auto", fontSize: 13, display: "flex", flexDirection: "column", gap: 5 }}>
                <div style={{ display: "flex", justifyContent: "space-between", color: "var(--text-3)" }}>
                  <span>Subtotal</span><span>{fmt(order.subtotal)}</span>
                </div>
                {Number(order.tax_amount) > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", color: "var(--text-3)" }}>
                    <span>Tax</span><span>{fmt(order.tax_amount)}</span>
                  </div>
                )}
                <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: 15, borderTop: "1px solid var(--border)", paddingTop: 6 }}>
                  <span>Total</span><span>{fmt(order.total_amount)}</span>
                </div>
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

          {/* Invoice / Payment status */}
          <div className="card">
            <div className="card-header">
              <span className="card-title">Invoice & Payment</span>
              {inv && effectiveInvStatus && (
                <span className={`badge ${INVOICE_STATUS_META[effectiveInvStatus]?.cls}`}>
                  {INVOICE_STATUS_META[effectiveInvStatus]?.label}
                </span>
              )}
            </div>
            <div className="card-body" style={{ fontSize: 13, display: "flex", flexDirection: "column", gap: 8 }}>
              {!inv ? (
                <p style={{ color: "var(--text-3)" }}>
                  {order.status === "draft"
                    ? "Invoice will be generated automatically when you confirm the order."
                    : "No invoice linked."}
                </p>
              ) : (
                <>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span className="td-muted">Invoice #</span>
                    <strong style={{ color: "var(--accent)" }}>{inv.invoice_number}</strong>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span className="td-muted">Issued</span>
                    <span>{fmtDateShort(inv.issue_date)}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span className="td-muted">Due</span>
                    <span style={{ color: invIsOverdue ? "var(--red)" : "inherit", fontWeight: invIsOverdue ? 600 : 400 }}>
                      {fmtDateShort(inv.due_date)}
                      {invIsOverdue && " ⚠"}
                    </span>
                  </div>
                  <div style={{ height: 1, background: "var(--border)", margin: "4px 0" }} />
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span className="td-muted">Total due</span>
                    <strong>{fmt(inv.total_due)}</strong>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span className="td-muted">Paid</span>
                    <span style={{ color: "var(--green)", fontWeight: 600 }}>{fmt(inv.amount_paid)}</span>
                  </div>
                  {!invIsPaid && inv.status !== "void" && (
                    <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid var(--border)", paddingTop: 6, marginTop: 2 }}>
                      <span style={{ fontWeight: 600 }}>Balance due</span>
                      <span style={{ fontWeight: 700, color: "var(--red)" }}>{fmt(inv.total_due - inv.amount_paid)}</span>
                    </div>
                  )}
                  {!invIsPaid && inv.status !== "void" && (
                    <button
                      className="btn-green"
                      style={{ width: "100%", marginTop: 8 }}
                      disabled={!!loading}
                      onClick={doMarkPaid}
                    >
                      {loading === "markpaid" ? "…" : "✓ Mark as Paid"}
                    </button>
                  )}
                  {invIsPaid && (
                    <div className="alert alert-success" style={{ marginTop: 4, marginBottom: 0 }}>
                      ✓ Paid in full
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Customer */}
          <div className="card">
            <div className="card-header"><span className="card-title">Customer</span></div>
            <div className="card-body" style={{ fontSize: 13, display: "flex", flexDirection: "column", gap: 8 }}>
              <Link href={`/customers/${order.customer_id}`}>
                <span style={{ fontWeight: 600, color: "var(--accent)", cursor: "pointer" }}>{order.customer_name}</span>
              </Link>
              {order.contact_name  && <div><span className="td-muted">Contact: </span>{order.contact_name}</div>}
              {order.customer_email && <div><span className="td-muted">Email: </span>{order.customer_email}</div>}
              {order.payment_terms_days != null && <div><span className="td-muted">Terms: </span>Net {order.payment_terms_days}</div>}
            </div>
          </div>

          {/* Order info */}
          <div className="card">
            <div className="card-header"><span className="card-title">Order Info</span></div>
            <div className="card-body" style={{ fontSize: 13, display: "flex", flexDirection: "column", gap: 8 }}>
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
                This will cancel <strong>{order.order_number}</strong>, release committed stock
                {order.invoice_id ? ", and void the linked invoice" : ""}.
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

      {/* Delete modal */}
      {showDeleteModal && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="modal-header">
              <h2>Delete Order</h2>
              <button className="modal-close" onClick={() => setShowDeleteModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: 13, color: "var(--text-2)" }}>
                This will <strong>permanently delete</strong> order <strong>{order.order_number}</strong> and all its lines. This cannot be undone.
              </p>
            </div>
            <div className="modal-footer">
              <button className="btn-outline" onClick={() => setShowDeleteModal(false)}>Cancel</button>
              <button className="btn-danger" onClick={doDelete}>
                {loading === "delete" ? "Deleting…" : "Delete permanently"}
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}

export async function getServerSideProps({ params }) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { data: order, error } = await supabase
    .from("sales_orders")
    .select(`
      *,
      customers ( id, name, email, contact_name, payment_terms_days ),
      customer_locations ( id, name, address_line1, city, state, zip ),
      sales_order_lines ( id, product_id, sku, product_name, quantity_ordered, quantity_fulfilled, quantity_returned, unit_price, line_total, cogs_unit_cost, notes ),
      invoices ( id, invoice_number, issue_date, due_date, subtotal, tax_amount, total_due, amount_paid, status )
    `)
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
    // invoice: take the first one linked (one-to-one via invoice_id)
    invoice:            Array.isArray(order.invoices) ? (order.invoices[0] ?? null) : (order.invoices ?? null),
    customers:          undefined,
    customer_locations: undefined,
    sales_order_lines:  undefined,
    invoices:           undefined,
  };

  return { props: { order: flat, error: null } };
}
