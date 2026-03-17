import { useState, useMemo } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import Layout from "../../components/Layout";
import { createClient } from "@supabase/supabase-js";

const STATUS_META = {
  draft:               { label: "Draft",           cls: "badge-gray" },
  confirmed:           { label: "Confirmed",       cls: "badge-blue" },
  partially_fulfilled: { label: "Part. Fulfilled", cls: "badge-amber" },
  fulfilled:           { label: "Fulfilled",       cls: "badge-green" },
  cancelled:           { label: "Cancelled",       cls: "badge-red" },
  voided:              { label: "Voided",          cls: "badge-gray" },
};

const CHANNEL_META = {
  wholesale:  { label: "Wholesale",  cls: "badge-blue" },
  ecommerce:  { label: "E-Commerce", cls: "badge-green" },
  sample:     { label: "Sample",     cls: "badge-gray" },
  marketing:  { label: "Marketing",  cls: "badge-amber" },
};

const fmt = (n) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 }).format(n ?? 0);

const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—";

export default function OrdersPage({ orders, kpis }) {
  const router = useRouter();
  const [search, setSearch]     = useState("");
  const [channel, setChannel]   = useState("all");
  const [status, setStatus]     = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo]     = useState("");
  const [sortCol, setSortCol]   = useState("order_date");
  const [sortDir, setSortDir]   = useState("desc");
  const [page, setPage]         = useState(1);
  const [actionLoading, setActionLoading] = useState(null);
  const PER_PAGE = 20;

  const filtered = useMemo(() => {
    let rows = orders ?? [];
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter(o =>
        o.order_number?.toLowerCase().includes(q) ||
        o.customers?.name?.toLowerCase().includes(q)
      );
    }
    if (channel !== "all") rows = rows.filter(o => o.channel === channel);
    if (status  !== "all") rows = rows.filter(o => o.status  === status);
    if (dateFrom) rows = rows.filter(o => o.order_date >= dateFrom);
    if (dateTo)   rows = rows.filter(o => o.order_date <= dateTo);

    return [...rows].sort((a, b) => {
      let va = sortCol === "customers" ? a.customers?.name : a[sortCol];
      let vb = sortCol === "customers" ? b.customers?.name : b[sortCol];
      if (va == null) return 1;
      if (vb == null) return -1;
      if (typeof va === "string") return sortDir === "asc" ? va.localeCompare(vb) : vb.localeCompare(va);
      return sortDir === "asc" ? va - vb : vb - va;
    });
  }, [orders, search, channel, status, dateFrom, dateTo, sortCol, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const pageRows   = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  const toggleSort = (col) => {
    if (sortCol === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir("desc"); }
    setPage(1);
  };
  const arrow = (col) => sortCol === col ? (sortDir === "asc" ? " ↑" : " ↓") : "";

  const doAction = async (e, orderId, action) => {
    e.preventDefault(); e.stopPropagation();
    if (action === "cancel" && !confirm("Cancel this order?")) return;
    setActionLoading(`${orderId}-${action}`);
    try {
      const res = await fetch(`/api/orders/${orderId}/${action}`, { method: "POST" });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
      router.replace(router.asPath);
    } catch (err) { alert(`Error: ${err.message}`); }
    finally { setActionLoading(null); }
  };

  const activeFilters = [channel !== "all", status !== "all", !!dateFrom, !!dateTo].filter(Boolean).length;

  return (
    <Layout>
      <div className="page-header">
        <div>
          <h1>Orders</h1>
          <p className="page-sub">Wholesale &amp; e-commerce sales orders</p>
        </div>
        <div className="page-actions">
          <Link href="/orders/new"><button className="btn-primary">+ New Order</button></Link>
        </div>
      </div>

      {/* KPIs */}
      <div className="kpi-grid kpi-grid-4">
        <div className="kpi">
          <div className="kpi-label">Total Orders</div>
          <div className="kpi-value">{kpis.total}</div>
          <div className="kpi-sub">Last 30 days: {kpis.last30}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Total Revenue</div>
          <div className="kpi-value green">{fmt(kpis.revenue)}</div>
          <div className="kpi-sub">Avg {fmt(kpis.avgOrder)} / order</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Pending Fulfillment</div>
          <div className="kpi-value amber">{kpis.pendingFulfill}</div>
          <div className="kpi-sub">confirmed + partial</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Open Invoices</div>
          <div className="kpi-value red">{kpis.noInvoice}</div>
          <div className="kpi-sub">fulfilled without invoice</div>
        </div>
      </div>

      {/* Filters */}
      <div className="filter-bar">
        <input
          type="text" className="search-input"
          placeholder="Order # or customer…"
          value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
        />
        <select value={channel} onChange={e => { setChannel(e.target.value); setPage(1); }} style={{ width: "auto" }}>
          <option value="all">All Channels</option>
          {Object.entries(CHANNEL_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select value={status} onChange={e => { setStatus(e.target.value); setPage(1); }} style={{ width: "auto" }}>
          <option value="all">All Statuses</option>
          {Object.entries(STATUS_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(1); }} style={{ width: "auto" }} />
        <span style={{ color: "var(--text-3)", fontSize: 13 }}>→</span>
        <input type="date" value={dateTo}   onChange={e => { setDateTo(e.target.value); setPage(1); }} style={{ width: "auto" }} />
        {activeFilters > 0 && (
          <button className="btn-outline btn-sm" onClick={() => { setSearch(""); setChannel("all"); setStatus("all"); setDateFrom(""); setDateTo(""); setPage(1); }}>
            Reset ({activeFilters})
          </button>
        )}
        <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--text-3)" }}>
          {filtered.length} result{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Table */}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {[["order_number","Order #"],["customers","Customer"],["channel","Channel"],["status","Status"],["order_date","Date"],["total_amount","Total"]].map(([col, label]) => (
                <th key={col} style={{ cursor: "pointer", userSelect: "none" }} onClick={() => toggleSort(col)}>
                  {label}{arrow(col)}
                </th>
              ))}
              <th>Invoice</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 ? (
              <tr><td colSpan={8}><div className="empty"><div className="empty-icon">📋</div><p>No orders match your filters.</p></div></td></tr>
            ) : pageRows.map(order => (
              <tr key={order.id} style={{ cursor: "pointer" }} onClick={() => router.push(`/orders/${order.id}`)}>
                <td>
                  <span style={{ fontWeight: 600, color: "var(--accent)" }}>{order.order_number}</span>
                  {order.shopify_order_number && (
                    <div style={{ fontSize: 11, color: "var(--text-3)" }}>Shopify {order.shopify_order_number}</div>
                  )}
                </td>
                <td style={{ fontWeight: 500 }}>{order.customers?.name ?? "—"}</td>
                <td><span className={`badge ${CHANNEL_META[order.channel]?.cls}`}>{CHANNEL_META[order.channel]?.label ?? order.channel}</span></td>
                <td><span className={`badge ${STATUS_META[order.status]?.cls}`}>{STATUS_META[order.status]?.label ?? order.status}</span></td>
                <td className="td-muted" style={{ fontSize: 13 }}>{fmtDate(order.order_date)}</td>
                <td style={{ fontWeight: 600 }}>
                  {fmt(order.total_amount)}
                  {Number(order.tax_amount) > 0 && <div style={{ fontSize: 11, color: "var(--text-3)", fontWeight: 400 }}>+{fmt(order.tax_amount)} tax</div>}
                </td>
                <td>
                  {order.invoice_id
                    ? <Link href={`/invoices/${order.invoice_id}`} onClick={e => e.stopPropagation()}>
                        <span style={{ color: "var(--green)", fontSize: 13 }}>View →</span>
                      </Link>
                    : <span className="td-muted">—</span>}
                </td>
                <td onClick={e => e.stopPropagation()}>
                  <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                    {order.status === "draft" && (
                      <button className="btn-outline btn-sm" style={{ color: "var(--blue)" }}
                        disabled={actionLoading === `${order.id}-confirm`}
                        onClick={e => doAction(e, order.id, "confirm")}>
                        {actionLoading === `${order.id}-confirm` ? "…" : "✓"}
                      </button>
                    )}
                    {["confirmed","partially_fulfilled"].includes(order.status) && (
                      <button className="btn-green btn-sm"
                        disabled={actionLoading === `${order.id}-fulfill`}
                        onClick={e => doAction(e, order.id, "fulfill")}>
                        {actionLoading === `${order.id}-fulfill` ? "…" : "Ship"}
                      </button>
                    )}
                    {["draft","confirmed"].includes(order.status) && (
                      <button className="btn-danger btn-sm"
                        disabled={actionLoading === `${order.id}-cancel`}
                        onClick={e => doAction(e, order.id, "cancel")}>
                        {actionLoading === `${order.id}-cancel` ? "…" : "✕"}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 16, fontSize: 13, color: "var(--text-3)" }}>
          <span>{(page-1)*PER_PAGE+1}–{Math.min(page*PER_PAGE, filtered.length)} of {filtered.length}</span>
          <div style={{ display: "flex", gap: 4 }}>
            {Array.from({ length: totalPages }, (_, i) => i+1).map(p => (
              <button key={p} onClick={() => setPage(p)} className={p === page ? "btn-primary btn-sm" : "btn-outline btn-sm"} style={{ minWidth: 32 }}>{p}</button>
            ))}
          </div>
        </div>
      )}
    </Layout>
  );
}

export async function getServerSideProps() {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data: orders } = await supabase
    .from("sales_orders")
    .select(`id, order_number, channel, status, order_date, subtotal, tax_amount, total_amount, invoice_id, shopify_order_number, customer_id, customers ( id, name )`)
    .order("order_date", { ascending: false });

  const rows = orders ?? [];
  const now = new Date();
  const from30 = new Date(now); from30.setDate(from30.getDate() - 30);
  const total          = rows.length;
  const last30         = rows.filter(o => new Date(o.order_date) >= from30).length;
  const revenue        = rows.reduce((s, o) => s + Number(o.total_amount ?? 0), 0);
  const avgOrder       = total > 0 ? revenue / total : 0;
  const pendingFulfill = rows.filter(o => ["confirmed","partially_fulfilled"].includes(o.status)).length;
  const noInvoice      = rows.filter(o => !o.invoice_id && !["cancelled","voided","draft"].includes(o.status)).length;

  return { props: { orders: rows, kpis: { total, last30, revenue, avgOrder, pendingFulfill, noInvoice } } };
}
