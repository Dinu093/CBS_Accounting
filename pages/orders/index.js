import { useState, useMemo } from "react";
import Head from "next/head";
import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import {
  MagnifyingGlassIcon,
  FunnelIcon,
  PlusIcon,
  ArrowPathIcon,
  ChevronUpDownIcon,
  ChevronUpIcon,
  ChevronDownIcon,
  EllipsisHorizontalIcon,
  CheckCircleIcon,
  TruckIcon,
  XCircleIcon,
  DocumentTextIcon,
} from "@heroicons/react/24/outline";

// ─── helpers ────────────────────────────────────────────────────────────────

const STATUS_META = {
  draft:                { label: "Draft",               color: "text-zinc-400 bg-zinc-400/10 border-zinc-400/20" },
  confirmed:            { label: "Confirmed",           color: "text-blue-400 bg-blue-400/10 border-blue-400/20" },
  partially_fulfilled:  { label: "Part. Fulfilled",     color: "text-amber-400 bg-amber-400/10 border-amber-400/20" },
  fulfilled:            { label: "Fulfilled",           color: "text-emerald-400 bg-emerald-400/10 border-emerald-400/20" },
  cancelled:            { label: "Cancelled",           color: "text-red-400 bg-red-400/10 border-red-400/20" },
  voided:               { label: "Voided",              color: "text-zinc-500 bg-zinc-500/10 border-zinc-500/20" },
};

const CHANNEL_META = {
  wholesale:  { label: "Wholesale",  color: "text-violet-400 bg-violet-400/10 border-violet-400/20" },
  ecommerce:  { label: "E-Commerce", color: "text-pink-400  bg-pink-400/10  border-pink-400/20"  },
  sample:     { label: "Sample",     color: "text-teal-400  bg-teal-400/10  border-teal-400/20"  },
  marketing:  { label: "Marketing",  color: "text-orange-400 bg-orange-400/10 border-orange-400/20" },
};

const fmt = (n) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 }).format(n ?? 0);

const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—";

function Badge({ meta }) {
  if (!meta) return null;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border ${meta.color}`}>
      {meta.label}
    </span>
  );
}

// ─── KPI card ───────────────────────────────────────────────────────────────

function KPICard({ label, value, sub, accent }) {
  return (
    <div className="relative rounded-xl border border-[#1E1E26] bg-[#111116] px-5 py-4 overflow-hidden">
      {accent && (
        <div
          className="absolute top-0 right-0 w-24 h-24 rounded-full opacity-10 blur-2xl"
          style={{ background: accent }}
        />
      )}
      <p className="text-xs font-medium tracking-widest uppercase text-zinc-500">{label}</p>
      <p className="mt-1.5 text-2xl font-semibold text-white tracking-tight">{value}</p>
      {sub && <p className="mt-1 text-xs text-zinc-500">{sub}</p>}
    </div>
  );
}

// ─── Sort icon ───────────────────────────────────────────────────────────────

function SortIcon({ col, sort }) {
  if (sort.col !== col) return <ChevronUpDownIcon className="h-3.5 w-3.5 text-zinc-600" />;
  return sort.dir === "asc"
    ? <ChevronUpIcon className="h-3.5 w-3.5 text-rose-400" />
    : <ChevronDownIcon className="h-3.5 w-3.5 text-rose-400" />;
}

// ─── Main page ───────────────────────────────────────────────────────────────

export default function OrdersPage({ orders, kpis, error }) {
  const [search, setSearch]   = useState("");
  const [channel, setChannel] = useState("all");
  const [status, setStatus]   = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo]   = useState("");
  const [sort, setSort]       = useState({ col: "order_date", dir: "desc" });
  const [page, setPage]       = useState(1);
  const [actionMenu, setActionMenu] = useState(null);
  const PER_PAGE = 20;

  // ── client-side filter + sort ──────────────────────────────────────────────
  const filtered = useMemo(() => {
    let rows = orders ?? [];

    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter(
        (o) =>
          o.order_number?.toLowerCase().includes(q) ||
          o.customers?.name?.toLowerCase().includes(q)
      );
    }
    if (channel !== "all") rows = rows.filter((o) => o.channel === channel);
    if (status  !== "all") rows = rows.filter((o) => o.status  === status);
    if (dateFrom) rows = rows.filter((o) => o.order_date >= dateFrom);
    if (dateTo)   rows = rows.filter((o) => o.order_date <= dateTo);

    rows = [...rows].sort((a, b) => {
      let va = a[sort.col], vb = b[sort.col];
      if (sort.col === "customers") { va = a.customers?.name; vb = b.customers?.name; }
      if (va == null) return 1;
      if (vb == null) return -1;
      if (typeof va === "string") return sort.dir === "asc" ? va.localeCompare(vb) : vb.localeCompare(va);
      return sort.dir === "asc" ? va - vb : vb - va;
    });

    return rows;
  }, [orders, search, channel, status, dateFrom, dateTo, sort]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const pageRows   = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  const toggleSort = (col) =>
    setSort((s) => s.col === col ? { col, dir: s.dir === "asc" ? "desc" : "asc" } : { col, dir: "desc" });

  const handleReset = () => {
    setSearch(""); setChannel("all"); setStatus("all");
    setDateFrom(""); setDateTo(""); setPage(1);
  };

  const activeFilters = [channel !== "all", status !== "all", !!dateFrom, !!dateTo].filter(Boolean).length;

  return (
    <>
      <Head>
        <title>Orders — CBS ERP</title>
      </Head>

      {/* ── page wrapper ─────────────────────────────────────────────────── */}
      <div className="min-h-screen bg-[#0A0A0D] text-white" style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}>
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;1,9..40,400&family=DM+Mono:wght@400;500&display=swap');
          * { box-sizing: border-box; }
          ::-webkit-scrollbar { width: 6px; height: 6px; }
          ::-webkit-scrollbar-track { background: transparent; }
          ::-webkit-scrollbar-thumb { background: #2a2a30; border-radius: 3px; }
          .mono { font-family: 'DM Mono', monospace; }
          .th-btn { display:flex; align-items:center; gap:4px; cursor:pointer; user-select:none; }
          .th-btn:hover { color: #f5f5f5; }
          .row-hover:hover { background: #131318; }
          select { background-image: none !important; }
          .action-ring { transition: box-shadow .15s; }
          .action-ring:hover { box-shadow: 0 0 0 1px #e8b4a040; }
        `}</style>

        <div className="max-w-screen-xl mx-auto px-6 py-8">

          {/* ── header ───────────────────────────────────────────────────── */}
          <div className="flex items-start justify-between mb-8">
            <div>
              <p className="text-xs font-medium tracking-widest uppercase text-zinc-500 mb-1">CBS ERP</p>
              <h1 className="text-3xl font-semibold tracking-tight text-white">Orders</h1>
            </div>
            <Link href="/orders/new">
              <button className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-rose-500/90 hover:bg-rose-500 text-white text-sm font-medium transition-colors">
                <PlusIcon className="h-4 w-4" />
                New Order
              </button>
            </Link>
          </div>

          {/* ── KPI row ──────────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            <KPICard label="Total Orders"       value={kpis.total}             sub={`Last 30 days: ${kpis.last30}`}         accent="#e8b4a0" />
            <KPICard label="Total Revenue"      value={fmt(kpis.revenue)}      sub={`Avg ${fmt(kpis.avgOrder)} / order`}    accent="#a78bfa" />
            <KPICard label="Pending Fulfillment" value={kpis.pendingFulfill}   sub="confirmed + partial"                    accent="#fbbf24" />
            <KPICard label="Open Invoices"      value={kpis.noInvoice}         sub="orders without invoice"                 accent="#34d399" />
          </div>

          {/* ── filter bar ───────────────────────────────────────────────── */}
          <div className="flex flex-wrap gap-2 mb-4">
            {/* search */}
            <div className="relative flex-1 min-w-[200px] max-w-xs">
              <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
              <input
                type="text"
                placeholder="Order # or customer…"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                className="w-full pl-9 pr-3 py-2 text-sm bg-[#111116] border border-[#1E1E26] rounded-lg text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-600"
              />
            </div>

            {/* channel */}
            <select
              value={channel}
              onChange={(e) => { setChannel(e.target.value); setPage(1); }}
              className="px-3 py-2 text-sm bg-[#111116] border border-[#1E1E26] rounded-lg text-white focus:outline-none focus:border-zinc-600 cursor-pointer"
            >
              <option value="all">All Channels</option>
              {Object.entries(CHANNEL_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>

            {/* status */}
            <select
              value={status}
              onChange={(e) => { setStatus(e.target.value); setPage(1); }}
              className="px-3 py-2 text-sm bg-[#111116] border border-[#1E1E26] rounded-lg text-white focus:outline-none focus:border-zinc-600 cursor-pointer"
            >
              <option value="all">All Statuses</option>
              {Object.entries(STATUS_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>

            {/* date range */}
            <input
              type="date" value={dateFrom}
              onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
              className="px-3 py-2 text-sm bg-[#111116] border border-[#1E1E26] rounded-lg text-white focus:outline-none focus:border-zinc-600"
            />
            <span className="flex items-center text-zinc-600 text-xs">→</span>
            <input
              type="date" value={dateTo}
              onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
              className="px-3 py-2 text-sm bg-[#111116] border border-[#1E1E26] rounded-lg text-white focus:outline-none focus:border-zinc-600"
            />

            {/* reset */}
            {activeFilters > 0 && (
              <button
                onClick={handleReset}
                className="flex items-center gap-1.5 px-3 py-2 text-sm text-zinc-400 hover:text-white border border-[#1E1E26] rounded-lg transition-colors"
              >
                <ArrowPathIcon className="h-3.5 w-3.5" />
                Reset
                <span className="ml-0.5 inline-flex items-center justify-center h-4 w-4 text-[10px] font-bold bg-rose-500/30 text-rose-400 rounded-full">{activeFilters}</span>
              </button>
            )}

            <div className="ml-auto flex items-center gap-2 text-xs text-zinc-500">
              <FunnelIcon className="h-3.5 w-3.5" />
              {filtered.length} result{filtered.length !== 1 ? "s" : ""}
            </div>
          </div>

          {/* ── table ────────────────────────────────────────────────────── */}
          <div className="rounded-xl border border-[#1E1E26] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-[#1E1E26] bg-[#0D0D11]">
                    {[
                      { key: "order_number",  label: "Order #" },
                      { key: "customers",     label: "Customer" },
                      { key: "channel",       label: "Channel" },
                      { key: "status",        label: "Status" },
                      { key: "order_date",    label: "Date" },
                      { key: "total_amount",  label: "Total" },
                      { key: "invoice",       label: "Invoice", noSort: true },
                    ].map(({ key, label, noSort }) => (
                      <th
                        key={key}
                        onClick={noSort ? undefined : () => toggleSort(key)}
                        className="px-4 py-3 text-left text-xs font-medium tracking-wider text-zinc-500 whitespace-nowrap"
                      >
                        {noSort ? label : (
                          <span className="th-btn">
                            {label}
                            <SortIcon col={key} sort={sort} />
                          </span>
                        )}
                      </th>
                    ))}
                    <th className="px-4 py-3 text-right text-xs font-medium tracking-wider text-zinc-500">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-16 text-center text-zinc-600 text-sm">
                        No orders match your filters.
                      </td>
                    </tr>
                  ) : pageRows.map((order) => (
                    <tr key={order.id} className="row-hover border-b border-[#1A1A20] last:border-0 transition-colors">
                      {/* order # */}
                      <td className="px-4 py-3">
                        <Link href={`/orders/${order.id}`}>
                          <span className="mono text-xs font-medium text-rose-300 hover:text-rose-200 cursor-pointer transition-colors">
                            {order.order_number}
                          </span>
                        </Link>
                        {order.shopify_order_number && (
                          <p className="mono text-[10px] text-zinc-600 mt-0.5">Shopify {order.shopify_order_number}</p>
                        )}
                      </td>

                      {/* customer */}
                      <td className="px-4 py-3">
                        <Link href={`/customers/${order.customer_id}`}>
                          <span className="text-white font-medium hover:text-zinc-300 cursor-pointer transition-colors text-sm">
                            {order.customers?.name ?? "—"}
                          </span>
                        </Link>
                      </td>

                      {/* channel */}
                      <td className="px-4 py-3">
                        <Badge meta={CHANNEL_META[order.channel]} />
                      </td>

                      {/* status */}
                      <td className="px-4 py-3">
                        <Badge meta={STATUS_META[order.status]} />
                      </td>

                      {/* date */}
                      <td className="px-4 py-3 text-zinc-400 text-xs mono whitespace-nowrap">
                        {fmtDate(order.order_date)}
                      </td>

                      {/* total */}
                      <td className="px-4 py-3">
                        <span className="mono font-medium text-white">{fmt(order.total_amount)}</span>
                        {order.tax_amount > 0 && (
                          <p className="mono text-[10px] text-zinc-600 mt-0.5">+{fmt(order.tax_amount)} tax</p>
                        )}
                      </td>

                      {/* invoice */}
                      <td className="px-4 py-3">
                        {order.invoice_id ? (
                          <Link href={`/invoices/${order.invoice_id}`}>
                            <span className="flex items-center gap-1 text-xs text-emerald-400 hover:text-emerald-300 transition-colors cursor-pointer">
                              <DocumentTextIcon className="h-3.5 w-3.5" />
                              View
                            </span>
                          </Link>
                        ) : (
                          <span className="text-xs text-zinc-600">—</span>
                        )}
                      </td>

                      {/* actions */}
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          {/* quick actions based on status */}
                          {order.status === "draft" && (
                            <QuickAction
                              icon={<CheckCircleIcon className="h-4 w-4" />}
                              label="Confirm"
                              color="text-blue-400 hover:bg-blue-400/10"
                              orderId={order.id}
                              action="confirm"
                            />
                          )}
                          {(order.status === "confirmed" || order.status === "partially_fulfilled") && (
                            <QuickAction
                              icon={<TruckIcon className="h-4 w-4" />}
                              label="Fulfill"
                              color="text-emerald-400 hover:bg-emerald-400/10"
                              orderId={order.id}
                              action="fulfill"
                            />
                          )}
                          {(order.status === "draft" || order.status === "confirmed") && (
                            <QuickAction
                              icon={<XCircleIcon className="h-4 w-4" />}
                              label="Cancel"
                              color="text-red-400 hover:bg-red-400/10"
                              orderId={order.id}
                              action="cancel"
                            />
                          )}
                          <Link href={`/orders/${order.id}`}>
                            <button className="p-1.5 rounded-md text-zinc-500 hover:text-white hover:bg-white/5 transition-colors" title="View detail">
                              <EllipsisHorizontalIcon className="h-4 w-4" />
                            </button>
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── pagination ───────────────────────────────────────────────── */}
          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between text-xs text-zinc-500">
              <span>
                {(page - 1) * PER_PAGE + 1}–{Math.min(page * PER_PAGE, filtered.length)} of {filtered.length}
              </span>
              <div className="flex gap-1">
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                  <button
                    key={p}
                    onClick={() => setPage(p)}
                    className={`w-7 h-7 rounded-md text-xs transition-colors ${
                      p === page
                        ? "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                        : "hover:bg-white/5 text-zinc-500 hover:text-white"
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ─── Quick action button ──────────────────────────────────────────────────────

function QuickAction({ icon, label, color, orderId, action }) {
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    if (loading) return;
    if (action === "cancel" && !confirm(`Cancel this order?`)) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/orders/${orderId}/${action}`, { method: "POST" });
      if (!res.ok) throw new Error(await res.text());
      window.location.reload();
    } catch (e) {
      alert(`Error: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      title={label}
      className={`p-1.5 rounded-md transition-colors ${color} ${loading ? "opacity-40 cursor-wait" : ""}`}
    >
      {loading ? <ArrowPathIcon className="h-4 w-4 animate-spin" /> : icon}
    </button>
  );
}

// ─── getServerSideProps ───────────────────────────────────────────────────────

export async function getServerSideProps() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { data: orders, error } = await supabase
    .from("sales_orders")
    .select(`
      id,
      order_number,
      channel,
      status,
      order_date,
      subtotal,
      tax_amount,
      total_amount,
      payment_terms_days,
      invoice_id,
      shopify_order_number,
      customer_id,
      customers ( id, name, type )
    `)
    .order("order_date", { ascending: false });

  if (error) {
    console.error("Orders fetch error:", error);
    return { props: { orders: [], kpis: {}, error: error.message } };
  }

  // ── compute KPIs server-side ──────────────────────────────────────────────
  const now     = new Date();
  const from30  = new Date(now); from30.setDate(from30.getDate() - 30);

  const total         = orders.length;
  const last30        = orders.filter((o) => new Date(o.order_date) >= from30).length;
  const revenue       = orders.reduce((s, o) => s + Number(o.total_amount ?? 0), 0);
  const avgOrder      = total > 0 ? revenue / total : 0;
  const pendingFulfill = orders.filter((o) =>
    ["confirmed", "partially_fulfilled"].includes(o.status)
  ).length;
  const noInvoice     = orders.filter((o) =>
    !o.invoice_id && !["cancelled", "voided", "draft"].includes(o.status)
  ).length;

  return {
    props: {
      orders,
      kpis: { total, last30, revenue, avgOrder, pendingFulfill, noInvoice },
      error: null,
    },
  };
}
